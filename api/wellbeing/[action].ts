/**
 * VITAS · Wellbeing Router (Sprint 22)
 * Routes /api/wellbeing/{action} to the correct handler.
 *
 *   GET  /api/wellbeing/dropout-risk?playerId=xxx → compute dropout risk on-demand
 *   POST /api/wellbeing/burnout-report → AI burnout report
 *   POST /api/wellbeing/save-questionnaire → persist wellbeing questionnaire
 *   POST /api/wellbeing/attendance → persist/upsert attendance record
 *
 * save-questionnaire y attendance persisten en Supabase (wellbeing_questionnaires
 * y attendance_records). Si Supabase no está configurado, devuelven
 * source:"client_only" para que el cliente lo guarde en su caché offline-first
 * (WellbeingService) — nunca se pierde el dato silenciosamente.
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import dropoutRisk from "./_dropout-risk";
import burnoutReport from "../agents/_burnout-report";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const VALID_RESPONDENTS = ["player", "coach", "parent"];
const VALID_STATUS = ["present", "absent", "late", "excused"];
const VALID_SOURCE = ["video", "manual", "auto"];

function supabaseHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SUPABASE_KEY,
    Authorization: `Bearer ${SUPABASE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "dropout-risk": dropoutRisk,
  "burnout-report": burnoutReport,

  "save-questionnaire": async (req: Request) => {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const playerId = body.playerId as string | undefined;
    const respondent = body.respondent as string | undefined;
    const responses = (body.responses ?? {}) as Record<string, unknown>;
    const score = typeof body.score === "number" ? (body.score as number) : null;

    if (!playerId) return errorResponse("playerId required", 400);
    if (!respondent || !VALID_RESPONDENTS.includes(respondent)) {
      return errorResponse(`respondent must be one of: ${VALID_RESPONDENTS.join(", ")}`, 400);
    }

    const row = {
      player_id: playerId,
      respondent,
      responses,
      score,
      filled_at: new Date().toISOString(),
    };

    // Sin Supabase → el cliente lo persiste en su caché offline-first.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ playerId, questionnaire: row, source: "client_only" });
    }

    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/wellbeing_questionnaires`, {
        method: "POST",
        headers: supabaseHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify(row),
      });
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return errorResponse(`Supabase insert failed: ${res.status} ${text.slice(0, 200)}`, 500);
      }
      const inserted = await res.json();
      return successResponse({
        playerId,
        questionnaire: Array.isArray(inserted) ? inserted[0] : inserted,
        status: "saved",
        savedAt: row.filled_at,
      });
    } catch (err) {
      console.error("[wellbeing/save-questionnaire] error:", err);
      return errorResponse("Internal error saving questionnaire", 500);
    }
  },

  attendance: async (req: Request) => {
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);
    let body: Record<string, unknown>;
    try {
      body = (await req.json()) as Record<string, unknown>;
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }

    const playerId = body.playerId as string | undefined;
    const date = (body.date as string | undefined) ?? new Date().toISOString().split("T")[0];
    const status = body.status as string | undefined;
    const source = (body.source as string | undefined) ?? "manual";
    const sessionId = (body.sessionId as string | undefined) ?? null;

    if (!playerId) return errorResponse("playerId required", 400);
    if (!status || !VALID_STATUS.includes(status)) {
      return errorResponse(`status must be one of: ${VALID_STATUS.join(", ")}`, 400);
    }
    if (!VALID_SOURCE.includes(source)) {
      return errorResponse(`source must be one of: ${VALID_SOURCE.join(", ")}`, 400);
    }

    const row = {
      player_id: playerId,
      date,
      status,
      source,
      session_id: sessionId,
    };

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ playerId, attendance: row, source: "client_only" });
    }

    try {
      // Upsert sobre la constraint UNIQUE (player_id, date) — re-marcar
      // asistencia del mismo día actualiza en vez de duplicar.
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/attendance_records?on_conflict=player_id,date`,
        {
          method: "POST",
          headers: supabaseHeaders({
            Prefer: "resolution=merge-duplicates,return=representation",
          }),
          body: JSON.stringify(row),
        },
      );
      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return errorResponse(`Supabase upsert failed: ${res.status} ${text.slice(0, 200)}`, 500);
      }
      const inserted = await res.json();
      return successResponse({
        playerId,
        attendance: Array.isArray(inserted) ? inserted[0] : inserted,
        status: "recorded",
        date,
      });
    } catch (err) {
      console.error("[wellbeing/attendance] error:", err);
      return errorResponse("Internal error saving attendance", 500);
    }
  },
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Wellbeing action "${action}" not found`, 404);
  return fn(req);
}
