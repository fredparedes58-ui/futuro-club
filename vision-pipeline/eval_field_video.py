"""
VITAS · Validación de la auto-calibración sobre un VÍDEO real (estabilidad temporal)

Las imágenes sueltas (eval_field_model.py) no dicen si la calibración es ESTABLE
frame a frame. Aquí bajamos un clip de muestra PÚBLICO de Roboflow (demo MIT, los
mismos que usan en su tutorial de análisis de fútbol), sacamos N frames, corremos
el modelo de keypoints por frame y volcamos las detecciones a JSON.

Luego, en local, un test alimenta esos keypoints por frame a NUESTRA cadena y mide:
  - % de frames que calibran high/medium a lo largo del clip
  - error de reproyección por frame
  - JITTER temporal: cuánto salta (en metros) un punto fijo del campo entre frames
    consecutivos → mide si la homografía es estable o tiembla.

Correr:
    modal run vision-pipeline/eval_field_video.py::main --out scratchpad/field_video_eval.json
"""

from __future__ import annotations

import json
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1", "ffmpeg")
    .pip_install(
        "ultralytics==8.3.40",
        "opencv-python-headless==4.10.0.84",
        "numpy<2.0",
        "huggingface_hub==0.26.2",
        "gdown==5.2.0",
    )
)

app = modal.App("vitas-field-video-eval")

MODEL_REPO = "martinjolif/yolo-football-pitch-detection"
MODEL_FILE = "yolo-football-pitch-detection.pt"
# Clip de muestra público de Roboflow (demo MIT · examples/soccer/setup.sh)
VIDEO_GDRIVE_ID = "19PGw55V8aA6GZu5-Aac5_9mCy3fNxmEf"  # 2e57b9_0.mp4


@app.function(image=image, gpu="A10G", timeout=1800)
def evaluate(num_frames: int = 40) -> list:
    import cv2  # type: ignore
    import gdown  # type: ignore
    from huggingface_hub import hf_hub_download  # type: ignore
    from ultralytics import YOLO  # type: ignore

    gdown.download(id=VIDEO_GDRIVE_ID, output="/tmp/clip.mp4", quiet=True)
    model = YOLO(hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE))

    cap = cv2.VideoCapture("/tmp/clip.mp4")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 300
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, total // num_frames)
    print(f"[VITAS] clip {w}x{h}, {total} frames, muestreando cada {step}")

    out = []
    idx = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            break
        if idx % step == 0:
            res = model.predict(frame, verbose=False)[0]
            pred = []
            if res.keypoints is not None and len(res.keypoints) > 0:
                for i, kp in enumerate(res.keypoints.data[0].tolist()):
                    pred.append({"id": i, "x": round(kp[0], 2), "y": round(kp[1], 2), "conf": round(kp[2], 3)})
            out.append({"name": f"frame_{idx:04d}", "w": w, "h": h, "pred": pred, "gt": []})
        idx += 1
    cap.release()
    print(f"[VITAS] {len(out)} frames evaluados")
    return out


@app.local_entrypoint()
def main(out: str = "scratchpad/field_video_eval.json", frames: int = 40):
    data = evaluate.remote(frames)
    with open(out, "w") as f:
        json.dump(data, f)
    print(f"[VITAS] {len(data)} frames · guardado en {out}")
