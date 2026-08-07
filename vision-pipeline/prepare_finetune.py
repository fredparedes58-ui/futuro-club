"""
VITAS · Auto-etiquetado semiautomático para el fine-tune del modelo de campo.

PASO 1 del pipeline (inferencia): sube frames YA extraídos localmente (JPEG) a Modal,
corre el MISMO modelo base de keypoints de campo (yolo11s-pose afinado, martinjolif) por
frame y devuelve los keypoints predichos por frame → JSON.

Ese JSON lo consume el PASO 2 (bucketing en TS, reutiliza el gate de producción
`registerFieldFromLandmarks`): decide AUTO (el modelo ya calibra fiable → pseudo-etiqueta)
vs HARD (el usuario marca a mano). Ver src/test/lib/yolo/bucketPseudoLabels.test.ts.

Uso:
    modal run vision-pipeline/prepare_finetune.py::main \
        --frames-dir scratchpad/ft/frames_raw \
        --out scratchpad/ft/predictions.json
"""

from __future__ import annotations

import json
import os

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        "ultralytics==8.3.40",
        "opencv-python-headless==4.10.0.84",
        "numpy<2.0",
        "huggingface_hub==0.26.2",
    )
)

app = modal.App("vitas-finetune-prep")
MODEL_REPO = "martinjolif/yolo-football-pitch-detection"
MODEL_FILE = "yolo-football-pitch-detection.pt"


@app.function(image=image, gpu="A10G", timeout=2400)
def infer(images: dict[str, bytes], conf: float = 0.10) -> list[dict]:
    """Corre el modelo base sobre cada JPEG. Devuelve keypoints en px de la imagen
    ORIGINAL (Ultralytics deshace el letterbox internamente en .predict)."""
    import cv2  # type: ignore
    import numpy as np  # type: ignore
    from huggingface_hub import hf_hub_download  # type: ignore
    from ultralytics import YOLO  # type: ignore

    model = YOLO(hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE))
    print(f"[VITAS] modelo cargado · {len(images)} frames a inferir")

    out: list[dict] = []
    conf_sum, conf_n = 0.0, 0
    for name in sorted(images.keys()):
        buf = np.frombuffer(images[name], dtype=np.uint8)
        frame = cv2.imdecode(buf, cv2.IMREAD_COLOR)
        if frame is None:
            out.append({"name": name, "w": 0, "h": 0, "pred": [], "gt": []})
            continue
        h, w = frame.shape[:2]
        res = model.predict(frame, conf=conf, verbose=False)[0]
        pred = []
        if res.keypoints is not None and len(res.keypoints) > 0:
            # Instancia con más keypoints de alta confianza (el campo es objeto único).
            best_i, best_score = 0, -1.0
            data = res.keypoints.data  # (n_inst, 32, 3)
            for i in range(len(data)):
                score = float((data[i][:, 2] > 0.5).sum())
                if score > best_score:
                    best_score, best_i = score, i
            for j, kp in enumerate(data[best_i].tolist()):
                pred.append({"id": j, "x": round(kp[0], 2), "y": round(kp[1], 2), "conf": round(kp[2], 3)})
            for kp in pred:
                conf_sum += kp["conf"]; conf_n += 1
        out.append({"name": name, "w": w, "h": h, "pred": pred, "gt": []})

    print(f"[VITAS] hecho · conf media de keypoints: {(conf_sum / conf_n) if conf_n else 0:.3f}")
    return out


@app.local_entrypoint()
def main(frames_dir: str, out: str = "scratchpad/ft/predictions.json", conf: float = 0.10):
    images: dict[str, bytes] = {}
    for fn in sorted(os.listdir(frames_dir)):
        if fn.lower().endswith((".jpg", ".jpeg", ".png")):
            with open(os.path.join(frames_dir, fn), "rb") as f:
                images[fn] = f.read()
    total_mb = sum(len(v) for v in images.values()) / 1e6
    print(f"[VITAS] subiendo {len(images)} frames ({total_mb:.0f} MB) a Modal…")
    res = infer.remote(images, conf)
    with open(out, "w") as f:
        json.dump(res, f)
    calibr = sum(1 for fr in res if len(fr["pred"]) > 0)
    print(f"[VITAS] {len(res)} frames inferidos · {calibr} con keypoints · guardado en {out}")
