/**
 * VITAS · POST /api/coaching/track-async  (Vision V4 · fase V4.2)
 *
 * Enqueue de tracking GPU para vídeos LARGOS (partidos completos). El proxy
 * síncrono (_track-players) rechaza >MAX_SYNC_TRACK_SEC; este endpoint:
 *   1. Inserta una fila en tracking_jobs (status=queued) con el service key.
 *   2. Dispara el spawn en Modal (track_async → {call_id}) con callback firmado.
 *   3. Responde 202 { jobId } al instante; el cliente hace polling por
 *      /api/coaching/track-status?jobId=…
 *
 * Env: MODAL_TRACK_ASYNC_URL, MODAL_API_KEY, MODAL_CALLBACK_SECRET, PUBLIC_URL.
 * Sin MODAL_TRACK_ASYNC_URL → 503 real_inference_disabled (mismo contrato que
 * el proxy síncrono: el cliente decide su fallback).
 *
 * Si el spawn falla, la fila queda status=failed con el detalle (el cron de
 * red de seguridad V4.5 podrá re-encolar; hasta entonces, fail-fast honesto).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hmacSha256Hex } from "../_lib/edgeCrypto";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const schema = z.object({
  videoUrl: z.string().url(),
  videoId: z.string().optional(),
  playerId: z.string().optional(),
  sampleFps: z.number().int().min(1).max(30).optional(),
  durationSec: z.number().int().positive().optional(),
  orgId: z.string().uuid().optional(),
});

interface JobRow {
  id: string;
  status: string;
}

function sbHeaders(extra: Record<string, string> = {}): Record<string, string> {
  return {
    apikey: SERVICE_KEY,
    Authorization: `Bearer ${SERVICE_KEY}`,
    "Content-Type": "application/json",
    ...extra,
  };
}

export default withHandler(
  { method: ["POST"], schema, requireAuth: true, allowServiceToken: true, maxRequests: 10 },
  async ({ body, userId }) => {
    const modalAsyncUrl = process.env.MODAL_TRACK_ASYNC_URL;
    const modalKey = process.env.MODAL_API_KEY;
    const callbackSecret = process.env.MODAL_CALLBACK_SECRET ?? "";
    const publicUrl = process.env.PUBLIC_URL ?? "";

    if (!modalAsyncUrl || !modalKey) {
      return errorResponse({
        code: "real_inference_disabled",
        message:
          "MODAL_TRACK_ASYNC_URL / MODAL_API_KEY no configurados. El tracking async no está disponible.",
        status: 503,
      });
    }
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse({
        code: "no_supabase",
        message: "Supabase no configurado — la cola de tracking requiere persistencia.",
        status: 503,
      });
    }

    // 1 ── Insertar el job (queued)
    let job: JobRow;
    try {
      const ins = await fetch(`${SUPABASE_URL}/rest/v1/tracking_jobs`, {
        method: "POST",
        headers: sbHeaders({ Prefer: "return=representation" }),
        body: JSON.stringify({
          video_id: body.videoId ?? null,
          video_url: body.videoUrl,
          player_id: body.playerId ?? null,
          user_id: userId,
          org_id: body.orgId ?? null,
          sample_fps: body.sampleFps ?? 5,
          duration_sec: body.durationSec ?? null,
        }),
      });
      if (!ins.ok) {
        const t = await ins.text().catch(() => "");
        return errorResponse({
          code: "enqueue_failed",
          message: `No se pudo crear el job: ${ins.status} ${t.slice(0, 200)}`,
          status: 500,
        });
      }
      const rows = (await ins.json()) as JobRow[];
      job = rows[0];
    } catch (err) {
      return errorResponse({
        code: "enqueue_failed",
        message: err instanceof Error ? err.message : "insert failed",
        status: 500,
      });
    }

    // 2 ── Spawn en Modal (fire-and-forget server-side)
    // El callback va firmado: Modal reenvía el token tal cual en el header
    // X-Vitas-Signature; el webhook lo verifica con HMAC(secret, jobId).
    const callbackUrl = `${publicUrl}/api/webhooks/modal-tracking`;
    const callbackToken = callbackSecret ? await hmacSha256Hex(callbackSecret, job.id) : "";

    try {
      const spawn = await fetch(modalAsyncUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${modalKey}`,
        },
        body: JSON.stringify({
          video_url: body.videoUrl,
          sample_fps: body.sampleFps ?? 5,
          classes: [0, 32],
          job_id: job.id,
          callback_url: callbackUrl,
          callback_token: callbackToken,
        }),
      });
      if (!spawn.ok) {
        const detail = await spawn.text().catch(() => "");
        await markFailed(job.id, `modal spawn ${spawn.status}: ${detail.slice(0, 300)}`);
        return errorResponse({
          code: "modal_spawn_failed",
          message: `Modal rechazó el spawn (${spawn.status}).`,
          status: 502,
        });
      }
      const data = (await spawn.json()) as { call_id?: string };
      if (data.call_id) {
        await fetch(`${SUPABASE_URL}/rest/v1/tracking_jobs?id=eq.${job.id}`, {
          method: "PATCH",
          headers: sbHeaders(),
          body: JSON.stringify({ modal_call_id: data.call_id }),
        }).catch(() => undefined); // best-effort: el job ya corre en Modal
      }
    } catch (err) {
      await markFailed(job.id, err instanceof Error ? err.message : "modal unreachable");
      return errorResponse({
        code: "modal_unreachable",
        message: "No se pudo contactar con Modal para lanzar el tracking.",
        status: 502,
      });
    }

    return successResponse({ jobId: job.id, status: "queued" }, 202);
  },
);

async function markFailed(jobId: string, error: string): Promise<void> {
  try {
    await fetch(`${SUPABASE_URL}/rest/v1/tracking_jobs?id=eq.${jobId}`, {
      method: "PATCH",
      headers: sbHeaders(),
      body: JSON.stringify({ status: "failed", error, finished_at: new Date().toISOString() }),
    });
  } catch {
    // best-effort — el cron V4.5 detectará el job colgado
  }
}
