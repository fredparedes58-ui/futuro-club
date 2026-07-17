"""
VITAS · Vision Pipeline — Modal app

Single-file Modal app that runs YOLOv11 + BoT-SORT (con Re-ID por apariencia)
on a video to extract player tracks and ball positions. Designed to avoid
common Modal pitfalls:

- All Pydantic models defined here (no cross-file imports)
- Pinned versions for every dependency
- Volume for YOLO weights (no re-download per invocation)
- Health check endpoint to verify the deployment is alive
- Explicit timeout, retries, and GPU pick
- `modal serve` works for local dev BEFORE deploy
- Uses only documented Modal APIs (no experimental modules)

Deploy:
    modal token new                       # one time
    modal secret create vitas-api-key API_KEY=$(openssl rand -hex 32)
    modal deploy vision-pipeline/app.py

Local dev (no deploy):
    modal serve vision-pipeline/app.py    # gets you a temp URL

Health check:
    curl https://<your-url>/health        # should return {"status": "ok"}

Run inference:
    curl -X POST https://<your-url>/track \
        -H "Authorization: Bearer $API_KEY" \
        -H "Content-Type: application/json" \
        -d '{"video_url": "https://...mp4", "sample_fps": 5}'
"""

from __future__ import annotations

import io
import os
import shutil
import tempfile
import time
from typing import Optional

import modal
from fastapi import Header  # leer el header Authorization (no query param)
from pydantic import BaseModel, Field

# ── Container image ───────────────────────────────────────────────────
# Pinned versions of EVERYTHING to make the deploy reproducible.
# The most common reason Modal deploys break is `pip install some-package`
# without a version — pkg updates between deploys and a new dep is missing.

image = (
    modal.Image.debian_slim(python_version="3.11")
    # System packages required by opencv/ffmpeg
    .apt_install("ffmpeg", "libgl1", "libglib2.0-0", "libsm6", "libxext6", "libxrender1")
    .pip_install(
        # V1 vision roadmap: 8.3.40 → 8.3.170. El Re-ID nativo de BoT-SORT
        # (`with_reid` + `model: auto`, sin pesos extra) llegó en 8.3.114;
        # nos quedamos en la línea 8.3.x para evitar breaking changes de 8.4.
        "ultralytics==8.3.170",         # YOLOv11 + BoT-SORT con Re-ID
        "opencv-python-headless==4.10.0.84",
        "numpy<2.0",                    # pin conservador (compatible con 8.3.x)
        "httpx==0.27.2",
        "pydantic==2.9.2",
        "fastapi[standard]==0.115.5",
    )
)

# ── App + persistent state ────────────────────────────────────────────
app = modal.App("vitas-vision")  # distinto de modal/modal_app.py para no sobreescribirlo

