/**
 * VITAS · Agents Router
 * Consolidates 7 Edge agent endpoints into one Vercel function.
 */
import { errorResponse } from "../_lib/apiResponse";

import phvCalculator from "./_phv-calculator";
import playerSimilarity from "./_player-similarity";
import roleProfile from "./_role-profile";
import scoutInsight from "./_scout-insight";
import tacticalLabel from "./_tactical-label";
import videoIntelligence from "./_video-intelligence";
import teamIntelligence from "./_team-intelligence";
import invalidateCache from "./_invalidate-cache";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "phv-calculator": phvCalculator,
  "player-similarity": playerSimilarity,
  "role-profile": roleProfile,
  "scout-insight": scoutInsight,
  "tactical-label": tacticalLabel,
  "video-intelligence": videoIntelligence,
  "team-intelligence": teamIntelligence,
  "invalidate-cache": invalidateCache,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Agent "${action}" not found`, 404);
  return fn(req);
}
