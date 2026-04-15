/**
 * VITAS · Account Router
 * Routes /api/account/{action} to the correct handler.
 *
 * Acciones soportadas:
 *   GET/POST /api/account/export → GDPR data export (JSON completo)
 *   DELETE   /api/account/delete → elimina cuenta del usuario
 */
import { errorResponse } from "../_lib/apiResponse";

import del from "./_delete";
import exportData from "./_export";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "delete": del,
  "export": exportData,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Account action "${action}" not found`, 404);
  return fn(req);
}
