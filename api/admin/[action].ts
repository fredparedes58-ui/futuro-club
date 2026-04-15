/**
 * VITAS · Admin Router
 * Routes /api/admin/{action} to the correct handler.
 *
 * Acciones soportadas:
 *   GET /api/admin/analytics → business analytics agregados (solo admin)
 */
import { errorResponse } from "../_lib/apiResponse";

import analytics from "./_analytics";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "analytics": analytics,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Admin action "${action}" not found`, 404);
  return fn(req);
}
