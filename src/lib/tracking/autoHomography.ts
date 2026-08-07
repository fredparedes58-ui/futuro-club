/**
 * VITAS · Auto Homography Pipeline (Sprint 5)
 *
 * Full automatic field-to-camera mapping pipeline:
 *   1. Detect field lines (multi-frame sampling)
 *   2. Extract line intersections as candidate correspondences
 *   3. Match intersections to FIFA field template
 *   4. RANSAC 4-point homography with outlier rejection
 *   5. Validate reprojection quality
 *
 * Falls back to heuristic preset if RANSAC fails or confidence is low.
 */

import {
  detectFieldLines,
  type FieldDetectionResult,
  type DetectedLine,
} from "./fieldLineDetector";
import {
  matchToTemplate,
  scoreCorrespondences,
  type PointCorrespondence,
} from "./fieldTemplateMatch";
import {
  validateHomography,
  type HomographyValidation,
} from "./homographyValidator";
import {
  computeHomographyRANSAC,
  invertMatrix3x3,
  identityHomography,
  type RANSACResult,
} from "@/lib/yolo/homography";
import { captureVideoFrame } from "./autoCalibrationBridge";
import { getFieldDimensions } from "@/lib/yolo/fieldFormatConfig";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutoHomographyResult {
  /** Computed homography matrix (3×3, row-major) */
  H: Float64Array;
  /** Inverse homography */
  Hinv: Float64Array;
  /** Overall pipeline confidence (0-1) */
  confidence: number;
  /** Whether RANSAC succeeded or fell back to heuristic */
  method: "ransac" | "template_direct" | "heuristic_fallback";
  /** Number of inlier correspondences used */
  inlierCount: number;
  /** Total correspondences found before RANSAC */
  totalCorrespondences: number;
  /** Validation result */
  validation: HomographyValidation | null;
  /** Field detection result (for debug) */
  fieldDetection: FieldDetectionResult | null;
  /** Processing time in ms */
  processingTimeMs: number;
}

export interface AutoHomographyConfig {
  /** RANSAC iterations (default: 200) */
  ransacIterations: number;
  /** RANSAC reprojection error threshold in pixels (default: 5.0) */
  ransacThreshold: number;
  /** Minimum confidence to accept auto-homography (default: 0.5) */
  minConfidence: number;
  /** Number of video frames to sample for multi-frame detection (default: 3) */
  multiFrameSamples: number;
  /** Ball positions for cross-validation (optional) */
  ballPositions?: Array<{ x: number; y: number }>;
}

const DEFAULT_CONFIG: AutoHomographyConfig = {
  ransacIterations: 200,
  ransacThreshold: 5.0,
  minConfidence: 0.5,
  multiFrameSamples: 3,
};

// ─── Main Pipeline ──────────────────────────────────────────────────────────

/**
 * Run the full auto-homography pipeline on a video element.
 *
 * @param video - HTMLVideoElement with loaded video (readyState >= 2)
 * @param config - Pipeline configuration
 * @returns AutoHomographyResult with homography and metadata
 */
export async function autoComputeHomography(
  video: HTMLVideoElement,
  config?: Partial<AutoHomographyConfig>,
): Promise<AutoHomographyResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startMs = performance.now();
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;

  // ── 1. Multi-frame field line detection ──
  let bestDetection: FieldDetectionResult | null = null;

  for (let i = 0; i < cfg.multiFrameSamples; i++) {
    const seekPct = 0.1 + (i / cfg.multiFrameSamples) * 0.6;
    try {
      const imageData = await captureVideoFrame(video, seekPct);
      const result = await detectFieldLines(imageData);

      if (!bestDetection || result.confidence > bestDetection.confidence) {
        bestDetection = result;
      }
    } catch {
      // Skip failed frames
    }
  }

  if (!bestDetection || bestDetection.lines.length < 2) {
    return fallbackResult(vw, vh, startMs, bestDetection);
  }

  // ── 2. Extract line intersections ──
  const intersections = extractIntersections(bestDetection.lines, vw, vh);

  if (intersections.length < 4) {
    // Not enough intersections — try using detected corners directly
    if (bestDetection.corners.length >= 4) {
      return directCornerHomography(bestDetection, vw, vh, cfg, startMs);
    }
    return fallbackResult(vw, vh, startMs, bestDetection);
  }

  // ── 3. Match intersections to FIFA template ──
  const correspondences = matchToTemplate(intersections, vw, vh);
  const templateScore = scoreCorrespondences(correspondences);

  if (correspondences.length < 4 || templateScore < 0.2) {
    // Template matching failed — try direct corners
    if (bestDetection.corners.length >= 4) {
      return directCornerHomography(bestDetection, vw, vh, cfg, startMs);
    }
    return fallbackResult(vw, vh, startMs, bestDetection);
  }

  // ── 4. RANSAC homography ──
  const ransacInput = correspondences.map((c) => ({
    pixel: c.pixel,
    field: c.field,
  }));

  const ransacResult = computeHomographyRANSAC(
    ransacInput,
    cfg.ransacIterations,
    cfg.ransacThreshold,
  );

  if (!ransacResult) {
    // RANSAC failed — try direct 4-point from best correspondences
    return directCorrespondenceHomography(
      correspondences,
      vw,
      vh,
      cfg,
      startMs,
      bestDetection,
    );
  }

  // ── 5. Validate ──
  const Hinv = invertMatrix3x3(ransacResult.H);
  const validation = validateHomography(
    ransacResult.H,
    Hinv,
    vw,
    vh,
    cfg.ballPositions,
  );

  if (!validation.valid || validation.confidence < cfg.minConfidence) {
    // Validation failed — try direct 4-point fallback
    return directCorrespondenceHomography(
      correspondences,
      vw,
      vh,
      cfg,
      startMs,
      bestDetection,
    );
  }

  return {
    H: ransacResult.H,
    Hinv,
    confidence: validation.confidence,
    method: "ransac",
    inlierCount: ransacResult.inlierCount,
    totalCorrespondences: correspondences.length,
    validation,
    fieldDetection: bestDetection,
    processingTimeMs: performance.now() - startMs,
  };
}

