/**
 * VITAS · Coaching Router
 * Routes /api/coaching/{action} to the correct handler.
 *
 * Sprint 14:
 *   POST /api/coaching/analyze-session → full session analysis pipeline
 *
 * Sprint 15:
 *   GET  /api/coaching/session-analysis → get session analysis
 *   GET  /api/coaching/session-recommendation → get weekly plan
 *   POST /api/coaching/coaching-report → AI coaching report
 *   GET  /api/coaching/parent-report → parent report
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import analyzeSession from "./_analyze-session";
import coachingAssistant from "../agents/_coaching-assistant";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "analyze-session": analyzeSession,
  "coaching-report": coachingAssistant,
  // Placeholder handlers for query endpoints (Sprint 15)
  "session-analysis": async (req: Request) => {
    const url = new URL(req.url);
    const sessionId = url.searchParams.get("sessionId");
    if (!sessionId) return errorResponse("sessionId required", 400);
    // TODO: fetch from training_sessions table
    return successResponse({ sessionId, status: "not_implemented" });
  },
  "session-recommendation": async (req: Request) => {
    const url = new URL(req.url);
    const teamId = url.searchParams.get("teamId");
    if (!teamId) return errorResponse("teamId required", 400);
    // TODO: compute from recent sessions
    return successResponse({ teamId, status: "not_implemented" });
  },
  "parent-report": async (req: Request) => {
    const url = new URL(req.url);
    const playerId = url.searchParams.get("playerId");
    if (!playerId) return errorResponse("playerId required", 400);
    // TODO: generate from player_session_metrics
    return successResponse({ playerId, status: "not_implemented" });
  },
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Coaching action "${action}" not found`, 404);
  return fn(req);
}
