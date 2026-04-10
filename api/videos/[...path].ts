/**
 * VITAS · Videos Router
 * Routes:
 *   /api/videos/list          → list all videos
 *   /api/videos/{id}/status   → get video status
 *   /api/videos/{id}/delete   → delete video
 */
import { errorResponse } from "../_lib/apiResponse";

import list from "./_list";
import status from "./[id]/_status";
import deleteVideo from "./[id]/_delete";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/api\/videos\/?/, "").split("/").filter(Boolean);

  // /api/videos/list
  if (segments.length === 1 && segments[0] === "list") {
    return list(req);
  }

  // /api/videos/{id}/status or /api/videos/{id}/delete
  if (segments.length === 2) {
    if (segments[1] === "status") return status(req);
    if (segments[1] === "delete") return deleteVideo(req);
  }

  return errorResponse(`Videos route "${segments.join("/")}" not found`, 404);
}
