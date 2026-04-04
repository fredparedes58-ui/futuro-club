/**
 * VITAS · POST /api/tracking/save
 * Persiste una sesión de tracking YOLO en Supabase.
 */

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Supabase no configurado" }, 503);
  }

  let body: Record<string, unknown>;
  try { body = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const authHeader = req.headers.get("Authorization") ?? "";
  let userId: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    try {
      const payload = JSON.parse(atob(authHeader.slice(7).split(".")[1]));
      userId = payload.sub ?? null;
    } catch { /* token inválido */ }
  }

  if (!userId) return json({ error: "No autenticado" }, 401);

  const row = {
    user_id:           userId,
    player_id:         body.playerId,
    video_id:          body.videoId,
    target_track_id:   body.targetTrackId ?? null,
    duration_ms:       body.durationMs    ?? 0,
    metrics:           body.metrics       ?? {},
    scan_events:       body.scanEvents    ?? [],
    duel_events:       body.duelEvents    ?? [],
    calibration_preset: body.calibrationPreset ?? "full_corners",
  };

  const res = await fetch(`${supabaseUrl}/rest/v1/tracking_sessions`, {
    method: "POST",
    headers: {
      "apikey":        supabaseKey,
      "Authorization": `Bearer ${supabaseKey}`,
      "Content-Type":  "application/json",
      "Prefer":        "return=representation",
    },
    body: JSON.stringify(row),
  });

  if (!res.ok) {
    const err = await res.text().catch(() => "error");
    return json({ error: `Supabase error: ${err}` }, 500);
  }

  const data = await res.json();
  return json({ success: true, id: data?.[0]?.id ?? null });
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
