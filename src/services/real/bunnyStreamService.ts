/**
 * VITAS · Bunny Stream Service (Phase 1)
 *
 * Client for the simplified Bunny upload pipeline:
 *   1. POST /api/videos/_bunny-create → reserves a video slot on Bunny
 *      and returns TUS upload credentials + final playback URLs
 *   2. Upload directly to Bunny via TUS protocol (resumable, multipart)
 *   3. Poll /api/videos/_bunny-status until "finished" (encoded)
 *
 * Graceful degradation: if /api/videos/_bunny-create returns 503
 * (env vars not configured), this service throws BunnyNotConfiguredError
 * and the caller falls back to blob: URLs.
 *
 * Public URLs returned by Bunny are reachable by Modal for analysis.
 */

import * as tus from "tus-js-client";

export class BunnyNotConfiguredError extends Error {
  constructor() {
    super("Bunny Stream is not configured on Vercel");
    this.name = "BunnyNotConfiguredError";
  }
}

export interface BunnyVideoUrls {
  /** Bunny video GUID (e.g. "abc123-def456-...") */
  bunnyVideoId: string;
  /** HLS playlist URL — best for in-app playback (adaptive) */
  streamUrl: string;
  /** Direct MP4 URL (720p) — best to feed to Modal / ffmpeg */
  mp4Url: string;
  /** Bunny iframe URL — drop into <iframe src=...> if you don't want to build a player */
  embedUrl: string;
  /** Thumbnail (auto-generated at the 50% mark) */
  thumbnailUrl: string;
}

export interface BunnyUploadProgress {
  stage: "creating" | "uploading" | "processing" | "finished" | "failed";
  pct: number;
  message: string;
  bytesUploaded?: number;
  bytesTotal?: number;
}

export interface BunnyUploadOptions {
  file: File;
  title: string;
  onProgress?: (p: BunnyUploadProgress) => void;
  /** Max time to wait for Bunny to finish encoding (ms). Default 5 min. */
  encodingTimeoutMs?: number;
}

interface CreateResponse {
  bunnyVideoId: string;
  libraryId: number;
  tusUploadUrl: string;
  authorizationSignature: string;
  authorizationExpire: number;
  streamUrl: string;
  mp4Url: string;
  embedUrl: string;
  thumbnailUrl: string;
}

/** Check the server is set up to talk to Bunny. */
export async function bunnyAvailable(): Promise<boolean> {
  try {
    // We can't HEAD a POST endpoint, so do a dry POST that will return 503
    // immediately if env vars are missing.
    const resp = await fetch("/api/videos/_bunny-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: "__healthcheck__" }),
    });
    if (resp.status === 503) return false;
    // Anything else (200, 400, even 502) means env vars exist, so server
    // is "configured" — surface other errors at upload time.
    if (resp.ok) {
      // Cleanup: delete the dummy video we just created
      // (best-effort; non-fatal if it fails)
      try {
        const data = (await resp.json()) as { bunnyVideoId?: string };
        if (data.bunnyVideoId) {
          void fetch(
            `/api/videos/_bunny-status?bunnyVideoId=${encodeURIComponent(data.bunnyVideoId)}`,
            { method: "GET" },
          );
        }
      } catch {
        /* ignore */
      }
    }
    return true;
  } catch {
    return false;
  }
}

/**
 * Full upload pipeline. Resolves with the public URLs once Bunny has
 * finished encoding the video. Rejects with BunnyNotConfiguredError if
 * the server isn't configured (caller should fall back to blob:).
 */
