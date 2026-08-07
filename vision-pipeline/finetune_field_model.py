"""
VITAS · Fine-tune del modelo de keypoints de campo al dominio ACADEMIA.

Mezcla el dataset broadcast base (martinjolif, 317 imgs = ANCLA fiable) con footage
propio de academia ETIQUETADO A MANO (el que sale del anotador + bucketPseudoLabels),
y continúa entrenando desde el checkpoint actual. Hiperparámetros según la
verificación de diseño (workflow 7 ago), para adaptar dominio SIN olvido catastrófico:
  - continuar desde best.pt (NO desde COCO) con freeze=10 (congela backbone)
  - lr0 bajo (0.002), cos_lr, epochs 60-100, patience 25
  - mosaic=0 (rompe la geometría del campo para keypoints); hsv/scale/translate suaves
  - flip_idx EXPLÍCITO (espejo horizontal de los 32 landmarks)
  - oversamplear academia x4 (si no, 317 broadcast ahogan las ~30 de dominio)
  - VAL = academia held-out (bloques temporales distintos), métrica de negocio aparte

El dataset de academia se sube como tar (images/ + labels/, con splits train/ y val/).
Estructura esperada dentro del tar:
    train/images/*.jpg  train/labels/*.txt
    val/images/*.jpg    val/labels/*.txt   (held-out de bloques temporales distintos)

    modal run vision-pipeline/finetune_field_model.py::main \
        --academy-tar scratchpad/ft/academy_dataset.tar \
        --base-onnx-run field-keypoints-s \
        --out public/models/field-keypoints-s-academy.onnx --epochs 80
"""

from __future__ import annotations

import io
import os
import tarfile

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        "ultralytics==8.3.40", "opencv-python-headless==4.10.0.84", "numpy<2.0",
        "onnx==1.17.0", "onnxscript", "onnxslim==0.1.42", "onnxruntime==1.20.1",
        "huggingface_hub==0.26.2",
    )
)
app = modal.App("vitas-field-finetune")

DATASET_REPO = "martinjolif/football-pitch-detection"
# flip_idx (espejo horizontal) por formato — DEBEN coincidir con src/lib/yolo.
FLIP_IDX_F11 = [24, 25, 26, 27, 28, 29, 22, 23, 21, 17, 18, 19, 20, 13, 14, 15, 16,
                9, 10, 11, 12, 8, 6, 7, 0, 1, 2, 3, 4, 5, 31, 30]  # 32 kpts
FLIP_IDX_F8 = [22, 23, 24, 25, 26, 27, 20, 21, 18, 17, 19, 11, 12, 13, 14, 16, 15,
               9, 8, 10, 6, 7, 0, 1, 2, 3, 4, 5]  # 28 kpts
FORMAT_CFG = {
    "f11": {"kpts": 32, "flip": FLIP_IDX_F11, "use_broadcast_anchor": True},
    # F8 NO tiene dataset broadcast público (esquema propio de 28 kpts) → entrena solo
    # con el footage F8 etiquetado a mano (anotador modo F8). Sin ancla broadcast.
    "f8": {"kpts": 28, "flip": FLIP_IDX_F8, "use_broadcast_anchor": False},
}


