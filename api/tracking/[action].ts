/**
 * VITAS · Tracking Router
 * Routes /api/tracking/{action} to the correct handler.
 */
import { errorResponse } from "../_lib/apiResponse";

import save from "./_save";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "save": save,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Tracking action "${action}" not found`, 404);
  return fn(req);
}
