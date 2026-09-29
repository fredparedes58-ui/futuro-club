/**
 * VITAS · Match job — conductor: despacho, re-despacho (epoch), fallo, cierre y tick
 *
 * Invariantes:
 *   - Todo cambio de estado pasa por assertTransition (tabla del contrato) y se escribe
 *     con compare-and-set (status + dispatch_epoch): dos invocaciones concurrentes no
 *     pueden despachar dos workers del mismo epoch.
 *   - Re-despacho = epoch++ (el worker viejo recibe `superseded` en su siguiente op).
 *   - Terminal ⇒ se borra el fichero Gemini, se libera la reserva de presupuesto y los
 *     tramos abiertos pasan a `skipped` (los hechos se conservan, nunca se refacturan).
 *   - El tick (Modal, cada 5 min) es el conductor durable; el webhook de Bunny y
 *     /api/match/start solo aceleran. GET /api/match/status NUNCA llama aquí (CWE-650).
 */
import {
  GEMINI_DISPLAY_NAME_PREFIX,
  MATCH_MAX_DISPATCH_ATTEMPTS,
  REDISPATCHABLE_MATCH_JOB_STATUSES,
  parseGeminiDisplayName,
  type MatchJobErrorCode,
  type MatchJobStatus,
} from "../../../src/lib/shared/matchJob/contract";
import { normalizeLocale } from "../../../src/lib/shared/locale";
import { MAX_MATCH_DURATION_SEC } from "../../../src/lib/shared/videoLimits";
import { BUNNY_API_VIDEO_STATUS, getBunnyVideo, type BunnyVideoInfo } from "../bunnyStream";
import { recordSpendAmountUsd } from "../budgetGuard";
import { deleteFile, listFilesByDisplayNamePrefix } from "../gemini/files";
import { aggregateMatch, type SegmentState } from "./aggregate";
import { isMatchVideoEnabled } from "./availability";
import { pickTargetVariant } from "./bunnySource";
import { AGGREGATE_CONFIDENCE, MATCH_VIDEO_CONFIG as CFG } from "./config";
import { estimateMatchCost, modalDispatchCostUsd } from "./costing";
import { spawnMatchWorker } from "./dispatch";
import { jobErrorMessage, type SegmentFailureKind } from "./messages";
import * as repo from "./repo";
import type { MatchJobRow, SegmentRow } from "./repo";
import type { NormalizedSegment } from "./segmentResult";
import { deleteJobGeminiFile } from "./retention";
import { assertTransition, isTerminal, redispatchTarget, ACTIVE_MATCH_JOB_STATUSES } from "./stateMachine";
import { GEMINI_MODEL } from "../../../src/lib/shared/geminiModel";

const MS = 1000;
const HOUR_MS = 3600 * MS;

export function nowIso(now: Date): string {
  return now.toISOString();
}

/** ¿El fichero Gemini del job sigue utilizable (existe, no borrado, no caduca dentro del margen)? */
export function isFileUsable(job: MatchJobRow, now: Date): boolean {
  if (!job.gemini_file_name || job.gemini_file_deleted_at) return false;
  if (!job.gemini_file_expires_at) return true; // sin fecha: files.get decidirá (404 ⇒ perdido)
  return Date.parse(job.gemini_file_expires_at) - now.getTime() > CFG.geminiFileExpiryMarginSec * MS;
}

export function isHeartbeatStale(job: MatchJobRow, now: Date): boolean {
  if (!job.heartbeat_at) return true;
  return now.getTime() - Date.parse(job.heartbeat_at) > CFG.staleHeartbeatSec * MS;
}

function bunnyCreds() {
  return {
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID ?? "",
    apiKey: process.env.BUNNY_STREAM_API_KEY ?? process.env.BUNNY_API_KEY ?? "",
  };
}

export async function readBunnyVideo(job: Pick<MatchJobRow, "bunny_video_id">): Promise<BunnyVideoInfo | null> {
  return getBunnyVideo({ ...bunnyCreds(), videoGuid: job.bunny_video_id });
}

// ── Cierre ───────────────────────────────────────────────────────────────────

/** Borra el fichero Gemini del job (idempotente) — implementación única en retention.ts. */
export async function finalizeCleanup(job: MatchJobRow, now = new Date()): Promise<{ deleted: boolean; error: boolean }> {
  return deleteJobGeminiFile(job, now);
}

