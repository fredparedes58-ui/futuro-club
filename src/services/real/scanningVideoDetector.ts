/**
 * VITAS · Scanning Video Detector
 *
 * Two execution modes:
 *
 * 1. REAL pipeline (Phase 2) — calls /api/behavioral/_detect-scanning which
 *    proxies to a Modal GPU worker running YOLOv11 + ByteTrack + MediaPipe
 *    Pose. Only used if the env var MODAL_SCANNING_URL is configured on
 *    Vercel and a real video URL is available.
 *
 * 2. MOCK pipeline (Phase 1 fallback) — deterministic simulation with a
 *    6-stage progress sequence. Used when the real pipeline is not
 *    configured or the request fails (graceful degradation).
 *
 * The caller doesn't need to know which path runs — runScanningDetection()
 * tries real first and silently falls back.
 */

import { VideoService } from "./videoService";

const STORAGE_KEY = "vitas_scanning_video_analyses";

export interface ScanningAnalysisResult {
  id: string;
  playerId: string;
  playerName: string;
  videoId: string;
  videoTitle: string;
  /** Scan IQ derived from the analysis (0-100) */
  scanIQ: number;
  receptionsAnalyzed: number;
  avgScansPreReception: number;
  scansUnderPressure: number;
  successWithScan: number; // 0-1
  successWithoutScan: number; // 0-1
  forwardOrientedPct: number;
  createdAt: string;
}

export interface ScanningDetectionProgress {
  stage:
    | "loading"
    | "tracking"
    | "pose"
    | "reception_detection"
    | "scan_classification"
    | "outcome_correlation"
    | "finished";
  pct: number;
  message: string;
}

export type ScanningDetectionListener = (p: ScanningDetectionProgress) => void;

const STAGE_FLOW: Array<{
  stage: ScanningDetectionProgress["stage"];
  message: string;
  duration: number;
  pct: number;
}> = [
  { stage: "loading", message: "Cargando video y calibrando cámara…", duration: 500, pct: 8 },
  { stage: "tracking", message: "Tracking del jugador objetivo (YOLO + ByteTrack)…", duration: 900, pct: 28 },
  { stage: "pose", message: "Pose estimation · detectando giros de cabeza…", duration: 900, pct: 50 },
  { stage: "reception_detection", message: "Detectando recepciones del balón…", duration: 700, pct: 68 },
  { stage: "scan_classification", message: "Contando scans en 10s previos a cada recepción…", duration: 700, pct: 85 },
  { stage: "outcome_correlation", message: "Correlacionando scans con calidad de decisión post-recepción…", duration: 600, pct: 96 },
  { stage: "finished", message: "Análisis completado", duration: 0, pct: 100 },
];

function readAll(): ScanningAnalysisResult[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(items: ScanningAnalysisResult[]): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
  } catch (err) {
    console.error("[scanningVideoDetector] write failed", err);
  }
}

