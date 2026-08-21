/**
 * VITAS · Ball Detector (Sprint 1 — Ball Tracking)
 *
 * Detects the football in a frame using either:
 * - A dedicated ball detection model (class 1 = ball in yolov8s-football)
 * - The person-pose model's bounding boxes filtered by size heuristic
 *
 * Ball-specific challenges:
 * - Very small target (10-30px in typical footage)
 * - Frequent occlusion (by players, behind bodies)
 * - Fast motion → motion blur
 * - Looks similar to other round objects (heads, corner flags)
 *
 * Strategy:
 * - Lower confidence threshold (0.25 vs 0.45 for players)
 * - Stricter NMS IoU (0.3 — balls rarely overlap)
 * - Size filter: max 50×50px (balls are small)
 * - Shape filter: aspect ratio near 1.0 (balls are round)
 */

import { decodeYoloBox } from "./tiling";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BallDetection {
  /** Bounding box [x, y, w, h] in pixels */
  bbox: [number, number, number, number];
  /** Detection confidence 0-1 */
  confidence: number;
  /** Center point in pixels */
  center: { x: number; y: number };
  /** Detection source */
  source: "model" | "heuristic";
}

export interface BallDetectorConfig {
  /** Minimum confidence for ball detection (default: 0.25) */
  confThreshold: number;
  /** NMS IoU threshold (default: 0.3) */
  nmsThreshold: number;
  /** Maximum bbox dimension in pixels (default: 50) */
  maxBboxSize: number;
  /** Minimum bbox dimension in pixels (default: 5) */
  minBboxSize: number;
  /** Maximum aspect ratio deviation from 1.0 (default: 0.6) */
  maxAspectDeviation: number;
  /**
   * Corrección de anisotropía para el filtro de aspecto (default 1 = sin cambio).
   *
   * El FrameExtractor dibuja el vídeo en un canvas CUADRADO 640×640, así que un
   * vídeo 16:9 se APLASTA: un balón redondo aparece como elipse (aspecto ≈ 1.78 en
   * 16:9) y el filtro `maxAspectDeviation` lo descartaba SIEMPRE. Pasando aquí
   * srcAspect = videoW/videoH, el aspecto se evalúa en proporciones reales:
   *   arReal = (w/h) · aspectCorrection  → para un balón real da ≈ 1.
   */
  aspectCorrection?: number;
}

const DEFAULT_CONFIG: BallDetectorConfig = {
  confThreshold: 0.25,
  nmsThreshold: 0.3,
  maxBboxSize: 50,
  minBboxSize: 5,
  maxAspectDeviation: 0.6,
};

// ─── Ball Detection from raw YOLO output ────────────────────────────────────

/**
 * Extract ball detections from a YOLO detection model output.
 * Assumes class 1 = ball in the model output.
 *
 * @param outputData - Raw model output (Float32Array)
 * @param numClasses - Number of classes in the model
 * @param ballClassId - Class index for ball (default: 32 for COCO sports ball)
 * @param imgW - Original image width
 * @param imgH - Original image height
 * @param modelSize - Model input size (default: 640)
 * @param config - Detection configuration
 */
export function detectBallFromModelOutput(
  outputData: Float32Array,
  numClasses: number,
  ballClassId: number,
  imgW: number,
  imgH: number,
  modelSize: number = 640,
  config: Partial<BallDetectorConfig> = {},
): BallDetection | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const scale = Math.min(modelSize / imgW, modelSize / imgH);
  const padX = (modelSize - imgW * scale) / 2;
  const padY = (modelSize - imgH * scale) / 2;
  const numAnchors = 8400;

  let bestDetection: BallDetection | null = null;
  let bestScore = 0;

  for (let i = 0; i < numAnchors; i++) {
    // For detection models: output shape [1, 4+numClasses, 8400]
    // bbox: indices 0-3, class scores: indices 4+
    const classScore = outputData[(4 + ballClassId) * numAnchors + i];
    if (classScore < cfg.confThreshold) continue;

    const cx = outputData[0 * numAnchors + i];
    const cy = outputData[1 * numAnchors + i];
    const bw = outputData[2 * numAnchors + i];
    const bh = outputData[3 * numAnchors + i];

    // Convert to image coordinates — decode letterbox⁻¹ compartido (invariante
    // #7): idéntico al de pose y detección.
    const [x, y, w, h] = decodeYoloBox(cx, cy, bw, bh, scale, padX, padY);

    // Size filter
    if (w > cfg.maxBboxSize || h > cfg.maxBboxSize) continue;
    if (w < cfg.minBboxSize || h < cfg.minBboxSize) continue;

    // Aspect ratio filter (balls are roughly square). Se corrige la anisotropía
    // del frame aplastado (16:9 → 640×640) para no descartar balones redondos.
    const arRaw = (w / h) * (cfg.aspectCorrection ?? 1);
    const aspectRatio = Math.max(arRaw, 1 / arRaw);
    if (aspectRatio - 1.0 > cfg.maxAspectDeviation) continue;

    if (classScore > bestScore) {
      bestScore = classScore;
      bestDetection = {
        bbox: [x, y, w, h],
        confidence: classScore,
        center: { x: x + w / 2, y: y + h / 2 },
        source: "model",
      };
    }
  }

  return bestDetection;
}

// ─── Heuristic ball detection from person-pose model ────────────────────────

/**
 * When using a person-only model (yolov8n-pose), we can try to detect the
 * ball by looking for small, low-confidence detections that don't match
 * typical person proportions.
 *
 * This is a fallback — much less reliable than a dedicated ball model.
 */
export function detectBallHeuristic(
  detections: Array<{ bbox: [number, number, number, number]; confidence: number }>,
  config: Partial<BallDetectorConfig> = {},
): BallDetection | null {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  // Look for small detections that could be the ball
  // Ball: small bbox, low confidence, near-square aspect ratio
  let bestCandidate: BallDetection | null = null;
  let bestScore = 0;

  for (const det of detections) {
    const [x, y, w, h] = det.bbox;

    // Must be small
    if (w > cfg.maxBboxSize || h > cfg.maxBboxSize) continue;
    if (w < cfg.minBboxSize || h < cfg.minBboxSize) continue;

    // Must be roughly square (corrigiendo la anisotropía del frame aplastado)
    const arRaw = (w / h) * (cfg.aspectCorrection ?? 1);
    const aspectRatio = Math.max(arRaw, 1 / arRaw);
    if (aspectRatio - 1.0 > cfg.maxAspectDeviation) continue;

    // Must have low-medium confidence (high confidence = likely a person)
    if (det.confidence > 0.6) continue;

    // Score: prefer higher confidence among small candidates
    const score = det.confidence * (1.0 / aspectRatio);
    if (score > bestScore) {
      bestScore = score;
      bestCandidate = {
        bbox: det.bbox,
        confidence: det.confidence,
        center: { x: x + w / 2, y: y + h / 2 },
        source: "heuristic",
      };
    }
  }

  return bestCandidate;
}

// ─── Utility: distance between two pixel points ─────────────────────────────

export function pixelDistance(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}
