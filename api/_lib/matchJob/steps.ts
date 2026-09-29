/**
 * VITAS · Match job — ops del protocolo step (worker Modal → Vercel), ya autenticadas
 *
 * El router (api/match/_step.ts) verifica el HMAC, parsea con el contrato y aplica el
 * fencing de epoch ANTES de llamar aquí: estas funciones reciben siempre un job cuyo
 * dispatch_epoch == epoch de la petición. Cada una es idempotente ante reintentos del
 * worker (misma op, mismo epoch).
 */
import {
  GEMINI_UPLOAD_HOST,
  geminiDisplayName,
  type MatchJobErrorCode,
  type MatchJobStatus,
  type StepRequest,
} from "../../../src/lib/shared/matchJob/contract";
import { VideoUrlError } from "../videoUrlGuard";
import { deleteFile, getFile, sha256Base64ToHex, startResumableSession } from "../gemini/files";
import { hlsSourceUrl, pickTargetVariant } from "./bunnySource";
import { MATCH_VIDEO_CONFIG as CFG } from "./config";
import { failJob, failJobKeepingPartial, readBunnyVideo } from "./driver";
import * as repo from "./repo";
import type { MatchJobRow } from "./repo";
import { assertTransition, isTerminal } from "./stateMachine";

type Req<Op extends StepRequest["op"]> = Extract<StepRequest, { op: Op }>;

/** Resultado de una op: `data` para el sobre { ok:true, data } o un error HTTP del protocolo. */
export type StepOutcome =
  | { ok: true; data: Record<string, unknown> }
  | { ok: false; status: number; code: string; message: string };

const ok = (data: Record<string, unknown>): StepOutcome => ({ ok: true, data });
const err = (status: number, code: string, message: string): StepOutcome => ({ ok: false, status, code, message });

async function failed(job: MatchJobRow, code: MatchJobErrorCode, status: number, message: string, stageDetail?: string): Promise<StepOutcome> {
  await failJob(job, code, { stageDetail });
  return err(status, code, message);
}

/** Motivo del worker sin URLs ni query strings (el contrato ya lo exige; defensa extra). */
export function redactReason(reason: string): string {
  return reason.replace(/https?:\/\/\S+/gi, "[url]").replace(/[?&][\w-]+=[^\s&]+/g, "[param]").slice(0, 300);
}

function proxySpec() {
  return {
    container: "mp4" as const,
    videoCodec: "h264" as const,
    audio: false as const, // nunca audio: ni voces de menores a Google ni tokens de audio
    fps: CFG.proxyFps,
    maxHeight: CFG.proxyHeight,
    crf: CFG.proxyCrf,
    durationToleranceSec: CFG.durationToleranceSec,
  };
}

// ── begin ────────────────────────────────────────────────────────────────────

export async function stepBegin(job: MatchJobRow, epoch: number): Promise<StepOutcome> {
  if (isTerminal(job.status) || job.status === "awaiting_encode") return ok({ action: "stop", epoch, state: job.status });
  if (job.status === "gemini_processing" || job.status === "observing" || job.status === "aggregating" || job.status === "reporting") {
    // Fichero ya subido (o ya no hace falta): se salta el transcode.
    return ok({ action: "advance", epoch });
  }

  // dispatched | preparing | uploading → (re)transcodificar.
  let duration = job.duration_sec;
  let variant = job.target_variant;
  if (duration === null || !variant) {
    const bunny = await readBunnyVideo(job);
    if (!bunny) return err(503, "bunny_unavailable", "Bunny no responde; reintenta");
    duration = bunny.length > 0 ? bunny.length : null;
    variant = pickTargetVariant(bunny.availableResolutions, CFG.proxyHeight);
    if (duration === null || !variant) return failed(job, "source_unavailable", 422, "sin duración o variante reproducible en Bunny");
    await repo.patchJob(job.id, { duration_sec: duration, target_variant: variant }, { epoch });
  }

  let sourceUrl: string;
  try {
    sourceUrl = hlsSourceUrl(job.bunny_video_id, variant);
  } catch (e) {
    if (e instanceof VideoUrlError && e.code !== "VIDEO_HOSTS_NOT_CONFIGURED") {
      return failed(job, "source_unavailable", 422, "URL de origen fuera de la allowlist");
    }
    return err(503, "source_not_configured", "BUNNY_CDN_HOSTNAME no configurado");
  }

  let state: MatchJobStatus = job.status;
  if (job.status === "dispatched") {
    assertTransition("dispatched", "preparing");
    const moved = await repo.patchJob(job.id, { status: "preparing", stage_detail: "transcoding" }, { status: "dispatched", epoch });
    state = moved?.status ?? (await repo.getJob(job.id))?.status ?? job.status;
    if (isTerminal(state)) return ok({ action: "stop", epoch, state });
  }
  return ok({
    action: "transcode",
    epoch,
    sourceUrl,
    sourceUrlExpiresAt: null,
    targetVariant: variant,
    expectedDurationSec: duration,
    proxy: proxySpec(),
  });
}

