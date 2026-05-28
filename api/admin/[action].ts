/**
 * VITAS · Admin Router
 * Routes /api/admin/{action} to the correct handler.
 *
 * Acciones soportadas:
 *   GET  /api/admin/analytics   → business analytics agregados (solo admin)
 *   POST /api/admin/manage-plan → assign plan to user (Fase 3)
 *   GET  /api/admin/list-orgs   → list all orgs with usage (Fase 3)
 *   GET  /api/admin/list-users  → paginated user list (Fase 3)
 *   POST /api/admin/reset-quota → reset user's monthly quota (Fase 3)
 */
import { errorResponse } from "../_lib/apiResponse";

import analytics from "./_analytics";
import managePlan from "./_manage-plan";
import listOrgs from "./_list-orgs";
import listUsers from "./_list-users";
import resetQuota from "./_reset-quota";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "analytics": analytics,
  "manage-plan": managePlan,
  "list-orgs": listOrgs,
  "list-users": listUsers,
  "reset-quota": resetQuota,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`Admin action "${action}" not found`, 404);
  return fn(req);
}
