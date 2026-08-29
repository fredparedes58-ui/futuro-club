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
import { hmacSha256Hex, timingSafeEqual } from "../_lib/edgeCrypto";
import { enqueueAnalysis } from "../_lib/enqueueAnalysis";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const BUNNY_WEBHOOK_SECRET = process.env.BUNNY_WEBHOOK_SECRET ?? "";
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;
const CRON_SECRET = process.env.CRON_SECRET ?? "";

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

async function validateBunnySignature(body: string, signature: string | null): Promise<boolean> {
  // Fail-CLOSED: sin secret NO validamos como "ok" (ver guard en el handler).
  if (!BUNNY_WEBHOOK_SECRET) return false;
  if (!signature) return false;

  try {
    const expected = await hmacSha256Hex(BUNNY_WEBHOOK_SECRET, body);
    return timingSafeEqual(signature.toLowerCase(), expected.toLowerCase());
  } catch {
    return false;
  }
}

export default withHandler(
  { schema: bunnySchema, requireAuth: false, maxRequests: 200 },
  async ({ body, headers, rawBody }) => {
    // ── Fail-CLOSED sin secret ──────────────────────────────
    // Consistente con stripe/modal-tracking: sin BUNNY_WEBHOOK_SECRET no podemos
    // verificar la firma → rechazamos. Antes hacía fail-OPEN (aceptaba cualquier
    // webhook), permitiendo forjar filas `analyses` y encolar procesamiento.
    if (!BUNNY_WEBHOOK_SECRET) {
      console.error("[VITAS] BUNNY_WEBHOOK_SECRET no configurado — rechazando webhook (fail-closed)");
      return errorResponse({
        code: "webhook_not_configured",
        message: "Webhook signature secret not configured",
        status: 503,
      });
    }

    // ── Validar firma Bunny ─────────────────────────────────
    const signature = headers?.["x-bunny-signature"] ?? null;
    if (!(await validateBunnySignature(rawBody ?? "", signature))) {
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
      .select("id, tenant_id, player_id, target_player_bbox, played_position")
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

    // ── Encolar (idempotente) · impl compartida con finalize (inv #7) ──────
    const result = await enqueueAnalysis({
      supabase,
      videoId: video.id,
      tenantId: video.tenant_id,
      playerId: video.player_id,
      playedPosition: (video as { played_position?: string | null }).played_position ?? null,
      publicUrl: PUBLIC_URL,
      cronSecret: CRON_SECRET,
    });

    if (result.status === "error") {
      return errorResponse({ code: "create_analysis_failed", message: result.error, status: 500 });
    }
    if (result.status === "skipped") {
      // Vídeo sin jugador/tenant atado → no se encola (no es un fallo del webhook).
      return successResponse({ skipped: true, reason: result.reason });
    }
    if (result.status === "exists") {
      return successResponse({ skipped: true, reason: "analysis_already_exists", analysisId: result.analysisId });
    }

    console.log(`[VITAS] Analysis ${result.analysisId} encolado para video ${video.id}`);
    return successResponse({
      analysisId: result.analysisId,
      videoId: video.id,
      status: "queued",
      estimatedStartIn: result.triggered
        ? "inmediato (procesamiento disparado)"
        : "<24h (cron diario · CRON_SECRET no configurado)",
    });
  }
);
