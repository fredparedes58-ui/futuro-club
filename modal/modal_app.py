"""
VITAS · Modal GPU Pipeline (NUEVO)
Procesa un vídeo de fútbol → keypoints + embedding + detecciones.

Stack:
  - RTMDet-m (Apache 2.0)  · detección + tracking jugadores
  - MMPose RTMPose-m       · 17 keypoints biomecánicos
  - VideoMAE v2 (MIT)      · embedding 768-dim del clip

Coste objetivo: ~€0,012 por vídeo de 90 seg en GPU T4 (free tier)
Latencia objetivo: 30-40 segundos en T4 (sin cold start)

Deploy:
    modal deploy modal_app.py

Test:
    modal run modal_app.py::analyze_video --video-url=https://...
"""

import modal
from typing import Any

app = modal.App("vitas-video-pipeline")

# ── Imagen Docker con todas las dependencias ────────────────────────────
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "torch==2.2.0",
        "torchvision==0.17.0",
        "opencv-python-headless==4.9.0.80",
        "numpy==1.26.3",
        "openmim==0.3.9",
        "transformers==4.38.0",  # para VideoMAE v2
        "decord==0.6.0",         # decodificación de vídeo eficiente
        "supervision==0.18.0",   # ByteTrack
        "requests==2.31.0",
    )
    .run_commands(
        # Instalar MMPose + MMDetection (RTMDet) via mim
        "mim install mmengine==0.10.3",
        "mim install 'mmcv==2.1.0'",
        "mim install 'mmdet==3.3.0'",
        "mim install 'mmpose==1.3.1'",
    )
)

# ── Volumen persistente para los pesos de los modelos ───────────────────
volume = modal.Volume.from_name("vitas-models", create_if_missing=True)

MODELS_PATH = "/models"