function failureKindFor(code: MatchJobErrorCode): SegmentFailureKind {
  return code === "budget_exhausted" ? "budget" : "job_failed";
}

/**
 * → failed con {code, message en el locale del job}. Libera la reserva, salta los
 * tramos abiertos (los hechos se conservan) y borra el fichero Gemini.
 */
export async function failJob(
  job: MatchJobRow,
  code: MatchJobErrorCode,
  opts: { now?: Date; extra?: Record<string, unknown>; stageDetail?: string } = {},
): Promise<MatchJobRow | null> {
  const now = opts.now ?? new Date();
  if (isTerminal(job.status)) return job;
  assertTransition(job.status, "failed");
  const updated = await repo.patchJob(
    job.id,
    {
      status: "failed",
      error: { code, message: jobErrorMessage(normalizeLocale(job.locale), code) },
      finished_at: nowIso(now),
      reservation_usd: 0,
      report_lease_until: null,
      ...(opts.stageDetail ? { stage_detail: opts.stageDetail.slice(0, 300) } : {}),
      ...(opts.extra ?? {}),
    },
    { status: ACTIVE_MATCH_JOB_STATUSES },
  );
  if (!updated) return repo.getJob(job.id);
  await repo.skipOpenSegments(job.id, { kind: failureKindFor(code), attempts: 0 }).catch(() => undefined);
  await finalizeCleanup(updated, now);
  return updated;
}

export async function cancelJob(job: MatchJobRow, now = new Date()): Promise<MatchJobRow | null> {
  if (isTerminal(job.status)) return job;
  assertTransition(job.status, "cancelled");
  const updated = await repo.patchJob(
    job.id,
    { status: "cancelled", finished_at: nowIso(now), reservation_usd: 0, report_lease_until: null },
    { status: job.status },
  );
  if (!updated) return repo.getJob(job.id);
  await repo.skipOpenSegments(job.id, { kind: "cancelled", attempts: 0 }).catch(() => undefined);
  await finalizeCleanup(updated, now);
  return updated;
}

export function toSegmentStates(rows: readonly SegmentRow[]): SegmentState[] {
  return rows.map((r) => ({
    idx: r.idx,
    start_sec: r.start_sec,
    end_sec: r.end_sec,
    status: r.status,
    result: r.status === "done" ? ((r.result as NormalizedSegment | null) ?? null) : null,
    failure: r.error ? { kind: r.error.kind as SegmentFailureKind, attempts: r.error.attempts } : null,
  }));
}

/**
 * → failed CONSERVANDO lo ya observado (presupuesto agotado, kill switch, despachos agotados): los tramos
 * abiertos pasan a skipped y se agrega la observación parcial (cobertura < 100 % con el
 * motivo de cada hueco). Los tramos hechos nunca se refacturan.
 */
export async function failJobKeepingPartial(
  job: MatchJobRow,
  code: MatchJobErrorCode,
  opts: { now?: Date; reportGate?: { code: string; reason: string } | null } = {},
): Promise<MatchJobRow | null> {
  const now = opts.now ?? new Date();
  if (isTerminal(job.status)) return job;
  await repo.skipOpenSegments(job.id, { kind: failureKindFor(code), attempts: 0 }).catch(() => undefined);
  let extra: Record<string, unknown> = {};
  if (job.segments_total) {
    try {
      const rows = await repo.listSegments(job.id);
      const observation = aggregateMatch({
        durationSec: job.duration_sec,
        segments: toSegmentStates(rows),
        locale: normalizeLocale(job.locale),
        geminiModel: GEMINI_MODEL,
        confidence: AGGREGATE_CONFIDENCE,
      });
      extra = {
        observation,
        coverage: observation.coverage,
        segments_done: rows.filter((r) => r.status === "done").length,
        report_gate: opts.reportGate ?? null,
      };
    } catch (err) {
      console.error("[match] agregación parcial fallida:", err instanceof Error ? err.message : err);
    }
  }
  return failJob(job, code, { now, extra });
}

/** aggregating | reporting → completed (fenced por epoch). */
export async function completeJob(job: MatchJobRow, patch: Record<string, unknown>, now = new Date()): Promise<MatchJobRow | null> {
  assertTransition(job.status, "completed");
  const updated = await repo.patchJob(
    job.id,
    { ...patch, status: "completed", finished_at: nowIso(now), reservation_usd: 0, report_lease_until: null },
    { status: job.status, epoch: job.dispatch_epoch },
  );
  if (updated) await finalizeCleanup(updated, now);
  return updated;
}

