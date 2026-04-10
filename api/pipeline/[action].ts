/**
 * VITAS · Pipeline Router
 * Routes /api/pipeline/{action} to the correct handler.
 */
import { errorResponse } from "../_lib/apiResponse";

import start from "./_start";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "start": start,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Pipeline action "${action}" not found`, 404);
  return fn(req);
}
