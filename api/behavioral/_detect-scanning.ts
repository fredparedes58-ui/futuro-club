/**
 * VITAS · /api/behavioral/_detect-scanning
 *
 * Edge proxy that forwards scanning-detection requests to Modal.
 *
 * Env vars expected:
 *   MODAL_SCANNING_URL   — Modal HTTP endpoint URL
 *   MODAL_API_KEY        — bearer token configured as a Modal secret
 *
 * If either env var is missing, the endpoint returns 503 so the client
 * can gracefully fall back to the mock pipeline.
 */

export const config = {
  runtime: "edge",
};

interface ScanningRequest {
  videoId: string;
  videoUrl: string;
  playerId: string;
  playerName?: string;
  // Optional bbox hint for the target player in the first frame (x,y,w,h normalized)
  playerBboxHint?: [number, number, number, number];
  sampleFps?: number;
}

interface ScanningResult {
  scan_iq: number;
  receptions_analyzed: number;
  avg_scans_pre_reception: number;
  scans_under_pressure: number;
  success_with_scan: number;
  success_without_scan: number;
  forward_oriented_pct: number;
  duration_processed_sec: number;
  receptions: Array<{ timestamp_ms: number; ball_pos: number[]; target_pos: number[] }>;
  scans: Array<{ timestamp_ms: number; direction: "left" | "right"; yaw_deg: number }>;
}

const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

export default async function handler(request: Request): Promise<Response> {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (request.method !== "POST") {
    return json({ error: "method not allowed" }, 405);
  }

  const modalUrl = process.env.MODAL_SCANNING_URL;
  const modalKey = process.env.MODAL_API_KEY;
  if (!modalUrl || !modalKey) {
    return json(
      {
        error: "real_inference_disabled",
        reason:
          "MODAL_SCANNING_URL and MODAL_API_KEY are not configured. The client should fall back to the mock pipeline.",
      },
      503,
    );
  }

  let body: ScanningRequest;
  try {
    body = (await request.json()) as ScanningRequest;
  } catch {
    return json({ error: "invalid_json" }, 400);
  }

  if (!body.videoUrl || !body.playerId) {
    return json({ error: "missing_fields", required: ["videoUrl", "playerId"] }, 400);
  }

  // Forward to Modal
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
        player_id: body.playerId,
        player_name: body.playerName ?? "Jugador",
        player_bbox_hint: body.playerBboxHint,
        sample_fps: body.sampleFps ?? 10,
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

  const data = (await modalResp.json()) as ScanningResult;

  return json({
    source: "modal",
    videoId: body.videoId,
    playerId: body.playerId,
    playerName: body.playerName ?? "Jugador",
    scanIQ: data.scan_iq,
    receptionsAnalyzed: data.receptions_analyzed,
    avgScansPreReception: data.avg_scans_pre_reception,
    scansUnderPressure: data.scans_under_pressure,
    successWithScan: data.success_with_scan,
    successWithoutScan: data.success_without_scan,
    forwardOrientedPct: data.forward_oriented_pct,
    durationProcessedSec: data.duration_processed_sec,
    receptions: data.receptions,
    scans: data.scans,
  });
}

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: {
      "Content-Type": "application/json",
      ...CORS_HEADERS,
    },
  });
}