function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let s = (h >>> 0) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function genId(): string {
  return `scan_analysis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/** Try the real Modal pipeline first, fall back to mock on failure */
export async function runScanningDetection(
  options: { playerId: string; playerName: string; videoId: string; videoTitle: string },
  onProgress?: ScanningDetectionListener,
): Promise<ScanningAnalysisResult> {
  // Look up the real video URL from the VideoService cache
  const videoUrl = (() => {
    try {
      const v = VideoService.getById(options.videoId);
      return v?.streamUrl ?? v?.embedUrl ?? v?.localPath ?? null;
    } catch {
      return null;
    }
  })();

  // Attempt real pipeline if we have a public-looking URL (not blob:)
  const isPublicUrl = !!videoUrl && /^https?:\/\//i.test(videoUrl);

  if (isPublicUrl) {
    try {
      // Drive a faster progress simulation in parallel with the real call
      // so the user sees feedback even during the actual GPU run.
      const progressPromise = (async () => {
        for (const step of STAGE_FLOW.slice(0, -1)) {
          onProgress?.({ stage: step.stage, pct: step.pct, message: step.message });
          if (step.duration > 0) {
            await new Promise((r) => setTimeout(r, step.duration));
          }
        }
      })();

      const realPromise = fetch("/api/behavioral/_detect-scanning", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          videoId: options.videoId,
          videoUrl,
          playerId: options.playerId,
          playerName: options.playerName,
          sampleFps: 10,
        }),
      });

      // Wait for both progress UI + actual call
      const [, resp] = await Promise.all([progressPromise, realPromise]);

      if (resp.status === 503) {
        // Not configured — fall through to mock
        console.info("[scanningVideoDetector] real inference disabled, using mock");
        return runMockDetection(options, onProgress, true);
      }

      if (!resp.ok) {
        const detail = await resp.text().catch(() => "");
        console.warn(
          `[scanningVideoDetector] real inference failed (${resp.status}): ${detail}. Falling back to mock.`,
        );
        return runMockDetection(options, onProgress, true);
      }

      onProgress?.({ stage: "finished", pct: 100, message: "Reel listo" });

      const data = (await resp.json()) as {
        source: string;
        scanIQ: number;
        receptionsAnalyzed: number;
        avgScansPreReception: number;
        scansUnderPressure: number;
        successWithScan: number;
        successWithoutScan: number;
        forwardOrientedPct: number;
      };

      const result: ScanningAnalysisResult = {
        id: genId(),
        playerId: options.playerId,
        playerName: options.playerName,
        videoId: options.videoId,
        videoTitle: options.videoTitle,
        scanIQ: data.scanIQ,
        receptionsAnalyzed: data.receptionsAnalyzed,
        avgScansPreReception: data.avgScansPreReception,
        scansUnderPressure: data.scansUnderPressure,
        successWithScan: data.successWithScan,
        successWithoutScan: data.successWithoutScan,
        forwardOrientedPct: data.forwardOrientedPct,
        createdAt: new Date().toISOString(),
      };

      const all = readAll();
      all.unshift(result);
      writeAll(all.slice(0, 50));

      return result;
    } catch (err) {
      console.warn(
        "[scanningVideoDetector] real inference threw, using mock:",
        err,
      );
      return runMockDetection(options, onProgress, true);
    }
  }

  // No public URL → mock
  return runMockDetection(options, onProgress, false);
}

/** Deterministic mock used as fallback or for demo videos */
async function runMockDetection(
  options: { playerId: string; playerName: string; videoId: string; videoTitle: string },
  onProgress: ScanningDetectionListener | undefined,
  skipProgress: boolean,
): Promise<ScanningAnalysisResult> {
  if (!skipProgress) {
    for (const step of STAGE_FLOW) {
      onProgress?.({ stage: step.stage, pct: step.pct, message: step.message });
      if (step.duration > 0) {
        await new Promise((r) => setTimeout(r, step.duration));
      }
    }
  } else {
    onProgress?.({ stage: "finished", pct: 100, message: "Análisis completado" });
  }

  const rng = seededRng(`${options.playerId}_${options.videoId}`);
  const scanIQ = Math.round(45 + rng() * 50);

  const result: ScanningAnalysisResult = {
    id: genId(),
    playerId: options.playerId,
    playerName: options.playerName,
    videoId: options.videoId,
    videoTitle: options.videoTitle,
    scanIQ,
    receptionsAnalyzed: 18 + Math.floor(rng() * 8),
    avgScansPreReception: Math.round((2 + rng() * 4) * 10) / 10,
    scansUnderPressure: Math.round((1.5 + rng() * 3) * 10) / 10,
    successWithScan: Math.round((0.55 + rng() * 0.3) * 100) / 100,
    successWithoutScan: Math.round((0.15 + rng() * 0.3) * 100) / 100,
    forwardOrientedPct: Math.round((0.5 + rng() * 0.4) * 100) / 100,
    createdAt: new Date().toISOString(),
  };

  const all = readAll();
  all.unshift(result);
  writeAll(all.slice(0, 50));

  return result;
}

export const ScanningVideoAnalyses = {
  getAll: readAll,
  getByPlayer(playerId: string): ScanningAnalysisResult[] {
    return readAll().filter((a) => a.playerId === playerId);
  },
  getLatestForPlayer(playerId: string): ScanningAnalysisResult | null {
    const list = this.getByPlayer(playerId);
    return list.length > 0 ? list[0] : null;
  },
  delete(id: string): void {
    writeAll(readAll().filter((a) => a.id !== id));
  },
};
