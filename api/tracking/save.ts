/**
 * VITAS · POST /api/tracking/save
 * Persiste una sesión de tracking YOLO en Supabase.
 */

import { verifyAuth } from "../lib/auth";
import { z } from "zod";

export const config = { runtime: "edge" };

const TrackingSaveSchema = z.object({
  playerId: z.string().optional(),
  videoId: z.string().optional(),
  targetTrackId: z.number().int().nullable().optional(),
  durationMs: z.number().int().min(0).default(0),
  metrics: z.record(z.unknown()).default({}),
  scanEvents: z.array(z.unknown()).default([]),
  duelEvents: z.array(z.unknown()).default([]),
  calibrationPreset: z.string().default("full_corners"),
});

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Supabase no configurado" }, 503);
  }

  let rawBody: unknown;
  try { rawBody = await req.json(); }
  catch { return json({ error: "JSON inválido" }, 400); }

  const parsed = TrackingSaveSchema.safeParse(rawBody);
  if (!parsed.success) {
    return json({
      error: "Datos de tracking inválidos",
      details: parsed.error.errors.map(e => ({ path: e.path.join("."), message: e.message })),
    }, 400);
  }

  const body = parsed.data;

  // Verify JWT with signature check
  const { userId, error: authError } = await verifyAuth(req);
  if (!userId) return json({ error: authError ?? "No autenticado" }, 401);

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
