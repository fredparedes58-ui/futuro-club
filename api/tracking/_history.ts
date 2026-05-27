/**
 * VITAS · Tracking History
 * GET /api/tracking/history?playerId=xxx&limit=10
 *
 * Returns the last N tracking sessions for a player from Supabase.
 * Provides summary data (no full positions/events) for timeline charts.
 */

import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const playerId = url.searchParams.get("playerId");
  const limit = Math.min(Number(url.searchParams.get("limit") ?? 10), 50);

  if (!playerId) {
    return errorResponse({ code: "missing_player_id", message: "playerId required", status: 400 });
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  const { data, error } = await supabase
    .from("tracking_sessions")
    .select("id, created_at, duration_ms, metrics, scan_events, duel_events")
    .eq("player_id", playerId)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) {
    return errorResponse({ code: "db_error", message: error.message, status: 500 });
  }

  const sessions = (data ?? []).map((row) => {
    const metrics = (row.metrics ?? {}) as Record<string, unknown>;
    const scans = Array.isArray(row.scan_events) ? row.scan_events : [];
    const duels = Array.isArray(row.duel_events) ? row.duel_events : [];

    return {
      id: row.id,
      date: row.created_at,
      durationSec: Math.round((row.duration_ms ?? 0) / 1000),
      maxSpeedMs: Number(metrics.maxSpeedMs ?? 0),
      avgSpeedMs: Number(metrics.avgSpeedMs ?? 0),
      sprintCount: Number(metrics.sprintCount ?? 0),
      scanCount: scans.length,
      duelCount: duels.length,
      eventCount: 0, // events not stored in tracking_sessions yet
      source: "supabase" as const,
    };
  });

  return successResponse(sessions);
}
