/**
 * VITAS · Bunny Stream — helpers compartidos (una implementación · inv #7)
 *
 * Usados por api/upload/_video-init.ts, api/videos/create-upload.ts,
 * api/videos/finalize.ts y api/webhooks/bunny-uploaded.ts.
 *
 * OJO: Bunny usa DOS enumeraciones de estado DISTINTAS con los mismos números:
 *   - la API REST de vídeo (GET /library/{id}/videos/{guid} → `status`)
 *     https://bunny.net/docs/reference/video_getvideo
 *     0 Created · 1 Uploaded · 2 Processing · 3 Transcoding · 4 Finished · 5 Error ·
 *     6 UploadFailed · 7 JitSegmenting · 8 JitPlaylistsCreated
 *   - el WEBHOOK (payload `Status`)
 *     https://bunny.net/docs/stream-webhook
 *     0 Queued · 1 Processing · 2 Encoding · 3 Finished · 4 Resolution finished ·
 *     5 Failed · 6 PresignedUploadStarted · 7 PresignedUploadFinished ·
 *     8 PresignedUploadFailed · 9 CaptionsGenerated · 10 TitleOrDescriptionGenerated
 * Confundirlas es el bug que tenía el webhook (trataba 4 = "Resolution finished",
 * que llega UNA VEZ POR RESOLUCIÓN, como si fuera el final de la codificación).
 */

import { sha256Hex, hmacSha256Hex, timingSafeEqual } from "./edgeCrypto";

const BUNNY_API_BASE = "https://video.bunnycdn.com/library";

/** Estado de vídeo de la API REST (GET video). */
export const BUNNY_API_VIDEO_STATUS = {
  CREATED: 0,
  UPLOADED: 1,
  PROCESSING: 2,
  TRANSCODING: 3,
  FINISHED: 4,
  ERROR: 5,
  UPLOAD_FAILED: 6,
  JIT_SEGMENTING: 7,
  JIT_PLAYLISTS_CREATED: 8,
} as const;

/** Estado del payload del WEBHOOK de Bunny Stream. */
export const BUNNY_WEBHOOK_STATUS = {
  QUEUED: 0,
  PROCESSING: 1,
  ENCODING: 2,
  /** "The video encoding has finished and the video is fully available." → ÚNICO terminal OK. */
  FINISHED: 3,
  /** "The encoder has finished processing one of the resolutions" → llega varias veces; NO terminal. */
  RESOLUTION_FINISHED: 4,
  FAILED: 5,
  PRESIGNED_UPLOAD_STARTED: 6,
  PRESIGNED_UPLOAD_FINISHED: 7,
  PRESIGNED_UPLOAD_FAILED: 8,
  CAPTIONS_GENERATED: 9,
  TITLE_OR_DESCRIPTION_GENERATED: 10,
} as const;

// ── TUS (subida reanudable) ─────────────────────────────────────────────────

/**
 * Validez de la firma TUS: 24 h.
 * Bunny (https://bunny.net/docs/stream/tus-resumable-uploads): AuthorizationExpire se
 * valida al inicio de CADA POST, HEAD y PATCH (no solo al crear), y una firma nueva
 * NO extiende la caducidad original del recurso de subida → la ventana tiene que
 * cubrir la subida entera de un partido completo. Bunny exige ≥ 1 h.
 */
export const TUS_AUTH_TTL_SEC = 24 * 60 * 60;

/**
 * Firma TUS de Bunny: SHA256(library_id + api_key + expiration_time + video_id).
 * La API key NUNCA sale del servidor; el cliente solo recibe la firma + expiración.
 */
export async function signTusUpload(opts: {
  libraryId: string;
  apiKey: string;
  videoGuid: string;
  nowSec?: number;
}): Promise<{ signature: string; expire: number }> {
  const now = opts.nowSec ?? Math.floor(Date.now() / 1000);
  const expire = now + TUS_AUTH_TTL_SEC;
  const signature = await sha256Hex(`${opts.libraryId}${opts.apiKey}${expire}${opts.videoGuid}`);
  return { signature, expire };
}

