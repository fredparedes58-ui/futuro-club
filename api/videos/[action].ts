/**
 * VITAS · Videos Dynamic Router
 * Handles: /api/videos/{action} where action = "list"
 * For /api/videos/{id}/status and /api/videos/{id}/delete,
 * these are 3-segment paths handled by [...path].ts
 */
import { errorResponse } from "../_lib/apiResponse";
import list from "./_list";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const segments = url.pathname.replace(/^\/api\/videos\/?/, "").split("/").filter(Boolean);
  const action = segments[0];

  if (action === "list") return list(req);

  return errorResponse(`Videos action "${action}" not found`, 404);
}
