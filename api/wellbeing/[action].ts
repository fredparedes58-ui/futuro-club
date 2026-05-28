/**
 * VITAS · Wellbeing Router (Sprint 22)
 * Routes /api/wellbeing/{action} to the correct handler.
 *
 *   GET  /api/wellbeing/dropout-risk?playerId=xxx → compute dropout risk on-demand
 *   POST /api/wellbeing/burnout-report → AI burnout report
 *   POST /api/wellbeing/save-questionnaire → save wellbeing questionnaire
 *   POST /api/wellbeing/attendance → save/update attendance record
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import dropoutRisk from "./_dropout-risk";
import burnoutReport from "../agents/_burnout-report";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "dropout-risk": dropoutRisk,
  "burnout-report": burnoutReport,
  "save-questionnaire": async (req: Request) => {
    // TODO: Persist to wellbeing_questionnaires table
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);
    try {
      const body = await req.json() as Record<string, unknown>;
      const playerId = body.playerId as string | undefined;
      if (!playerId) return errorResponse("playerId required", 400);
      return successResponse({
        playerId,
        status: "saved",
        savedAt: new Date().toISOString(),
        source: "mock",
      });
    } catch {
      return errorResponse("Invalid JSON body", 400);
    }
  },
  "attendance": async (req: Request) => {
    // TODO: Persist to attendance_records table
    if (req.method !== "POST") return errorResponse("Method not allowed", 405);
    try {
      const body = await req.json() as Record<string, unknown>;
      const playerId = body.playerId as string | undefined;
      if (!playerId) return errorResponse("playerId required", 400);
      return successResponse({
        playerId,
        status: "recorded",
        date: body.date ?? new Date().toISOString().split("T")[0],
        source: "mock",
      });
    } catch {
      return errorResponse("Invalid JSON body", 400);
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