// ── API REST: leer un vídeo ─────────────────────────────────────────────────

export interface BunnyVideoInfo {
  guid: string;
  /** BUNNY_API_VIDEO_STATUS (API REST, NO la del webhook). */
  status: number;
  /** "The duration of the video in seconds" (0 mientras Bunny no lo sabe). */
  length: number;
  width: number;
  height: number;
  /** "240p,360p,720p" según la API (vacío mientras no hay renditions). Aditivo (match job). */
  availableResolutions: string[];
  /** 0–100 según la API; null si no viene. Dato operativo, no métrica. */
  encodeProgress: number | null;
}

/** GET del vídeo en Bunny. null si no está configurado o falla (el llamador decide). */
export async function getBunnyVideo(opts: {
  libraryId: string;
  apiKey: string;
  videoGuid: string;
}): Promise<BunnyVideoInfo | null> {
  if (!opts.libraryId || !opts.apiKey || !opts.videoGuid) return null;
  try {
    const res = await fetch(
      `${BUNNY_API_BASE}/${opts.libraryId}/videos/${encodeURIComponent(opts.videoGuid)}`,
      { headers: { AccessKey: opts.apiKey, Accept: "application/json" } },
    );
    if (!res.ok) return null;
    const data = (await res.json()) as Partial<Omit<BunnyVideoInfo, "availableResolutions">> & {
      availableResolutions?: string | null;
    };
    const progress = Number(data.encodeProgress);
    return {
      guid: String(data.guid ?? opts.videoGuid),
      status: Number(data.status),
      length: Number(data.length ?? 0),
      width: Number(data.width ?? 0),
      height: Number(data.height ?? 0),
      availableResolutions: String(data.availableResolutions ?? "")
        .split(",")
        .map((r) => r.trim())
        .filter(Boolean),
      encodeProgress: Number.isFinite(progress) ? progress : null,
    };
  } catch {
    return null;
  }
}

// ── Webhook: verificación de firma ──────────────────────────────────────────

/**
 * Cabeceras documentadas (https://bunny.net/docs/stream-webhook):
 *   X-BunnyStream-Signature-Version:   v1
 *   X-BunnyStream-Signature-Algorithm: hmac-sha256
 *   X-BunnyStream-Signature:           HMAC-SHA256 hex en minúsculas del body CRUDO,
 *                                      con la Read-Only API key de la librería como clave.
 * Se acepta SOLO la cabecera documentada (la antigua `x-bunny-signature` no existe en
 * la documentación de Bunny → aceptarla sería una puerta sin contrato).
 */
export const BUNNY_SIGNATURE_HEADER = "x-bunnystream-signature";
export const BUNNY_SIGNATURE_VERSION_HEADER = "x-bunnystream-signature-version";
export const BUNNY_SIGNATURE_ALGORITHM_HEADER = "x-bunnystream-signature-algorithm";

/**
 * Fail-CLOSED: sin secreto, sin firma, versión/algoritmo no soportados o firma distinta
 * → false. Comparación en tiempo constante. `headers` con claves en minúsculas.
 */
export async function verifyBunnyWebhookSignature(
  secret: string,
  rawBody: string,
  headers: Record<string, string | undefined>,
): Promise<boolean> {
  if (!secret) return false;
  const signature = headers[BUNNY_SIGNATURE_HEADER];
  if (!signature) return false;

  const version = headers[BUNNY_SIGNATURE_VERSION_HEADER];
  if (version !== undefined && version.trim().toLowerCase() !== "v1") return false;
  const algorithm = headers[BUNNY_SIGNATURE_ALGORITHM_HEADER];
  if (algorithm !== undefined && algorithm.trim().toLowerCase() !== "hmac-sha256") return false;

  try {
    const expected = await hmacSha256Hex(secret, rawBody);
    return timingSafeEqual(signature.trim().toLowerCase(), expected);
  } catch {
    return false;
  }
}
