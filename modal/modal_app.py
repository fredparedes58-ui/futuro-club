"""
VITAS · Modal GPU Pipeline (PRODUCCIÓN)
Procesa un vídeo de fútbol → keypoints biomecánicos + métricas.

Stack:
  - MediaPipe Pose Landmarker (Apache 2.0) · 33 keypoints biomecánicos
  - GPU T4 para acelerar inferencia

Coste objetivo: ~€0,003 por vídeo de 90 seg en GPU T4
Latencia objetivo: 30-60 segundos en T4

Deploy:
    modal deploy modal/modal_app.py

Endpoint público que VITAS API llama:
    POST https://YOUR-WORKSPACE--vitas-video-pipeline-analyze.modal.run
    Body: { videoUrl, analysisId, callbackUrl, callbackToken, ... }
    Comportamiento: ASYNC · responde 200 inmediato + procesa en background +
    callback HTTP cuando termina.
"""

import modal
from typing import Any

app = modal.App("vitas-video-pipeline")

# ── Imagen Docker ─────────────────────────────────────────────────────
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "mediapipe==0.10.18",
        "opencv-python-headless==4.10.0.84",
        "numpy==1.26.4",
        "decord==0.6.0",
        "requests==2.32.3",
        "fastapi[standard]==0.115.0",  # requerido por @modal.fastapi_endpoint
    )
)

volume = modal.Volume.from_name("vitas-models", create_if_missing=True)
MODELS_PATH = "/models"