// ─── Extract line intersections ──────────────────────────────────────────────

function extractIntersections(
  lines: DetectedLine[],
  imgW: number,
  imgH: number,
): Array<{ x: number; y: number }> {
  const points: Array<{ x: number; y: number }> = [];

  for (let i = 0; i < lines.length; i++) {
    for (let j = i + 1; j < lines.length; j++) {
      // Only intersect lines with significantly different angles
      const angleDiff = Math.abs(lines[i].angle - lines[j].angle);
      if (angleDiff < 20 && angleDiff > 160) continue;

      const pt = computeIntersection(lines[i], lines[j]);
      if (!pt) continue;

      // Must be within image bounds (with small margin)
      if (pt.x < -10 || pt.x > imgW + 10 || pt.y < -10 || pt.y > imgH + 10) continue;

      // Check not too close to existing point
      const tooClose = points.some(
        (p) => Math.sqrt((p.x - pt.x) ** 2 + (p.y - pt.y) ** 2) < 15,
      );
      if (!tooClose) {
        points.push(pt);
      }
    }
  }

  return points;
}

function computeIntersection(
  l1: DetectedLine,
  l2: DetectedLine,
): { x: number; y: number } | null {
  const x1 = l1.start[0], y1 = l1.start[1];
  const x2 = l1.end[0], y2 = l1.end[1];
  const x3 = l2.start[0], y3 = l2.start[1];
  const x4 = l2.end[0], y4 = l2.end[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  return {
    x: Math.round(x1 + t * (x2 - x1)),
    y: Math.round(y1 + t * (y2 - y1)),
  };
}

// ─── Direct homography from correspondences (no RANSAC) ─────────────────────

function directCorrespondenceHomography(
  correspondences: PointCorrespondence[],
  imgW: number,
  imgH: number,
  cfg: AutoHomographyConfig,
  startMs: number,
  fieldDetection: FieldDetectionResult | null,
): AutoHomographyResult {
  // Take the 4 best correspondences
  const best4 = correspondences.slice(0, 4);

  try {
    const ransacInput = best4.map((c) => ({
      pixel: c.pixel,
      field: c.field,
    }));

    const result = computeHomographyRANSAC(ransacInput, 1, cfg.ransacThreshold);
    if (!result) return fallbackResult(imgW, imgH, startMs, fieldDetection);

    const Hinv = invertMatrix3x3(result.H);
    const validation = validateHomography(result.H, Hinv, imgW, imgH);

    return {
      H: result.H,
      Hinv,
      confidence: Math.min(0.6, validation.confidence),
      method: "template_direct",
      inlierCount: 4,
      totalCorrespondences: correspondences.length,
      validation,
      fieldDetection,
      processingTimeMs: performance.now() - startMs,
    };
  } catch {
    return fallbackResult(imgW, imgH, startMs, fieldDetection);
  }
}

// ─── Direct homography from detected corners ─────────────────────────────────

function directCornerHomography(
  detection: FieldDetectionResult,
  imgW: number,
  imgH: number,
  cfg: AutoHomographyConfig,
  startMs: number,
): AutoHomographyResult {
  const corners = detection.corners.slice(0, 4);
  const correspondences = corners.map((c) => ({
    pixel: { x: c[0], y: c[1] },
    field: { x: 0, y: 0 }, // Will be assigned below
  }));

  // Assign field coordinates based on corner ordering (top-left, top-right,
  // bottom-right, bottom-left). FORMAT-AWARE: dimensiones del formato activo
  // (F8 60×40 vs F11 105×68) para no inflar los metros en fútbol-8.
  const { length: L, width: Wm } = getFieldDimensions();
  const fieldCorners = [
    { x: 0, y: 0 },
    { x: L, y: 0 },
    { x: L, y: Wm },
    { x: 0, y: Wm },
  ];

  for (let i = 0; i < correspondences.length; i++) {
    correspondences[i].field = fieldCorners[i];
  }

  try {
    const result = computeHomographyRANSAC(correspondences, 1, cfg.ransacThreshold);
    if (!result) return fallbackResult(imgW, imgH, startMs, detection);

    const Hinv = invertMatrix3x3(result.H);
    const validation = validateHomography(result.H, Hinv, imgW, imgH, cfg.ballPositions);

    return {
      H: result.H,
      Hinv,
      confidence: Math.min(detection.confidence, validation.confidence),
      method: "template_direct",
      inlierCount: 4,
      totalCorrespondences: 4,
      validation,
      fieldDetection: detection,
      processingTimeMs: performance.now() - startMs,
    };
  } catch {
    return fallbackResult(imgW, imgH, startMs, detection);
  }
}

// ─── Fallback ────────────────────────────────────────────────────────────────

function fallbackResult(
  imgW: number,
  imgH: number,
  startMs: number,
  fieldDetection: FieldDetectionResult | null,
): AutoHomographyResult {
  return {
    H: identityHomography(),
    Hinv: identityHomography(),
    confidence: 0,
    method: "heuristic_fallback",
    inlierCount: 0,
    totalCorrespondences: 0,
    validation: null,
    fieldDetection,
    processingTimeMs: performance.now() - startMs,
  };
}
