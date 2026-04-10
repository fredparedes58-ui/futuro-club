/**
 * VITAS · Catch-all API Router
 * Handles scattered endpoints consolidated into one Vercel function.
 */
import { errorResponse } from "./_lib/apiResponse";

import pipelineStart from "./pipeline/_start";
import playersSearch from "./players/_search";
import fixturesLive from "./fixtures/_live";
import trackingSave from "./tracking/_save";
import audit from "./_audit";
import roboflowAnalyze from "./roboflow/_analyze";
import uploadImage from "./upload/_image";
import uploadVideoInit from "./upload/_video-init";
import videosList from "./videos/_list";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  // Remove /api/ prefix and split
  const path = url.pathname.replace(/^\/api\/?/, "");
  const segments = path.split("/").filter(Boolean);

  // Match routes
  const key = segments.join("/");

  // Static routes
  const staticRoutes: Record<string, (req: Request) => Promise<Response>> = {
    "pipeline/start": pipelineStart,
    "players/search": playersSearch,
    "fixtures/live": fixturesLive,
    "tracking/save": trackingSave,
    "audit": audit,
    "roboflow/analyze": roboflowAnalyze,
    "upload/image": uploadImage,
    "upload/video-init": uploadVideoInit,
    "videos/list": videosList,
  };

  if (staticRoutes[key]) return staticRoutes[key](req);

  return errorResponse(`Route "/api/${key}" not found`, 404);
}
