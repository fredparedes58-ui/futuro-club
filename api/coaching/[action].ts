/**
 * VITAS · Coaching Router
 * Routes /api/coaching/{action} to the correct handler.
 *
 * Sprint 14:
 *   POST /api/coaching/analyze-session → full session analysis pipeline
 *
 * Sprint 15 (ahora con lectura real de Supabase):
 *   GET  /api/coaching/session-analysis?sessionId= → una sesión analizada
 *   GET  /api/coaching/session-recommendation?teamId= → recomendación desde
 *        las últimas sesiones (balance agregado + dimensión más floja)
 *   POST /api/coaching/coaching-report → AI coaching report
 *   GET  /api/coaching/parent-report?playerId= → último reporte de padres
 *
 * Los cómputos pesados (segmenter, classifier, analyzer, recommender) corren
 * en analyze-session y persisten en training_sessions.balance; estos endpoints
 * solo leen. Sin Supabase → source:"no_supabase" (el cliente cae a su caché).
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import analyzeSession from "./_analyze-session";
import coachingAssistant from "../agents/_coaching-assistant";
import trackPlayers from "./_track-players";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

function sbHeaders(): Record<string, string> {
  return { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` };
}

interface SessionRow {
  id: string;
  team_id: string;
  session_date: string;
  duration_min: number;
  segments: unknown[];
  drills: unknown[];
  balance: Record<string, number> | null;
  total_load: number;
  drill_count: number;
  player_count: number;
  status: string;
}

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "analyze-session": analyzeSession,
  "coaching-report": coachingAssistant,
  "track-players": trackPlayers,

  "session-analysis": async (req: Request) => {
    const sessionId = new URL(req.url).searchParams.get("sessionId");
    if (!sessionId) return errorResponse("sessionId required", 400);
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ sessionId, session: null, source: "no_supabase" });
    }
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/training_sessions?id=eq.${sessionId}&select=*&limit=1`,
        { headers: sbHeaders() },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return errorResponse(`Supabase fetch failed: ${res.status} ${t.slice(0, 200)}`, 500);
      }
      const rows = (await res.json()) as SessionRow[];
      if (!rows.length) return errorResponse("Session not found", 404);
      return successResponse({ sessionId, session: rows[0] });
    } catch (err) {
      console.error("[coaching/session-analysis] error:", err);
      return errorResponse("Internal error", 500);
    }
  },

  "session-recommendation": async (req: Request) => {
    const teamId = new URL(req.url).searchParams.get("teamId");
    if (!teamId) return errorResponse("teamId required", 400);
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ teamId, recommendation: null, source: "no_supabase" });
    }
    try {
      // Últimas 8 sesiones completadas del equipo
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/training_sessions?team_id=eq.${teamId}&status=eq.completed&select=id,session_date,balance,total_load,duration_min&order=session_date.desc&limit=8`,
        { headers: sbHeaders() },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return errorResponse(`Supabase fetch failed: ${res.status} ${t.slice(0, 200)}`, 500);
      }
      const sessions = (await res.json()) as SessionRow[];
      if (!sessions.length) {
        return successResponse({
          teamId,
          recommendation: null,
          message: "No hay sesiones completadas para generar recomendación",
          sessionsAnalyzed: 0,
        });
      }

      // Agregar balance (% por dimensión) de las sesiones con datos
      const dims = ["technical", "tactical", "physical", "game"] as const;
      const acc: Record<string, { sum: number; n: number }> = {};
      for (const d of dims) acc[d] = { sum: 0, n: 0 };
      for (const s of sessions) {
        if (!s.balance) continue;
        for (const d of dims) {
          if (typeof s.balance[d] === "number") {
            acc[d].sum += s.balance[d];
            acc[d].n += 1;
          }
        }
      }
      const avgBalance: Record<string, number> = {};
      for (const d of dims) avgBalance[d] = acc[d].n > 0 ? Math.round(acc[d].sum / acc[d].n) : 0;

      // Dimensión más floja = candidata a reforzar
      const weakest = dims.reduce((min, d) => (avgBalance[d] < avgBalance[min] ? d : min), dims[0]);
      const avgLoad =
        sessions.reduce((s, x) => s + (x.total_load ?? 0), 0) / sessions.length;

      return successResponse({
        teamId,
        sessionsAnalyzed: sessions.length,
        recommendation: {
          avgBalance,
          weakestDimension: weakest,
          avgLoad: Math.round(avgLoad),
          focus: `Reforzar dimensión "${weakest}" (promedio ${avgBalance[weakest]}% en últimas ${sessions.length} sesiones)`,
          lastSessionDate: sessions[0].session_date,
        },
      });
    } catch (err) {
      console.error("[coaching/session-recommendation] error:", err);
      return errorResponse("Internal error", 500);
    }
  },

  "parent-report": async (req: Request) => {
    const playerId = new URL(req.url).searchParams.get("playerId");
    if (!playerId) return errorResponse("playerId required", 400);
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ playerId, report: null, source: "no_supabase" });
    }
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/parent_reports?player_id=eq.${playerId}&select=*&order=report_month.desc&limit=1`,
        { headers: sbHeaders() },
      );
      if (!res.ok) {
        const t = await res.text().catch(() => "");
        return errorResponse(`Supabase fetch failed: ${res.status} ${t.slice(0, 200)}`, 500);
      }
      const rows = (await res.json()) as Array<{ report_data: unknown; report_month: string }>;
      if (!rows.length) {
        return successResponse({
          playerId,
          report: null,
          message: "No hay reporte de padres generado aún para este jugador",
        });
      }
      return successResponse({
        playerId,
        report: rows[0].report_data,
        reportMonth: rows[0].report_month,
      });
    } catch (err) {
      console.error("[coaching/parent-report] error:", err);
      return errorResponse("Internal error", 500);
    }
  },
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Coaching action "${action}" not found`, 404);
  return fn(req);
}