@app.function(image=image, gpu="A10G", timeout=7200)
def finetune(academy_tar: bytes, base_model_pt: bytes, epochs: int = 80,
             imgsz: int = 640, batch: int = 16, oversample: int = 4,
             fmt: str = "f11") -> tuple[bytes, dict]:
    import glob
    import shutil
    import yaml  # type: ignore
    from huggingface_hub import snapshot_download  # type: ignore
    from ultralytics import YOLO  # type: ignore

    fcfg = FORMAT_CFG[fmt]
    root = "/tmp/ds"
    os.makedirs(root, exist_ok=True)

    # ── 1. Dataset broadcast base (ancla) — SOLO F11 (F8 tiene otro esquema) ──
    if fcfg["use_broadcast_anchor"]:
        hf = snapshot_download(repo_id=DATASET_REPO, repo_type="dataset")
        hf_data = os.path.join(hf, "data")
        for split, folder in (("train", "train"), ("val", "valid")):
            for sub in ("images", "labels"):
                src = os.path.join(hf_data, folder, sub)
                dst = os.path.join(root, split, sub)
                os.makedirs(dst, exist_ok=True)
                if os.path.isdir(src):
                    for f in os.listdir(src):
                        shutil.copy(os.path.join(src, f), os.path.join(dst, f"bc_{f}"))
    else:
        print(f"[VITAS] formato {fmt}: sin ancla broadcast, solo footage propio etiquetado")

    # ── 2. Academia (a mano) — oversamplea el TRAIN, val queda tal cual ────
    with tarfile.open(fileobj=io.BytesIO(academy_tar)) as tf:
        tf.extractall("/tmp/academy")
    ac_train = 0
    for sub in ("images", "labels"):
        src = os.path.join("/tmp/academy", "train", sub)
        dst = os.path.join(root, "train", sub)
        if os.path.isdir(src):
            for f in os.listdir(src):
                stem, ext = os.path.splitext(f)
                for r in range(oversample):  # oversample: copiar x`oversample`
                    shutil.copy(os.path.join(src, f), os.path.join(dst, f"ac{r}_{stem}{ext}"))
            if sub == "images":
                ac_train = len(os.listdir(src))
    ac_val = 0
    for sub in ("images", "labels"):
        src = os.path.join("/tmp/academy", "val", sub)
        dst = os.path.join(root, "val", sub)
        os.makedirs(dst, exist_ok=True)
        if os.path.isdir(src):
            for f in os.listdir(src):
                shutil.copy(os.path.join(src, f), os.path.join(dst, f"acval_{f}"))
            if sub == "images":
                ac_val = len(os.listdir(src))

    # ── 3. data.yaml con kpt_shape + flip_idx del FORMATO ──────────────────
    cfg = {
        "path": root, "train": "train/images", "val": "val/images",
        "kpt_shape": [fcfg["kpts"], 3], "nc": 1, "names": {0: "pitch"}, "flip_idx": fcfg["flip"],
    }
    assert len(fcfg["flip"]) == fcfg["kpts"], "flip_idx debe tener kpts índices"
    work_yaml = "/tmp/finetune.yaml"
    yaml.safe_dump(cfg, open(work_yaml, "w"))
    n_train = len(glob.glob(os.path.join(root, "train", "images", "*")))
    anchor = "broadcast + " if fcfg["use_broadcast_anchor"] else ""
    print(f"[VITAS] fmt={fmt} kpts={fcfg['kpts']} · train={n_train} ({anchor}academia x{oversample} de {ac_train}) · val academia={ac_val}")

    # ── 4. Fine-tune desde el checkpoint actual ────────────────────────────
    open("/tmp/base.pt", "wb").write(base_model_pt)
    model = YOLO("/tmp/base.pt")
    model.train(
        data=work_yaml, epochs=epochs, imgsz=imgsz, batch=batch,
        pretrained=True, freeze=10,            # congela backbone → no olvida broadcast
        lr0=0.002, cos_lr=True, warmup_epochs=3, patience=25,
        mosaic=0.0,                            # mosaic rompe la geometría del campo
        hsv_h=0.015, hsv_s=0.4, hsv_v=0.4, scale=0.2, translate=0.1, degrees=0.0,
        project="/tmp/runs", name="finetune", exist_ok=True, verbose=True,
    )
    best = "/tmp/runs/finetune/weights/best.pt"
    trained = YOLO(best)
    metrics = {}
    try:
        res = trained.val(data=work_yaml, imgsz=imgsz)
        metrics = {"pose_map50": float(getattr(res.pose, "map50", 0) or 0),
                   "pose_map": float(getattr(res.pose, "map", 0) or 0)}
    except Exception as e:  # noqa: BLE001
        print(f"[VITAS] val() falló: {e}")

    onnx_path = trained.export(format="onnx", imgsz=imgsz, opset=17, simplify=True, dynamic=False)
    info = {"epochs": epochs, "academy_train": ac_train, "academy_val": ac_val,
            "oversample": oversample, "onnx_size_mb": round(os.path.getsize(onnx_path) / 1e6, 1), **metrics}
    return open(onnx_path, "rb").read(), info


@app.local_entrypoint()
def main(academy_tar: str, base_pt: str,
         out: str = "public/models/field-keypoints-s-academy.onnx",
         epochs: int = 80, oversample: int = 4, fmt: str = "f11"):
    """`base_pt` = ruta local al best.pt de partida (F11: el field-keypoints-s actual;
    F8: un yolo11s-pose base, la cabeza se re-inicializa a 28 kpts). `fmt` = f11 | f8."""
    ac = open(academy_tar, "rb").read()
    base = open(base_pt, "rb").read()
    print(f"[VITAS] fmt={fmt} · academia {len(ac)/1e6:.0f}MB + base {len(base)/1e6:.0f}MB → Modal…")
    data, info = finetune.remote(ac, base, epochs, oversample=oversample, fmt=fmt)
    open(out, "wb").write(data)
    print(f"[VITAS] guardado {out} ({len(data)/1e6:.1f}MB) · metadata: {info}")
    print("[VITAS] OJO métrica de negocio (%frames medium/high + reproj en academia)"
          " se mide APARTE: exporta, corre eval_user_video sobre un clip val y pásalo por gateHardening.test.ts")
