"""VITAS · Detección pose (jugadores) por frame para VALIDAR el tracker headless.

Corre el MISMO modelo de producción (yolov8n-pose, COCO) por frame y vuelca las
detecciones crudas (bbox [x,y,w,h] esquina+wh, confidence, 17 keypoints) a JSON, para
alimentarlas a nuestro CentroidTracker (ByteTrack, #14) en un harness de vitest y
medir la estabilidad de identidad SIN depender de calibración (asociación en píxeles).

    modal run vision-pipeline/pose_detect.py::main --frames-dir <dir> --out <json> [--conf 0.1]
"""
from __future__ import annotations
import os, json
import modal

image = (
    modal.Image.debian_slim(python_version="3.11")
    .apt_install("libgl1", "libglib2.0-0")
    .pip_install("ultralytics==8.3.40", "opencv-python-headless<4.11", "numpy<2.0")
)
app = modal.App("vitas-pose-detect")


@app.function(image=image, gpu="a10g", timeout=1200)
def detect(images: dict[str, bytes], conf: float, model_name: str, imgsz: int) -> dict:
    from ultralytics import YOLO  # type: ignore
    import cv2  # type: ignore
    import numpy as np  # type: ignore

    model = YOLO(model_name)  # p.ej. yolov8n-pose.pt (móvil) / yolo11m-pose.pt (desktop)
    out: dict[str, list] = {}
    for name in sorted(images.keys()):
        img = cv2.imdecode(np.frombuffer(images[name], np.uint8), cv2.IMREAD_COLOR)
        if img is None:
            out[name] = []
            continue
        res = model.predict(img, conf=conf, imgsz=imgsz, verbose=False)[0]
        dets = []
        if res.boxes is not None and len(res.boxes) > 0:
            xywh = res.boxes.xywh.cpu().numpy()  # centro x,y + w,h
            confs = res.boxes.conf.cpu().numpy()
            kpts = res.keypoints.data.cpu().numpy() if res.keypoints is not None else None
            for i in range(len(xywh)):
                cx, cy, w, h = [float(v) for v in xywh[i]]
                kp = []
                if kpts is not None:
                    for k in kpts[i]:
                        kp.append([float(k[0]), float(k[1]), float(k[2])])
                dets.append({
                    "bbox": [cx - w / 2, cy - h / 2, w, h],  # esquina sup-izq + wh
                    "confidence": float(confs[i]),
                    "keypoints": kp,
                })
        out[name] = dets
    return out


@app.local_entrypoint()
def main(frames_dir: str, out: str, conf: float = 0.1, model: str = "yolov8n-pose.pt", imgsz: int = 640):
    imgs = {
        fn: open(os.path.join(frames_dir, fn), "rb").read()
        for fn in sorted(os.listdir(frames_dir))
        if fn.lower().endswith((".jpg", ".jpeg", ".png")) and fn.startswith("f_")
    }
    print(f"[VITAS] {len(imgs)} frames → pose detect ({model}, imgsz={imgsz}, conf>={conf})…")
    res = detect.remote(imgs, conf, model, imgsz)
    json.dump(res, open(out, "w"))
    total = sum(len(v) for v in res.values())
    perframe = total / max(1, len(res))
    print(f"[VITAS] {total} detecciones en {len(res)} frames (~{perframe:.1f}/frame) → {out}")
