/**
 * VITAS · GET /api/injuries/list?playerId=xxx
 * Fetch injury history for a player from Supabase `player_injuries` table.
 *
 * Sprint 10: Injury Risk Model & Data
 */

import { withHandler } from "../_lib/withHandler";
import { ownsPlayer } from "../_lib/ownership";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

export default withHandler(
  { method: "GET", requireAuth: true, allowServiceToken: true, maxRequests: 60 },
  async ({ query, userId, isServiceCall }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const playerId = query.playerId ?? null;

    if (!playerId) {
      return errorResponse("playerId required", 400, "MISSING_PARAM");
    }

    // Ownership: solo el dueño del jugador puede leer su historial de lesiones.
    if (!isServiceCall && !(await ownsPlayer(playerId, userId))) {
      return errorResponse("No autorizado para este jugador", 403, "FORBIDDEN");
    }

    const res = await fetch(
      `${supabaseUrl}/rest/v1/player_injuries?player_id=eq.${encodeURIComponent(playerId)}&order=injury_date.desc&limit=50`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!res.ok) {
      const err = await res.text().catch(() => "error");
      return errorResponse(`Supabase error: ${err}`, 500);
    }

    const injuries = await res.json();

    // Map to frontend format
    const mapped = (injuries as Array<Record<string, unknown>>).map((row) => ({
      id: row.id,
      type: row.injury_type,
      severity: row.severity,
      bodyPart: row.body_part,
      date: row.injury_date,
      daysOut: row.days_out,
      mechanism: row.mechanism,
      notes: row.notes,
      isRecurrent: row.is_recurrent,
    }));

    return successResponse(mapped);
  },
);
