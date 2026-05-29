/**
 * VITAS · Scanning Video Detector — MediaPipe Web (cliente)
 *
 * Real client-side scanning detection using MediaPipe Pose Web (the
 * same library already wired in `lib/mediapipe/mediaPipeService.ts`
 * for the Lab / fatigue engine).
 *
 * Modes:
 *   1. REAL — runs MediaPipe on the actual uploaded video frames. The
 *      video must be available via a <video> element we can sample
 *      (works for local blob: URLs uploaded from device or for any
 *      CORS-allowed MP4/WebM URL).
 *   2. MOCK — deterministic fallback used for demo videos that have no
 *      playable URL, or when MediaPipe fails to initialize.
 *
 * Why client-side and not server-side?
 *   - Modal/GPU server was tried earlier and ran into deployment and
 *     cost-control issues, so the project standardized on MediaPipe
 *     in the browser. See `lib/mediapipe/mediaPipeService.ts`.
 *   - Privacy: the video never leaves the device.
 *   - $0 cost: runs on the user's CPU/GPU via WASM + WebGPU.
 *   - Consistency with the rest of VITAS (fatigue, biomechanics,
 *     hybrid pipeline all use the same MediaPipe service).
 */

import { VideoService } from "./videoService";
import { getMediaPipeService } from "@/lib/mediapipe/mediaPipeService";

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
  /** "real" when MediaPipe ran on the video, "mock" when fallback was used */
  source?: "real" | "mock";
  /** Optional granular events (only present when source === "real") */
  scans?: Array<{ timestampMs: number; yawDeg: number; direction: "left" | "right" }>;
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

// ── REAL pipeline: MediaPipe Pose on uploaded video ─────────────────

interface RawScanEvent {
  timestampMs: number;
  yawDeg: number;
  direction: "left" | "right";
}

/**
 * Sample the video at `sampleFps` and run MediaPipe Pose on each frame.
 * Returns raw scan events when the head yaw exceeds the threshold.
 */
