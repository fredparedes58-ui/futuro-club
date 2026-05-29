"""
VITAS · Vision Pipeline — Modal app

Single-file Modal app that runs YOLOv11 + ByteTrack on a video to extract
player tracks and ball positions. Designed to avoid common Modal pitfalls:

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
import tempfile
import time
from typing import Optional

import modal
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
        "ultralytics==8.3.40",          # YOLOv11 + tracker
        "opencv-python-headless==4.10.0.84",
        "numpy<2.0",                    # YOLO not compatible with numpy 2.x yet
        "httpx==0.27.2",
        "pydantic==2.9.2",
        "fastapi[standard]==0.115.5",
    )
)

# ── App + persistent state ────────────────────────────────────────────
app = modal.App("vitas-vision")

# Volume to cache YOLO weights between runs (no re-download per invocation)
weights_volume = modal.Volume.from_name("vitas-yolo-weights", create_if_missing=True)
WEIGHTS_DIR = "/weights"
WEIGHTS_FILE = f"{WEIGHTS_DIR}/yolo11n.pt"

# Secret with the API key (configured via `modal secret create vitas-api-key`)
api_secret = modal.Secret.from_name("vitas-api-key", required_keys=["API_KEY"])


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
    """Download a video, run YOLOv11 + ByteTrack, return player + ball tracks."""
    # Imports inside the function so Modal's image cache picks them up
    import cv2  # type: ignore
    import httpx  # type: ignore
    from ultralytics import YOLO  # type: ignore

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
        print("[VITAS] Downloading YOLOv11 weights (first run only)")
        os.makedirs(WEIGHTS_DIR, exist_ok=True)
        # Triggers download to default ultralytics location, then we move it
        YOLO("yolo11n.pt")
        # Search the standard Ultralytics location
        for candidate in [
            "yolo11n.pt",
            os.path.expanduser("~/yolo11n.pt"),
            "/root/yolo11n.pt",
        ]:
            if os.path.exists(candidate):
                os.replace(candidate, WEIGHTS_FILE)
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

    # 4. Run YOLO+ByteTrack on the video (Ultralytics built-in tracker)
    # `vid_stride` makes YOLO skip frames to match our sample fps
    vid_stride = max(1, int(round(src_fps / req.sample_fps)))

    players: list[PlayerAppearance] = []
    ball: list[BallPosition] = []

    frames_processed = 0
    try:
        results = yolo.track(
            source=tmp.name,
            stream=True,
            persist=True,
            tracker="bytetrack.yaml",
            classes=req.classes,
            conf=0.3,
            vid_stride=vid_stride,
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
                        players.append(
                            PlayerAppearance(
                                track_id=int(ids[i]),
                                timestamp_ms=timestamp_ms,
                                bbox=[float(x) for x in xyxy[i]],
                                confidence=float(conf[i]),
                            )
                        )
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
        f"{unique_tracks} player tracks · {len(ball)} ball detections · {len(ball_stops)} stops"
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
    ).model_dump()


# ── Public HTTP endpoint ──────────────────────────────────────────────
@app.function(image=image, secrets=[api_secret], timeout=900)
@modal.fastapi_endpoint(method="POST")
def track(payload: dict, authorization: Optional[str] = None) -> dict:
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
