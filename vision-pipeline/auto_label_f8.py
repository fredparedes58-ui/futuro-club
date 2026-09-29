"""
VITAS · Auto-etiquetado F8 por COLOR (líneas amarillas) + geometría conocida.

Idea (T4 sin marcado manual): las líneas de fútbol-8 son AMARILLAS. Las aíslo por
color (HSV), detecto segmentos de línea, y (si se ve suficiente campo) ajusto la
geometría F8 conocida (FFCV 60×40) para obtener la homografía → reproyecto los 28
landmarks = etiquetas automáticas. Se VERIFICA con overlay (si las líneas
reproyectadas encajan con las amarillas reales, la etiqueta es fiable).

PASO 1 (este): DIAGNÓSTICO — ¿se detectan bien las líneas amarillas? Dibuja la
máscara amarilla + segmentos Hough sobre cada frame para inspección visual.

    modal run vision-pipeline/auto_label_f8.py::main --frames-dir <dir> --out <dir>
"""
from __future__ import annotations
import os, base64, json
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("opencv-python-headless==4.10.0.84", "numpy<2.0")
)
app = modal.App("vitas-auto-label-f8")


@app.function(image=image, timeout=900)
def diagnose(images: dict[str, bytes]) -> dict:
    import cv2  # type: ignore
    import numpy as np  # type: ignore

    out_imgs: dict[str, str] = {}
    stats: dict[str, dict] = {}
    for name in sorted(images.keys()):
        img = cv2.imdecode(np.frombuffer(images[name], np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            continue
        h, w = img.shape[:2]
        hsv = cv2.cvtColor(img, cv2.COLOR_BGR2HSV)
        # Amarillo: H~20-38, S y V medios-altos (líneas amarillas sobre césped verde).
        yellow = cv2.inRange(hsv, (18, 60, 90), (40, 255, 255))
        # Limpieza morfológica
        yellow = cv2.morphologyEx(yellow, cv2.MORPH_CLOSE, np.ones((3, 3), np.uint8))
        yellow_px = int((yellow > 0).sum())
        yellow_frac = yellow_px / (w * h)

        # Segmentos de línea sobre la máscara amarilla
        lines = cv2.HoughLinesP(yellow, 1, np.pi / 180, threshold=40, minLineLength=40, maxLineGap=20)
        nlines = 0 if lines is None else len(lines)

        # Overlay: máscara amarilla en cian tenue + segmentos en rojo
        vis = img.copy()
        vis[yellow > 0] = (0.5 * vis[yellow > 0] + np.array([255, 255, 0]) * 0.5).astype(np.uint8)
        if lines is not None:
            for l in lines[:200]:
                x1, y1, x2, y2 = l[0]
                cv2.line(vis, (x1, y1), (x2, y2), (0, 0, 255), 2, cv2.LINE_AA)
        cv2.rectangle(vis, (0, 0), (min(w, 760), 34), (0, 0, 0), -1)
        cv2.putText(vis, f"{name}  amarillo={yellow_frac*100:.1f}%  lineas={nlines}", (8, 24),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.65, (255, 255, 255), 2, cv2.LINE_AA)
        ok, enc = cv2.imencode(".jpg", vis, [cv2.IMWRITE_JPEG_QUALITY, 82])
        if ok:
            out_imgs[name] = base64.b64encode(enc.tobytes()).decode()
        stats[name] = {"yellow_frac": round(yellow_frac, 4), "lines": nlines}
    return {"imgs": out_imgs, "stats": stats}


@app.local_entrypoint()
def main(frames_dir: str, out: str):
    imgs = {}
    for fn in sorted(os.listdir(frames_dir)):
        if fn.lower().endswith((".jpg", ".jpeg", ".png")):
            imgs[fn] = open(os.path.join(frames_dir, fn), "rb").read()
    print(f"[VITAS] {len(imgs)} frames → diagnóstico amarillo…")
    res = diagnose.remote(imgs)
    os.makedirs(out, exist_ok=True)
    for name, b64 in res["imgs"].items():
        open(os.path.join(out, name), "wb").write(base64.b64decode(b64))
    json.dump(res["stats"], open(os.path.join(out, "_yellow_stats.json"), "w"), indent=2)
    # Ranking por nº de líneas amarillas detectadas
    rows = sorted(res["stats"].items(), key=lambda kv: -kv[1]["lines"])
    print("[VITAS] amarillo detectado (ordenado por nº de líneas):")
    for name, s in rows:
        print(f"  {name:20s} amarillo={s['yellow_frac']*100:5.1f}%  lineas={s['lines']}")
