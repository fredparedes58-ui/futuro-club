/**
 * VITAS · Video Tracking Service
 *
 * Wraps the Modal pipeline (`/api/coaching/_track-players`) that returns
 * tracked player + ball positions for a video. Used by Set Pieces, the
 * Coach dashboard's session analyzer, and any other module that needs
 * 22-player tracking.
 *
 * - If MODAL_* env vars are configured on Vercel → real tracking
 * - If not configured (503) → caller can use its own mock
 *
 * Results are cached per videoId in localStorage so we don't re-run the
 * expensive pipeline if the user revisits a video.
 */

import { getAuthHeaders } from "@/lib/apiAuth";

const STORAGE_KEY = "vitas_video_tracking_results";

/**
 * Techo de duración para el tracking SÍNCRONO (proxy edge ~25s). Por encima de
 * esto NO se llama al proxy (haría timeout → antes caía a mock silencioso); el
 * vídeo largo debe ir por el flujo de análisis completo (cola async). Debe
 * coincidir con MAX_SYNC_TRACK_SEC del servidor (api/coaching/_track-players).
 */
const MAX_SYNC_TRACK_SEC = 240;

export interface PlayerAppearance {
  trackId: number;
  timestampMs: number;
  bbox: [number, number, number, number]; // [x1, y1, x2, y2] pixels
  confidence: number;
}

export interface BallPosition {
  timestampMs: number;
  x: number;
  y: number;
  confidence: number;
}

export interface BallStop {
  startMs: number;
  endMs: number;
  x: number;
  y: number;
}

export interface TrackingResult {
  videoId: string;
  source: "modal" | "mock";
  durationSec: number;
  framesProcessed: number;
  sourceFps: number;
  sampleFps: number;
  players: PlayerAppearance[];
  ball: BallPosition[];
  ballStops: BallStop[];
  totalPlayerTracks: number;
  totalBallDetections: number;
  createdAt: string;
}

type CacheEntry = TrackingResult;

function readCache(): CacheEntry[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(entries: CacheEntry[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(entries));
  } catch (err) {
    console.error("[videoTrackingService] cache write failed", err);
  }
}

export interface TrackingProgress {
  stage:
    | "checking_cache"
    | "calling_pipeline"
    | "processing"
    | "finished"
    | "fallback"
    /** Vídeo demasiado largo para tracking síncrono → usar análisis completo (async). */
    | "too_long";
  pct: number;
  message: string;
}

export type TrackingListener = (p: TrackingProgress) => void;

interface TrackOptions {
  videoId: string;
  videoUrl: string;
  sampleFps?: number;
  onProgress?: TrackingListener;
  /** If true, skip cache and run a fresh analysis */
  force?: boolean;
  /** Duración del vídeo (s). Si supera el techo síncrono, se omite el proxy. */
  durationSec?: number;
}

/**
 * Track all players + ball in a video. Returns null if real inference is
 * unavailable and the caller hasn't provided a mock fallback.
 */
export async function trackVideo(opts: TrackOptions): Promise<TrackingResult | null> {
  const { videoId, videoUrl, sampleFps = 5, onProgress, force = false, durationSec } = opts;

  // 1. Cache hit?
  if (!force) {
    onProgress?.({ stage: "checking_cache", pct: 2, message: "Buscando análisis previo…" });
    const cached = readCache().find((e) => e.videoId === videoId);
    if (cached) {
      onProgress?.({ stage: "finished", pct: 100, message: "Análisis recuperado del cache" });
      return cached;
    }
  }

  // 2. Validate URL is something Modal can fetch
  const isPublicHttp = /^https?:\/\//i.test(videoUrl);
  if (!isPublicHttp) {
    // Modal can't reach blob: URLs — the caller must use its own mock
    onProgress?.({
      stage: "fallback",
      pct: 100,
      message: "El video no tiene URL pública — usar mock local",
    });
    return null;
  }

  // 2b. Guard de duración: el proxy síncrono es solo para clips. Un vídeo
  // largo haría timeout en edge (~25s) → NO lo llamamos (antes caía a mock
  // silencioso); el usuario debe usar el flujo de análisis completo (async).
  if (typeof durationSec === "number" && durationSec > MAX_SYNC_TRACK_SEC) {
    onProgress?.({
      stage: "too_long",
      pct: 100,
      message: `Vídeo de ${Math.round(durationSec / 60)} min: demasiado largo para tracking en vivo. Súbelo por Análisis completo (procesado en segundo plano).`,
    });
    return null;
  }

  // 3. Call the Modal-backed Edge proxy
  onProgress?.({
    stage: "calling_pipeline",
    pct: 10,
    message: "Conectando con el servidor de visión…",
  });

  let resp: Response;
  try {
    const authHeaders = await getAuthHeaders();
    resp = await fetch("/api/coaching/track-players", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, sampleFps, durationSec }),
    });
  } catch (err) {
    console.warn("[videoTrackingService] fetch failed, fallback to mock:", err);
    onProgress?.({
      stage: "fallback",
      pct: 100,
      message: "Servidor no disponible — usar mock local",
    });
    return null;
  }

  if (resp.status === 503) {
    // Real inference disabled (env vars missing) — caller should mock
    onProgress?.({
      stage: "fallback",
      pct: 100,
      message: "Inferencia real no configurada — usar mock local",
    });
    return null;
  }

  if (resp.status === 413) {
    // El servidor rechazó el vídeo por largo (guard MAX_SYNC_TRACK_SEC).
    onProgress?.({
      stage: "too_long",
      pct: 100,
      message: "Vídeo demasiado largo para tracking en vivo. Súbelo por Análisis completo (procesado en segundo plano).",
    });
    return null;
  }

  if (!resp.ok) {
    const detail = await resp.text().catch(() => "");
    console.warn(`[videoTrackingService] modal error ${resp.status}: ${detail}`);
    onProgress?.({
      stage: "fallback",
      pct: 100,
      message: `Error del servidor (${resp.status}) — usar mock local`,
    });
    return null;
  }

  onProgress?.({ stage: "processing", pct: 95, message: "Recibiendo resultados…" });

  const data = (await resp.json()) as Omit<TrackingResult, "videoId" | "createdAt">;

  const result: TrackingResult = {
    ...data,
    videoId,
    createdAt: new Date().toISOString(),
  };

  // 4. Cache (keep last 20 to avoid quota issues)
  const all = readCache().filter((e) => e.videoId !== videoId);
  all.unshift(result);
  writeCache(all.slice(0, 20));

  onProgress?.({ stage: "finished", pct: 100, message: "Análisis completado" });

  return result;
}

/** Check if the Modal pipeline is alive (cheap GET). */
export async function pingTrackingPipeline(): Promise<boolean> {
  try {
    const authHeaders = await getAuthHeaders();
    const resp = await fetch("/api/coaching/track-players", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl: "" }),
    });
    return resp.status !== 503;
  } catch {
    return false;
  }
}

export const VideoTrackingCache = {
  list(): TrackingResult[] {
    return readCache();
  },
  get(videoId: string): TrackingResult | null {
    return readCache().find((e) => e.videoId === videoId) ?? null;
  },
  clear(videoId?: string): void {
    if (videoId) {
      writeCache(readCache().filter((e) => e.videoId !== videoId));
    } else {
      writeCache([]);
    }
  },
};
