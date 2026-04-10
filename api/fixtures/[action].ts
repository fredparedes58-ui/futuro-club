/**
 * VITAS · Fixtures Router
 * Routes /api/fixtures/{action} to the correct handler.
 */
import { errorResponse } from "../_lib/apiResponse";

import live from "./_live";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "live": live,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Fixtures action "${action}" not found`, 404);
  return fn(req);
}
