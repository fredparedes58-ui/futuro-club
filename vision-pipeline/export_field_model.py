"""
VITAS · Field-keypoint model → ONNX export (Fase 2 auto-calibración)

Exporta a ONNX el modelo que detecta los KEYPOINTS del campo (intersecciones de
líneas), para calibrar la homografía píxel↔metros SIN marcar puntos a mano. Corre
en Modal (GPU en la nube; evita necesitar torch/ultralytics en local). Reutiliza
el mismo patrón que export_onnx.py.

El modelo esperado es un **YOLOv8-pose con 27 keypoints** en el MISMO orden de
`FIELD_TEMPLATE` (src/lib/yolo/fieldRegistration.ts). Salida ONNX: [1, 4+1+27*3, N]
= [1, 86, 8400] a imgsz 640 → el worker decodifica igual que el pose model humano
(caja + conf + 27*(x,y,conf)).

De dónde sacar el .pt de 27 keypoints (elige uno):
  A) Roboflow Universe "football field detection" (YOLOv8-pose ya entrenado con
     landmarks de campo) → descargar el .pt y re-mapear sus ids a FIELD_TEMPLATE.
     Es lo más rápido (sin entrenar). https://universe.roboflow.com (buscar
     "soccer field keypoints" / "football pitch keypoints").
  B) Fine-tune propio: dataset SoccerNet-Calibration + footage de academias,
     anotado como YOLO-pose con 27 kpts a FIELD_TEMPLATE, entrenado con
     `yolo pose train`. Mejor en dominio juvenil/amateur, pero requiere anotación.
  C) No-Bells/PnLCalib (https://github.com/mguti97/PnLCalib): pesos SOTA en
     SoccerNet, pero su salida son HEATMAPS (HRNet), no YOLO-pose → el decoder del
     worker sería distinto. Úsalo solo si necesitas la máxima precisión de
     broadcast; para el MVP, A o B encajan directo con la tubería actual.

Uso:
    # 1. Deja tu field-keypoints.pt accesible (subido a un volumen Modal, un URL, o
    #    móntalo). Aquí se asume un .pt local pasado por --model (ruta o nombre HF).
    modal run vision-pipeline/export_field_model.py --model field-keypoints.pt \
        --out public/models/field-keypoints.onnx

Después:
    - Sube field-keypoints.onnx como release asset (tag models-v1), como pose/ball.
    - Añádelo a scripts/download-models.mjs (prebuild lo baja a public/models/).
    - Activa la config en src/lib/yolo/fieldModelConfig.ts (field-keypoints-v1).

Notas:
- imgsz=640 (coincide con FieldModelConfig.inputSize).
- opset=17 (soportado por onnxruntime-web en los workers).
- Static batch (el worker mete 1 frame cada vez).
- Verifica que numKeypoints del ONNX == FIELD_TEMPLATE.length (27). Si tu .pt tiene
  otro nº/orden, ajusta el mapeo id→landmark en el decoder del worker (o re-entrena).
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
    )
)

app = modal.App("vitas-field-model-export")

# Nº de keypoints esperado — DEBE coincidir con FIELD_TEMPLATE.length en
# src/lib/yolo/fieldRegistration.ts. Si cambias la plantilla, cambia esto y el modelo.
EXPECTED_KEYPOINTS = 27


@app.function(image=image, timeout=1200)
def export_field_model(model_name: str = "field-keypoints.pt") -> bytes:
    """Carga el modelo de keypoints de campo y lo exporta a ONNX (imgsz 640, opset 17)."""
    import os

    from ultralytics import YOLO  # type: ignore

    model = YOLO(model_name)

    # Sanity-check del nº de keypoints (si el modelo lo expone).
    try:
        n_kpt = int(model.model.kpt_shape[0])  # type: ignore[attr-defined]
        if n_kpt != EXPECTED_KEYPOINTS:
            print(
                f"[VITAS][WARN] el modelo tiene {n_kpt} keypoints, se esperaban "
                f"{EXPECTED_KEYPOINTS} (FIELD_TEMPLATE). Ajusta el mapeo id→landmark "
                f"en el decoder del worker o re-entrena para que coincidan."
            )
    except Exception:
        print("[VITAS] no se pudo leer kpt_shape del modelo; sigue el export.")

    out_path = model.export(
        format="onnx", imgsz=640, opset=17, simplify=True, dynamic=False
    )
    size_mb = os.path.getsize(out_path) / 1e6
    print(f"[VITAS] Exported {model_name} -> {out_path} ({size_mb:.1f} MB)")
    with open(out_path, "rb") as f:
        return f.read()


@app.local_entrypoint()
def main(
    model: str = "field-keypoints.pt",
    out: str = "public/models/field-keypoints.onnx",
):
    data = export_field_model.remote(model)
    with open(out, "wb") as f:
        f.write(data)
    print(f"[VITAS] Saved {out} ({len(data) / 1e6:.1f} MB)")
    print("[VITAS] Siguiente: subir como release asset + añadir a download-models.mjs")