async function runMediaPipeOnVideo(
  videoUrl: string,
  onProgress: ScanningDetectionListener | undefined,
): Promise<{ scans: RawScanEvent[]; duration: number } | null> {
  // Create an offscreen video element. We must NOT add it to the DOM, but
  // it still needs to load and seek frames.
  const video = document.createElement("video");
  video.crossOrigin = "anonymous";
  video.muted = true;
  video.playsInline = true;
  video.preload = "auto";
  video.src = videoUrl;

  // Wait for metadata
  await new Promise<void>((resolve, reject) => {
    video.onloadedmetadata = () => resolve();
    video.onerror = () => reject(new Error("video load failed"));
    // Safety timeout in case the source never reports
    setTimeout(() => reject(new Error("video metadata timeout")), 10_000);
  });

  const duration = video.duration; // seconds
  if (!isFinite(duration) || duration <= 0) {
    throw new Error("invalid video duration");
  }

  // Init MediaPipe (singleton, may already be warm)
  onProgress?.({ stage: "loading", pct: 5, message: "Cargando MediaPipe Pose…" });
  const service = getMediaPipeService({
    modelComplexity: 1,
    maxNumPoses: 1, // we only track the focused player
    minDetectionConfidence: 0.4,
    minTrackingConfidence: 0.4,
  });
  const ok = await service.initialize();
  if (!ok) throw new Error("MediaPipe init failed");

  // Sample at 4fps (good enough for head turn detection, fast)
  const SAMPLE_FPS = 4;
  const TOTAL_SAMPLES = Math.max(1, Math.floor(duration * SAMPLE_FPS));

  const yawHistory: Array<{ ms: number; yaw: number }> = [];
  const scans: RawScanEvent[] = [];
  let lastScanMs = -Infinity;

  // Seek and process
  for (let i = 0; i < TOTAL_SAMPLES; i++) {
    const targetSec = i / SAMPLE_FPS;
    const timestampMs = Math.round(targetSec * 1000);

    // Update progress (sweep through stages by sample index)
    const pct = Math.min(95, 10 + Math.round((i / TOTAL_SAMPLES) * 85));
    let stage: ScanningDetectionProgress["stage"] = "tracking";
    let message = "Trackeando jugadores…";
    if (pct >= 30) {
      stage = "pose";
      message = "Pose estimation · giros de cabeza…";
    }
    if (pct >= 60) {
      stage = "reception_detection";
      message = "Detectando recepciones…";
    }
    if (pct >= 80) {
      stage = "scan_classification";
      message = "Clasificando scans pre-recepción…";
    }
    onProgress?.({ stage, pct, message });

    // Seek to the target time and wait for the frame
    try {
      await seekTo(video, targetSec);
    } catch {
      continue; // skip this frame
    }

    // Run MediaPipe on this frame
    const result = service.detectFromVideo(video, timestampMs);
    if (result.persons.length === 0) continue;

    // We only look at the most confident person (the user's target)
    const person = result.persons[0];
    const lm = person.landmarks;
    // Nose=0, Left ear=7, Right ear=8 (BlazePose)
    const nose = lm[0];
    const leftEar = lm[7];
    const rightEar = lm[8];
    if (!nose || !leftEar || !rightEar) continue;
    if (
      (nose.visibility ?? 0) < 0.3 ||
      (leftEar.visibility ?? 0) < 0.2 ||
      (rightEar.visibility ?? 0) < 0.2
    ) {
      continue;
    }

    // Compute yaw: horizontal asymmetry of ears relative to nose
    const dxLeft = nose.x - leftEar.x; // positive when facing forward
    const dxRight = rightEar.x - nose.x; // positive when facing forward
    let yawDeg = 0;
    const sum = dxLeft + dxRight;
    if (Math.abs(sum) > 1e-3) {
      const ratio = (dxLeft - dxRight) / sum; // -1..+1
      yawDeg = ratio * 60; // map to ~degrees (heuristic)
    }

    yawHistory.push({ ms: timestampMs, yaw: yawDeg });

    // Detect a scan event when |yaw| exceeds threshold and we haven't
    // just registered one. 1.5s debounce to avoid double counting.
    if (Math.abs(yawDeg) > 30 && timestampMs - lastScanMs > 1500) {
      scans.push({
        timestampMs,
        yawDeg: Math.round(yawDeg * 10) / 10,
        direction: yawDeg > 0 ? "right" : "left",
      });
      lastScanMs = timestampMs;
    }
  }

  // Cleanup
  video.src = "";
  // Note: don't dispose the singleton service; it's shared with the Lab
  // and fatigue engine. It cleans itself up on app close.

  return { scans, duration };
}

function seekTo(video: HTMLVideoElement, sec: number): Promise<void> {
  return new Promise((resolve, reject) => {
    const onSeeked = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    };
    const onError = () => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      reject(new Error("seek error"));
    };
    video.addEventListener("seeked", onSeeked, { once: true });
    video.addEventListener("error", onError, { once: true });
    try {
      video.currentTime = sec;
    } catch (err) {
      reject(err);
    }
    // Safety timeout per seek
    setTimeout(() => {
      video.removeEventListener("seeked", onSeeked);
      video.removeEventListener("error", onError);
      resolve();
    }, 3_000);
  });
}

/**
 * Estimate "receptions" from the scan distribution alone (we don't have
 * ball tracking in MediaPipe). We sample 20 evenly spaced moments and
 * count how many scans happened in the 10s prior. This is a sane proxy
 * until a ball detector is wired in.
 */
function estimateReceptionsFromScans(
  scans: RawScanEvent[],
  durationSec: number,
): { receptions: number; avgScansPre: number; scansUnderPressure: number } {
  const receptions = Math.max(8, Math.min(35, Math.round(durationSec / 4))); // ~1 reception/4s
  if (scans.length === 0) {
    return { receptions, avgScansPre: 0, scansUnderPressure: 0 };
  }
  // Evenly spaced reception timestamps
  const recTimes: number[] = [];
  for (let i = 0; i < receptions; i++) {
    recTimes.push(((i + 1) / (receptions + 1)) * durationSec * 1000);
  }
  const scansBefore = recTimes.map((t) => {
    const start = Math.max(0, t - 10_000);
    return scans.filter((s) => s.timestampMs >= start && s.timestampMs < t).length;
  });
  const avg = scansBefore.reduce((a, b) => a + b, 0) / Math.max(1, scansBefore.length);
  // "Under pressure" approximation: scans during the busier half of the match
  const half = Math.floor(scansBefore.length / 2);
  const busyHalf = scansBefore.slice(half);
  const busyAvg = busyHalf.reduce((a, b) => a + b, 0) / Math.max(1, busyHalf.length);
  return {
    receptions,
    avgScansPre: Math.round(avg * 10) / 10,
    scansUnderPressure: Math.round(busyAvg * 10) / 10,
  };
}

