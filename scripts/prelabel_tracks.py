#!/usr/bin/env python3
"""
Pre-etiquetador de pistas para anotación asistida (humano-in-the-loop).

Qué hace y qué NO hace — la división honesta (ver fixtures/README.md):
  - El MODELO pre-etiqueta GEOMETRÍA: detecta jugadores (pose + tiling) y los agrupa
    en pistas con un tracker nearest-neighbor. Salida: tracks.json con cajas por frame.
  - El MODELO **no** asigna dorsal, equipo ni identidad. Eso lo aporta una persona en
    el anotador (tools/anotador-identidad.html). Un modelo que adivinara el dorsal y
    lo tratáramos como verdad sería circular (ver .claude/rules/identidad.md).

Uso:
  python scripts/prelabel_tracks.py <frames_dir> <salida.json> [--model nano|m] [--tile 2x2|3x3] [--fps 10]

frames_dir: carpeta con los frames extraídos del clip (d_001.jpg, d_002.jpg, ...),
en orden alfabético = orden temporal. Extrae con:
  ffmpeg -i clip.mov -vf fps=10 frames/d_%03d.jpg
"""
import sys, os, glob, json, argparse
import numpy as np
from PIL import Image
import onnxruntime as ort

MODELS = {
    "nano": "public/models/yolov8n-pose.onnx",
    "m": "public/models/yolov11m-pose.onnx",
}
SIZE = 640
CONF = 0.35
IOU = 0.5
LINK_MAX_FACTOR = 1.2  # gate de asociación = LINK_MAX_FACTOR * altura mediana de caja


