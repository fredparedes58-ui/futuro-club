"""
VITAS · Field-keypoint model → inspect + ONNX export (Fase 2 auto-calibración)

Descarga un modelo de KEYPOINTS DE CAMPO desde HuggingFace (público, sin API key),
lo INSPECCIONA (nº real de keypoints, arquitectura, nombres) y lo exporta a ONNX
para la auto-calibración de la homografía píxel↔metros (sin marcar puntos a mano).

Todo corre en Modal (GPU en la nube). Importante por seguridad: cargar un .pt de
terceros deserializa pickle → ejecuta código. Hacerlo aquí lo mantiene en un
sandbox remoto y efímero, nunca en la máquina del usuario.

Modelos candidatos (pesos públicos en HF):
  - martinjolif/yolo-football-pitch-detection  · YOLOv8x-pose · 32 kpts · 140MB · AGPL-3.0
  - Adit-jain/Soccana_Keypoint                 · YOLO11-pose  · 29 kpts · 86MB  · sin licencia
Ambos derivan de Ultralytics (AGPL-3.0). OJO LICENCIA: para SaaS comercial, AGPL
obliga a liberar el código del servicio. Alternativas: licencia comercial de
Ultralytics, o entrenar con un dataset permisivo (martinjolif/football-pitch-detection,
CC-BY-4.0, 317 imgs, 32 kpts) sobre un framework permisivo.

Uso:
    # 1. Inspeccionar (rápido, sin exportar): imprime arquitectura y nº de keypoints
    modal run vision-pipeline/export_field_model.py::inspect

    # 2. Exportar a ONNX (imgsz 640, opset 17) y guardarlo en local
    modal run vision-pipeline/export_field_model.py \
        --repo martinjolif/yolo-football-pitch-detection \
        --filename yolo-football-pitch-detection.pt \
        --out public/models/field-keypoints.onnx

Después:
    - Sube el .onnx como release asset (tag models-v1), como pose/ball.
    - Añádelo a scripts/download-models.mjs (prebuild lo baja a public/models/).
    - Ajusta FIELD_TEMPLATE (src/lib/yolo/fieldRegistration.ts) al esquema REAL de
      keypoints que reporte `inspect`, y activa la config en fieldModelConfig.ts.

Notas:
- imgsz=640 (coincide con FieldModelConfig.inputSize).
- opset=17 (soportado por onnxruntime-web en los workers).
- Static batch (1 frame por inferencia).
- Salida esperada YOLO-pose: [1, 4+1+K*3, N] (caja + conf + K*(x,y,conf)).
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

app = modal.App("vitas-field-model-export")

DEFAULT_REPO = "martinjolif/yolo-football-pitch-detection"
DEFAULT_FILE = "yolo-football-pitch-detection.pt"


def _fetch(repo: str, filename: str) -> str:
    """Descarga el .pt desde HuggingFace (repo público, sin token)."""
    from huggingface_hub import hf_hub_download  # type: ignore

    path = hf_hub_download(repo_id=repo, filename=filename)
    print(f"[VITAS] Descargado {repo}/{filename} -> {path}")
    return path


def _describe(model) -> dict:
    """Extrae la metadata que necesitamos para cablear el decoder del worker."""
    info: dict = {}
    m = getattr(model, "model", None)
    try:
        info["kpt_shape"] = list(getattr(m, "kpt_shape", []) or [])
    except Exception:
        info["kpt_shape"] = []
    try:
        info["names"] = getattr(model, "names", None)
    except Exception:
        info["names"] = None
    try:
        info["task"] = getattr(model, "task", None)
    except Exception:
        info["task"] = None
    try:
        info["yaml_model"] = (getattr(m, "yaml", {}) or {}).get("yaml_file")
    except Exception:
        info["yaml_model"] = None
    try:
        info["n_params"] = sum(p.numel() for p in m.parameters())
    except Exception:
        info["n_params"] = None
    return info


@app.function(image=image, timeout=900)
def inspect_model(repo: str = DEFAULT_REPO, filename: str = DEFAULT_FILE) -> dict:
    """Carga el modelo y reporta arquitectura + nº de keypoints (sin exportar)."""
    from ultralytics import YOLO  # type: ignore

    path = _fetch(repo, filename)
    model = YOLO(path)
    info = _describe(model)
    print(f"[VITAS] task={info['task']} kpt_shape={info['kpt_shape']} "
          f"names={info['names']} params={info['n_params']}")
    return info


@app.function(image=image, timeout=1800)
def export_field_model(
    repo: str = DEFAULT_REPO,
    filename: str = DEFAULT_FILE,
    half: bool = False,
) -> tuple[bytes, dict]:
    """Descarga, inspecciona y exporta a ONNX. Devuelve (bytes_onnx, metadata)."""
    import os

    from ultralytics import YOLO  # type: ignore

    path = _fetch(repo, filename)
    model = YOLO(path)
    info = _describe(model)
    print(f"[VITAS] task={info['task']} kpt_shape={info['kpt_shape']} params={info['n_params']}")

    out_path = model.export(
        format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False, half=half
    )
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"[VITAS] Exported -> {out_path} ({size_mb:.1f} MB)")
    info["onnx_size_mb"] = round(size_mb, 1)
    with open(out_path, "rb") as f:
        return f.read(), info


@app.local_entrypoint()
def inspect(repo: str = DEFAULT_REPO, filename: str = DEFAULT_FILE):
    """Solo inspección: `modal run ...::inspect`"""
    info = inspect_model.remote(repo, filename)
    print("\n[VITAS] === METADATA DEL MODELO ===")
    for k, v in info.items():
        print(f"  {k}: {v}")


@app.local_entrypoint()
def main(
    repo: str = DEFAULT_REPO,
    filename: str = DEFAULT_FILE,
    out: str = "public/models/field-keypoints.onnx",
    half: bool = False,
):
    data, info = export_field_model.remote(repo, filename, half)
    with open(out, "wb") as f:
        f.write(data)
    print(f"[VITAS] Saved {out} ({len(data) / 1e6:.1f} MB)")
    print("[VITAS] metadata:", info)
    print("[VITAS] Siguiente: ajustar FIELD_TEMPLATE al kpt_shape reportado, "
          "subir como release asset y añadir a download-models.mjs")