@app.function(
    image=image,
    gpu="T4",
    volumes={MODELS_PATH: volume},
    timeout=600,  # max 10 min
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
    memory=8192,
)
def analyze_video(
    video_url: str,
    target_player_bbox: dict | None = None,  # {"x":, "y":, "w":, "h":} si ya identificado
) -> dict[str, Any]:
    """
    Pipeline principal: vídeo → keypoints + embedding + detecciones.

    Args:
        video_url: URL HTTPS del vídeo (Bunny Stream)
        target_player_bbox: bbox del jugador objetivo (opcional, primera vez será None)

    Returns:
        {
          "keypoints": [...],          # 17 keypoints × jugador × frame
          "embedding": [...],          # 768-dim VideoMAE
          "detections": [...],         # bboxes RTMDet
          "videoFps": float,
          "pixelsPerMeter": float | None,
          "framesProcessed": int,
          "latencyMs": int,
        }
    """
    import time
    import os
    import requests
    import cv2
    import numpy as np
    from decord import VideoReader, cpu

    t0 = time.time()

    # ── 1. Descargar vídeo ─────────────────────────────────────────
    local_path = "/tmp/input.mp4"
    print(f"[VITAS] Descargando vídeo desde {video_url[:80]}...")
    r = requests.get(video_url, stream=True, timeout=60)
    r.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)

    # ── 2. Decodificar frames (submuestreo 5 fps) ──────────────────
    vr = VideoReader(local_path, ctx=cpu(0))
    total_frames = len(vr)
    fps = vr.get_avg_fps()
    duration = total_frames / fps
    sample_step = max(1, int(fps / 5))  # ~5 fps efectivos
    sampled_indices = list(range(0, total_frames, sample_step))
    print(f"[VITAS] Vídeo: {duration:.1f}s @ {fps:.0f}fps · sampling {len(sampled_indices)} frames")

    # ── 3. RTMDet detección + ByteTrack ────────────────────────────
    print("[VITAS] Inicializando RTMDet-m...")
    from mmdet.apis import init_detector, inference_detector
    rtmdet_config = f"{MODELS_PATH}/rtmdet_m_8xb32-300e_coco.py"
    rtmdet_ckpt = f"{MODELS_PATH}/rtmdet_m_8xb32-300e_coco.pth"

    if not os.path.exists(rtmdet_ckpt):
        print("[VITAS] Descargando pesos RTMDet (primera vez)...")
        os.makedirs(MODELS_PATH, exist_ok=True)
        os.system(f"mim download mmdet --config rtmdet_m_8xb32-300e_coco --dest {MODELS_PATH}")
        volume.commit()

    detector = init_detector(rtmdet_config, rtmdet_ckpt, device="cuda:0")

    detections_per_frame = []
    for idx in sampled_indices:
        frame = vr[idx].asnumpy()
        result = inference_detector(detector, frame)
        # Filtrar solo personas (class_id=0) con confianza >0.5
        person_dets = result.pred_instances[result.pred_instances.labels == 0]
        person_dets = person_dets[person_dets.scores > 0.5]
        bboxes = person_dets.bboxes.cpu().numpy().tolist()
        detections_per_frame.append({"frame_idx": idx, "bboxes": bboxes})

    print(f"[VITAS] Detección: {sum(len(d['bboxes']) for d in detections_per_frame)} personas-frame")

    # ── 4. MMPose RTMPose ──────────────────────────────────────────
    print("[VITAS] Inicializando MMPose RTMPose-m...")
    from mmpose.apis import init_model as init_pose, inference_topdown
    pose_config = f"{MODELS_PATH}/rtmpose-m_8xb256-420e_coco-256x192.py"
    pose_ckpt = f"{MODELS_PATH}/rtmpose-m_8xb256-420e_coco-256x192.pth"

    if not os.path.exists(pose_ckpt):
        print("[VITAS] Descargando pesos RTMPose (primera vez)...")
        os.system(f"mim download mmpose --config rtmpose-m_8xb256-420e_coco-256x192 --dest {MODELS_PATH}")
        volume.commit()

    pose_model = init_pose(pose_config, pose_ckpt, device="cuda:0")

    keypoints_per_frame = []
    for det in detections_per_frame:
        if not det["bboxes"]:
            continue
        frame = vr[det["frame_idx"]].asnumpy()
        bboxes_np = np.array(det["bboxes"])
        pose_results = inference_topdown(pose_model, frame, bboxes_np)
        for player_idx, pr in enumerate(pose_results):
            kp = pr.pred_instances.keypoints[0].cpu().numpy()  # (17, 2)
            kp_scores = pr.pred_instances.keypoint_scores[0].cpu().numpy()
            keypoints_per_frame.append({
                "timestamp": det["frame_idx"] / fps,
                "playerIdx": player_idx,
                "keypoints": _format_keypoints(kp, kp_scores),
            })

    # ── 5. VideoMAE v2 embedding ───────────────────────────────────
    print("[VITAS] Calculando VideoMAE embedding...")
    from transformers import VideoMAEImageProcessor, VideoMAEModel
    import torch

    processor = VideoMAEImageProcessor.from_pretrained("MCG-NJU/videomae-base", cache_dir=MODELS_PATH)
    videomae = VideoMAEModel.from_pretrained("MCG-NJU/videomae-base", cache_dir=MODELS_PATH).cuda().eval()

    # Tomar 16 frames uniformemente espaciados
    sample_16 = np.linspace(0, total_frames - 1, 16, dtype=int)
    clip_frames = [vr[int(i)].asnumpy() for i in sample_16]
    inputs = processor(clip_frames, return_tensors="pt").to("cuda:0")

    with torch.no_grad():
        outputs = videomae(**inputs)
        embedding = outputs.last_hidden_state.mean(dim=1)[0].cpu().numpy().tolist()

    # ── 6. Resultado final ─────────────────────────────────────────
    latency_ms = int((time.time() - t0) * 1000)
    print(f"[VITAS] ✓ Pipeline completado en {latency_ms / 1000:.1f}s")

    return {
        "keypoints": keypoints_per_frame,
        "embedding": embedding,
        "detections": detections_per_frame,
        "videoFps": fps,
        "videoDurationSec": duration,
        "pixelsPerMeter": None,  # requiere calibración manual
        "framesProcessed": len(sampled_indices),
        "latencyMs": latency_ms,
    }


