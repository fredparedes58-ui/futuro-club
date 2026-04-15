/**
 * VITAS · Legal Router
 * Routes /api/legal/{action} to the correct handler.
 *
 * Acciones soportadas:
 *   GET  /api/legal/status  → estado de aceptación de documentos legales
 *   POST /api/legal/accept  → registra aceptación de un documento
 *
 * Los handlers individuales usan prefijo `_` para que Vercel no los exponga
 * como rutas independientes. Este router es el único entry point público.
 */
import { errorResponse } from "../_lib/apiResponse";

import status from "./_status";
import accept from "./_accept";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "status": status,
  "accept": accept,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Legal action "${action}" not found`, 404);
  return fn(req);
}
