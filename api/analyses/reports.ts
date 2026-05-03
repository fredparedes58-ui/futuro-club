/**
 * VITAS · Get Analysis Reports
 * GET /api/analyses/reports?analysisId=xxx
 *
 * Devuelve los 6 reportes generados para un análisis,
 * más metadata del análisis (VSI, PHV, etc).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const querySchema = z.object({
  analysisId: z.string().uuid(),
});

export default withHandler(
  { schema: querySchema, requireAuth: true, maxRequests: 200 },
  async ({ query }) => {
    const params = querySchema.safeParse(query);
    if (!params.success) {
      return errorResponse({ code: "invalid_params", message: "analysisId requerido", status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // Cargar analysis + reports en paralelo
    const [analysisRes, reportsRes] = await Promise.all([
      supabase
        .from("analyses")
        .select("id, status, vsi, phv, similarity, biomechanics, completed_at, total_latency_ms, player_id, video_id")
        .eq("id", params.data.analysisId)
        .single(),
      supabase
        .from("reports")
        .select("report_type, content, model, prompt_version, generated_at, feedback_useful")
        .eq("analysis_id", params.data.analysisId)
        .eq("is_latest", true)
        .order("generated_at", { ascending: true }),
    ]);

    if (analysisRes.error || !analysisRes.data) {
      return errorResponse({
        code: "analysis_not_found",
        message: analysisRes.error?.message ?? "Not found",
        status: 404,
      });
    }

    return successResponse({
      analysis: analysisRes.data,
      reports: reportsRes.data ?? [],
      reportCount: reportsRes.data?.length ?? 0,
    });
  }
);
