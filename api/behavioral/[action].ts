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

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "compute-profile": computeProfile,
  "behavioral-report": behavioralReport,
  "get-profile": async (req: Request) => {
    const url = new URL(req.url);
    const playerId = url.searchParams.get("playerId");
    if (!playerId) return errorResponse("playerId required", 400);
    // TODO: fetch from behavioral_profiles table
    return successResponse({ playerId, status: "not_implemented" });
  },
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Behavioral action "${action}" not found`, 404);
  return fn(req);
}
