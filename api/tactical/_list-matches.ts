/**
 * VITAS · GET /api/tactical/list-matches
 *
 * Lista los matches que tienen heatmap táctico computado, ordenados por
 * última actualización descendente. Útil para el selector del módulo
 * tactical cuando no hay matchId en la URL.
 */

import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

interface HeatmapRow {
  match_id: string;
  computed_at: string;
  phase_type: string;
}

export default async function handler(_req: Request): Promise<Response> {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    return successResponse({ matches: [], source: "no_supabase" });
  }

  try {
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/phase_heatmaps?player_id=is.null&select=match_id,computed_at,phase_type&order=computed_at.desc&limit=200`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    const rows = (await res.json()) as HeatmapRow[];

    // Group by match_id
    const map = new Map<string, { phasesCount: number; computedAt: string }>();
    for (const r of rows) {
      const entry = map.get(r.match_id) ?? { phasesCount: 0, computedAt: r.computed_at };
      entry.phasesCount += 1;
      if (r.computed_at > entry.computedAt) entry.computedAt = r.computed_at;
      map.set(r.match_id, entry);
    }

    const matches = Array.from(map.entries())
      .map(([matchId, v]) => ({ matchId, phasesCount: v.phasesCount, computedAt: v.computedAt }))
      .sort((a, b) => b.computedAt.localeCompare(a.computedAt));

    return successResponse({ matches });
  } catch (err) {
    console.error("[list-matches] error:", err);
    return successResponse({ matches: [], error: String(err) });
  }
}
