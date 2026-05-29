/**
 * VITAS · Scanning Video Detector
 *
 * Phase 1: simulates a focused scanning-detection pipeline on a video.
 * Independent from other detectors (set pieces, highlights, behavioral) —
 * stores results in its own localStorage key and only updates Scan IQ.
 *
 * Phase 2 hook: replace runScanningDetection() with a call to
 * /api/behavioral/_detect-scanning that runs the pose pipeline.
 */

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

export async function runScanningDetection(
  options: { playerId: string; playerName: string; videoId: string; videoTitle: string },
  onProgress?: ScanningDetectionListener,
): Promise<ScanningAnalysisResult> {
  for (const step of STAGE_FLOW) {
    onProgress?.({ stage: step.stage, pct: step.pct, message: step.message });
    if (step.duration > 0) {
      await new Promise((r) => setTimeout(r, step.duration));
    }
  }

  // Derive a new Scan IQ based on player + video seed so re-runs are stable
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

  // Persist (keep at most 50 latest analyses)
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