# ── Función core: procesa vídeo ───────────────────────────────────────
@app.function(
    image=image,
    gpu="T4",
    volumes={MODELS_PATH: volume},
    timeout=600,
    memory=8192,
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
)
def analyze_video(
    video_url: str,
    target_player_bbox: dict | None = None,
    max_frames: int = 60,
) -> dict[str, Any]:
    """
    Pipeline principal: vídeo → keypoints + métricas biomecánicas.

    Returns dict serializable (sin objetos torch/numpy raw).
    """
    import time
    import os
    import math
    import requests
    import cv2
    import mediapipe as mp
    from decord import VideoReader, cpu

    t0 = time.time()
    log = []

    def step(msg):
        elapsed = time.time() - t0
        log.append(f"[{elapsed:.1f}s] {msg}")
        print(log[-1])

    step("Iniciando pipeline MediaPipe Pose")

    # ── 1. Descargar vídeo ──────────────────────────────────────
    step(f"Descargando: {video_url[:80]}...")
    local_path = "/tmp/input.mp4"
    r = requests.get(video_url, stream=True, timeout=120)
    r.raise_for_status()
    with open(local_path, "wb") as f:
        for chunk in r.iter_content(chunk_size=1024 * 1024):
            f.write(chunk)
    file_size_mb = os.path.getsize(local_path) / 1024 / 1024
    step(f"Vídeo descargado · {file_size_mb:.1f} MB")

    # ── 2. Decodificar ──────────────────────────────────────────
    vr = VideoReader(local_path, ctx=cpu(0))
    total_frames = len(vr)
    fps = float(vr.get_avg_fps())
    duration = total_frames / fps
    step(f"Vídeo: {duration:.1f}s @ {fps:.0f}fps · {total_frames} frames totales")

    sample_step = max(1, total_frames // max_frames)
    sampled_indices = list(range(0, total_frames, sample_step))[:max_frames]
    step(f"Procesando {len(sampled_indices)} frames")

    # ── 3. MediaPipe Pose ───────────────────────────────────────
    step("Inicializando MediaPipe Pose")
    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=2,
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    keypoints_per_frame = []
    frames_with_pose = 0

    for idx in sampled_indices:
        frame_bgr = vr[idx].asnumpy()
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = pose.process(frame_rgb)

        if results.pose_landmarks:
            frames_with_pose += 1
            h, w, _ = frame_rgb.shape
            kp_list = []
            for lm in results.pose_landmarks.landmark:
                kp_list.append({
                    "x": float(lm.x * w),
                    "y": float(lm.y * h),
                    "z": float(lm.z),
                    "visibility": float(lm.visibility),
                })

            keypoints_per_frame.append({
                "timestamp": float(idx / fps),
                "frame_idx": int(idx),
                "keypoints": kp_list,
            })

    pose.close()
    step(f"Pose detectada en {frames_with_pose}/{len(sampled_indices)} frames")

    # ── 4. Métricas biomecánicas ──────────────────────────────
    metrics = compute_biomechanics(keypoints_per_frame)
    step(f"Métricas: knee_L={metrics.get('knee_left_avg')}° R={metrics.get('knee_right_avg')}°")

    # ── 5. Resultado ──────────────────────────────────────────
    total_time = time.time() - t0
    step(f"Pipeline completo en {total_time:.1f}s")

    # ── 6. Si NO hay target_player_bbox, extraer candidatos para identificación ─
    candidates = []
    if not target_player_bbox and frames_with_pose > 0:
        candidates = extract_player_candidates(vr, keypoints_per_frame, max_candidates=6)
        step(f"Candidatos extraídos para identificación: {len(candidates)}")

    return {
        "status": "success" if frames_with_pose > 0 else "no_pose_detected",
        "videoUrl": video_url,
        "videoFps": round(fps, 1),
        "videoDurationSec": round(duration, 2),
        "framesProcessed": len(sampled_indices),
        "framesWithPose": int(frames_with_pose),
        "detectionRate": round(frames_with_pose / len(sampled_indices), 3) if sampled_indices else 0,
        "keypointsPerFrame": 33,
        "keypoints": keypoints_per_frame,
        "biomechanics": metrics,
        "candidates": candidates,        # NUEVO: imágenes en base64 de cada persona detectada
        "totalLatencyMs": int(total_time * 1000),
        "pixelsPerMeter": None,
        "log": log,
    }


def extract_player_candidates(vr, keypoints_per_frame, max_candidates: int = 6) -> list:
    """
    Extrae crops de personas detectadas en frames distintos.
    Devuelve lista de:
      { candidateIdx, frameIdx, bbox, cropBase64 }
    Para que el frontend pueda mostrar al usuario quién seleccionar.
    """
    import cv2
    import base64

    if not keypoints_per_frame:
        return []

    # Submuestrear: tomar candidatos de frames espaciados
    step_size = max(1, len(keypoints_per_frame) // max_candidates)
    selected = keypoints_per_frame[::step_size][:max_candidates]

    candidates = []
    for idx, frame_data in enumerate(selected):
        kp = frame_data["keypoints"]

        # Calcular bbox a partir de los keypoints visibles
        xs = [p["x"] for p in kp if p["visibility"] > 0.5]
        ys = [p["y"] for p in kp if p["visibility"] > 0.5]
        if not xs or not ys:
            continue

        x_min = max(0, int(min(xs) - 30))
        y_min = max(0, int(min(ys) - 30))
        x_max = int(max(xs) + 30)
        y_max = int(max(ys) + 30)
        w = x_max - x_min
        h = y_max - y_min

        # Filtrar bbox demasiado pequeñas (<80px alto)
        if h < 80:
            continue

        # Extraer crop del frame
        frame_bgr = vr[frame_data["frame_idx"]].asnumpy()
        h_frame, w_frame, _ = frame_bgr.shape
        x_max = min(w_frame, x_max)
        y_max = min(h_frame, y_max)
        crop = frame_bgr[y_min:y_max, x_min:x_max]

        # Comprimir a JPEG y codificar base64 (máx 100KB cada uno)
        _, jpeg = cv2.imencode(".jpg", crop, [cv2.IMWRITE_JPEG_QUALITY, 70])
        crop_b64 = base64.b64encode(jpeg.tobytes()).decode("ascii")

        candidates.append({
            "candidateIdx": idx,
            "frameIdx": frame_data["frame_idx"],
            "timestamp": frame_data["timestamp"],
            "bbox": {"x": x_min, "y": y_min, "w": w, "h": h},
            "cropBase64": crop_b64,  # frontend lo renderiza como <img src="data:image/jpeg;base64,...">
        })

    return candidates


def compute_biomechanics(keypoints_per_frame: list) -> dict:
    """Calcula métricas biomecánicas a partir de los keypoints MediaPipe."""
    import math

    if not keypoints_per_frame:
        return {"error": "no_keypoints"}

    def angle(a, b, c):
        ab = (a["x"] - b["x"], a["y"] - b["y"])
        cb = (c["x"] - b["x"], c["y"] - b["y"])
        dot = ab[0] * cb[0] + ab[1] * cb[1]
        mag_ab = math.hypot(*ab)
        mag_cb = math.hypot(*cb)
        if mag_ab == 0 or mag_cb == 0:
            return 0
        cos_angle = max(-1, min(1, dot / (mag_ab * mag_cb)))
        return math.degrees(math.acos(cos_angle))

    knee_left, knee_right = [], []
    ankle_y_left = []

    # Indices MediaPipe: 23=leftHip, 24=rightHip, 25=leftKnee, 26=rightKnee,
    # 27=leftAnkle, 28=rightAnkle
    for f in keypoints_per_frame:
        kp = f["keypoints"]
        if (kp[23]["visibility"] > 0.5 and kp[25]["visibility"] > 0.5
                and kp[27]["visibility"] > 0.5):
            knee_left.append(angle(kp[23], kp[25], kp[27]))
            ankle_y_left.append(kp[27]["y"])
        if (kp[24]["visibility"] > 0.5 and kp[26]["visibility"] > 0.5
                and kp[28]["visibility"] > 0.5):
            knee_right.append(angle(kp[24], kp[26], kp[28]))

    def avg(arr):
        return round(sum(arr) / len(arr), 2) if arr else None

    knee_l_avg = avg(knee_left)
    knee_r_avg = avg(knee_right)
    asymmetry = None
    if knee_l_avg and knee_r_avg:
        asymmetry = round(abs(knee_l_avg - knee_r_avg) / max(knee_l_avg, knee_r_avg) * 100, 2)

    stride_hz = None
    if len(ankle_y_left) > 5:
        peaks = 0
        for i in range(1, len(ankle_y_left) - 1):
            if ankle_y_left[i] < ankle_y_left[i - 1] and ankle_y_left[i] < ankle_y_left[i + 1]:
                peaks += 1
        duration = keypoints_per_frame[-1]["timestamp"] - keypoints_per_frame[0]["timestamp"]
        if duration > 0:
            stride_hz = round(peaks / duration, 2)

    return {
        "knee_left_avg": knee_l_avg,
        "knee_right_avg": knee_r_avg,
        "asymmetry_pct": asymmetry,
        "stride_frequency_hz": stride_hz,
        "samples_left": len(knee_left),
        "samples_right": len(knee_right),
    }


# ── Función ASYNC con callback (lo que llama VITAS API) ────────────────
@app.function(
    image=image,
    gpu="T4",
    volumes={MODELS_PATH: volume},
    timeout=900,
    memory=8192,
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
)
def analyze_and_callback(
    video_url: str,
    analysis_id: str,
    callback_url: str,
    callback_token: str,
    target_player_bbox: dict | None = None,
) -> dict:
    """Procesa vídeo + POST callback a VITAS cuando termina."""
    import requests

    try:
        result = analyze_video.local(video_url, target_player_bbox)

        cb_response = requests.post(
            callback_url,
            json={
                "analysisId": analysis_id,
                "callbackToken": callback_token,
                "modalRunId": "managed-by-modal",
                "status": "success",
                "result": result,
            },
            timeout=30,
        )
        cb_response.raise_for_status()
        return {"callback_sent": True, "callback_status": cb_response.status_code}

    except Exception as exc:
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


# ── Endpoint HTTP público que llama VITAS API ─────────────────────────
@app.function(
    image=image,
    secrets=[
        modal.Secret.from_name("vitas-bunny"),
        modal.Secret.from_name("vitas-anthropic"),
        modal.Secret.from_name("vitas-voyage"),
    ],
)
@modal.fastapi_endpoint(method="POST", label="analyze")
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
        "callbackToken": "secret",
        "targetPlayerBbox": {...} | null
      }
    """
    video_url = payload.get("videoUrl")
    analysis_id = payload.get("analysisId")
    callback_url = payload.get("callbackUrl")
    callback_token = payload.get("callbackToken")
    target_bbox = payload.get("targetPlayerBbox")

    if not all([video_url, analysis_id, callback_url, callback_token]):
        return {
            "error": "missing_required_fields",
            "required": ["videoUrl", "analysisId", "callbackUrl", "callbackToken"],
        }

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


# ── CLI test (sólo para desarrollo) ────────────────────────────────
@app.local_entrypoint()
def main(video_url: str = "https://download.samplelib.com/mp4/sample-5s.mp4"):
    print(f"[VITAS] Test pipeline con {video_url}")
    result = analyze_video.remote(video_url)
    print(f"\n=== RESULTADO ===")
    print(f"Status: {result['status']}")
    print(f"Frames procesados: {result['framesProcessed']}")
    print(f"Pose detectada: {result['framesWithPose']}/{result['framesProcessed']}")
    print(f"Latencia: {result['totalLatencyMs']}ms")
