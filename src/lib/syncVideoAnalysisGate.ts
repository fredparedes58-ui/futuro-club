/**
 * VITAS · Gate honesto de las rutas de análisis SÍNCRONO de clips cortos (cliente)
 *
 * TeamBaselinePage y CompareRivalPage mandan la URL del vídeo a
 * /api/agents/video-observation, que DESCARGA el fichero entero dentro de una función
 * de 120 s y lo pasa inline a Gemini → un partido completo falla tras gastar cómputo.
 * Antes de llamar, este helper decide:
 *   - duración REAL conocida (Bunny o metadatos del navegador) > límite → rechazo con
 *     mensaje traducido (el análisis de partido completo llega con el match-analysis job);
 *   - no hay URL HTTP que el servidor pueda descargar (blob: local, codificación en
 *     curso) → mensaje traducido, NUNCA se manda un blob: al servidor;
 *   - duración desconocida → NO se bloquea y NO se inventa.
 * Una sola implementación para las dos páginas (inv #7); el umbral vive en
 * src/lib/shared/videoLimits.ts (el mismo que usan finalize y el webhook).
 */

import type { TFunction } from "i18next";
import {
  evaluateSyncAnalysisGate,
  knownDurationSec,
  durationMinutesForDisplay,
  SYNC_ANALYSIS_GATE_CODE,
  SYNC_ANALYSIS_MAX_DURATION_MIN,
} from "@/lib/shared/videoLimits";
import { getServerVideoUrl, type ServerVideoUrlReason, type VideoRecord } from "@/services/real/videoService";

/**
 * Discriminante string (`kind`) a propósito: el proyecto compila con strictNullChecks
 * OFF y ahí el estrechamiento por `ok: true/false` en un else no funciona.
 */
export type SyncAnalysisRefusal =
  | { kind: "too_long"; durationSec: number }
  | { kind: ServerVideoUrlReason };

export type SyncAnalysisInput =
  | { kind: "ok"; url: string; durationSec: number | null }
  | SyncAnalysisRefusal;

/**
 * @param video registro local del vídeo (VideoService.getById)
 * @param browserDurationSec duración leída por VideoUpload de los metadatos del navegador
 */
export function resolveSyncAnalysisInput(
  video: VideoRecord | null | undefined,
  browserDurationSec: number | null | undefined,
): SyncAnalysisInput {
  // Duración de Bunny (record.duration tras el poll) primero; si no, la del navegador.
  const durationSec = knownDurationSec(video?.duration, browserDurationSec);
  const gate = evaluateSyncAnalysisGate(durationSec);
  if (gate.allowed === false) return { kind: "too_long", durationSec: gate.durationSec };

  const server = getServerVideoUrl(video);
  if (server.url === null) return { kind: server.reason };
  return { kind: "ok", url: server.url, durationSec };
}

/** Mensaje traducido para un rechazo del gate (7 idiomas, namespace videoUpload). */
export function syncAnalysisRefusalMessage(t: TFunction, input: SyncAnalysisRefusal): string {
  if (input.kind === "too_long") return syncAnalysisTooLongMessage(t, input.durationSec);
  if (input.kind === "encoding_pending") return t("videoUpload.notReadyEncoding");
  if (input.kind === "local_only") return t("videoUpload.notReadyLocalOnly");
  return t("videoUpload.notReadyNoUrl");
}

export function syncAnalysisTooLongMessage(t: TFunction, durationSec: number): string {
  return t("videoUpload.syncAnalysisTooLong", {
    duration: durationMinutesForDisplay(durationSec),
    max: SYNC_ANALYSIS_MAX_DURATION_MIN,
  });
}

/**
 * Si la respuesta JSON de /api/videos/finalize es el rechazo del gate (422 con
 * `errorDetail.code = SYNC_ANALYSIS_GATE_CODE`), devuelve el mensaje traducido; si no,
 * null. Los callers de finalize dejan de reintentar y muestran esto en vez de acabar
 * en un "timeout de Bunny" falso.
 */
export function finalizeSyncGateMessage(t: TFunction, json: unknown): string | null {
  if (!json || typeof json !== "object") return null;
  const detail = (json as { errorDetail?: { code?: unknown; durationSec?: unknown } }).errorDetail;
  if (!detail || detail.code !== SYNC_ANALYSIS_GATE_CODE) return null;
  const durationSec = knownDurationSec(typeof detail.durationSec === "number" ? detail.durationSec : null);
  // El servidor solo rechaza con duración conocida; si faltara, no se inventa una cifra.
  if (durationSec === null) {
    return t("videoUpload.syncAnalysisTooLongGeneric", { max: SYNC_ANALYSIS_MAX_DURATION_MIN });
  }
  return syncAnalysisTooLongMessage(t, durationSec);
}
