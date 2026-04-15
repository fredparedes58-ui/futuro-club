/**
 * VITAS · Reports Router
 * Routes /api/reports/{action} to the correct handler.
 *
 * Acciones soportadas:
 *   POST /api/reports/pdf → genera PDF/HTML de reporte de jugador server-side
 */
import { errorResponse } from "../_lib/apiResponse";

import pdf from "./_pdf";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "pdf": pdf,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Reports action "${action}" not found`, 404);
  return fn(req);
}
