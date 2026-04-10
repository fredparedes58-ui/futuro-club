/**
 * VITAS · Videos Router
 * Uses [action].ts pattern (same as agents, pipeline, rag)
 *
 * Routes:
 *   /api/videos/list              → list all videos
 *   /api/videos/status?videoId=X  → get video encoding status
 *   /api/videos/delete?videoId=X  → delete video
 */
import { errorResponse } from "../_lib/apiResponse";
import list from "./_list";
import videoStatus from "./_status";
import videoDelete from "./_delete";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.replace(/^\/api\/videos\/?/, "").split("/").filter(Boolean)[0];

  switch (action) {
    case "list": return list(req);
    case "status": return videoStatus(req);
    case "delete": return videoDelete(req);
    default:
      return errorResponse(`Videos action "${action}" not found`, 404);
  }
}
