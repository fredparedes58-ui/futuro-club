/**
 * VITAS · Ball Model Configuration (Sprint 1 — Ball Tracking)
 *
 * Configuration for ball detection models.
 * Supports two modes:
 * 1. Combined model: person + ball in same model (class 0=person, 1=ball)
 * 2. Separate model: dedicated lightweight ball detector
 *
 * Current implementation uses heuristic detection from the existing
 * yolov8n-pose model output (no separate model needed initially).
 * Future: switch to yolov8s-football.onnx for dedicated ball detection.
 */

import type { ModelSpec } from "./modelConfig";

// ─── Ball-specific model config ─────────────────────────────────────────────

export interface BallModelConfig {
  /** Model ID to use for ball detection */
  modelId: string;
  /** Class ID for ball in the model output */
  ballClassId: number;
  /** Class ID for person in the model output */
  personClassId: number;
  /** Confidence threshold for ball (lower than persons) */
  confThreshold: number;
  /** Maximum bounding box size for ball in pixels */
  maxBboxSize: number;
  /** Minimum bounding box size for ball in pixels */
  minBboxSize: number;
  /** Whether to use heuristic detection as fallback */
  useHeuristicFallback: boolean;
  /** Nº de clases del modelo detect (COCO = 80). Solo modo standalone. */
  numClasses?: number;
  /** URL del ONNX para inferencia standalone en el ball worker (FASE 2). */
  modelUrl?: string;
  /** Input size del modelo standalone (default 640). */
  inputSize?: number;
}

// ─── Predefined configurations ──────────────────────────────────────────────

export const BALL_CONFIGS: Record<string, BallModelConfig> = {
  /** Heuristic mode: extract ball candidates from person-pose model */
  "heuristic": {
    modelId: "yolov8n-pose",
    ballClassId: -1,  // Not applicable — uses bbox heuristic
    personClassId: 0,
    confThreshold: 0.25,
    maxBboxSize: 40,
    minBboxSize: 5,
    useHeuristicFallback: true,
  },

  /** Combined model: yolov8s trained on football dataset */
  "yolov8s-football": {
    modelId: "yolov8s-football",
    ballClassId: 1,    // class 0=person, 1=ball
    personClassId: 0,
    confThreshold: 0.25,
    maxBboxSize: 50,
    minBboxSize: 3,
    useHeuristicFallback: true,
  },

  /** COCO sports ball class (class 32) from standard YOLO detection model */
  "coco-sportsball": {
    modelId: "yolov8n",
    ballClassId: 32,   // COCO class 32 = sports ball
    personClassId: 0,
    confThreshold: 0.20,
    maxBboxSize: 50,
    minBboxSize: 3,
    useHeuristicFallback: true,
  },

  /**
   * FASE 2 · Detección de balón dedicada (standalone en el ball worker).
   * yolo11s COCO exportado con vision-pipeline/export_onnx.py. Same-origin:
   * scripts/download-models.mjs (prebuild) lo trae del release models-v1 a
   * public/models/ (github.com/releases no sirve CORS al navegador).
   * Clase 32 = sports ball. Umbral bajo: el balón lejano es pequeño y difícil.
   */
  "yolo11s-detect": {
    modelId: "yolo11s-detect",
    ballClassId: 32,
    personClassId: 0,
    confThreshold: 0.15,
    maxBboxSize: 48,
    minBboxSize: 3,
    useHeuristicFallback: true,
    numClasses: 80,
    inputSize: 640,
    modelUrl: "/models/yolo11s-detect.onnx",
  },
};

/** Football-specific model spec (for future model registry) */
export const BALL_MODEL_SPEC: ModelSpec = {
  id: "yolov8s-football",
  name: "YOLOv8 Small Football",
  family: "yolov8",
  variant: "s",
  task: "detect",
  inputSize: 640,
  numKeypoints: 0,
  confThreshold: 0.25,
  nmsThreshold: 0.3,
  modelPath: "/models/yolov8s-football.onnx",
  sizeMb: 22,
  accuracyFactor: 1.5,
  dynamicBatch: false,
  notes: "Football-specific detection model. Classes: person (0), ball (1). mAP@0.50 = 0.92 on football datasets.",
};

// ─── Active config ──────────────────────────────────────────────────────────

const STORAGE_KEY = "vitas_ball_config";
const DEFAULT_CONFIG = "heuristic";
/** FASE 2: desktop puede con la inferencia standalone del detect (37.9MB). */
const DESKTOP_DEFAULT_CONFIG = "yolo11s-detect";

/** Default por dispositivo: móvil → heurística (status quo); desktop → detect dedicado. */
function getDefaultBallConfigId(): string {
  if (typeof navigator === "undefined") return DEFAULT_CONFIG;
  const isMobile = /Mobi|Android/i.test(navigator.userAgent ?? "");
  return isMobile ? DEFAULT_CONFIG : DESKTOP_DEFAULT_CONFIG;
}

export function getActiveBallConfig(): BallModelConfig {
  if (typeof window === "undefined") return BALL_CONFIGS[DEFAULT_CONFIG];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && BALL_CONFIGS[stored]) return BALL_CONFIGS[stored]; // override manual gana
  return BALL_CONFIGS[getDefaultBallConfigId()] ?? BALL_CONFIGS[DEFAULT_CONFIG];
}

export function setActiveBallConfig(configId: string): void {
  if (!BALL_CONFIGS[configId]) {
    console.warn(`[BallModelConfig] Unknown config: ${configId}`);
    return;
  }
  localStorage.setItem(STORAGE_KEY, configId);
}