def _format_keypoints(kp_arr, scores):
    """Convierte keypoints COCO 17 puntos al formato VITAS."""
    names = [
        "nose", "leftEye", "rightEye", "leftEar", "rightEar",
        "leftShoulder", "rightShoulder", "leftElbow", "rightElbow",
        "leftWrist", "rightWrist", "leftHip", "rightHip",
        "leftKnee", "rightKnee", "leftAnkle", "rightAnkle",
    ]
    return {
        name: {"x": float(kp_arr[i][0]), "y": float(kp_arr[i][1]), "confidence": float(scores[i])}
        for i, name in enumerate(names)
    }


# ── Endpoint HTTP que dispara procesamiento ASYNC con callback ────────
@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
)
@modal.web_endpoint(method="POST", label="analyze")
def analyze_endpoint(payload: dict) -> dict:
    """
    HTTP endpoint llamado desde VITAS API · ASYNC con callback.

    Body esperado:
      {
        "videoUrl": "https://...",
        "analysisId": "uuid",
        "playerId": "...",
        "videoId": "...",
        "callbackUrl": "https://vitas.app/api/webhooks/modal-callback",
        "callbackToken": "secret"
      }

    Comportamiento:
      1. Acepta el job (return 202)
      2. Procesa en background (.spawn)
      3. Cuando termina, POST a callbackUrl con el resultado
    """
    video_url = payload["videoUrl"]
    analysis_id = payload["analysisId"]
    callback_url = payload["callbackUrl"]
    callback_token = payload["callbackToken"]
    target_bbox = payload.get("targetPlayerBbox")

    # Lanzar procesamiento en background y retornar inmediatamente
    call = analyze_and_callback.spawn(
        video_url=video_url,
        analysis_id=analysis_id,
        callback_url=callback_url,
        callback_token=callback_token,
        target_player_bbox=target_bbox,
    )

    return {
        "accepted": True,
        "analysisId": analysis_id,
        "modalRunId": call.object_id,
        "estimatedTime": "60-120 seconds",
    }


@app.function(
    image=image,
    gpu="T4",
    volumes={MODELS_PATH: volume},
    timeout=900,  # 15 min max
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
    memory=8192,
)
def analyze_and_callback(
    video_url: str,
    analysis_id: str,
    callback_url: str,
    callback_token: str,
    target_player_bbox: dict | None = None,
) -> dict:
    """
    Procesa el vídeo + hace callback a VITAS cuando termina.
    """
    import requests

    try:
        # Procesar vídeo (función que ya teníamos)
        result = analyze_video.local(video_url, target_player_bbox)

        # POST al callback con el resultado
        callback_payload = {
            "analysisId": analysis_id,
            "callbackToken": callback_token,
            "modalRunId": "managed-by-modal",
            "status": "success",
            "result": result,
        }

        cb_response = requests.post(
            callback_url,
            json=callback_payload,
            timeout=30,
        )
        cb_response.raise_for_status()

        return {"callback_sent": True, "callback_status": cb_response.status_code}

    except Exception as exc:
        # Notificar fallo a VITAS
        try:
            requests.post(
                callback_url,
                json={
                    "analysisId": analysis_id,
                    "callbackToken": callback_token,
                    "status": "failed",
                    "error": str(exc),
                },
                timeout=30,
            )
        except Exception:
            pass
        raise


# ── Test local ─────────────────────────────────────────────────────
@app.local_entrypoint()
def main(video_url: str = "https://example.com/test.mp4"):
    print(f"[VITAS] Test analyze_video con {video_url}")
    result = analyze_video.remote(video_url)
    print(f"\n=== RESULTADO ===")
    print(f"Frames procesados: {result['framesProcessed']}")
    print(f"Keypoints extraídos: {len(result['keypoints'])}")
    print(f"Embedding dim: {len(result['embedding'])}")
    print(f"Latencia: {result['latencyMs']}ms")
