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
  /** V2 · equipo por color de camiseta: "team_a" | "team_b" | "other" | null. */
  team?: string | null;
  /** V2 · RGB representativo del equipo [r,g,b], o null si no clasificado. */
  teamColor?: number[] | null;
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
  /** V2 · leyenda de equipos detectados {"team_a": [r,g,b], ...}. */
  teams?: Record<string, number[]>;
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
    | "too_long"
    /** V4 · job encolado en la cola async (tracking_jobs). */
    | "queued";
  pct: number;
  message: string;
  /** V4 · id del job async (para reanudar polling o debug). */
  jobId?: string;
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
  /**
   * V4 · opt-in: si el vídeo supera el techo síncrono, en vez de rendirse con
   * stage:"too_long", encola en la cola async (track-async) y hace polling
   * hasta el resultado. OJO: la promesa puede tardar lo que tarde la GPU
   * (decenas de minutos en un partido completo) — el caller debe mostrar
   * progreso con onProgress. Default false = comportamiento actual intacto.
   */
  allowAsync?: boolean;
}

/**
 * Track all players + ball in a video. Returns null if real inference is
 * unavailable and the caller hasn't provided a mock fallback.
 */
export async function trackVideo(opts: TrackOptions): Promise<TrackingResult | null> {
  const { videoId, videoUrl, sampleFps = 5, onProgress, force = false, durationSec, allowAsync = false } = opts;

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
  // silencioso). Con allowAsync (V4) se desvía a la cola async; sin él, el
  // usuario debe usar el flujo de análisis completo.
  if (typeof durationSec === "number" && durationSec > MAX_SYNC_TRACK_SEC) {
    if (allowAsync) {
      return trackVideoAsync(opts);
    }
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
    if (allowAsync) {
      return trackVideoAsync(opts);
    }
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

// ─── V4 · Ruta async (partidos completos) ─────────────────────────────────
// enqueue en /api/coaching/track-async → poll /api/coaching/track-status.
// El webhook guarda el result CRUDO de Modal (snake_case) → aquí se mapea al
// mismo camelCase que devuelve el proxy síncrono (misma lógica que
// api/coaching/_track-players.ts) para que TrackingResult sea idéntico.

const ASYNC_POLL_INTERVAL_MS = 10_000;
/** Techo de espera del polling (150 min: partido + margen de proceso). */
const ASYNC_POLL_MAX_MS = 150 * 60_000;

interface ModalRawResult {
  duration_sec?: number;
  frames_processed?: number;
  fps_source?: number;
  sample_fps?: number;
  players?: Array<{
    track_id: number;
    timestamp_ms: number;
    bbox: number[];
    confidence: number;
    team?: string | null;
    team_color?: number[] | null;
  }>;
  ball?: Array<{ timestamp_ms: number; x: number; y: number; confidence: number }>;
  ball_stops?: Array<{ start_ms: number; end_ms: number; avg_x: number; avg_y: number }>;
  total_player_tracks?: number;
  total_ball_detections?: number;
  teams?: Record<string, number[]>;
}

/** Mapea el result crudo de Modal (snake_case) a TrackingResult (camelCase). */
export function mapModalResult(raw: ModalRawResult, videoId: string): TrackingResult {
  return {
    videoId,
    source: "modal",
    durationSec: raw.duration_sec ?? 0,
    framesProcessed: raw.frames_processed ?? 0,
    sourceFps: raw.fps_source ?? 0,
    sampleFps: raw.sample_fps ?? 0,
    players: (raw.players ?? []).map((p) => ({
      trackId: p.track_id,
      timestampMs: p.timestamp_ms,
      bbox: p.bbox as [number, number, number, number],
      confidence: p.confidence,
      team: p.team ?? null,
      teamColor: p.team_color ?? null,
    })),
    ball: (raw.ball ?? []).map((b) => ({
      timestampMs: b.timestamp_ms,
      x: b.x,
      y: b.y,
      confidence: b.confidence,
    })),
    ballStops: (raw.ball_stops ?? []).map((s) => ({
      startMs: s.start_ms,
      endMs: s.end_ms,
      x: s.avg_x,
      y: s.avg_y,
    })),
    totalPlayerTracks: raw.total_player_tracks ?? 0,
    totalBallDetections: raw.total_ball_detections ?? 0,
    teams: raw.teams ?? {},
    createdAt: new Date().toISOString(),
  };
}

/**
 * V4 · Tracking async de un vídeo largo: encola el job y hace polling hasta
 * done/failed. La promesa vive lo que tarde la GPU (decenas de minutos en un
 * partido) — mostrar progreso con onProgress. El servidor deduplica: si ya hay
 * un job pendiente para el mismo vídeo, se reanuda su polling (revisitar la
 * página NO relanza la GPU).
 */
export async function trackVideoAsync(opts: TrackOptions): Promise<TrackingResult | null> {
  const { videoId, videoUrl, sampleFps = 5, onProgress, durationSec } = opts;

  // Cache primero (el resultado async también se cachea al terminar).
  const cached = readCache().find((e) => e.videoId === videoId);
  if (cached && !opts.force) {
    onProgress?.({ stage: "finished", pct: 100, message: "Análisis recuperado del cache" });
    return cached;
  }

  // 1 ── Enqueue
  onProgress?.({ stage: "calling_pipeline", pct: 5, message: "Encolando tracking en GPU…" });
  let jobId: string;
  try {
    const authHeaders = await getAuthHeaders();
    const resp = await fetch("/api/coaching/track-async", {
      method: "POST",
      headers: { ...authHeaders, "Content-Type": "application/json" },
      body: JSON.stringify({ videoUrl, videoId, sampleFps, durationSec }),
    });
    if (resp.status === 503) {
      onProgress?.({
        stage: "fallback",
        pct: 100,
        message: "Tracking async no configurado — usar mock local",
      });
      return null;
    }
    if (!resp.ok) {
      const detail = await resp.text().catch(() => "");
      console.warn(`[videoTrackingService] track-async ${resp.status}: ${detail}`);
      onProgress?.({
        stage: "fallback",
        pct: 100,
        message: `No se pudo encolar el tracking (${resp.status})`,
      });
      return null;
    }
    const data = (await resp.json()) as { data?: { jobId?: string; deduped?: boolean } };
    if (!data.data?.jobId) {
      onProgress?.({ stage: "fallback", pct: 100, message: "Respuesta de enqueue sin jobId" });
      return null;
    }
    jobId = data.data.jobId;
    onProgress?.({
      stage: "queued",
      pct: 10,
      message: data.data.deduped
        ? "Ya había un tracking en curso para este vídeo — reanudando seguimiento"
        : "Tracking encolado — la GPU procesará el partido completo",
      jobId,
    });
  } catch (err) {
    console.warn("[videoTrackingService] enqueue failed:", err);
    onProgress?.({ stage: "fallback", pct: 100, message: "Servidor no disponible" });
    return null;
  }

  // 2 ── Poll hasta terminal
  const result = await pollTrackingJob(jobId, videoId, onProgress);
  if (!result) return null;

  // 3 ── Cache (mismo límite que la ruta síncrona)
  const all = readCache().filter((e) => e.videoId !== videoId);
  all.unshift(result);
  writeCache(all.slice(0, 20));
  onProgress?.({ stage: "finished", pct: 100, message: "Análisis completado", jobId });
  return result;
}

/** Polling de un job async hasta done/failed/timeout. Exportado para reanudar. */
export async function pollTrackingJob(
  jobId: string,
  videoId: string,
  onProgress?: TrackingListener,
): Promise<TrackingResult | null> {
  const startedAt = Date.now();
  for (;;) {
    const elapsed = Date.now() - startedAt;
    if (elapsed > ASYNC_POLL_MAX_MS) {
      onProgress?.({
        stage: "fallback",
        pct: 100,
        message: "El tracking async superó el tiempo máximo de espera",
        jobId,
      });
      return null;
    }

    await new Promise((r) => setTimeout(r, ASYNC_POLL_INTERVAL_MS));

    let status: string | undefined;
    let raw: ModalRawResult | undefined;
    let errMsg: string | undefined;
    try {
      const authHeaders = await getAuthHeaders();
      const resp = await fetch(`/api/coaching/track-status?jobId=${encodeURIComponent(jobId)}`, {
        headers: authHeaders,
      });
      if (!resp.ok) {
        // Transitorio (rate limit / red): seguimos intentando dentro del techo.
        continue;
      }
      const data = (await resp.json()) as {
        data?: { status?: string; result?: ModalRawResult; error?: string };
      };
      status = data.data?.status;
      raw = data.data?.result;
      errMsg = data.data?.error;
    } catch {
      continue; // red intermitente → siguiente tick
    }

    if (status === "done" && raw) {
      return mapModalResult(raw, videoId);
    }
    if (status === "failed") {
      onProgress?.({
        stage: "fallback",
        pct: 100,
        message: `El tracking falló en el servidor: ${errMsg ?? "sin detalle"}`,
        jobId,
      });
      return null;
    }

    // queued/processing → progreso suave 10→90 según tiempo transcurrido
    const pct = Math.min(90, 10 + Math.round((elapsed / ASYNC_POLL_MAX_MS) * 160));
    onProgress?.({
      stage: "processing",
      pct,
      message:
        status === "queued"
          ? "En cola — esperando GPU…"
          : `Procesando partido en GPU… (${Math.round(elapsed / 60000)} min)`,
      jobId,
    });
  }
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
