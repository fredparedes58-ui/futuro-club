/**
 * VITAS · Roboflow Router
 * Routes /api/roboflow/{action} to the correct handler.
 */
import { errorResponse } from "../_lib/apiResponse";

import analyze from "./_analyze";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "analyze": analyze,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Roboflow action "${action}" not found`, 404);
  return fn(req);
}