// ── Despacho ─────────────────────────────────────────────────────────────────

export type DispatchOutcome =
  | { kind: "dispatched"; epoch: number; job: MatchJobRow }
  | { kind: "spawn_failed"; epoch: number; reason: string; job: MatchJobRow | null }
  | { kind: "failed"; job: MatchJobRow | null }
  | { kind: "not_dispatchable" }
  | { kind: "conflict" };

/**
 * Despacha (awaiting_encode) o re-despacha (epoch caducado) un job. CAS sobre
 * (status, dispatch_epoch): si otra invocación ya lo movió, `conflict` y no se lanza nada.
 * `fileLost`: Gemini ya dijo que el fichero no está (files.get 404 / file_unavailable)
 * aunque la BD lo tenga adjunto y sin caducar ⇒ se trata como no utilizable y se
 * re-transcodifica; conservarlo haría chocar al siguiente worker con el mismo 404 hasta
 * dispatch_exhausted. Agotados los despachos, lo ya observado (y facturado) se conserva.
 */
export async function dispatchJob(
  job: MatchJobRow,
  reason: string,
  now = new Date(),
  opts: { fileLost?: boolean } = {},
): Promise<DispatchOutcome> {
  if (job.dispatch_attempts >= MATCH_MAX_DISPATCH_ATTEMPTS) {
    return { kind: "failed", job: await failJobKeepingPartial(job, "dispatch_exhausted", { now }) };
  }
  const fileUsable = !opts.fileLost && isFileUsable(job, now);
  const target: MatchJobStatus | null = job.status === "awaiting_encode" ? "dispatched" : redispatchTarget(job.status, fileUsable);
  if (target === null) return { kind: "not_dispatchable" };
  if (target !== job.status) assertTransition(job.status, target);

  const epoch = job.dispatch_epoch + 1;
  const patch: Record<string, unknown> = {
    status: target,
    dispatch_epoch: epoch,
    dispatch_attempts: job.dispatch_attempts + 1,
    dispatched_at: nowIso(now),
    heartbeat_at: nowIso(now),
    modal_call_id: null,
    stage_detail: `dispatch:${reason}`.slice(0, 300),
  };
  const restartsTranscode = target === "dispatched" && job.status !== "awaiting_encode" && job.status !== "dispatched";
  if (restartsTranscode && job.gemini_file_name && !job.gemini_file_deleted_at) {
    // El transcode se rehace: el fichero del epoch anterior sobra (el barrido lo caza si esto falla).
    await deleteFile(job.gemini_file_name).catch(() => false);
  }
  if (restartsTranscode) {
    Object.assign(patch, {
      proxy: null,
      gemini_file_name: null,
      gemini_file_uri: null,
      gemini_file_display_name: null,
      gemini_file_expires_at: null,
      gemini_file_deleted_at: null,
    });
  }

  const updated = await repo.patchJob(job.id, patch, { status: job.status, epoch: job.dispatch_epoch });
  if (!updated) return { kind: "conflict" };

  const spawn = await spawnMatchWorker({ jobId: job.id, epoch });
  if (spawn.ok) {
    const withCall = await repo.patchJob(job.id, { modal_call_id: spawn.callId }, { epoch });
    const usd = modalDispatchCostUsd();
    await recordSpendAmountUsd("modal", usd);
    await repo.addJobSpend(job.id, "modal", usd);
    return { kind: "dispatched", epoch, job: withCall ?? updated };
  }
  // Fallo del spawn: NO se registra gasto. heartbeat null ⇒ el próximo tick lo reintenta.
  const after = await repo.patchJob(
    job.id,
    { heartbeat_at: null, stage_detail: `dispatch_failed:${spawn.reason}`.slice(0, 300) },
    { epoch },
  );
  if ((after ?? updated).dispatch_attempts >= MATCH_MAX_DISPATCH_ATTEMPTS) {
    return { kind: "failed", job: await failJobKeepingPartial(after ?? updated, "dispatch_exhausted", { now }) };
  }
  return { kind: "spawn_failed", epoch, reason: spawn.reason, job: after };
}

