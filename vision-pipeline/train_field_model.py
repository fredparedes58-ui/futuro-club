"""
VITAS · Entrenar el modelo NANO de keypoints de campo (Fase 2b auto-calibración)

Por qué: el modelo público que exportamos (YOLOv8x-pose, martinjolif) da 279 MB en
ONNX → inviable en el navegador. Aquí entrenamos uno PEQUEÑO (yolo11s-pose ≈ 20 MB)
con el MISMO esquema de 32 keypoints, usando el dataset público
`martinjolif/football-pitch-detection` (HuggingFace, CC-BY-4.0, 317 imágenes ya en
formato YOLO-pose). Resultado: mismo contrato de salida, ~14× más pequeño.

OJO LICENCIA: esto resuelve la licencia del DATASET (CC-BY-4.0, permisiva con
atribución), NO la del framework: Ultralytics sigue siendo AGPL-3.0. Para eliminar
del todo la exposición AGPL habría que usar un framework permisivo (RT-DETR/RTMPose
Apache-2.0) o comprar la licencia Enterprise de Ultralytics.

Uso:
    # Entrenar (GPU A10G, ~20-40 min con 317 imgs) y exportar a ONNX
    modal run vision-pipeline/train_field_model.py::main \
        --model yolo11s-pose.pt --epochs 300 \
        --out public/models/field-keypoints-s.onnx

    # Variante aún más pequeña (~6 MB) para móvil
    modal run vision-pipeline/train_field_model.py::main --model yolo11n-pose.pt

El ONNX resultante tiene el MISMO orden de 32 keypoints que FIELD_TEMPLATE
(src/lib/yolo/fieldRegistration.ts) porque el dataset usa el esquema de
SoccerPitchConfiguration (roboflow/sports).

Limitación conocida (dominio): las 317 imágenes son de BROADCAST (TV, cámara alta,
estadio). Para footage de móvil en campo de academia generalizará peor. El salto
real de calidad vendrá de re-entrenar añadiendo footage propio anotado.
"""

from __future__ import annotations

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        "ultralytics==8.3.40",
        "opencv-python-headless==4.10.0.84",
        "numpy<2.0",
        "onnx==1.17.0",
        "onnxscript",
        "onnxslim==0.1.42",
        "onnxruntime==1.20.1",
        "huggingface_hub==0.26.2",
    )
)

app = modal.App("vitas-field-model-train")

DATASET_REPO = "martinjolif/football-pitch-detection"


@app.function(image=image, gpu="A10G", timeout=5400)
def train(
    base_model: str = "yolo11s-pose.pt",
    epochs: int = 300,
    imgsz: int = 640,
    batch: int = 16,
) -> tuple[bytes, dict]:
    """Descarga el dataset de HF, entrena y exporta a ONNX. Devuelve (onnx, metadata)."""
    import os
    import shutil

    import yaml  # type: ignore
    from huggingface_hub import snapshot_download  # type: ignore
    from ultralytics import YOLO  # type: ignore

    # ── 1. Dataset ────────────────────────────────────────────────────────
    root = snapshot_download(repo_id=DATASET_REPO, repo_type="dataset")
    data_dir = os.path.join(root, "data")
    print(f"[VITAS] Dataset en {data_dir}: {os.listdir(data_dir)}")

    # El data.yaml del release trae rutas relativas de Roboflow; lo reescribimos
    # con rutas absolutas para que ultralytics lo resuelva sin ambigüedad.
    with open(os.path.join(data_dir, "data.yaml")) as f:
        cfg = yaml.safe_load(f)
    print(f"[VITAS] data.yaml original: {cfg}")

    cfg["path"] = data_dir
    for split in ("train", "val", "test"):
        # Roboflow usa 'valid' como carpeta de validación
        folder = "valid" if split == "val" else split
        p = os.path.join(data_dir, folder, "images")
        if os.path.isdir(p):
            cfg[split] = p
    # El dataset es de un campo → 1 clase, 32 keypoints (x, y, visible)
    cfg.setdefault("kpt_shape", [32, 3])
    # flip_idx OBLIGATORIO: con fliplr>0 (default 0.5) Ultralytics espeja la imagen
    # izq↔der; sin remapear los índices de keypoints, corrompe la mitad de los batches.
    # Este es el espejo horizontal exacto de FIELD_TEMPLATE (== flip_idx del data.yaml
    # del dataset martinjolif). Lo fijamos explícito por si el yaml de origen no lo trae.
    FLIP_IDX = [24, 25, 26, 27, 28, 29, 22, 23, 21, 17, 18, 19, 20, 13, 14, 15, 16,
                9, 10, 11, 12, 8, 6, 7, 0, 1, 2, 3, 4, 5, 31, 30]
    assert len(FLIP_IDX) == cfg["kpt_shape"][0], "flip_idx debe tener 32 índices"
    if cfg.get("flip_idx") and list(cfg["flip_idx"]) != FLIP_IDX:
        print(f"[VITAS] AVISO: flip_idx del yaml {cfg['flip_idx']} != esperado; se respeta el del yaml")
    else:
        cfg["flip_idx"] = FLIP_IDX

    work_yaml = "/tmp/vitas_pitch.yaml"
    with open(work_yaml, "w") as f:
        yaml.safe_dump(cfg, f)
    print(f"[VITAS] data.yaml efectivo: {cfg}")

    # ── 2. Entrenar ───────────────────────────────────────────────────────
    model = YOLO(base_model)
    model.train(
        data=work_yaml,
        epochs=epochs,
        imgsz=imgsz,
        batch=batch,
        patience=60,          # early stopping si no mejora
        pretrained=True,      # transfer learning desde COCO-pose
        project="/tmp/runs",
        name="pitch",
        exist_ok=True,
        verbose=True,
    )

    best = "/tmp/runs/pitch/weights/best.pt"
    print(f"[VITAS] best={best} exists={os.path.exists(best)}")

    # ── 3. Métricas de validación ─────────────────────────────────────────
    trained = YOLO(best)
    metrics = {}
    try:
        res = trained.val(data=work_yaml, imgsz=imgsz)
        metrics = {
            "pose_map50": float(getattr(res.pose, "map50", 0) or 0),
            "pose_map": float(getattr(res.pose, "map", 0) or 0),
            "box_map50": float(getattr(res.box, "map50", 0) or 0),
        }
    except Exception as e:  # noqa: BLE001
        print(f"[VITAS] val() falló (no bloquea): {e}")

    # ── 4. Exportar a ONNX ────────────────────────────────────────────────
    onnx_path = trained.export(
        format="onnx", imgsz=imgsz, opset=17, simplify=True, dynamic=False
    )
    size_mb = os.path.getsize(onnx_path) / 1e6
    print(f"[VITAS] ONNX -> {onnx_path} ({size_mb:.1f} MB)")

    info = {
        "base_model": base_model,
        "epochs": epochs,
        "imgsz": imgsz,
        "onnx_size_mb": round(size_mb, 1),
        "kpt_shape": list(getattr(trained.model, "kpt_shape", []) or []),
        **metrics,
    }
    with open(onnx_path, "rb") as f:
        return f.read(), info


@app.local_entrypoint()
def main(
    model: str = "yolo11s-pose.pt",
    epochs: int = 300,
    out: str = "public/models/field-keypoints-s.onnx",
):
    data, info = train.remote(model, epochs)
    with open(out, "wb") as f:
        f.write(data)
    print(f"[VITAS] Saved {out} ({len(data) / 1e6:.1f} MB)")
    print("[VITAS] metadata:", info)
