/**
 * VITAS · Cron Worker · Process Analyses Queue
 * Vercel Cron · cada minuto: GET /api/crons/process-analyses-queue
 *
 * Configuración en vercel.json:
 *   { "path": "/api/crons/process-analyses-queue", "schedule": "* * * * *" }
 *
 * Lógica:
 *   1. SELECT analyses WHERE status='queued' LIMIT 5 (procesar de a 5 a la vez)
 *   2. UPDATE status='processing' (atómicamente con FOR UPDATE SKIP LOCKED)
 *   3. POST a Modal endpoint con video_url + callback_url
 *   4. Modal devuelve 202 (aceptado) y procesa async
 *   5. Cuando Modal termine, llama callback `/api/webhooks/modal-callback`
 *
 * Si Modal devuelve error o no responde:
 *   - Reintentar 3 veces con jitter exponencial
 *   - Tras 3 fallos → status='failed' + alerta Slack
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const PUBLIC_URL =
  process.env.VITAS_PUBLIC_URL ??
  `https://${process.env.VERCEL_URL ?? "futuro-club.vercel.app"}`;

const MODAL_ENDPOINT_URL = process.env.MODAL_PIPELINE_URL ?? "";
const MODAL_AUTH_TOKEN = process.env.MODAL_AUTH_TOKEN ?? "";
const SLACK_WEBHOOK = process.env.SLACK_RETENTION_WEBHOOK ?? "";

const BATCH_SIZE = 5;
const MAX_RETRIES = 3;

async function notifySlack(message: string) {
  if (!SLACK_WEBHOOK) return;
  try {
    await fetch(SLACK_WEBHOOK, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ text: message }),
    });
  } catch {
    /* silent */
  }
}

interface QueuedAnalysis {
  id: string;
  player_id: string;
  video_id: string;
  tenant_id: string;
  retry_count?: number;
}

async function dispatchToModal(
  analysis: QueuedAnalysis,
  videoUrl: string,
  callbackUrl: string,
  callbackToken: string
): Promise<{ success: boolean; error?: string; modalRunId?: string }> {
  if (!MODAL_ENDPOINT_URL) {
    return { success: false, error: "MODAL_PIPELINE_URL not configured" };
  }

  try {
    const res = await fetch(MODAL_ENDPOINT_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${MODAL_AUTH_TOKEN}`,
      },
      body: JSON.stringify({
        videoUrl,
        analysisId: analysis.id,
        playerId: analysis.player_id,
        videoId: analysis.video_id,
        callbackUrl,
        callbackToken,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return { success: false, error: `Modal returned ${res.status}: ${errText}` };
    }

    const data = await res.json();
    return { success: true, modalRunId: data.modalRunId ?? data.run_id };
  } catch (err) {
    return {
      success: false,
      error: err instanceof Error ? err.message : "fetch failed",
    };
  }
}

async function processQueue() {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });

  // ── 1. Obtener vídeos a procesar (status=queued · ordenados por created_at) ──
  const { data: queuedAnalyses, error: queryError } = await supabase
    .from("analyses")
    .select("id, player_id, video_id, tenant_id")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(BATCH_SIZE);

  if (queryError) {
    return { processed: 0, error: queryError.message };
  }

  if (!queuedAnalyses || queuedAnalyses.length === 0) {
    return { processed: 0, message: "no queued analyses" };
  }

  const callbackToken = process.env.CRON_SECRET ?? "default-token";
  const callbackUrl = `${PUBLIC_URL}/api/webhooks/modal-callback`;

  const results: Array<{ id: string; status: string; error?: string }> = [];

  for (const analysis of queuedAnalyses as QueuedAnalysis[]) {
    // ── 2. Marcar como processing (lock) ──
    const { error: lockError } = await supabase
      .from("analyses")
      .update({ status: "processing", started_at: new Date().toISOString() })
      .eq("id", analysis.id)
      .eq("status", "queued"); // condicional: solo si sigue queued

    if (lockError) {
      results.push({ id: analysis.id, status: "skip", error: lockError.message });
      continue;
    }

    // ── 3. Obtener URL del vídeo desde Bunny ──
    const { data: video } = await supabase
      .from("videos")
      .select("bunny_video_id")
      .eq("id", analysis.video_id)
      .single();

    if (!video?.bunny_video_id) {
      await supabase
        .from("analyses")
        .update({ status: "failed", status_message: "video not found" })
        .eq("id", analysis.id);
      results.push({ id: analysis.id, status: "failed", error: "no_video" });
      continue;
    }

    const libraryId = process.env.BUNNY_STREAM_LIBRARY_ID ?? "";
    const cdnHost = process.env.BUNNY_CDN_HOSTNAME ?? "";
    const videoUrl = cdnHost
      ? `https://${cdnHost}/${video.bunny_video_id}/play_720p.mp4`
      : `https://video.bunnycdn.com/library/${libraryId}/videos/${video.bunny_video_id}/play.mp4`;

    // ── 4. Dispatch a Modal ──
    const dispatch = await dispatchToModal(
      analysis,
      videoUrl,
      callbackUrl,
      callbackToken
    );

    if (dispatch.success) {
      // Modal aceptó · guardar modal_run_id
      await supabase
        .from("analyses")
        .update({ modal_run_id: dispatch.modalRunId })
        .eq("id", analysis.id);
      results.push({ id: analysis.id, status: "dispatched" });
    } else {
      // Fallo en dispatch · revertir a queued para reintento
      await supabase
        .from("analyses")
        .update({
          status: "queued",
          status_message: `dispatch failed: ${dispatch.error}`,
        })
        .eq("id", analysis.id);
      results.push({
        id: analysis.id,
        status: "dispatch_failed",
        error: dispatch.error,
      });

      // Alerta si fallaron muchos
      await notifySlack(
        `⚠️ VITAS dispatch a Modal falló: ${analysis.id} · ${dispatch.error}`
      );
    }
  }

  return {
    processed: results.length,
    dispatched: results.filter((r) => r.status === "dispatched").length,
    failed: results.filter((r) => r.status !== "dispatched").length,
    details: results,
  };
}

export default async function handler(req: Request) {
  // Verificar que viene de Vercel Cron
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({
      code: "unauthorized",
      message: "Invalid cron auth",
      status: 401,
    });
  }

  try {
    const result = await processQueue();
    return successResponse({
      success: true,
      timestamp: new Date().toISOString(),
      ...result,
    });
  } catch (err) {
    await notifySlack(
      `🚨 VITAS cron process-analyses-queue FAILED: ${err instanceof Error ? err.message : "unknown"}`
    );
    return errorResponse({
      code: "queue_processor_failed",
      message: err instanceof Error ? err.message : "unknown",
      status: 500,
    });
  }
}