export type AwaitingOutcome = "dispatched" | "spawn_failed" | "failed" | "waiting" | "conflict";

/**
 * awaiting_encode: despacha solo si la API de Bunny dice Finished (4) y la variante
 * objetivo existe. Actualiza la duración REAL y recalcula la reserva (el tope de 150 min
 * se sustituye por el `length` real). Error/UploadFailed → encode_failed.
 */
export async function processAwaitingJob(job: MatchJobRow, now = new Date(), info?: BunnyVideoInfo | null): Promise<AwaitingOutcome> {
  if (job.status !== "awaiting_encode") return "conflict";
  const bunny = info === undefined ? await readBunnyVideo(job) : info;
  const tooOld = now.getTime() - Date.parse(job.created_at) > CFG.maxEncodeWaitHours * HOUR_MS;
  if (!bunny) {
    if (tooOld) return (await failJob(job, "encode_timeout", { now })) ? "failed" : "conflict";
    return "waiting";
  }
  if (bunny.status === BUNNY_API_VIDEO_STATUS.ERROR || bunny.status === BUNNY_API_VIDEO_STATUS.UPLOAD_FAILED) {
    await failJob(job, "encode_failed", { now, extra: { bunny_status: bunny.status } });
    return "failed";
  }
  const variant = pickTargetVariant(bunny.availableResolutions, CFG.proxyHeight);
  if (bunny.status !== BUNNY_API_VIDEO_STATUS.FINISHED || !variant || !(bunny.length > 0)) {
    if (tooOld) {
      await failJob(job, "encode_timeout", { now, extra: { bunny_status: bunny.status } });
      return "failed";
    }
    return "waiting";
  }
  if (bunny.length > MAX_MATCH_DURATION_SEC) {
    await failJob(job, "video_too_long", { now, extra: { bunny_status: bunny.status, duration_sec: bunny.length } });
    return "failed";
  }
  const est = estimateMatchCost({ durationSec: bunny.length, purpose: job.purpose, geminiModel: GEMINI_MODEL });
  const refreshed = await repo.patchJob(
    job.id,
    {
      duration_sec: bunny.length,
      bunny_status: bunny.status,
      target_variant: variant,
      estimate: est.amount,
      estimate_usd: est.amount.usd,
      reservation_usd: est.amount.usd,
    },
    { status: "awaiting_encode", epoch: job.dispatch_epoch },
  );
  if (!refreshed) return "conflict";
  const out = await dispatchJob(refreshed, "encoded", now);
  if (out.kind === "dispatched") return "dispatched";
  if (out.kind === "failed") return "failed";
  if (out.kind === "spawn_failed") return "spawn_failed";
  return "conflict";
}

// ── Tick (conductor durable, op=tick firmada desde Modal cada 5 min) ──────────

export interface TickResult {
  dispatched: number;
  redispatched: number;
  failedJobs: number;
  geminiFilesDeleted: number;
  geminiDeleteErrors: number;
  more: boolean;
}

/**
 * Regla del barrido de huérfanos (diseño §12). Un fichero ADJUNTO a un job vivo (no
 * terminal, `gemini_file_name` = este fichero, no marcado como borrado) NUNCA se borra,
 * sea cual sea el epoch de su displayName: un re-despacho que conserva el fichero sube
 * el epoch a N+1 pero el fichero se llamó `-N` al subirse, y borrarlo rompería la
 * reanudación sin re-transcode (y re-facturaría Modal + subida + tramos). El resto se
 * borra si el job es terminal o no existe, si su epoch no es el vigente (subida de un
 * worker obsoleto), o si tiene más de `orphanFileMaxAgeHours` (subida del epoch vigente
 * que nunca llegó a proxy_ready).
 */
export function shouldSweepGeminiFile(
  f: { name: string; createTime?: string | null },
  ref: { jobId: string; epoch: number },
  job: Pick<MatchJobRow, "status" | "dispatch_epoch" | "gemini_file_name" | "gemini_file_deleted_at"> | undefined,
  now: Date,
): boolean {
  const live = !!job && !isTerminal(job.status);
  const attachedToLive = live && job!.gemini_file_name === f.name && !job!.gemini_file_deleted_at;
  if (attachedToLive) return false;
  const currentEpoch = live && ref.epoch === job!.dispatch_epoch;
  const ageMs = f.createTime ? now.getTime() - Date.parse(f.createTime) : 0;
  const tooOld = ageMs > CFG.orphanFileMaxAgeHours * HOUR_MS;
  return !currentEpoch || tooOld;
}

