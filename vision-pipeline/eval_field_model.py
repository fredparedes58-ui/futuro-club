"""
VITAS · Evaluación end-to-end de la auto-calibración (Fase 3, sin clip del usuario)

Idea: usar el TEST split (held-out, 28 imgs de partido real) del dataset público
`martinjolif/football-pitch-detection` como "clip" de validación. Para cada imagen:
  1. Corre el modelo de keypoints de campo → 32 keypoints PREDICHOS (px, conf).
  2. Lee los 32 keypoints GROUND-TRUTH del label YOLO-pose.
  3. Saca ambos a JSON (en píxeles de la imagen original + w,h).

Luego, en local, un test de vitest alimenta esos keypoints REALES a NUESTRA cadena
(registerFieldFromLandmarks + homografía + refinamiento LM) y mide:
  - % de imágenes que calibran con confianza high/medium
  - error de reproyección (px)
  - ERROR EN METROS entre nuestra homografía (desde keypoints predichos) y la de
    ground-truth → la cifra de fiabilidad real.

Correr:
    modal run vision-pipeline/eval_field_model.py::main --out scratchpad/field_eval.json

Nota de dominio: estas imágenes son de BROADCAST, no de móvil de academia. Valida
la cadena modelo+geometría; el salto de dominio necesita footage propio.
"""

from __future__ import annotations

import json
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        "ultralytics==8.3.40",
        "opencv-python-headless==4.10.0.84",
        "numpy<2.0",
        "pillow==11.0.0",
        "huggingface_hub==0.26.2",
    )
)

app = modal.App("vitas-field-eval")

DATASET = "martinjolif/football-pitch-detection"
MODEL_REPO = "martinjolif/yolo-football-pitch-detection"
MODEL_FILE = "yolo-football-pitch-detection.pt"


@app.function(image=image, gpu="A10G", timeout=1800)
def evaluate() -> list:
    import glob
    import os

    from huggingface_hub import hf_hub_download, snapshot_download  # type: ignore
    from PIL import Image  # type: ignore
    from ultralytics import YOLO  # type: ignore

    ds = snapshot_download(repo_id=DATASET, repo_type="dataset")
    img_dir = os.path.join(ds, "data", "test", "images")
    lbl_dir = os.path.join(ds, "data", "test", "labels")
    model = YOLO(hf_hub_download(repo_id=MODEL_REPO, filename=MODEL_FILE))

    out = []
    for img_path in sorted(glob.glob(os.path.join(img_dir, "*.jpg"))):
        name = os.path.basename(img_path)
        w, h = Image.open(img_path).size

        # ── Predicción del modelo ──
        res = model.predict(img_path, verbose=False)[0]
        pred = []
        if res.keypoints is not None and len(res.keypoints) > 0:
            kd = res.keypoints.data[0].tolist()  # 32 × [x, y, conf]
            for i, kp in enumerate(kd):
                x, y, c = kp[0], kp[1], kp[2]
                pred.append({"id": i, "x": round(x, 2), "y": round(y, 2), "conf": round(c, 3)})

        # ── Ground truth (label YOLO-pose normalizado) ──
        gt = []
        lbl = os.path.join(lbl_dir, name.rsplit(".", 1)[0] + ".txt")
        if os.path.exists(lbl):
            first = open(lbl).read().strip().split("\n")[0].split()
            vals = list(map(float, first[5:]))  # tras class cx cy w h
            for i in range(len(vals) // 3):
                px, py, v = vals[3 * i], vals[3 * i + 1], vals[3 * i + 2]
                if v > 0:
                    gt.append({"id": i, "x": round(px * w, 2), "y": round(py * h, 2)})

        out.append({"name": name, "w": w, "h": h, "pred": pred, "gt": gt})
        print(f"[VITAS] {name}: {len(pred)} pred, {len(gt)} gt")

    return out


@app.local_entrypoint()
def main(out: str = "scratchpad/field_eval.json"):
    data = evaluate.remote()
    with open(out, "w") as f:
        json.dump(data, f)
    npred = sum(len(d["pred"]) for d in data)
    ngt = sum(len(d["gt"]) for d in data)
    print(f"[VITAS] {len(data)} imágenes · {npred} kpts predichos · {ngt} gt · guardado en {out}")
