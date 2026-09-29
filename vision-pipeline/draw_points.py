"""VITAS · Dibuja puntos (x,y) con etiqueta sobre un frame — para verificar la
precisión de la localización (p.ej. puntos propuestos por Gemini).
    modal run vision-pipeline/draw_points.py::main --frame <jpg> --points <json> --out <jpg>
"""
from __future__ import annotations
import os, base64, json
import modal

image = modal.Image.debian_slim(python_version="3.11").apt_install("libgl1", "libglib2.0-0").pip_install("opencv-python-headless==4.10.0.84", "numpy<2.0")
app = modal.App("vitas-draw-points")


@app.function(image=image, timeout=300)
def render(img_bytes: bytes, points: list[dict]) -> bytes:
    import cv2  # type: ignore
    import numpy as np  # type: ignore
    img = cv2.imdecode(np.frombuffer(img_bytes, np.uint8), cv2.IMREAD_COLOR)
    for p in points:
        if not p.get("visible", True):
            continue
        x, y = int(p["x"]), int(p["y"])
        cv2.circle(img, (x, y), 7, (0, 0, 255), -1, cv2.LINE_AA)
        cv2.circle(img, (x, y), 8, (255, 255, 255), 1, cv2.LINE_AA)
        cv2.putText(img, p["name"], (x + 8, y - 6), cv2.FONT_HERSHEY_SIMPLEX, 0.4, (0, 255, 255), 1, cv2.LINE_AA)
    ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 88])
    return enc.tobytes()


@app.local_entrypoint()
def main(frame: str, points: str, out: str):
    pts = json.load(open(points))
    res = render.remote(open(frame, "rb").read(), pts)
    open(out, "wb").write(res)
    print(f"[VITAS] {len(pts)} puntos dibujados → {out}")
