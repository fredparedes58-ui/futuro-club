"""
VITAS · Modal · Pipeline E2E con MediaPipe Pose
Procesa un vídeo y devuelve keypoints biomecánicos.

Stack:
  - YOLOv8 (ultralytics) → detección de personas (Apache 2.0 para detection-only)
    OR opencv HOG simple → detección sin license issue
  - MediaPipe Pose → 33 keypoints biomecánicos por persona

NOTA: para MVP usamos MediaPipe directo en frame completo (modo single person)
o con detección previa para multi-person. Empezamos simple: single person mode
asumiendo que el padre recorta el vídeo a su hijo.

Uso:
    modal run modal/test_pose_pipeline.py::test_pose
    modal run modal/test_pose_pipeline.py::test_pose --video-url=URL_MP4

Latencia esperada T4: ~15 seg para vídeo de 5 seg
Coste estimado: ~€0.002 por vídeo en T4 (free tier cubre)
"""

import modal

app = modal.App("vitas-test-pose")

# Imagen MUY simple · MediaPipe es Python puro + pre-built wheels
image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("ffmpeg", "libgl1-mesa-glx", "libglib2.0-0")
    .pip_install(
        "mediapipe==0.10.18",
        "opencv-python-headless==4.10.0.84",
        "numpy==1.26.4",
        "decord==0.6.0",
        "requests==2.32.3",
    )
)

volume = modal.Volume.from_name("vitas-models", create_if_missing=True)
MODELS_PATH = "/models"


@app.function(
    image=image,
    gpu="T4",
    volumes={MODELS_PATH: volume},
    timeout=300,
    memory=4096,
)
def process_video(video_url: str, max_frames: int = 30) -> dict:
    """
    Procesa un vídeo:
      1. Descarga
      2. Decodifica frames (submuestreo)
      3. MediaPipe Pose → 33 keypoints por frame
      4. Métricas biomecánicas básicas
    """
    import time
    import os
    import requests
    import numpy as np
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
    step(f"Descargando: {video_url[:80]}")
    local_path = "/tmp/test_video.mp4"
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

    # ── 3. Inicializar MediaPipe Pose ──────────────────────────
    step("Inicializando MediaPipe Pose")
    mp_pose = mp.solutions.pose
    pose = mp_pose.Pose(
        static_image_mode=False,
        model_complexity=2,        # 0=lite, 1=full, 2=heavy (mejor calidad)
        enable_segmentation=False,
        min_detection_confidence=0.5,
        min_tracking_confidence=0.5,
    )

    # ── 4. Procesar frames ──────────────────────────────────────
    keypoints_per_frame = []
    frames_with_pose = 0
    sample_keypoints_first = None

    for idx in sampled_indices:
        frame_bgr = vr[idx].asnumpy()
        # MediaPipe espera RGB
        frame_rgb = cv2.cvtColor(frame_bgr, cv2.COLOR_BGR2RGB)
        results = pose.process(frame_rgb)

        if results.pose_landmarks:
            frames_with_pose += 1
            h, w, _ = frame_rgb.shape
            kp_list = []
            for lm in results.pose_landmarks.landmark:
                kp_list.append({
                    "x": float(lm.x * w),       # coordenadas píxel
                    "y": float(lm.y * h),
                    "z": float(lm.z),           # profundidad relativa
                    "visibility": float(lm.visibility),
                })

            keypoints_per_frame.append({
                "timestamp": float(idx / fps),
                "frame_idx": int(idx),
                "keypoints": kp_list,
            })

            # Guardar muestra del primer frame con pose detectada
            if sample_keypoints_first is None:
                # MediaPipe POSE_LANDMARKS: 33 puntos
                # Algunos relevantes: nose=0, leftAnkle=27, rightAnkle=28
                sample_keypoints_first = {
                    "nose": kp_list[0],
                    "leftShoulder": kp_list[11],
                    "rightShoulder": kp_list[12],
                    "leftHip": kp_list[23],
                    "rightHip": kp_list[24],
                    "leftKnee": kp_list[25],
                    "rightKnee": kp_list[26],
                    "leftAnkle": kp_list[27],
                    "rightAnkle": kp_list[28],
                }

    pose.close()
    step(f"Pose detectada en {frames_with_pose}/{len(sampled_indices)} frames")

    # ── 5. Métricas biomecánicas básicas ──────────────────────
    metrics = compute_basic_biomechanics(keypoints_per_frame)
    step(f"Métricas calculadas: ángulo rodilla L={metrics['knee_left_avg']}°, R={metrics['knee_right_avg']}°")

    # ── 6. Resultado ────────────────────────────────────────────
    total_time = time.time() - t0
    step(f"Pipeline completo en {total_time:.1f}s")

    return {
        "status": "success" if frames_with_pose > 0 else "no_pose_detected",
        "video": {
            "size_mb": round(file_size_mb, 2),
            "duration_sec": round(duration, 2),
            "fps": round(fps, 1),
            "total_frames": int(total_frames),
            "processed_frames": len(sampled_indices),
        },
        "pose": {
            "frames_with_pose": int(frames_with_pose),
            "detection_rate": round(frames_with_pose / len(sampled_indices), 3),
            "total_keypoints_per_frame": 33,
            "sample_keypoints": sample_keypoints_first,
        },
        "biomechanics": metrics,
        "performance": {
            "total_latency_sec": round(total_time, 2),
            "estimated_cost_eur": round(total_time / 3600 * 0.28, 4),
        },
        "log": log,
    }


