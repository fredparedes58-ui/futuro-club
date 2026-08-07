"""
VITAS · Prototipo/validación del SOPORTE DE LÍNEAS (discriminador real del gate).

Una calibración es correcta sii las líneas del campo reproyectadas por la homografía
caen sobre líneas blancas reales del frame. Este score mide justo eso: fracción de
puntos muestreados a lo largo de las líneas reproyectadas que aterrizan sobre un
píxel de "línea" (realce top-hat de estructuras brillantes finas).

Correcto → score alto (verde). Falso positivo → líneas sobre césped → score bajo (rojo).

Valida el metric contra tus frames (overlays.json trae la H por frame) y pinta el
soporte punto a punto para inspección visual.

    modal run vision-pipeline/line_support.py::main --ft-dir "C:/.../scratchpad/ft"
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
app = modal.App("vitas-line-support")

L, W = 105.0, 68.0
PB_TOP, PB_BOT, GB_TOP, GB_BOT = 13.84, 54.16, 24.84, 43.16


def _pitch_polys():
    import numpy as np
    polys = [
        [(0, 0), (L, 0), (L, W), (0, W), (0, 0)],
        [(L / 2, 0), (L / 2, W)],
        [(0, PB_TOP), (16.5, PB_TOP), (16.5, PB_BOT), (0, PB_BOT)],
        [(0, GB_TOP), (5.5, GB_TOP), (5.5, GB_BOT), (0, GB_BOT)],
        [(L, PB_TOP), (L - 16.5, PB_TOP), (L - 16.5, PB_BOT), (L, PB_BOT)],
        [(L, GB_TOP), (L - 5.5, GB_TOP), (L - 5.5, GB_BOT), (L, GB_BOT)],
    ]
    polys.append([(L / 2 + 9.15 * np.cos(t), W / 2 + 9.15 * np.sin(t)) for t in np.linspace(0, 2 * np.pi, 60)])
    return polys


@app.function(image=image, timeout=600)
def score(images: dict[str, bytes], overlays: list[dict]) -> dict:
    import cv2  # type: ignore
    import numpy as np  # type: ignore

    polys = _pitch_polys()
    by_name = {o["name"]: o for o in overlays}

    def project(H, fx, fy):
        w = H[6] * fx + H[7] * fy + H[8]
        if w <= 1e-9:
            return None
        return H[0] * fx + H[1] * fy + H[2], H[3] * fx + H[4] * fy + H[5]

    out_scores = {}
    out_imgs = {}
    for name, buf in images.items():
        o = by_name.get(name)
        if not o or not o.get("H"):
            continue
        img = cv2.imdecode(np.frombuffer(buf, np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        H = o["H"]
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        k = cv2.getStructuringElement(cv2.MORPH_RECT, (17, 17))
        tophat = cv2.morphologyEx(gray, cv2.MORPH_TOPHAT, k)
        linemask = cv2.dilate((tophat > 22).astype(np.uint8), np.ones((3, 3), np.uint8))
        # Máscara de CÉSPED (verde) — una línea de campo real es blanca SOBRE verde.
        # Descarta el "soporte" falso de red de portería / muro / valla / gente (blancos
        # sin césped alrededor). Integral image para consultar el % de verde en ventana.
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        green = (cv2.inRange(hsv, (30, 25, 25), (95, 255, 255)) > 0).astype(np.uint8)
        gint = cv2.integral(green).astype(np.float64)  # (h+1, w+1)

        def green_frac(cx, cy, r=14):
            x0, y0 = max(0, cx - r), max(0, cy - r)
            x1, y1 = min(w, cx + r), min(h, cy + r)
            area = (x1 - x0) * (y1 - y0)
            if area <= 0:
                return 0.0
            s = gint[y1, x1] - gint[y0, x1] - gint[y1, x0] + gint[y0, x0]
            return s / area

        total, hits = 0, 0
        for poly in polys:
            pts = [project(H, fx, fy) for (fx, fy) in poly]
            for i in range(1, len(pts)):
                a, b = pts[i - 1], pts[i]
                if a is None or b is None:
                    continue
                seglen = float(np.hypot(b[0] - a[0], b[1] - a[1]))
                n = max(2, int(seglen / 4))
                for t in np.linspace(0, 1, n):
                    x = int(a[0] + (b[0] - a[0]) * t)
                    y = int(a[1] + (b[1] - a[1]) * t)
                    if 0 <= x < w and 0 <= y < h:
                        total += 1
                        y0, y1 = max(0, y - 4), min(h, y + 5)
                        x0, x1 = max(0, x - 4), min(w, x + 5)
                        bright = linemask[y0:y1, x0:x1].any()
                        # línea real = blanca SOBRE césped (verde alrededor, no solo debajo)
                        hit = bool(bright) and green_frac(x, y) >= 0.30
                        if hit:
                            hits += 1
                        cv2.circle(img, (x, y), 2, (0, 200, 0) if hit else (0, 0, 255), -1)
        s = (hits / total) if total > 25 else 0.0
        out_scores[name] = {"support": round(s, 3), "samples": total, "confidence": o.get("confidence")}
        cv2.rectangle(img, (0, 0), (min(w, 900), 40), (0, 0, 0), -1)
        cv2.putText(img, f"{name}  {o.get('confidence')}  soporte={s:.2f}", (10, 28),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.8, (255, 255, 255), 2, cv2.LINE_AA)
        ok, enc = cv2.imencode(".jpg", img, [cv2.IMWRITE_JPEG_QUALITY, 85])
        if ok:
            out_imgs[name] = enc.tobytes()
    return {"scores": out_scores, "imgs_b64": {k: __import__("base64").b64encode(v).decode() for k, v in out_imgs.items()}}


@app.local_entrypoint()
def main(ft_dir: str):
    import base64
    overlays = json.load(open(os.path.join(ft_dir, "overlays.json")))
    raw = os.path.join(ft_dir, "frames_raw")
    images = {o["name"]: open(os.path.join(raw, o["name"]), "rb").read()
              for o in overlays if os.path.exists(os.path.join(raw, o["name"]))}
    print(f"[VITAS] {len(images)} frames…")
    res = score.remote(images, overlays)
    outd = os.path.join(ft_dir, "line_support_img")
    os.makedirs(outd, exist_ok=True)
    for k, b64 in res["imgs_b64"].items():
        open(os.path.join(outd, k), "wb").write(base64.b64decode(b64))
    # ordenar por soporte
    rows = sorted(res["scores"].items(), key=lambda kv: -kv[1]["support"])
    print("[VITAS] SOPORTE DE LÍNEAS (ordenado):")
    for name, r in rows:
        print(f"  {name:22s} conf={r['confidence']:7s} soporte={r['support']:.2f} ({r['samples']} muestras)")
    json.dump(res["scores"], open(os.path.join(ft_dir, "line_support.json"), "w"), indent=2)
