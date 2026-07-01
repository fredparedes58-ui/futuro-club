/**
 * VITAS · Behavioral Router (Sprint 19)
 * Routes /api/behavioral/{action} to the correct handler.
 *
 *   POST /api/behavioral/compute-profile → compute behavioral profile
 *   GET  /api/behavioral/get-profile → get stored profile
 *   POST /api/behavioral/behavioral-report → AI behavioral report
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import computeProfile from "./_compute-profile";
import behavioralReport from "../agents/_behavioral-report";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

interface BehavioralRow {
  id: string;
  player_id: string;
  analyzed_at: string;
  decision_speed: number;
  scanning_intelligence: number;
  resilience: number;
  clutch_factor: number;
  leadership: number;
  mental_fatigue: number;
  unpredictability: number;
  mental_composite_score: number;
  personality_archetype: string;
  full_profile: Record<string, unknown> | null;
  confidence: number;
  videos_analyzed: number;
  model_version: string;
}

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "compute-profile": computeProfile,
  "behavioral-report": behavioralReport,
  "get-profile": async (req: Request) => {
    const url = new URL(req.url);
    const playerId = url.searchParams.get("playerId");
    if (!playerId) return errorResponse("playerId required", 400);

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ playerId, profile: null, source: "no_supabase" });
    }

    try {
      // Último perfil conductual del jugador
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/behavioral_profiles?player_id=eq.${playerId}&select=*&order=analyzed_at.desc&limit=1`,
        { headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` } },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return errorResponse(`Supabase fetch failed: ${res.status} ${t.slice(0, 200)}`, 500);
      }
      const rows = (await res.json()) as BehavioralRow[];
      if (!rows.length) {
        return successResponse({
          playerId,
          profile: null,
          message: "No hay perfil conductual computado aún para este jugador",
        });
      }
      const r = rows[0];
      return successResponse({
        playerId,
        profile: {
          id: r.id,
          playerId: r.player_id,
          analyzedAt: r.analyzed_at,
          scores: {
            decisionSpeed: r.decision_speed,
            scanningIntelligence: r.scanning_intelligence,
            resilience: r.resilience,
            clutchFactor: r.clutch_factor,
            leadership: r.leadership,
            mentalFatigue: r.mental_fatigue,
            unpredictability: r.unpredictability,
            mentalComposite: r.mental_composite_score,
            archetype: r.personality_archetype,
          },
          fullProfile: r.full_profile ?? {},
          confidence: r.confidence,
          videosAnalyzed: r.videos_analyzed,
          modelVersion: r.model_version,
        },
      });
    } catch (err) {
      console.error("[behavioral/get-profile] error:", err);
      return errorResponse("Internal error fetching profile", 500);
    }
  },
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Behavioral action "${action}" not found`, 404);
  return fn(req);
}