def compute_basic_biomechanics(keypoints_per_frame: list) -> dict:
    """Calcula métricas biomecánicas básicas a partir de los frames."""
    if not keypoints_per_frame:
        return {"error": "no_keypoints"}

    import math

    def angle(a, b, c):
        """Ángulo en B formado por A-B-C en grados."""
        ab = (a["x"] - b["x"], a["y"] - b["y"])
        cb = (c["x"] - b["x"], c["y"] - b["y"])
        dot = ab[0] * cb[0] + ab[1] * cb[1]
        mag_ab = math.hypot(*ab)
        mag_cb = math.hypot(*cb)
        if mag_ab == 0 or mag_cb == 0:
            return 0
        cos_angle = max(-1, min(1, dot / (mag_ab * mag_cb)))
        return math.degrees(math.acos(cos_angle))

    knee_left = []
    knee_right = []
    ankle_y_left = []

    # Indices MediaPipe: 23=leftHip, 24=rightHip, 25=leftKnee, 26=rightKnee, 27=leftAnkle, 28=rightAnkle
    for f in keypoints_per_frame:
        kp = f["keypoints"]
        # Filtrar baja confianza
        if kp[23]["visibility"] > 0.5 and kp[25]["visibility"] > 0.5 and kp[27]["visibility"] > 0.5:
            knee_left.append(angle(kp[23], kp[25], kp[27]))
            ankle_y_left.append(kp[27]["y"])
        if kp[24]["visibility"] > 0.5 and kp[26]["visibility"] > 0.5 and kp[28]["visibility"] > 0.5:
            knee_right.append(angle(kp[24], kp[26], kp[28]))

    def avg(arr):
        return round(sum(arr) / len(arr), 2) if arr else None

    knee_l_avg = avg(knee_left)
    knee_r_avg = avg(knee_right)
    asymmetry = None
    if knee_l_avg and knee_r_avg:
        asymmetry = round(abs(knee_l_avg - knee_r_avg) / max(knee_l_avg, knee_r_avg) * 100, 2)

    # Frecuencia de zancada (picos de tobillo izquierdo)
    stride_hz = None
    if len(ankle_y_left) > 5:
        peaks = 0
        for i in range(1, len(ankle_y_left) - 1):
            if ankle_y_left[i] < ankle_y_left[i - 1] and ankle_y_left[i] < ankle_y_left[i + 1]:
                peaks += 1
        # Estimación rough (asumiendo distribución uniforme)
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


# Vídeo público de prueba (~3MB, 5s, 720p, gente caminando)
DEFAULT_TEST_VIDEO = "https://download.samplelib.com/mp4/sample-5s.mp4"


@app.local_entrypoint()
def test_pose(video_url: str = DEFAULT_TEST_VIDEO):
    print(f"\n[VITAS] Test E2E pipeline MediaPipe Pose")
    print(f"[VITAS] Vídeo: {video_url}\n")

    result = process_video.remote(video_url)

    print("\n" + "=" * 60)
    print("=== RESULTADO ===")
    print("=" * 60)

    print(f"\n📹 VÍDEO:")
    for k, v in result["video"].items():
        print(f"  {k}: {v}")

    print(f"\n🦴 POSE:")
    print(f"  frames_with_pose: {result['pose']['frames_with_pose']}/{result['video']['processed_frames']}")
    print(f"  detection_rate: {result['pose']['detection_rate']*100:.1f}%")
    print(f"  total_keypoints_per_frame: {result['pose']['total_keypoints_per_frame']}")
    if result['pose']['sample_keypoints']:
        print(f"  sample_keypoints (puntos clave):")
        for name, kp in result['pose']['sample_keypoints'].items():
            print(f"    {name}: x={kp['x']:.0f}, y={kp['y']:.0f}, vis={kp['visibility']:.2f}")

    print(f"\n📐 BIOMECÁNICA:")
    bio = result['biomechanics']
    print(f"  ángulo rodilla izq: {bio.get('knee_left_avg')}°")
    print(f"  ángulo rodilla der: {bio.get('knee_right_avg')}°")
    print(f"  asimetría: {bio.get('asymmetry_pct')}%")
    print(f"  frecuencia zancada: {bio.get('stride_frequency_hz')} Hz")

    print(f"\n💰 PERFORMANCE:")
    print(f"  latency: {result['performance']['total_latency_sec']}s")
    print(f"  cost: €{result['performance']['estimated_cost_eur']}")

    if result["status"] == "success":
        print(f"\n✅ PIPELINE FUNCIONA · MediaPipe Pose operativo")
    else:
        print(f"\n⚠️  No se detectó pose (¿vídeo sin personas?)")
