"""
VITAS · ONNX export helper (FASE 1 vision upgrade)

Exports an ultralytics YOLO model to ONNX **on Modal** (avoids needing
torch/ultralytics locally — Windows + Python 3.14 has no torch wheel).

Usage:
    modal run vision-pipeline/export_onnx.py                       # yolo11m-pose → public/models/yolov11m-pose.onnx
    modal run vision-pipeline/export_onnx.py --model yolo11l-pose.pt --out public/models/yolov11l-pose.onnx

Notes:
- imgsz=640 to match ModelSpec.inputSize (src/lib/yolo/modelConfig.ts:76).
- opset=17: supported by onnxruntime-web 1.24 used in the browser workers.
- Static batch (worker feeds 1 frame at a time).
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
        "onnxscript",  # requerido por el exporter ONNX de torch moderno
        "onnxslim==0.1.42",
        "onnxruntime==1.20.1",
    )
)

app = modal.App("vitas-onnx-export")


@app.function(image=image, timeout=900)
def export_onnx(model_name: str = "yolo11m-pose.pt", imgsz: int = 640) -> bytes:
    """Download the .pt on Modal, export to ONNX (input fijo imgsz×imgsz), return bytes."""
    import os

    from ultralytics import YOLO  # type: ignore

    model = YOLO(model_name)
    out_path = model.export(format="onnx", imgsz=imgsz, opset=17, simplify=True, dynamic=False)
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"[VITAS] Exported {model_name} @ imgsz={imgsz} -> {out_path} ({size_mb:.1f} MB)")
    with open(out_path, "rb") as f:
        return f.read()


@app.local_entrypoint()
def main(model: str = "yolo11m-pose.pt", out: str = "public/models/yolov11m-pose.onnx", imgsz: int = 640):
    data = export_onnx.remote(model, imgsz)
    with open(out, "wb") as f:
        f.write(data)
    print(f"[VITAS] Saved {out} ({len(data) / 1e6:.1f} MB, imgsz={imgsz})")