// ── heartbeat ────────────────────────────────────────────────────────────────

export function stepHeartbeat(job: MatchJobRow): StepOutcome {
  // El heartbeat_at ya lo refrescó el router (fenced por epoch).
  return ok({ action: isTerminal(job.status) ? "stop" : "continue", state: job.status });
}

// ── upload_session (después de ffmpeg: Gemini exige el tamaño exacto) ────────

export async function stepUploadSession(job: MatchJobRow, body: Req<"upload_session">): Promise<StepOutcome> {
  if (job.status !== "preparing" && job.status !== "uploading") {
    return err(409, "job_state_conflict", `upload_session no aplica en estado ${job.status}`);
  }
  if (job.duration_sec === null) return failed(job, "internal_error", 422, "duración desconocida", "duration_unknown_at_upload");
  if (Math.abs(body.durationSec - job.duration_sec) > CFG.durationToleranceSec) {
    return failed(job, "duration_mismatch", 422, "la duración del proxy no cuadra con Bunny");
  }
  if (body.bytes > CFG.geminiFileMaxBytes) return failed(job, "proxy_too_large", 422, "proxy por encima del límite por fichero de Gemini");

  const displayName = geminiDisplayName(job.id, body.epoch);
  let session;
  try {
    session = await startResumableSession({ bytes: body.bytes, mime: body.mime, displayName });
  } catch {
    return err(502, "gemini_upload_start_failed", "no se pudo abrir la sesión de subida; reintenta");
  }
  if (job.status === "preparing") assertTransition("preparing", "uploading");
  const moved = await repo.patchJob(
    job.id,
    {
      status: "uploading",
      stage_detail: "uploading",
      proxy: { bytes: body.bytes, sha256: body.sha256, durationSec: body.durationSec, mime: body.mime },
      gemini_file_display_name: displayName,
    },
    { status: ["preparing", "uploading"], epoch: body.epoch },
  );
  if (!moved) return err(409, "job_state_conflict", "el job cambió de estado");
  return ok({ uploadUrl: session.uploadUrl, displayName, chunkGranularityBytes: session.chunkGranularityBytes });
}

// ── proxy_ready ──────────────────────────────────────────────────────────────