export async function uploadToBunny(opts: BunnyUploadOptions): Promise<BunnyVideoUrls> {
  const { file, title, onProgress, encodingTimeoutMs = 5 * 60 * 1000 } = opts;

  // 1. Create video record on Bunny
  onProgress?.({ stage: "creating", pct: 2, message: "Preparando upload…" });

  let createResp: Response;
  try {
    createResp = await fetch("/api/videos/_bunny-create", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title }),
    });
  } catch (err) {
    throw new Error(`Failed to reach /api/videos/_bunny-create: ${(err as Error).message}`);
  }

  if (createResp.status === 503) {
    throw new BunnyNotConfiguredError();
  }

  if (!createResp.ok) {
    const detail = await createResp.text().catch(() => "");
    throw new Error(`Create upload failed (${createResp.status}): ${detail}`);
  }

  const meta = (await createResp.json()) as CreateResponse;

  // 2. Upload to Bunny via TUS
  onProgress?.({ stage: "uploading", pct: 5, message: "Subiendo a Bunny…" });

  await new Promise<void>((resolve, reject) => {
    const upload = new tus.Upload(file, {
      endpoint: meta.tusUploadUrl,
      retryDelays: [0, 1000, 3000, 5000],
      headers: {
        AuthorizationSignature: meta.authorizationSignature,
        AuthorizationExpire: String(meta.authorizationExpire),
        VideoId: meta.bunnyVideoId,
        LibraryId: String(meta.libraryId),
      },
      metadata: {
        filetype: file.type,
        title,
      },
      onError: (err) => reject(err),
      onProgress: (bytesUploaded, bytesTotal) => {
        const uploadPct = Math.round((bytesUploaded / bytesTotal) * 100);
        // 5..70% of the overall flow is the actual upload
        const overallPct = 5 + Math.round((uploadPct / 100) * 65);
        onProgress?.({
          stage: "uploading",
          pct: overallPct,
          message: `Subiendo · ${uploadPct}%`,
          bytesUploaded,
          bytesTotal,
        });
      },
      onSuccess: () => resolve(),
    });
    upload.start();
  });

  // 3. Poll for encoding completion
  onProgress?.({ stage: "processing", pct: 75, message: "Bunny procesando el video…" });

  const startedAt = Date.now();
  const pollIntervalMs = 4000;
  while (Date.now() - startedAt < encodingTimeoutMs) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));

    let statusResp: Response;
    try {
      statusResp = await fetch(
        `/api/videos/_bunny-status?bunnyVideoId=${encodeURIComponent(meta.bunnyVideoId)}`,
      );
    } catch {
      continue;
    }

    if (!statusResp.ok) continue;

    const status = (await statusResp.json()) as {
      status: string;
      statusCode: number;
      encodeProgress: number;
    };

    const encodingPct = status.encodeProgress ?? 0;
    const overallPct = Math.min(95, 75 + Math.round((encodingPct / 100) * 20));
    onProgress?.({
      stage: "processing",
      pct: overallPct,
      message:
        status.status === "processing"
          ? `Transcodificando · ${encodingPct}%`
          : status.status === "uploading"
            ? "Bunny verificando…"
            : status.status,
    });

    if (status.status === "finished") {
      onProgress?.({ stage: "finished", pct: 100, message: "Video listo para reproducir" });
      return {
        bunnyVideoId: meta.bunnyVideoId,
        streamUrl: meta.streamUrl,
        mp4Url: meta.mp4Url,
        embedUrl: meta.embedUrl,
        thumbnailUrl: meta.thumbnailUrl,
      };
    }
    if (status.status === "failed") {
      onProgress?.({ stage: "failed", pct: 100, message: "Bunny falló al procesar" });
      throw new Error("Bunny failed to encode the video");
    }
  }

  // Timed out — return URLs anyway (they may still work even if not fully encoded)
  onProgress?.({
    stage: "finished",
    pct: 100,
    message: "Tiempo de procesamiento agotado · puede que aún no esté completo",
  });
  return {
    bunnyVideoId: meta.bunnyVideoId,
    streamUrl: meta.streamUrl,
    mp4Url: meta.mp4Url,
    embedUrl: meta.embedUrl,
    thumbnailUrl: meta.thumbnailUrl,
  };
}
