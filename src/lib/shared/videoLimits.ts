/**
 * VITAS · Límites de vídeo compartidos (cliente + api/)
 *
 * UNA sola implementación (invariante #7): la subida (VideoUpload), el init del
 * servidor (api/upload/video-init), el webhook de Bunny, finalize y las páginas de
 * análisis rápido leen SUS límites de aquí. No se re-declaran en ningún otro sitio.
 *
 * Tres conceptos distintos — no mezclarlos:
 *   1. MAX_MATCH_DURATION_MIN — cuánto puede DURAR un vídeo que aceptamos SUBIR
 *      (un partido completo). Límite de producto.
 *   2. MAX_UPLOAD_SIZE_MB     — cuánto puede PESAR ese fichero.
 *   3. SYNC_ANALYSIS_MAX_DURATION_SEC — cuánto puede durar un vídeo para las rutas
 *      de análisis SÍNCRONO de clips cortos (Gemini inline: video-observation
 *      descarga el fichero entero dentro de una función de 120 s). Un partido
 *      completo se SUBE, pero NO se analiza por esa ruta: lo hará el futuro
 *      análisis de partido (match-analysis job, fase 1).
 *
 * Regla de dato ausente (invariante #2): si la duración no se conoce, NO se
 * bloquea y NO se inventa un valor (ni 0, ni una media). Los gates devuelven
 * `allowed: true` con `durationSec: null`.
 */

// ── Constantes (cada una con su procedencia) ────────────────────────────────

/**
 * Duración máxima de un vídeo de partido aceptado en la subida, en minutos.
 * 90' + prórroga (2 × 15') + tanda de penaltis + margen de descuento/cortes.
 */
export const MAX_MATCH_DURATION_MIN = 150;

/**
 * Tamaño máximo de subida en MB (1 MB = 1024 × 1024 bytes) → 20 GB.
 * Bunny Stream NO documenta un tamaño máximo de subida (ver fuente) → valor
 * "pendiente de validar" con un clip real de 150 min.
 */
export const MAX_UPLOAD_SIZE_MB = 20480;

/**
 * Duración máxima (s) para las rutas de análisis síncrono de clips cortos
 * (TeamBaseline / CompareRival → /api/agents/video-observation, y la cola Gemini
 * por jugador que encolan finalize y el webhook de Bunny).
 */
export const SYNC_ANALYSIS_MAX_DURATION_SEC = 300;

/** Procedencia de cada constante (contrato de config: fuente o "pendiente de validar"). */
export const VIDEO_LIMIT_SOURCES = {
  MAX_MATCH_DURATION_MIN:
    "límite de producto: 90 min + prórroga 2×15 min + penaltis + margen (fase 0 partido completo)",
  MAX_UPLOAD_SIZE_MB:
    "pendiente de validar — Bunny Stream no documenta un tamaño máximo de subida " +
    "(https://bunny.net/docs/stream/tus-resumable-uploads; https://bunny.net/docs/stream/http " +
    "solo recomienda TUS por encima de 2 GB). 20 GB cubre ~150 min a 1080p con margen.",
  SYNC_ANALYSIS_MAX_DURATION_SEC:
    "pendiente de validar — api/pipeline/_gemini-analyze.ts:28 (vídeo largo ≈ 4 min ya roza el " +
    "tope de 120 s de video-observation) + api/agents/_video-quality-check.ts (clip ≤ 5 min)",
} as const;

// ── Derivados ────────────────────────────────────────────────────────────────

export const BYTES_PER_MB = 1024 * 1024;
export const MAX_UPLOAD_SIZE_BYTES = MAX_UPLOAD_SIZE_MB * BYTES_PER_MB;
/** Para el copy de la UI ("Máximo 20 GB"). */
export const MAX_UPLOAD_SIZE_GB = MAX_UPLOAD_SIZE_MB / 1024;
export const MAX_MATCH_DURATION_SEC = MAX_MATCH_DURATION_MIN * 60;
export const SYNC_ANALYSIS_MAX_DURATION_MIN = SYNC_ANALYSIS_MAX_DURATION_SEC / 60;

/**
 * Código de error/skip del gate de análisis síncrono. Lo emiten finalize (422) y el
 * webhook de Bunny (skip 200); el cliente lo traduce a `videoUpload.syncAnalysisTooLong`.
 */
export const SYNC_ANALYSIS_GATE_CODE = "video_too_long_for_sync_analysis";

/** Código de rechazo de subida por duración (video-init). */
export const MATCH_DURATION_GATE_CODE = "video_duration_exceeds_match_limit";

// ── Helpers puros ────────────────────────────────────────────────────────────

/**
 * Primera duración CONOCIDA de la lista (finita y > 0), o null.
 * `0` en un registro de vídeo significa "aún no se sabe" (stub) → no cuenta.
 */
export function knownDurationSec(...candidates: Array<number | null | undefined>): number | null {
  for (const c of candidates) {
    if (typeof c === "number" && Number.isFinite(c) && c > 0) return c;
  }
  return null;
}

/** Minutos para mostrar (redondeo hacia arriba: 150,2 min se muestra 151, nunca 150). */
export function durationMinutesForDisplay(durationSec: number): number {
  return Math.ceil(durationSec / 60);
}

export type UploadSizeCheck =
  | { ok: true }
  | { ok: false; reason: "file_too_large"; sizeBytes: number; maxBytes: number };

/** ¿Cabe el fichero en el límite de subida? */
export function checkUploadSize(sizeBytes: number): UploadSizeCheck {
  if (Number.isFinite(sizeBytes) && sizeBytes > MAX_UPLOAD_SIZE_BYTES) {
    return { ok: false, reason: "file_too_large", sizeBytes, maxBytes: MAX_UPLOAD_SIZE_BYTES };
  }
  return { ok: true };
}

export type DurationGate =
  | { allowed: true; durationSec: number | null }
  | { allowed: false; reason: string; durationSec: number; maxDurationSec: number };

function gateByMax(durationSec: number | null | undefined, maxSec: number, reason: string): DurationGate {
  const known = knownDurationSec(durationSec);
  // Duración desconocida → NO bloquear y NO inventar (invariante #2).
  if (known === null) return { allowed: true, durationSec: null };
  if (known > maxSec) return { allowed: false, reason, durationSec: known, maxDurationSec: maxSec };
  return { allowed: true, durationSec: known };
}

/** Gate de SUBIDA: ¿el vídeo dura como mucho un partido completo (MAX_MATCH_DURATION_MIN)? */
export function checkMatchDuration(durationSec: number | null | undefined): DurationGate {
  return gateByMax(durationSec, MAX_MATCH_DURATION_SEC, MATCH_DURATION_GATE_CODE);
}

/** Gate de ANÁLISIS SÍNCRONO de clips cortos (SYNC_ANALYSIS_MAX_DURATION_SEC). */
export function evaluateSyncAnalysisGate(durationSec: number | null | undefined): DurationGate {
  return gateByMax(durationSec, SYNC_ANALYSIS_MAX_DURATION_SEC, SYNC_ANALYSIS_GATE_CODE);
}
