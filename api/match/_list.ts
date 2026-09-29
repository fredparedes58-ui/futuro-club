/**
 * VITAS · GET /api/match/list — los últimos jobs de partido del usuario (solo lectura)
 *
 * Permite recuperar un job sin `?job=` (el encode de Bunny puede tardar horas).
 * Solo los del propio usuario (user_id del JWT verificado).
 */
import { withHandler } from "../_lib/withHandler";
import { errorResponse, successResponse } from "../_lib/apiResponse";
import { matchJobListResponseSchema } from "../../src/lib/shared/matchJob/contract";
import { MATCH_VIDEO_CONFIG as CFG } from "../_lib/matchJob/config";
import { buildListItem } from "../_lib/matchJob/statusView";
import * as repo from "../_lib/matchJob/repo";

export default withHandler({ method: "GET", requireAuth: true, maxRequests: 60 }, async ({ userId }) => {
  if (!userId) return errorResponse({ message: "No autenticado", status: 401, code: "unauthorized" });
  const jobs = await repo.listUserJobs(userId, CFG.listLimit);
  return successResponse(matchJobListResponseSchema.parse({ jobs: jobs.map(buildListItem) }));
});