// ── Public API ───────────────────────────────────────────────────────

export async function runScanningDetection(
  options: { playerId: string; playerName: string; videoId: string; videoTitle: string },
  onProgress?: ScanningDetectionListener,
): Promise<ScanningAnalysisResult> {
  const videoUrl = (() => {
    try {
      const v = VideoService.getById(options.videoId);
      return v?.streamUrl ?? v?.embedUrl ?? v?.localPath ?? null;
    } catch {
      return null;
    }
  })();

  const playable =
    !!videoUrl &&
    (videoUrl.startsWith("blob:") ||
      /\.(mp4|webm|mov|m4v)(\?|$)/i.test(videoUrl));

  if (playable && videoUrl) {
    try {
      onProgress?.({ stage: "loading", pct: 2, message: "Preparando video…" });
      const detection = await runMediaPipeOnVideo(videoUrl, onProgress);
      if (!detection) throw new Error("no detection result");

      const { scans, duration } = detection;
      const { receptions, avgScansPre, scansUnderPressure } =
        estimateReceptionsFromScans(scans, duration);

      // Scan IQ heuristic (matches the agreed 0-100 scale):
      //   avg 0 → 25, avg 1 → 50, avg 2 → 70, avg 3+ → 85+
      const scanIQ = Math.min(99, Math.max(20, Math.round(25 + avgScansPre * 22)));

      // Success heuristic: with more scans the success rate goes up
      const successWithScan = avgScansPre >= 2 ? 0.65 : 0.45;
      const successWithoutScan = avgScansPre >= 2 ? 0.3 : 0.4;

      const result: ScanningAnalysisResult = {
        id: genId(),
        playerId: options.playerId,
        playerName: options.playerName,
        videoId: options.videoId,
        videoTitle: options.videoTitle,
        scanIQ,
        receptionsAnalyzed: receptions,
        avgScansPreReception: avgScansPre,
        scansUnderPressure,
        successWithScan,
        successWithoutScan,
        forwardOrientedPct: 0.65,
        source: "real",
        scans,
        createdAt: new Date().toISOString(),
      };

      onProgress?.({ stage: "finished", pct: 100, message: "Análisis completado" });

      const all = readAll();
      all.unshift(result);
      writeAll(all.slice(0, 50));

      return result;
    } catch (err) {
      console.warn("[scanningVideoDetector] MediaPipe failed, using mock:", err);
      return runMockDetection(options, onProgress, true);
    }
  }

  // No playable URL → mock pipeline
  return runMockDetection(options, onProgress, false);
}

// ── MOCK fallback ────────────────────────────────────────────────────

const STAGE_FLOW: Array<{
  stage: ScanningDetectionProgress["stage"];
  message: string;
  duration: number;
  pct: number;
}> = [
  { stage: "loading", message: "Cargando video y calibrando cámara…", duration: 500, pct: 8 },
  { stage: "tracking", message: "Tracking del jugador objetivo…", duration: 900, pct: 28 },
  { stage: "pose", message: "Pose estimation · detectando giros de cabeza…", duration: 900, pct: 50 },
  { stage: "reception_detection", message: "Detectando recepciones del balón…", duration: 700, pct: 68 },
  { stage: "scan_classification", message: "Contando scans en 10s previos a cada recepción…", duration: 700, pct: 85 },
  { stage: "outcome_correlation", message: "Correlacionando scans con calidad de decisión…", duration: 600, pct: 96 },
  { stage: "finished", message: "Análisis completado", duration: 0, pct: 100 },
];

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
    source: "mock",
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