export async function stepProxyReady(job: MatchJobRow, body: Req<"proxy_ready">): Promise<StepOutcome> {
  // Idempotente por (fichero, sha256).
  if (job.status !== "uploading") {
    if (job.gemini_file_name === body.file.name && job.proxy?.sha256 === body.sha256) return ok({ state: job.status });
    if (isTerminal(job.status)) {
      await deleteFile(body.file.name);
      return ok({ state: job.status });
    }
    return err(409, "job_state_conflict", `proxy_ready no aplica en estado ${job.status}`);
  }
  const got = await getFile(body.file.name);
  if (!got.ok) {
    if (got.status === 404) return failed(job, "gemini_upload_failed", 422, "el fichero no existe en Gemini");
    return err(502, "gemini_unavailable", "Gemini no responde; reintenta");
  }
  const f = got.file;
  const expectedName = geminiDisplayName(job.id, body.epoch);
  const hashHex = f.sha256Hash ? sha256Base64ToHex(f.sha256Hash) : null;
  const mismatch =
    f.displayName !== expectedName ||
    (f.sizeBytes !== undefined && Number(f.sizeBytes) !== body.bytes) ||
    (job.proxy !== null && (job.proxy.bytes !== body.bytes || job.proxy.sha256 !== body.sha256)) ||
    (hashHex !== null && hashHex !== body.sha256) ||
    !(f.uri ?? body.file.uri).startsWith(`https://${GEMINI_UPLOAD_HOST}/`);
  if (mismatch) {
    await deleteFile(body.file.name);
    return failed(job, "gemini_upload_failed", 422, "el fichero subido no coincide con el proxy declarado");
  }
  if (f.state === "FAILED") {
    await deleteFile(body.file.name);
    return failed(job, "gemini_file_failed", 422, "Gemini no pudo procesar el fichero");
  }
  assertTransition("uploading", "gemini_processing");
  const moved = await repo.patchJob(
    job.id,
    {
      status: "gemini_processing",
      stage_detail: "gemini_processing",
      gemini_file_name: f.name,
      gemini_file_uri: f.uri ?? body.file.uri,
      gemini_file_expires_at: f.expirationTime ?? null,
      gemini_file_deleted_at: null,
    },
    { status: "uploading", epoch: body.epoch },
  );
  if (!moved) {
    // Carrera: otro proxy_ready ganó (o el job cambió). Si el ganador no es este fichero, sobra.
    const fresh = await repo.getJob(job.id);
    if (fresh && fresh.gemini_file_name !== f.name) await deleteFile(f.name);
    return ok({ state: fresh?.status ?? job.status });
  }
  return ok({ state: moved.status });
}

// ── fail ─────────────────────────────────────────────────────────────────────

const WORKER_TO_JOB_ERROR: Record<Req<"fail">["code"], MatchJobErrorCode> = {
  source_forbidden: "source_forbidden",
  source_unavailable: "source_unavailable",
  transcode_failed: "transcode_failed",
  duration_mismatch: "duration_mismatch",
  upload_failed: "gemini_upload_failed",
  deadline_exceeded: "deadline_exceeded",
  internal: "worker_failed",
};

// ── kill switch (MATCH_VIDEO_ENABLED !== "true") ─────────────────────────────

/**
 * Con el análisis APAGADO no se gasta nada más: el job en vuelo falla con
 * `analysis_disabled` conservando lo ya observado, y la respuesta le dice al worker que
 * salga (stop / estado terminal). Un proxy recién subido que no es el del job se borra.
 */
export async function stepWhenDisabled(job: MatchJobRow, body: Exclude<StepRequest, { op: "tick" | "fail" }>): Promise<StepOutcome> {
  let state: MatchJobStatus = job.status;
  if (!isTerminal(job.status)) {
    const failedJob = await failJobKeepingPartial(job, "analysis_disabled");
    state = failedJob?.status ?? "failed";
  }
  switch (body.op) {
    case "begin":
      return ok({ action: "stop", epoch: body.epoch, state });
    case "heartbeat":
      return ok({ action: "stop", state });
    case "advance":
      return ok({ state, retryAfterSec: 0 });
    case "proxy_ready":
      if (body.file.name !== job.gemini_file_name) await deleteFile(body.file.name);
      return ok({ state });
    case "upload_session":
      return err(409, "match_video_disabled", "análisis de partido completo en validación: no se abre la subida");
  }
}

export async function stepFail(job: MatchJobRow, body: Req<"fail">): Promise<StepOutcome> {
  if (isTerminal(job.status)) return ok({ state: job.status });
  const updated = await failJob(job, WORKER_TO_JOB_ERROR[body.code], { stageDetail: `worker:${body.code}:${redactReason(body.reason)}` });
  return ok({ state: updated?.status ?? "failed" });
}
