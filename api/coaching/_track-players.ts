/**
 * VITAS · /api/coaching/_track-players
 *
 * Edge proxy that forwards player-tracking requests to the Modal pipeline
 * defined in `vision-pipeline/app.py`.
 *
 * Env vars expected on Vercel:
 *   MODAL_TRACK_URL   — Modal HTTP endpoint for `track`
 *   MODAL_API_KEY     — bearer token (the one stored as a Modal secret)
 *
 * If either env var is missing the endpoint returns 503 so the client
 * can gracefully fall back to the mock pipeline (zero downtime).
 */

import { withHandler } from "../_lib/withHandler";

export const config = {
  runtime: "edge",
};

interface TrackingRequest {
  videoUrl: string;
  sampleFps?: number;
  classes?: number[];
}

interface ModalResponse {
  status: string;
  reason?: string;
  duration_sec: number;
  frames_processed: number;
  fps_source: number;
  sample_fps: number;
  players: Array<{
    track_id: number;
    timestamp_ms: number;
    bbox: number[];
    confidence: number;
  }>;
  ball: Array<{
    timestamp_ms: number;
    x: number;
    y: number;
    confidence: number;
  }>;
  ball_stops: Array<{
    start_ms: number;
    end_ms: number;
    avg_x: number;
    avg_y: number;
  }>;
  total_player_tracks: number;
  total_ball_detections: number;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

// Auth: solo usuarios autenticados (JWT) o llamadas internas con service token.
// Antes era un proxy público → cualquiera podía disparar GPU de pago en Modal.
export default withHandler(
  { method: ["POST"], requireAuth: true, allowServiceToken: true },
  async ({ body: ctxBody }): Promise<Response> => {
  const modalUrl = process.env.MODAL_TRACK_URL;
  const modalKey = process.env.MODAL_API_KEY;
  if (!modalUrl || !modalKey) {
    return json(
      {
        error: "real_inference_disabled",
        reason:
          "MODAL_TRACK_URL and MODAL_API_KEY are not configured. The client should fall back to the mock pipeline.",
      },
      503,
    );
  }

  const body = (ctxBody ?? {}) as TrackingRequest;
  if (!body.videoUrl) {
    return json({ error: "missing_fields", required: ["videoUrl"] }, 400);
  }

  let modalResp: Response;
  try {
    modalResp = await fetch(modalUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${modalKey}`,
      },
      body: JSON.stringify({
        video_url: body.videoUrl,
        sample_fps: body.sampleFps ?? 5,
        classes: body.classes ?? [0, 32],
      }),
    });
  } catch (err) {
    return json(
      { error: "modal_unreachable", detail: (err as Error).message },
      502,
    );
  }

  if (!modalResp.ok) {
    const detail = await modalResp.text().catch(() => "");
    return json(
      { error: "modal_error", status: modalResp.status, detail },
      modalResp.status,
    );
  }

  const data = (await modalResp.json()) as ModalResponse;

  if (data.status !== "ok") {
    return json({ error: "modal_processing_failed", detail: data.reason }, 500);
  }

  // Repackage to camelCase for the TS client
  return json({
    source: "modal",
    durationSec: data.duration_sec,
    framesProcessed: data.frames_processed,
    sourceFps: data.fps_source,
    sampleFps: data.sample_fps,
    players: data.players.map((p) => ({
      trackId: p.track_id,
      timestampMs: p.timestamp_ms,
      bbox: p.bbox,
      confidence: p.confidence,
    })),
    ball: data.ball.map((b) => ({
      timestampMs: b.timestamp_ms,
      x: b.x,
      y: b.y,
      confidence: b.confidence,
    })),
    ballStops: data.ball_stops.map((s) => ({
      startMs: s.start_ms,
      endMs: s.end_ms,
      x: s.avg_x,
      y: s.avg_y,
    })),
    totalPlayerTracks: data.total_player_tracks,
    totalBallDetections: data.total_ball_detections,
  });
  },
);

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
