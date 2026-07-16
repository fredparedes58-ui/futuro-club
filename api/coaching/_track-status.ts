/**
 * VITAS · GET /api/coaching/track-status?jobId=…  (Vision V4 · fase V4.2)
 *
 * Polling del estado de un tracking job async. Contrato (roadmap V4):
 *   { jobId, status, result?, error? }
 *
 * Detalles de la review:
 *   - Ownership con ctx.isServiceCall EXPLÍCITO (no el frágil userId===null).
 *   - El SELECT del poll NO trae `result` (multi-MB para un partido completo);
 *     solo cuando status=done se hace un segundo fetch únicamente del result.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { supabaseConfigured, serviceHeaders, trackingJobUrl } from "../_lib/supabaseRest";

export const config = { runtime: "edge" };

interface JobRow {
  id: string;
  user_id: string | null;
  status: "queued" | "processing" | "done" | "failed";
  error: string | null;
}

export default withHandler(
  { method: ["GET"], requireAuth: true, allowServiceToken: true, maxRequests: 120 },
  async ({ query, userId, isServiceCall }) => {
    const jobId = query.jobId;
    if (!jobId) {
      return errorResponse({ code: "missing_fields", message: "jobId requerido", status: 400 });
    }
    if (!supabaseConfigured()) {
      return errorResponse({ code: "no_supabase", message: "Supabase no configurado", status: 503 });
    }

    const res = await fetch(
      trackingJobUrl(jobId, "&select=id,user_id,status,error&limit=1"),
      { headers: serviceHeaders() },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return errorResponse({
        code: "lookup_failed",
        message: `Supabase: ${res.status} ${t.slice(0, 200)}`,
        status: 500,
      });
    }
    const rows = (await res.json().catch(() => [])) as JobRow[];
    if (!rows.length) {
      return errorResponse({ code: "job_not_found", message: `Job ${jobId} no existe`, status: 404 });
    }
    const job = rows[0];

    if (!isServiceCall && job.user_id !== userId) {
      return errorResponse({ code: "forbidden", message: "Este job no te pertenece", status: 403 });
    }

    // result solo cuando done — y en un fetch aparte para no arrastrar el jsonb
    // multi-MB en cada tick del polling.
    let result: unknown;
    if (job.status === "done") {
      const r = await fetch(trackingJobUrl(jobId, "&select=result&limit=1"), {
        headers: serviceHeaders(),
      });
      if (r.ok) {
        const rr = (await r.json().catch(() => [])) as Array<{ result: unknown }>;
        result = rr[0]?.result;
      }
    }

    return successResponse({
      jobId: job.id,
      status: job.status,
      result,
      error: job.status === "failed" ? job.error : undefined,
    });
  },
);
