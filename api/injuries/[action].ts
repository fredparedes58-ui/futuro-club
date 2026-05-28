/**
 * VITAS · Injuries Router
 * Routes /api/injuries/{action} to the correct handler.
 *
 * Sprint 10: Injury Risk Model & Data
 */
import { errorResponse } from "../_lib/apiResponse";

import save from "./_save";
import list from "./_list";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  save,
  list,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Injuries action "${action}" not found`, 404);
  return fn(req);
}