export async function sweepGeminiFiles(now: Date, result: TickResult): Promise<void> {
  // 1. Ficheros de jobs terminales aún sin borrar.
  const terminal = await repo.listTerminalJobsWithFiles(CFG.tickBatchSize + 1);
  if (terminal.length > CFG.tickBatchSize) result.more = true;
  for (const job of terminal.slice(0, CFG.tickBatchSize)) {
    const r = await finalizeCleanup(job, now);
    if (r.deleted) result.geminiFilesDeleted++;
    if (r.error) result.geminiDeleteErrors++;
  }
  // 2. Huérfanos por prefijo de displayName (no depende del estado de BD).
  if (!process.env.GEMINI_API_KEY) return;
  let listed: Awaited<ReturnType<typeof listFilesByDisplayNamePrefix>>;
  try {
    listed = await listFilesByDisplayNamePrefix(GEMINI_DISPLAY_NAME_PREFIX, CFG.sweepMaxPages);
  } catch {
    result.geminiDeleteErrors++;
    return;
  }
  if (listed.more) result.more = true;
  const parsed = listed.files.map((f) => ({ f, ref: parseGeminiDisplayName(f.displayName ?? "") })).filter((x) => x.ref);
  const jobs = new Map((await repo.getJobsByIds([...new Set(parsed.map((x) => x.ref!.jobId))])).map((j) => [j.id, j]));
  for (const { f, ref } of parsed) {
    if (!shouldSweepGeminiFile(f, ref!, jobs.get(ref!.jobId), now)) continue;
    const job = jobs.get(ref!.jobId);
    const ok = await deleteFile(f.name);
    if (ok) {
      result.geminiFilesDeleted++;
      if (job && job.gemini_file_name === f.name && !job.gemini_file_deleted_at) {
        await repo.patchJob(job.id, { gemini_file_deleted_at: nowIso(now) }, { raw: "&gemini_file_deleted_at=is.null" });
      }
    } else {
      result.geminiDeleteErrors++;
    }
  }
}

export async function runTick(now = new Date(), opts: { enabled?: boolean } = {}): Promise<TickResult> {
  const result: TickResult = { dispatched: 0, redispatched: 0, failedJobs: 0, geminiFilesDeleted: 0, geminiDeleteErrors: 0, more: false };
  const batch = CFG.tickBatchSize;

  if (!(opts.enabled ?? isMatchVideoEnabled())) {
    // Kill switch: ni despacho ni re-despacho; los jobs en vuelo se detienen conservando lo
    // ya observado (sin gasto nuevo) y el barrido de ficheros Gemini sigue (minimización).
    const active = await repo.listJobsByStatus(ACTIVE_MATCH_JOB_STATUSES, batch + 1);
    if (active.length > batch) result.more = true;
    for (const job of active.slice(0, batch)) {
      const r = await failJobKeepingPartial(job, "analysis_disabled", { now });
      if (r?.status === "failed") result.failedJobs++;
    }
    await sweepGeminiFiles(now, result);
    return result;
  }

  // 1. awaiting_encode ya codificados → despachar.
  const awaiting = await repo.listJobsByStatus(["awaiting_encode"], batch + 1);
  if (awaiting.length > batch) result.more = true;
  for (const job of awaiting.slice(0, batch)) {
    const r = await processAwaitingJob(job, now);
    if (r === "dispatched") result.dispatched++;
    if (r === "failed") result.failedJobs++;
  }

  // 2. Heartbeat caducado → re-despachar (epoch++, ≤ MATCH_MAX_DISPATCH_ATTEMPTS).
  const active = await repo.listJobsByStatus(REDISPATCHABLE_MATCH_JOB_STATUSES, batch * 4);
  const stale = active.filter((j) => isHeartbeatStale(j, now));
  if (stale.length > batch) result.more = true;
  for (const job of stale.slice(0, batch)) {
    const r = await dispatchJob(job, "stale_heartbeat", now);
    if (r.kind === "dispatched") result.redispatched++;
    if (r.kind === "failed") result.failedJobs++;
  }

  // 3-4. Ficheros Gemini: terminales + huérfanos.
  await sweepGeminiFiles(now, result);
  return result;
}
