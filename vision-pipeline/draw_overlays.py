"""
VITAS · Verificación VISUAL de las pseudo-etiquetas de campo.

Dibuja, sobre cada frame de muestra, las LÍNEAS DEL CAMPO reproyectadas con la
homografía que produjo nuestra cadena (registerFieldFromLandmarks). Si las líneas
verdes encajan con el campo real → la calibración es correcta y la pseudo-etiqueta
es fiable. Si "flotan" o están torcidas → falso positivo (no usar como etiqueta).

Entrada: overlays.json (name,w,h,H campo→píxel,confidence,kps) + los frames.
Salida:  JPEGs anotados en ${FT_DIR}/overlays_img/.

    modal run vision-pipeline/draw_overlays.py::main \
        --ft-dir "C:/.../scratchpad/ft"
"""

from __future__ import annotations

import json
import os

import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("opencv-python-headless==4.10.0.84", "numpy<2.0")
)
app = modal.App("vitas-draw-overlays")

L, W = 105.0, 68.0
PB_TOP, PB_BOT, GB_TOP, GB_BOT = 13.84, 54.16, 24.84, 43.16

def _pitch_lines():
    import numpy as np
    lines = [
        [(0, 0), (L, 0), (L, W), (0, W), (0, 0)],                       # perímetro
        [(L / 2, 0), (L / 2, W)],                                        # línea media
        [(0, PB_TOP), (16.5, PB_TOP), (16.5, PB_BOT), (0, PB_BOT)],      # área grande izq
        [(0, GB_TOP), (5.5, GB_TOP), (5.5, GB_BOT), (0, GB_BOT)],        # área pequeña izq
        [(L, PB_TOP), (L - 16.5, PB_TOP), (L - 16.5, PB_BOT), (L, PB_BOT)],  # área grande der
        [(L, GB_TOP), (L - 5.5, GB_TOP), (L - 5.5, GB_BOT), (L, GB_BOT)],    # área pequeña der
    ]
    circle = [(L / 2 + 9.15 * np.cos(t), W / 2 + 9.15 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 48)]
    lines.append(circle)
    spots = [(11, W / 2), (L - 11, W / 2), (L / 2, W / 2)]
    return lines, spots


@app.function(image=image, timeout=600)
def render(images: dict[str, bytes], overlays: list[dict]) -> dict[str, bytes]:
    import cv2  # type: ignore
    import numpy as np  # type: ignore

    lines, spots = _pitch_lines()

    def project(H, fx, fy):
        w = H[6] * fx + H[7] * fy + H[8]
        if w <= 1e-9:
            return None  # detrás de cámara / degenerado
        return (H[0] * fx + H[1] * fy + H[2]) / w, (H[3] * fx + H[4] * fy + H[5]) / w

    out: dict[str, bytes] = {}
    by_name = {o["name"]: o for o in overlays}
    for name, buf in images.items():
        o = by_name.get(name)
        if o is None:
            continue
        img = cv2.imdecode(np.frombuffer(buf, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        conf = o.get("confidence", "none")
        color = {"high": (0, 220, 0), "medium": (0, 200, 255), "low": (0, 120, 255)}.get(conf, (128, 128, 128))
        H = o.get("H")
        if H:
            for poly in lines:
                pts = [project(H, fx, fy) for (fx, fy) in poly]
                pts = [(int(p[0]), int(p[1])) for p in pts if p is not None]
                for i in range(1, len(pts)):
                    cv2.line(img, pts[i - 1], pts[i], color, 3, cv2.LINE_AA)
            for (fx, fy) in spots:
                p = project(H, fx, fy)
                if p:
                    cv2.circle(img, (int(p[0]), int(p[1])), 5, color, -1, cv2.LINE_AA)
        # keypoints crudos del modelo (rojo)
        for kp in o.get("kps", []):
            cv2.circle(img, (int(kp["x"]), int(kp["y"])), 5, (0, 0, 255), -1, cv2.LINE_AA)
        # rótulo
        txt = f"{name}  {conf}  reproj={o.get('reprojPx')}px  inliers={o.get('inliers')}"
        cv2.rectangle(img, (0, 0), (min(w, 1100), 40), (0, 0, 0), -1)
        cv2.putText(img, txt, (10, 28), cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
        ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            out[name] = enc.tobytes()
    print(f"[VITAS] {len(out)} overlays dibujados")
    return out


@app.local_entrypoint()
def main(ft_dir: str):
    overlays = json.load(open(os.path.join(ft_dir, "overlays.json")))
    raw_dir = os.path.join(ft_dir, "frames_raw")
    images = {}
    for o in overlays:
        p = os.path.join(raw_dir, o["name"])
        if os.path.exists(p):
            images[o["name"]] = open(p, "rb").read()
    print(f"[VITAS] enviando {len(images)} frames + {len(overlays)} overlays…")
    res = render.remote(images, overlays)
    out_dir = os.path.join(ft_dir, "overlays_img")
    os.makedirs(out_dir, exist_ok=True)
    for name, b in res.items():
        with open(os.path.join(out_dir, name), "wb") as f:
            f.write(b)
    print(f"[VITAS] {len(res)} overlays guardados en {out_dir}")
