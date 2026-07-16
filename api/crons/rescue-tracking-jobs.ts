/**
 * VITAS · Cron Worker · Rescue Tracking Jobs (Vision V4 · fase V4.5)
 * Vercel Cron: GET /api/crons/rescue-tracking-jobs
 *
 * Red de seguridad de la cola async de tracking (tracking_jobs). Dos deberes:
 *
 *  1. RESCATE de spawns huérfanos — filas 'queued' SIN modal_call_id (el edge
 *     murió entre insert y spawn, o Modal estaba caído). Se reclaman con la RPC
 *     atómica `claim_queued_tracking_jobs` (FOR UPDATE SKIP LOCKED, filtra
 *     modal_call_id IS NULL, marca processing + attempts+1) y se re-spawnean.
 *     - spawn OK  → PATCH modal_call_id (queda processing, el webhook cierra).
 *     - spawn KO  → attempts < MAX_ATTEMPTS: vuelve a 'queued' (próximo cron);
 *                   attempts >= MAX_ATTEMPTS: 'failed' definitivo.
 *
 *  2. REAPER de 'processing' colgados — started_at más viejo que
 *     STALE_PROCESSING_HOURS sin callback (Modal timeout es 1h; default 2h)
 *     → 'failed' con error explícito. PATCH condicional (no pisa un 'done'
 *     que llegue en la carrera).
 *
 * Mismo contrato de auth que process-analyses-queue: Bearer CRON_SECRET.
 * Nota Vercel Hobby: crons máx. 1×/día → esto es un BACKSTOP, no el camino
 * primario (el spawn directo en track-async lo es). Con plan Pro, subir a
 * cada 15-30 min en vercel.json.
 */

import { errorResponse, successResponse } from "../_lib/apiResponse";
import {
  supabaseRestUrl,
  serviceHeaders,
  supabaseConfigured,
  patchTrackingJob,
} from "../_lib/supabaseRest";
import { env } from "../_lib/env";

export const config = { runtime: "edge" };

const MAX_ATTEMPTS = 3;
const BATCH_SIZE = 3;
const STALE_PROCESSING_HOURS = Number(process.env.STALE_PROCESSING_HOURS ?? 2);

interface ClaimedJob {
  id: string;
  video_url: string;
  sample_fps: number;
  attempts: number;
}

export default async function handler(req: Request): Promise<Response> {
  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return errorResponse({ code: "unauthorized", message: "Invalid cron auth", status: 401 });
  }
  if (!supabaseConfigured()) {
    return errorResponse({ code: "no_supabase", message: "Supabase no configurado", status: 503 });
  }

  const details: Array<Record<string, unknown>> = [];

  // ── 1 · Reaper de processing colgados ─────────────────────────────────
  const cutoff = new Date(Date.now() - STALE_PROCESSING_HOURS * 3_600_000).toISOString();
  let reaped = 0;
  const reap = await fetch(
    `${supabaseRestUrl()}/rest/v1/tracking_jobs` +
      `?status=eq.processing&started_at=lt.${encodeURIComponent(cutoff)}`,
    {
      method: "PATCH",
      headers: serviceHeaders({ Prefer: "return=representation" }),
      body: JSON.stringify({
        status: "failed",
        error: `Sin callback tras ${STALE_PROCESSING_HOURS}h — job dado por muerto (reaper V4.5)`,
        finished_at: new Date().toISOString(),
      }),
    },
  );
  if (reap.ok) {
    const rows = (await reap.json().catch(() => [])) as Array<{ id: string }>;
    reaped = rows.length;
    for (const r of rows) details.push({ id: r.id, action: "reaped_stale_processing" });
  } else {
    details.push({ action: "reap_failed", status: reap.status });
  }

  // ── 2 · Rescate de spawns huérfanos (RPC atómica) ─────────────────────
  const modalAsyncUrl = process.env.MODAL_TRACK_ASYNC_URL;
  const modalKey = process.env.MODAL_API_KEY;
  const callbackSecret = process.env.MODAL_CALLBACK_SECRET;
  let rescued = 0;
  let buried = 0;

  if (!modalAsyncUrl || !modalKey || !callbackSecret) {
    // Sin Modal configurado no hay re-spawn posible; el reaper ya corrió.
    return successResponse({
      timestamp: new Date().toISOString(),
      reaped,
      rescued: 0,
      buried: 0,
      skippedRescue: "modal_env_missing",
      details,
    });
  }

  const claim = await fetch(`${supabaseRestUrl()}/rest/v1/rpc/claim_queued_tracking_jobs`, {
    method: "POST",
    headers: serviceHeaders(),
    body: JSON.stringify({ batch_size: BATCH_SIZE }),
  });
  if (!claim.ok) {
    const t = await claim.text().catch(() => "");
    details.push({ action: "claim_failed", status: claim.status, detail: t.slice(0, 200) });
    return successResponse({
      timestamp: new Date().toISOString(),
      reaped,
      rescued,
      buried,
      details,
    });
  }
  const jobs = (await claim.json().catch(() => [])) as ClaimedJob[];

  for (const job of jobs) {
    // La RPC ya incrementó attempts al reclamar.
    if (job.attempts > MAX_ATTEMPTS) {
      await patchTrackingJob(job.id, {
        status: "failed",
        error: `Spawn fallido tras ${MAX_ATTEMPTS} intentos (cron V4.5)`,
        finished_at: new Date().toISOString(),
      }).catch(() => null);
      buried++;
      details.push({ id: job.id, action: "buried_max_attempts", attempts: job.attempts });
      continue;
    }

    let ok = false;
    let detail = "";
    try {
      const spawn = await fetch(modalAsyncUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${modalKey}` },
        body: JSON.stringify({
          video_url: job.video_url,
          sample_fps: job.sample_fps ?? 5,
          classes: [0, 32],
          job_id: job.id,
          callback_url: `${env.publicUrl}/api/webhooks/modal-tracking`,
        }),
      });
      if (spawn.ok) {
        const data = (await spawn.json().catch(() => ({}))) as { call_id?: string };
        await patchTrackingJob(job.id, { modal_call_id: data.call_id ?? null }).catch(() => null);
        ok = true;
      } else {
        detail = `modal ${spawn.status}`;
      }
    } catch (err) {
      detail = err instanceof Error ? err.message : "modal unreachable";
    }

    if (ok) {
      rescued++;
      details.push({ id: job.id, action: "respawned", attempts: job.attempts });
    } else {
      // Devolver a la cola para el próximo cron (attempts ya cuenta el intento).
      await patchTrackingJob(job.id, { status: "queued", error: detail.slice(0, 300) }).catch(
        () => null,
      );
      details.push({ id: job.id, action: "requeued_spawn_failed", attempts: job.attempts, detail });
    }
  }

  return successResponse({
    timestamp: new Date().toISOString(),
    reaped,
    rescued,
    buried,
    claimed: jobs.length,
    details,
  });
}
