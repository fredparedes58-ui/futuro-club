"""
VITAS · Validación de auto-calibración sobre un vídeo LOCAL del usuario.

Sube un .mov/.mp4 local a Modal, saca frames, corre el modelo de keypoints de campo
por frame y vuelca las detecciones a JSON (mismo formato que eval_field_video.py) →
lo consume src/test/lib/yolo/fieldEval.test.ts para medir fiabilidad en TU dominio.

    modal run vision-pipeline/eval_user_video.py::main \
        --path "C:/ruta/al/clip.mov" --out scratchpad/field_video_eval.json --frames 50
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
    )
)

app = modal.App("vitas-user-video-eval")
MODEL_REPO = "martinjolif/yolo-football-pitch-detection"
MODEL_FILE = "yolo-football-pitch-detection.pt"


@app.function(image=image, gpu="A10G", timeout=2400)
def evaluate_bytes(video_bytes: bytes, num_frames: int = 50) -> dict:
    import os

    import cv2  # type: ignore
    from huggingface_hub import hf_hub_download  # type: ignore
    from ultralytics import YOLO  # type: ignore

    with open("/tmp/clip.mov", "wb") as f:
        f.write(video_bytes)
    model = YOLO(hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE))

    cap = cv2.VideoCapture("/tmp/clip.mov")
    total = int(cap.get(cv2.CAP_PROP_FRAME_COUNT)) or 0
    fps = cap.get(cv2.CAP_PROP_FPS) or 30
    w = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
    h = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
    step = max(1, (total or num_frames * 10) // num_frames)
    print(f"[VITAS] clip {w}x{h}, {total} frames @ {fps:.0f}fps, muestreo cada {step}")

    out = []
    idx = 0
    read_fail = 0
    while True:
        ok, frame = cap.read()
        if not ok:
            read_fail += 1
            if read_fail > 5 or idx > (total or 100000):
                break
            continue
        if idx % step == 0:
            res = model.predict(frame, verbose=False)[0]
            pred = []
            if res.keypoints is not None and len(res.keypoints) > 0:
                for i, kp in enumerate(res.keypoints.data[0].tolist()):
                    pred.append({"id": i, "x": round(kp[0], 2), "y": round(kp[1], 2), "conf": round(kp[2], 3)})
            out.append({"name": f"frame_{idx:04d}", "w": w, "h": h, "pred": pred, "gt": []})
        idx += 1
    cap.release()
    # Diagnóstico: confianza media de keypoints por frame (proxy de "ve el campo").
    avg_conf = 0.0
    n = 0
    for fr in out:
        for k in fr["pred"]:
            avg_conf += k["conf"]; n += 1
    print(f"[VITAS] {len(out)} frames evaluados · conf media de keypoints: {(avg_conf/n) if n else 0:.3f}")
    return {"w": w, "h": h, "fps": fps, "total": total, "frames": out}


@app.local_entrypoint()
def main(path: str, out: str = "scratchpad/field_video_eval.json", frames: int = 50):
    with open(path, "rb") as f:
        vb = f.read()
    print(f"[VITAS] subiendo {len(vb) / 1e6:.0f} MB a Modal…")
    res = evaluate_bytes.remote(vb, frames)
    with open(out, "w") as f:
        json.dump(res["frames"], f)
    print(f"[VITAS] clip {res['w']}x{res['h']} @ {res['fps']:.0f}fps, {res['total']} frames totales")
    print(f"[VITAS] {len(res['frames'])} frames evaluados · guardado en {out}")
