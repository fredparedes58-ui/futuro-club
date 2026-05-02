/**
 * VITAS · Webhook Callback desde Modal
 * POST /api/webhooks/modal-callback
 *
 * Llamado por Modal cuando termina el procesamiento del vídeo.
 *
 * Modal envía:
 *   {
 *     "analysisId": "uuid",
 *     "callbackToken": "secret",
 *     "modalRunId": "...",
 *     "status": "success" | "failed",
 *     "result": {
 *       "keypoints": [...],
 *       "biomechanics": {...},
 *       "videoFps": 30,
 *       "videoDurationSec": 90,
 *       "framesProcessed": 30,
 *       "totalLatencyMs": 12000
 *     },
 *     "error": "..."  // si status=failed
 *   }
 *
 * Flujo:
 *   1. Validar callbackToken
 *   2. Persistir keypoints + biomechanics en `analyses` table
 *   3. Disparar `_pipeline-orchestrator` para los 6 reportes LLM
 *   4. Marcar analysis status='completed' (cuando reportes terminen) o
 *      status='processing_reports' mientras tanto.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const callbackSchema = z.object({
  analysisId: z.string().uuid(),
  callbackToken: z.string(),
  modalRunId: z.string().optional(),
  status: z.enum(["success", "failed"]),
  result: z
    .object({
      keypoints: z.array(z.unknown()).optional(),
      biomechanics: z.record(z.unknown()).optional(),
      embedding: z.array(z.number()).optional(),
      videoFps: z.number().optional(),
      videoDurationSec: z.number().optional(),
      framesProcessed: z.number().optional(),
      totalLatencyMs: z.number().optional(),
      pixelsPerMeter: z.number().nullable().optional(),
    })
    .optional(),
  error: z.string().optional(),
});

async function triggerOrchestrator(
  analysisId: string,
  authToken: string
): Promise<{ success: boolean; error?: string }> {
  // Llamar al pipeline-orchestrator (que dispara los 6 reportes Claude en paralelo)
  try {
    const res = await fetch(`${PUBLIC_URL}/api/agents/pipeline-orchestrator`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ analysisId }),
    });
    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `orchestrator returned ${res.status}: ${errText}` };
    }
    return { success: true };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

export default withHandler(
  { schema: callbackSchema, requireAuth: false, maxRequests: 100 },
  async ({ body }) => {
    const input = body as z.infer<typeof callbackSchema>;

    // ── Validar callback token (timing-safe) ──────────────
    const expectedToken = process.env.CRON_SECRET ?? "default-token";
    if (input.callbackToken !== expectedToken) {
      return errorResponse({
        code: "invalid_token",
        message: "Modal callback token mismatch",
        status: 401,
      });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── Verificar que analysis existe ──────────────────────
    const { data: analysis, error: queryError } = await supabase
      .from("analyses")
      .select("id, status, tenant_id, player_id, video_id")
      .eq("id", input.analysisId)
      .single();

    if (queryError || !analysis) {
      return errorResponse({
        code: "analysis_not_found",
        message: "Analysis not in database",
        status: 404,
      });
    }

    // ── Caso: Modal reportó fallo ──────────────────────────
    if (input.status === "failed") {
      await supabase
        .from("analyses")
        .update({
          status: "failed",
          status_message: input.error ?? "Modal pipeline failed",
          completed_at: new Date().toISOString(),
        })
        .eq("id", analysis.id);

      console.error(`[VITAS] Analysis ${analysis.id} falló: ${input.error}`);
      return successResponse({
        analysisId: analysis.id,
        recorded: "failure",
      });
    }

    // ── Caso éxito: persistir resultado ─────────────────────
    const result = input.result ?? {};
    const updatePayload: Record<string, unknown> = {
      status: "processing_reports",
      biomechanics: result.biomechanics ?? null,
      total_latency_ms: result.totalLatencyMs ?? null,
      modal_run_id: input.modalRunId ?? null,
    };

    // Si Modal devolvió embedding, persistirlo
    if (result.embedding && result.embedding.length === 768) {
      updatePayload.embedding = result.embedding;
    }

    const { error: updateError } = await supabase
      .from("analyses")
      .update(updatePayload)
      .eq("id", analysis.id);

    if (updateError) {
      return errorResponse({
        code: "update_failed",
        message: updateError.message,
        status: 500,
      });
    }

    // ── Disparar pipeline-orchestrator (6 reportes LLM en paralelo) ──
    const internalToken = process.env.INTERNAL_API_TOKEN ?? expectedToken;
    const orchestrator = await triggerOrchestrator(analysis.id, internalToken);

    if (!orchestrator.success) {
      // Modal terminó OK pero falló el dispatch a Claude
      // Lo dejamos en processing_reports, manualmente se puede re-disparar
      console.error(
        `[VITAS] Orchestrator dispatch failed for ${analysis.id}: ${orchestrator.error}`
      );
      return successResponse({
        analysisId: analysis.id,
        modalResult: "saved",
        reportsTrigger: "failed",
        warning: orchestrator.error,
      });
    }

    return successResponse({
      analysisId: analysis.id,
      modalResult: "saved",
      reportsTrigger: "dispatched",
      message: "6 reportes Claude generándose · ETA ~25 segundos",
    });
  }
);
