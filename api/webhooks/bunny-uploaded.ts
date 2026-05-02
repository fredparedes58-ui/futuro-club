/**
 * VITAS · Webhook Bunny Stream
 * POST /api/webhooks/bunny-uploaded
 *
 * Llamado por Bunny CDN cuando termina el upload de un vídeo.
 *
 * Bunny envía:
 *   {
 *     "VideoLibraryId": 634866,
 *     "VideoGuid": "abc-def-...",
 *     "Status": 4,                    // 4 = encoded ready
 *     "Resolution": "1920x1080",
 *     "Length": 90,                   // duración en segundos
 *     "Size": 12345678,
 *     "Title": "..."
 *   }
 *
 * Bunny puede enviar webhooks múltiples por upload (uploaded, encoded, etc).
 * Solo procesamos cuando Status === 4 (encoded ready, listo para usar).
 *
 * Flujo:
 *   1. Validar payload + signature
 *   2. Buscar el "videos" row asociado (por bunny_video_id)
 *   3. Crear `analyses` row con status='queued'
 *   4. Cron worker procesará en <1 min
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUNNY_WEBHOOK_SECRET = process.env.BUNNY_WEBHOOK_SECRET ?? "";

const bunnySchema = z.object({
  VideoLibraryId: z.number(),
  VideoGuid: z.string(),
  Status: z.number(),
  Resolution: z.string().optional(),
  Length: z.number().optional(),
  Size: z.number().optional(),
  Title: z.string().optional(),
});

// Bunny manda Status numérico:
// 0=Created, 1=Uploaded, 2=Processing, 3=Transcoding, 4=Finished, 5=Error
const STATUS_FINISHED = 4;
const STATUS_ERROR = 5;

function validateBunnySignature(body: string, signature: string | null): boolean {
  if (!BUNNY_WEBHOOK_SECRET) {
    console.warn("[VITAS] BUNNY_WEBHOOK_SECRET not configured · skipping signature validation");
    return true; // dev mode
  }
  if (!signature) return false;

  const expected = crypto
    .createHmac("sha256", BUNNY_WEBHOOK_SECRET)
    .update(body)
    .digest("hex");

  // timing-safe compare
  try {
    return crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(expected));
  } catch {
    return false;
  }
}

export default withHandler(
  { schema: bunnySchema, requireAuth: false, maxRequests: 200 },
  async ({ body, headers, rawBody }) => {
    // ── Validar firma Bunny ─────────────────────────────────
    const signature = headers?.["x-bunny-signature"] ?? null;
    if (BUNNY_WEBHOOK_SECRET && !validateBunnySignature(rawBody ?? "", signature)) {
      return errorResponse({
        code: "invalid_signature",
        message: "Bunny webhook signature mismatch",
        status: 401,
      });
    }

    const payload = body as z.infer<typeof bunnySchema>;

    // Solo procesamos cuando el vídeo está listo (encoded)
    if (payload.Status !== STATUS_FINISHED) {
      // Para Status=5 (error), opcional: marcar el video como failed
      if (payload.Status === STATUS_ERROR) {
        console.error(`[VITAS] Bunny reporta error en video ${payload.VideoGuid}`);
      }
      return successResponse({
        skipped: true,
        reason: `status=${payload.Status} (only Status=4 triggers processing)`,
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── Buscar el video en nuestra BBDD ────────────────────
    const { data: video, error: videoError } = await supabase
      .from("videos")
      .select("id, tenant_id, player_id, target_player_bbox")
      .eq("bunny_video_id", payload.VideoGuid)
      .single();

    if (videoError || !video) {
      console.warn(`[VITAS] Video ${payload.VideoGuid} no encontrado en BBDD`);
      return errorResponse({
        code: "video_not_found",
        message: "Video record not found",
        status: 404,
      });
    }

    // ── Idempotencia: ¿ya existe un analysis para este vídeo? ──
    const { data: existing } = await supabase
      .from("analyses")
      .select("id, status")
      .eq("video_id", video.id)
      .in("status", ["queued", "processing", "completed"])
      .maybeSingle();

    if (existing) {
      return successResponse({
        skipped: true,
        reason: "analysis_already_exists",
        analysisId: existing.id,
        status: existing.status,
      });
    }

    // ── Crear analysis row · status=queued ─────────────────
    const { data: analysis, error: createError } = await supabase
      .from("analyses")
      .insert({
        tenant_id: video.tenant_id,
        player_id: video.player_id,
        video_id: video.id,
        status: "queued",
        pipeline_version: "v1.0",
      })
      .select("id")
      .single();

    if (createError) {
      return errorResponse({
        code: "create_analysis_failed",
        message: createError.message,
        status: 500,
      });
    }

    console.log(`[VITAS] Analysis ${analysis.id} encolado para video ${video.id}`);

    return successResponse({
      analysisId: analysis.id,
      videoId: video.id,
      status: "queued",
      estimatedStartIn: "<60s (próximo ciclo del cron)",
    });
  }
);
