/**
 * VITAS · Get Analysis by Video
 * GET /api/analyses/by-video?videoId=xxx
 *
 * Devuelve el análisis asociado a un vídeo · usado por el frontend para
 * polling del estado mientras Modal procesa.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const querySchema = z.object({
  videoId: z.string().min(1),
});

export default withHandler(
  { schema: querySchema, requireAuth: true, maxRequests: 200 },
  async ({ query }) => {
    const params = querySchema.safeParse(query);
    if (!params.success) {
      return errorResponse({ code: "invalid_params", message: "videoId requerido", status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    const { data: analysis, error } = await supabase
      .from("analyses")
      .select(
        "id, status, status_message, started_at, completed_at, vsi, phv, total_latency_ms"
      )
      .eq("video_id", params.data.videoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return errorResponse({ code: "db_error", message: error.message, status: 500 });
    }

    return successResponse({
      analysis: analysis ?? null,
    });
  }
);
