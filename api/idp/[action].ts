/**
 * VITAS · IDP Router
 *
 * Routes /api/idp/{action} to the correct handler.
 *
 *   POST /api/idp/generate-plan      → propose draft IDP via Claude Sonnet
 *   POST /api/idp/approve-plan       → coach transitions draft → active
 *   POST /api/idp/update-goal        → coach edits a goal (marks coach_edited)
 *   POST /api/idp/update-milestone   → marks milestone status + evidence
 *   POST /api/idp/checkin            → monthly coach checkin (per-goal or plan-level)
 *   GET  /api/idp/get-plan           → fetch hydrated plan + optional summary
 */

import { errorResponse } from "../_lib/apiResponse";
import generatePlan from "./_generate-plan";
import approvePlan from "./_approve-plan";
import updateGoal from "./_update-goal";
import updateMilestone from "./_update-milestone";
import checkin from "./_checkin";
import getPlan from "./_get-plan";

export const config = { runtime: "edge" };

const routes: Record<string, (req: Request) => Promise<Response>> = {
  "generate-plan": generatePlan,
  "approve-plan": approvePlan,
  "update-goal": updateGoal,
  "update-milestone": updateMilestone,
  checkin,
  "get-plan": getPlan,
};

export default async function handler(req: Request): Promise<Response> {
  const url = new URL(req.url);
  const action = url.pathname.split("/").filter(Boolean).pop() ?? "";
  const fn = routes[action];
  if (!fn) return errorResponse(`IDP action "${action}" not found`, 404);
  return fn(req);
}