def letterbox(im, s):
    w0, h0 = im.size
    r = min(s / w0, s / h0)
    nw, nh = int(w0 * r), int(h0 * r)
    pad = ((s - nw) // 2, (s - nh) // 2)
    c = Image.new("RGB", (s, s), (114, 114, 114))
    c.paste(im.resize((nw, nh)), pad)
    return (np.asarray(c, np.float32) / 255).transpose(2, 0, 1)[None], r, pad


def nms(b, sc, thr):
    if len(b) == 0:
        return []
    x1, y1, x2, y2 = b[:, 0], b[:, 1], b[:, 2], b[:, 3]
    ar = (x2 - x1) * (y2 - y1)
    o = sc.argsort()[::-1]
    keep = []
    while o.size > 0:
        i = o[0]
        keep.append(i)
        xx1 = np.maximum(x1[i], x1[o[1:]]); yy1 = np.maximum(y1[i], y1[o[1:]])
        xx2 = np.minimum(x2[i], x2[o[1:]]); yy2 = np.minimum(y2[i], y2[o[1:]])
        w = np.maximum(0, xx2 - xx1); h = np.maximum(0, yy2 - yy1)
        inter = w * h
        iou = inter / (ar[i] + ar[o[1:]] - inter + 1e-9)
        o = o[1:][iou <= thr]
    return keep


def detect(sess, im, nx, ny):
    W, H = im.size
    tw, th = W // nx, H // ny
    allb, alls = [], []
    inp = sess.get_inputs()[0].name
    for iy in range(ny):
        for ix in range(nx):
            ox, oy = ix * tw, iy * th
            crop = im.crop((ox, oy, ox + tw, oy + th))
            blob, r, pad = letterbox(crop, SIZE)
            o = sess.run(None, {inp: blob})[0][0].T
            conf = o[:, 4]
            m = conf > CONF
            if m.sum() == 0:
                continue
            p = o[m]
            cx, cy, w, h = p[:, 0], p[:, 1], p[:, 2], p[:, 3]
            gx = (cx - pad[0]) / r + ox
            gy = (cy - pad[1]) / r + oy
            gw, gh = w / r, h / r
            allb.append(np.stack([gx - gw / 2, gy - gh / 2, gx + gw / 2, gy + gh / 2], 1))
            alls.append(conf[m])
    if not allb:
        return np.zeros((0, 4))
    B = np.concatenate(allb)
    S = np.concatenate(alls)
    return B[nms(B, S, IOU)]


def foot(b):
    return np.array([(b[0] + b[2]) / 2, b[3]])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("frames_dir")
    ap.add_argument("out_json")
    ap.add_argument("--model", choices=list(MODELS), default="nano")
    ap.add_argument("--tile", default="2x2")
    ap.add_argument("--fps", type=float, default=10.0)
    ap.add_argument("--min-track", type=int, default=10, help="descartar pistas con menos frames (ruido/fragmentos)")
    ap.add_argument("--gap", type=int, default=5, help="frames sin detección que una pista puede sobrevivir (re-cosido)")
    args = ap.parse_args()

    nx, ny = (int(x) for x in args.tile.lower().split("x"))
    frame_paths = sorted(glob.glob(os.path.join(args.frames_dir, "*.jpg")) +
                         glob.glob(os.path.join(args.frames_dir, "*.png")))
    if not frame_paths:
        print(f"Sin frames en {args.frames_dir}", file=sys.stderr)
        return 1
    model_path = MODELS[args.model]
    if not os.path.exists(model_path):
        print(f"Modelo no encontrado: {model_path} (corre desde la raíz del repo)", file=sys.stderr)
        return 1

    sess = ort.InferenceSession(model_path, providers=["CPUExecutionProvider"])
    W, H = Image.open(frame_paths[0]).size

    # detección por frame
    per_frame = []
    for i, fp in enumerate(frame_paths):
        boxes = detect(sess, Image.open(fp).convert("RGB"), nx, ny)
        per_frame.append(boxes)
        print(f"\r  frame {i+1}/{len(frame_paths)}: {len(boxes)} det", end="", file=sys.stderr)
    print(file=sys.stderr)

    # gate de asociación proporcional al tamaño típico de jugador
    heights = [b[3] - b[1] for bx in per_frame for b in bx]
    gate = LINK_MAX_FACTOR * (np.median(heights) if heights else 60.0)

    # tracker nearest-neighbor con gating y TOLERANCIA A HUECOS: una pista sigue
    # "viva" hasta GAP_MAX frames sin detección (oclusión, fallo puntual) y se
    # re-cose en cuanto reaparece cerca. Sin esto, cada frame perdido parte al
    # jugador en una pista nueva (fragmentación → cientos de pistas basura).
    GAP_MAX = args.gap
    tracks = []  # cada track: {'boxes': [(frame_idx, box)]}
    for fi, boxes in enumerate(per_frame):
        feet = [foot(b) for b in boxes]
        used = [False] * len(boxes)
        # pistas cuya última detección está en [fi-GAP_MAX, fi-1], más recientes primero
        alive = [tr for tr in tracks if 0 < fi - tr["boxes"][-1][0] <= GAP_MAX]
        alive.sort(key=lambda tr: -tr["boxes"][-1][0])
        for tr in alive:
            last_fi, last_box = tr["boxes"][-1]
            last = foot(last_box)
            g = gate * (1 + 0.4 * (fi - last_fi - 1))  # más margen cuanto mayor el hueco
            best, bd = -1, g
            for j, ft in enumerate(feet):
                if used[j]:
                    continue
                d = float(np.hypot(*(ft - last)))
                if d < bd:
                    bd, best = d, j
            if best >= 0:
                tr["boxes"].append((fi, boxes[best]))
                used[best] = True
        for j, b in enumerate(boxes):
            if not used[j]:
                tracks.append({"boxes": [(fi, b)]})

    tracks = [t for t in tracks if len(t["boxes"]) >= args.min_track]

    # ordenar pistas por primer frame y aparición (id anónimo estable #1, #2, ...)
    tracks.sort(key=lambda t: (t["boxes"][0][0], t["boxes"][0][1][0]))
    out_tracks = []
    for idx, tr in enumerate(tracks, 1):
        boxes = [{"f": int(fi), "box": [round(float(x), 1) for x in b]} for fi, b in tr["boxes"]]
        # frame representativo = caja más grande (mejor para leer el dorsal)
        rep = max(tr["boxes"], key=lambda fb: (fb[1][2] - fb[1][0]) * (fb[1][3] - fb[1][1]))
        out_tracks.append({
            "track_id": f"#{idx}",
            "n_frames": len(boxes),
            "rep_frame": int(rep[0]),
            "boxes": boxes,
        })

    doc = {
        "__pre_etiqueta__": True,
        "__nota__": "GEOMETRIA pre-etiquetada por modelo. Dorsal/equipo/legibilidad los aporta un HUMANO en el anotador. No es ground truth por si solo.",
        "frames_dir": os.path.abspath(args.frames_dir),
        "frames": [os.path.basename(p) for p in frame_paths],
        "width": W,
        "height": H,
        "fps": args.fps,
        "model": args.model,
        "tile": args.tile,
        "n_tracks": len(out_tracks),
        "tracks": out_tracks,
    }
    with open(args.out_json, "w", encoding="utf-8") as f:
        json.dump(doc, f, ensure_ascii=False, indent=1)
    print(f"OK -> {args.out_json}  ({len(out_tracks)} pistas, {len(frame_paths)} frames)", file=sys.stderr)
    print(f"Siguiente: abre tools/anotador-identidad.html, carga este JSON + la carpeta de frames.", file=sys.stderr)
    return 0


if __name__ == "__main__":
    sys.exit(main())
