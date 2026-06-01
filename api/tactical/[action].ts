/**
 * VITAS · Tactical Router
 *
 *   POST /api/tactical/compute-heatmap     → tracking → phases + heatmaps
 *   GET  /api/tactical/get-heatmap         → fully hydrated TacticalMatchSummary
 *   POST /api/tactical/generate-insights   → Claude Sonnet insights
 *   GET  /api/tactical/list-matches        → matches with heatmap (selector)
 */

import { errorResponse } from "../_lib/apiResponse";
import computeHeatmap from "./_compute-heatmap";
import computeFromVideo from "./_compute-from-video";
import getHeatmap from "./_get-heatmap";
import generateInsights from "./_generate-insights";
import listMatches from "./_list-matches";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "compute-heatmap": computeHeatmap,
  "compute-from-video": computeFromVideo,
  "get-heatmap": getHeatmap,
  "generate-insights": generateInsights,
  "list-matches": listMatches,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Tactical action "${action}" not found`, 404);
  return fn(req);
}
