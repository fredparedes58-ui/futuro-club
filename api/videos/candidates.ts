/**
 * VITAS · Get Player Candidates from Video
 * GET /api/videos/candidates?videoId=xxx
 *
 * Devuelve los candidatos de jugador que Modal extrajo del vídeo.
 * Usado por la pantalla de identificación para que el padre seleccione
 * cuál es su hijo.
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

    // Obtener el último análisis del vídeo (que contiene los candidates)
    const { data: analysis } = await supabase
      .from("analyses")
      .select("id, status, biomechanics, video_id")
      .eq("video_id", params.data.videoId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!analysis) {
      return successResponse({
        ready: false,
        message: "Análisis aún no completado, reintenta en unos segundos",
      });
    }

    // Verificar si ya hay un jugador identificado
    const { data: video } = await supabase
      .from("videos")
      .select("target_player_bbox")
      .eq("id", params.data.videoId)
      .single();

    if (video?.target_player_bbox) {
      return successResponse({
        ready: true,
        alreadyIdentified: true,
        targetBbox: video.target_player_bbox,
      });
    }

    // Los candidates vienen en el JSON del biomechanics o en una columna dedicada.
    // Por ahora, los modelos guardan en `analyses` table (extender si es necesario).
    // En la query actual buscamos en una columna jsonb `candidates` dentro de analyses.

    const { data: analysisFull } = await supabase
      .from("analyses")
      .select("*")
      .eq("id", analysis.id)
      .single();

    const candidates =
      (analysisFull as { candidates?: unknown })?.candidates ?? [];

    return successResponse({
      ready: true,
      alreadyIdentified: false,
      analysisId: analysis.id,
      analysisStatus: analysis.status,
      candidates,
    });
  }
);
