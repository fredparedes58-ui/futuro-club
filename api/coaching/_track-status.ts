/**
 * VITAS · GET /api/coaching/track-status?jobId=…  (Vision V4 · fase V4.2)
 *
 * Polling del estado de un tracking job async. Devuelve status y, cuando
 * status=done, el result completo (TrackingResponse camelCase).
 *
 * Ownership: el job debe pertenecer al usuario autenticado (user_id) salvo
 * llamadas internas con service token (cron/orchestrator), que ven todo.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

interface JobRow {
  id: string;
  user_id: string | null;
  status: "queued" | "processing" | "done" | "failed";
  result: unknown;
  error: string | null;
  attempts: number;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
}

export default withHandler(
  { method: ["GET"], requireAuth: true, allowServiceToken: true, maxRequests: 120 },
  async ({ query, userId }) => {
    const jobId = query.jobId;
    if (!jobId) {
      return errorResponse({ code: "missing_fields", message: "jobId requerido", status: 400 });
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse({ code: "no_supabase", message: "Supabase no configurado", status: 503 });
    }

    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/tracking_jobs?id=eq.${encodeURIComponent(jobId)}&select=id,user_id,status,result,error,attempts,created_at,started_at,finished_at&limit=1`,
      {
        headers: {
          apikey: SERVICE_KEY,
          Authorization: `Bearer ${SERVICE_KEY}`,
        },
      },
    );
    if (!res.ok) {
      const t = await res.text().catch(() => "");
      return errorResponse({
        code: "lookup_failed",
        message: `Supabase: ${res.status} ${t.slice(0, 200)}`,
        status: 500,
      });
    }
    const rows = (await res.json()) as JobRow[];
    if (!rows.length) {
      return errorResponse({ code: "job_not_found", message: `Job ${jobId} no existe`, status: 404 });
    }
    const job = rows[0];

    // Ownership: userId null = service token (withHandler ya validó el token).
    if (userId !== null && job.user_id !== userId) {
      return errorResponse({ code: "forbidden", message: "Este job no te pertenece", status: 403 });
    }

    return successResponse({
      jobId: job.id,
      status: job.status,
      // result solo cuando done (evita payloads enormes durante el polling)
      result: job.status === "done" ? job.result : undefined,
      error: job.status === "failed" ? job.error : undefined,
      attempts: job.attempts,
      createdAt: job.created_at,
      startedAt: job.started_at,
      finishedAt: job.finished_at,
    });
  },
);