# Volume to cache YOLO weights between runs (no re-download per invocation)
weights_volume = modal.Volume.from_name("vitas-yolo-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"
# FASE 1 vision upgrade: variante parametrizable por env (default medium).
# nano perdía jugadores lejanos y el balón; medium sube recall en T4 con fp16.
YOLO_MODEL = os.environ.get("YOLO_MODEL", "yolo11m.pt")
WEIGHTS_FILE = f"{WEIGHTS_DIR}/{YOLO_MODEL}"

# Secret with the API key (configured via `modal secret create vitas-api-key`)
api_secret = modal.Secret.from_name("vitas-api-key", required_keys=["API_KEY"])

# ── Tracker config (V1 vision roadmap) ────────────────────────────────
# BoT-SORT + Re-ID en vez de ByteTrack pelado. En 90 min de partido,
# ByteTrack acumula ID-switches en cada cruce/oclusión → heatmaps y métricas
# por jugador sucios. El Re-ID por apariencia (embeddings del propio detector,
# `model: auto` → cero pesos extra) re-asocia jugadores tras oclusiones.
# Se escribe a disco en runtime porque la app es single-file por diseño.
# Basado en los defaults oficiales de botsort.yaml @ v8.3.170; solo se tunea
# lo justificado: track_buffer (oclusiones largas) + with_reid (el objetivo V1).
BOTSORT_REID_YAML = """\
tracker_type: botsort
track_high_thresh: 0.25
track_low_thresh: 0.1
new_track_thresh: 0.25
# Buffer de track perdido, en FRAMES MUESTREADOS (a sample_fps=5 → 60 = 12 s
# de tolerancia a oclusión antes de matar el track; default 30 = 6 s).
track_buffer: 60
match_thresh: 0.8
fuse_score: True
# Compensación de movimiento global de cámara (broadcast/panning)
gmc_method: sparseOptFlow
# Re-ID por apariencia (defaults oficiales; model auto = features del detector)
proximity_thresh: 0.5
appearance_thresh: 0.8
with_reid: True
model: auto
"""
TRACKER_YAML_PATH = "/root/vitas-botsort-reid.yaml"


# ── Pydantic schemas (defined here, no imports from other files) ──────
class TrackingRequest(BaseModel):
    video_url: str = Field(..., description="Public HTTPS URL to the video")
    sample_fps: int = Field(5, ge=1, le=15, description="Frames per second to sample")
    classes: list[int] = Field(default=[0, 32], description="COCO classes: 0=person, 32=sports_ball")
    max_duration_sec: int = Field(7200, description="Hard cap on video length to avoid runaway costs")


class PlayerAppearance(BaseModel):
    track_id: int
    timestamp_ms: int
    bbox: list[float]  # [x1, y1, x2, y2] in pixels
    confidence: float
    # V2 vision roadmap · identidad server-side: equipo por color de camiseta.
    # "team_a" | "team_b" | "other" (portero/árbitro/outlier) | None (sin datos).
    team: Optional[str] = None
    team_color: Optional[list[int]] = None  # RGB representativo del cluster


class BallPosition(BaseModel):
    timestamp_ms: int
    x: float
    y: float
    confidence: float


class BallStop(BaseModel):
    start_ms: int
    end_ms: int
    avg_x: float
    avg_y: float


class TrackingResponse(BaseModel):
    status: str = "ok"
    duration_sec: float
    frames_processed: int
    fps_source: float
    sample_fps: int
    players: list[PlayerAppearance]
    ball: list[BallPosition]
    ball_stops: list[BallStop]
    # Aggregations the client can use directly
    total_player_tracks: int
    total_ball_detections: int
    # V2 · leyenda de equipos detectados: {"team_a": [r,g,b], "team_b": [r,g,b]}.
    # Vacío si no se pudo clasificar (menos de 2 tracks con color).
    teams: dict[str, list[int]] = Field(default_factory=dict)


# ── Health check (cheap, no GPU needed) ───────────────────────────────
@app.function(image=image)
@modal.fastapi_endpoint(method="GET")
def health() -> dict:
    """Cheap endpoint to verify the deployment is alive."""
    return {
        "status": "ok",
        "service": "vitas-vision",
        "modal_app": app.name,
    }


# ── Main GPU function ─────────────────────────────────────────────────
@app.function(
    image=image,
    gpu="T4",                # Cheapest GPU that runs YOLO comfortably
    timeout=900,             # 15 min hard cap
    retries=2,               # Retry on transient failures
    volumes={WEIGHTS_DIR: weights_volume},
    secrets=[api_secret],
)
def track_video(req: TrackingRequest) -> dict:
    """Download a video, run YOLOv11 + BoT-SORT(Re-ID), return player + ball tracks."""
    # Imports inside the function so Modal's image cache picks them up
    import cv2  # type: ignore
    import httpx  # type: ignore
    import numpy as np  # type: ignore
    from ultralytics import YOLO  # type: ignore

    # ── V2 · helpers de identidad por equipo (color de camiseta) ──────────
    def _torso_color(img, box):
        """Color mediano (LAB) de la banda del torso — robusto a fondo/piel."""
        h, w = img.shape[:2]
        x1 = max(0, min(int(box[0]), w - 1)); x2 = max(0, min(int(box[2]), w))
        y1 = max(0, min(int(box[1]), h - 1)); y2 = max(0, min(int(box[3]), h))
        bw, bh = x2 - x1, y2 - y1
        if bw < 6 or bh < 12:
            return None
        # Banda torso: vertical 20-55% (camiseta, evita cabeza y short/piernas),
        # horizontal central 20-80% (evita brazos/fondo).
        crop = img[y1 + int(bh * 0.20): y1 + int(bh * 0.55),
                   x1 + int(bw * 0.20): x1 + int(bw * 0.80)]
        if crop.size == 0:
            return None
        lab = cv2.cvtColor(crop, cv2.COLOR_BGR2LAB).reshape(-1, 3)
        return np.median(lab, axis=0)

    def _kmeans2(feats, iters=15):
        """2-means determinista (init por puntos más distantes)."""
        c0 = feats[int(np.argmax(np.linalg.norm(feats - feats.mean(axis=0), axis=1)))]
        c1 = feats[int(np.argmax(np.linalg.norm(feats - c0, axis=1)))]
        cents = np.stack([c0, c1]).astype(np.float64)
        labels = np.zeros(len(feats), dtype=int)
        for _ in range(iters):
            dists = np.stack([np.linalg.norm(feats - cents[k], axis=1) for k in range(2)], axis=1)
            labels = np.argmin(dists, axis=1)
            for k in range(2):
                if np.any(labels == k):
                    cents[k] = feats[labels == k].mean(axis=0)
        return labels, cents

    t0 = time.time()
    print(f"[VITAS] Request video_url={req.video_url[:80]}, sample_fps={req.sample_fps}")

    # 1. Download the video to a temp file (streaming, to avoid OOM)
    tmp = tempfile.NamedTemporaryFile(suffix=".mp4", delete=False)
    try:
        with httpx.stream("GET", req.video_url, follow_redirects=True, timeout=180.0) as r:
            r.raise_for_status()
            for chunk in r.iter_bytes(chunk_size=1024 * 1024):
                tmp.write(chunk)
        tmp.close()
        size_mb = os.path.getsize(tmp.name) / 1e6
        print(f"[VITAS] Downloaded {size_mb:.1f}MB in {time.time() - t0:.1f}s")
    except Exception as err:
        return {"status": "error", "reason": "download_failed", "detail": str(err)}

    # 2. Load YOLOv11 weights (cached on volume between runs)
    if not os.path.exists(WEIGHTS_FILE):
        print(f"[VITAS] Downloading YOLO weights ({YOLO_MODEL}, first run only)")
        os.makedirs(WEIGHTS_DIR, exist_ok=True)
        # Triggers download to default ultralytics location, then we move it
        YOLO(YOLO_MODEL)
        # Search the standard Ultralytics location
        for candidate in [
            YOLO_MODEL,
            os.path.expanduser(f"~/{YOLO_MODEL}"),
            f"/root/{YOLO_MODEL}",
        ]:
            if os.path.exists(candidate):
                # shutil.move, NO os.replace: el volumen /weights es otro
                # filesystem → os.replace lanza EXDEV "Invalid cross-device
                # link" (bug latente pisado en el primer run GPU real, V4.6).
                shutil.move(candidate, WEIGHTS_FILE)
                break
        weights_volume.commit()
        print(f"[VITAS] Weights cached to volume")
    yolo = YOLO(WEIGHTS_FILE)

    # 3. Inspect the video
    cap = cv2.VideoCapture(tmp.name)
    if not cap.isOpened():
        os.unlink(tmp.name)
        return {"status": "error", "reason": "cv2_open_failed"}

    src_fps = cap.get(cv2.CAP_PROP_FPS) or 30.0
    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
    duration = total_frames / max(1.0, src_fps)
    cap.release()

    if duration > req.max_duration_sec:
        os.unlink(tmp.name)
        return {
            "status": "error",
            "reason": "video_too_long",
            "duration_sec": duration,
            "max_allowed": req.max_duration_sec,
        }

    print(
        f"[VITAS] Video {total_frames}f @ {src_fps:.1f}fps = {duration:.0f}s, "
        f"sampling at {req.sample_fps}fps"
    )

    # 4. Run YOLO + BoT-SORT(Re-ID) on the video (V1 vision roadmap)
    # `vid_stride` makes YOLO skip frames to match our sample fps
    vid_stride = max(1, int(round(src_fps / req.sample_fps)))

    # Tracker config escrita en runtime (app single-file, sin ficheros extra)
    with open(TRACKER_YAML_PATH, "w") as f:
        f.write(BOTSORT_REID_YAML)

    players: list[PlayerAppearance] = []
    ball: list[BallPosition] = []
    track_colors: dict[int, list] = {}  # V2 · track_id → muestras de color de torso
    teams_legend: dict[str, list] = {}  # V2 · {"team_a": [r,g,b], ...}

    frames_processed = 0
    try:
        results = yolo.track(
            source=tmp.name,
            stream=True,
            persist=True,
            tracker=TRACKER_YAML_PATH,
            classes=req.classes,
            conf=0.3,
            vid_stride=vid_stride,
            half=True,  # fp16 en T4: ~2x más rápido, compensa el coste del modelo medium
            verbose=False,
        )

        frame_idx = 0
        for result in results:
            timestamp_ms = int((frame_idx * vid_stride / src_fps) * 1000)
            frames_processed += 1

            if result.boxes is not None and len(result.boxes) > 0:
                boxes = result.boxes
                xyxy = boxes.xyxy.cpu().numpy() if hasattr(boxes.xyxy, "cpu") else boxes.xyxy
                conf = boxes.conf.cpu().numpy() if hasattr(boxes.conf, "cpu") else boxes.conf
                cls = boxes.cls.cpu().numpy() if hasattr(boxes.cls, "cpu") else boxes.cls
                ids = (
                    boxes.id.cpu().numpy()
                    if boxes.id is not None and hasattr(boxes.id, "cpu")
                    else None
                )

                for i in range(len(xyxy)):
                    cls_int = int(cls[i])
                    if cls_int == 0:  # person
                        if ids is None:
                            continue
                        tid = int(ids[i])
                        players.append(
                            PlayerAppearance(
                                track_id=tid,
                                timestamp_ms=timestamp_ms,
                                bbox=[float(x) for x in xyxy[i]],
                                confidence=float(conf[i]),
                            )
                        )
                        # V2 · muestra de color de torso (cap 40/track para acotar coste)
                        samples = track_colors.setdefault(tid, [])
                        if len(samples) < 40 and result.orig_img is not None:
                            col = _torso_color(result.orig_img, xyxy[i])
                            if col is not None:
                                samples.append(col)
                    elif cls_int == 32:  # sports ball
                        x1, y1, x2, y2 = xyxy[i]
                        ball.append(
                            BallPosition(
                                timestamp_ms=timestamp_ms,
                                x=float((x1 + x2) / 2),
                                y=float((y1 + y2) / 2),
                                confidence=float(conf[i]),
                            )
                        )

            frame_idx += 1
    finally:
        try:
            os.unlink(tmp.name)
        except OSError:
            pass

    # 4b. Team classification by jersey color (V2 vision roadmap)
    # Agrupa los tracks en 2 equipos por color mediano del torso; los outliers
    # (portero/árbitro) se marcan "other". Le da identidad de EQUIPO a cada
    # jugador — imprescindible para heatmaps/táctica; antes solo había track_id.
    tids = [t for t, cs in track_colors.items() if cs]
    if len(tids) >= 2:
        feats = np.stack([np.median(np.stack(track_colors[t]), axis=0) for t in tids])
        labels, cents = _kmeans2(feats)
        dists = np.array([np.linalg.norm(feats[i] - cents[labels[i]]) for i in range(len(tids))])
        med = np.median(dists)
        mad = np.median(np.abs(dists - med)) + 1e-6
        thr = med + 2.5 * mad  # outliers robustos = portero/árbitro
        cent_bgr = [cv2.cvtColor(np.uint8([[c]]), cv2.COLOR_LAB2BGR)[0, 0] for c in cents]
        team_by_track: dict[int, dict] = {}
        for i, t in enumerate(tids):
            if dists[i] > thr:
                team_by_track[t] = {"team": "other", "color": None}
            else:
                lab_i = int(labels[i])
                bgr = cent_bgr[lab_i]
                team_by_track[t] = {
                    "team": f"team_{'ab'[lab_i]}",
                    "color": [int(bgr[2]), int(bgr[1]), int(bgr[0])],  # RGB
                }
        for p in players:
            info = team_by_track.get(p.track_id)
            if info:
                p.team = info["team"]
                p.team_color = info["color"]
        # Leyenda: solo equipos que quedaron asignados (no "other").
        for lab_i in range(2):
            if np.any(labels == lab_i) and np.any(
                (labels == lab_i) & (dists <= thr)
            ):
                bgr = cent_bgr[lab_i]
                teams_legend[f"team_{'ab'[lab_i]}"] = [int(bgr[2]), int(bgr[1]), int(bgr[0])]

    # 5. Derive ball stops (ball static within 30px for >2 seconds)
    ball_stops: list[BallStop] = []
    if ball:
        ball_sorted = sorted(ball, key=lambda b: b.timestamp_ms)
        stop_start: Optional[BallPosition] = None
        last_seen: Optional[BallPosition] = None
        STATIC_PX = 30.0
        for b in ball_sorted:
            if last_seen is None:
                stop_start = b
            else:
                dist = ((b.x - last_seen.x) ** 2 + (b.y - last_seen.y) ** 2) ** 0.5
                gap_ms = b.timestamp_ms - last_seen.timestamp_ms
                if dist > STATIC_PX or gap_ms > 3000:
                    # Stop ended
                    if stop_start is not None:
                        duration_ms = last_seen.timestamp_ms - stop_start.timestamp_ms
                        if duration_ms >= 2000:
                            ball_stops.append(
                                BallStop(
                                    start_ms=stop_start.timestamp_ms,
                                    end_ms=last_seen.timestamp_ms,
                                    avg_x=(stop_start.x + last_seen.x) / 2,
                                    avg_y=(stop_start.y + last_seen.y) / 2,
                                )
                            )
                    stop_start = b
            last_seen = b
        # Trailing stop
        if stop_start is not None and last_seen is not None:
            duration_ms = last_seen.timestamp_ms - stop_start.timestamp_ms
            if duration_ms >= 2000:
                ball_stops.append(
                    BallStop(
                        start_ms=stop_start.timestamp_ms,
                        end_ms=last_seen.timestamp_ms,
                        avg_x=(stop_start.x + last_seen.x) / 2,
                        avg_y=(stop_start.y + last_seen.y) / 2,
                    )
                )

    unique_tracks = len({p.track_id for p in players})

    elapsed = time.time() - t0
    print(
        f"[VITAS] Done in {elapsed:.1f}s · {frames_processed} frames · "
        f"{unique_tracks} player tracks · {len(ball)} ball detections · "
        f"{len(ball_stops)} stops · {len(teams_legend)} teams"
    )

    return TrackingResponse(
        status="ok",
        duration_sec=round(duration, 1),
        frames_processed=frames_processed,
        fps_source=round(src_fps, 1),
        sample_fps=req.sample_fps,
        players=players,
        ball=ball,
        ball_stops=ball_stops,
        total_player_tracks=unique_tracks,
        total_ball_detections=len(ball),
        teams=teams_legend,
    ).model_dump()


# ── Public HTTP endpoint ──────────────────────────────────────────────
@app.function(image=image, secrets=[api_secret], timeout=900)
@modal.fastapi_endpoint(method="POST")
def track(payload: dict, authorization: Optional[str] = Header(default=None)) -> dict:
    """Public POST endpoint. Validates the bearer token, dispatches to GPU."""
    expected = os.environ.get("API_KEY", "")
    if not expected:
        return {"status": "error", "reason": "server_misconfigured"}

    auth_ok = authorization == f"Bearer {expected}"
    if not auth_ok:
        return {"status": "error", "reason": "unauthorized"}

    try:
        req = TrackingRequest.model_validate(payload)
    except Exception as err:
        return {"status": "error", "reason": "invalid_request", "detail": str(err)}

    # Call the GPU function synchronously
    return track_video.remote(req)


# ── Async path (Vision V4) ────────────────────────────────────────────
# Para partidos completos (90 min) el proxy síncrono de Vercel hace timeout
# (~25 s en edge). El flujo async: track_async (spawn, responde {call_id} al
# instante) → run_track_and_callback (corre en GPU, timeout largo) → POST
# firmado al webhook de la app cuando termina.
#
# Contrato del callback (pineado por api/webhooks/__tests__/modal-tracking.test.ts):
#   body JSON snake_case: {"job_id","status":"done"|"failed","result"|"error"}
#   header X-Vitas-Signature = HMAC-SHA256(MODAL_CALLBACK_SECRET, body) hex minúsculas.
#   La firma es del CONTENIDO (rawBody), no del job_id.
#
# MODAL_CALLBACK_SECRET viaja como clave EXTRA del secret vitas-api-key (no en el
# payload del spawn). Deploy:
#   modal secret create vitas-api-key API_KEY=... MODAL_CALLBACK_SECRET=...
# (required_keys sigue siendo solo API_KEY; la extra se lee de os.environ.)

@app.function(
    image=image,
    gpu="T4",
    timeout=3600,            # 60 min: cubre un partido a sample_fps bajo en T4
    retries=1,               # el webhook es idempotente → un callback repetido es seguro
    volumes={WEIGHTS_DIR: weights_volume},
    secrets=[api_secret],
)
def run_track_and_callback(payload: dict, job_id: str, callback_url: str) -> dict:
    """Corre el tracking y hace POST firmado al webhook. Spawneada por track_async."""
    import hashlib
    import hmac
    import json

    import httpx  # type: ignore

    secret = os.environ.get("MODAL_CALLBACK_SECRET", "")

    # Ejecuta la MISMA lógica que track_video en ESTE contenedor GPU (.local()
    # corre el cuerpo inline, sin anidar otro contenedor).
    try:
        req = TrackingRequest.model_validate(payload)
        result = track_video.local(req)
        if isinstance(result, dict) and result.get("status") == "ok":
            out = {"job_id": job_id, "status": "done", "result": result}
        else:
            reason = result.get("reason") if isinstance(result, dict) else "unknown"
            out = {"job_id": job_id, "status": "failed", "error": f"tracking_failed: {reason}"}
    except Exception as err:  # noqa: BLE001 — cualquier fallo debe notificar al webhook
        out = {"job_id": job_id, "status": "failed", "error": str(err)[:1000]}

    # Firma el CONTENIDO exacto que se envía (mismos bytes → misma firma en el TS).
    body = json.dumps(out, separators=(",", ":")).encode("utf-8")
    headers = {"Content-Type": "application/json"}
    if secret:
        headers["X-Vitas-Signature"] = hmac.new(
            secret.encode("utf-8"), body, hashlib.sha256
        ).hexdigest()

    try:
        resp = httpx.post(callback_url, content=body, headers=headers, timeout=30)
        delivered = resp.status_code
    except Exception as err:  # noqa: BLE001 — el resultado ya corrió; solo reportamos
        delivered = -1
        print(f"[run_track_and_callback] callback POST failed for job {job_id}: {err}")

    return {"job_id": job_id, "status": out["status"], "callback_http": delivered}


@app.function(image=image, secrets=[api_secret], timeout=60)
@modal.fastapi_endpoint(method="POST")
def track_async(payload: dict, authorization: Optional[str] = Header(default=None)) -> dict:
    """Valida el bearer, spawnea el tracking y responde {call_id} al instante."""
    expected = os.environ.get("API_KEY", "")
    if not expected:
        return {"status": "error", "reason": "server_misconfigured"}
    if authorization != f"Bearer {expected}":
        return {"status": "error", "reason": "unauthorized"}

    job_id = payload.get("job_id")
    callback_url = payload.get("callback_url")
    if not job_id or not callback_url:
        return {
            "status": "error",
            "reason": "invalid_request",
            "detail": "job_id and callback_url are required",
        }

    # Valida los campos de tracking (video_url/sample_fps/classes); job_id y
    # callback_url son extra y Pydantic los ignora.
    try:
        TrackingRequest.model_validate(payload)
    except Exception as err:
        return {"status": "error", "reason": "invalid_request", "detail": str(err)}

    call = run_track_and_callback.spawn(payload, job_id, callback_url)
    return {"call_id": call.object_id}
