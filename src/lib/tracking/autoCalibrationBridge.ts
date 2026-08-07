/**
 * VITAS · Auto-Calibration Bridge (Sprint 0 — UX 1-Click)
 *
 * Bridge between field line detection and homography computation.
 * Given a video frame, auto-detects field lines, extracts corners,
 * and computes the homography matrix for coordinate mapping.
 *
 * Flow:
 *   captureFrame(video, seekPct) → detectFieldLines(imageData) →
 *   extractCorners → computeHomography → { H, Hinv, preset, confidence }
 *
 * Fallback: if detection confidence < threshold, returns a preset
 * based on video aspect ratio (lateral/aerial/tribuna heuristic).
 */

import { detectFieldLines, type FieldDetectionResult } from "./fieldLineDetector";
import {
  buildAnchors,
  computeHomography,
  invertMatrix3x3,
  identityHomography,
} from "@/lib/yolo/homography";
import { type FieldAnchorPreset } from "@/lib/yolo/types";
import { autoComputeHomography, type AutoHomographyResult } from "./autoHomography";
import { getFieldDimensions } from "@/lib/yolo/fieldFormatConfig";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface AutoCalibrationResult {
  /** Homography matrix (3x3, row-major) */
  H: Float64Array;
  /** Inverse homography matrix */
  Hinv: Float64Array;
  /** Anchor preset used */
  preset: FieldAnchorPreset;
  /** Calibration confidence (0-1) */
  confidence: number;
  /** Whether this was auto-detected or fell back to a preset heuristic */
  autoDetected: boolean;
  /** Detected corners in pixel coordinates [x, y] */
  corners: Array<{ x: number; y: number }>;
  /** Raw field detection result (for debug/display) */
  fieldDetection: FieldDetectionResult | null;
  /** Processing time in ms */
  processingTimeMs: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

/** Minimum confidence for auto-calibration to be trusted */
const AUTO_CONFIDENCE_THRESHOLD = 0.55;

/** Where to seek in video to capture frame (% of duration) */
const DEFAULT_SEEK_PCT = 0.2;

// ─── Preset heuristics based on aspect ratio ────────────────────────────────

interface PresetHeuristic {
  preset: FieldAnchorPreset;
  corners: Array<{ x: number; y: number }>;
}

function guessPresetFromAspectRatio(
  videoWidth: number,
  videoHeight: number,
): PresetHeuristic {
  const ratio = videoWidth / videoHeight;

  // Very wide (>2.0) → likely a lateral broadcast view
  if (ratio > 2.0) {
    return {
      preset: "full_corners",
      corners: [
        { x: 15, y: 55 },
        { x: 85, y: 55 },
        { x: 92, y: 90 },
        { x: 8, y: 90 },
      ],
    };
  }

  // Standard widescreen (1.5-2.0) → tribuna/lateral view
  if (ratio > 1.5) {
    return {
      preset: "full_corners",
      corners: [
        { x: 20, y: 45 },
        { x: 80, y: 45 },
        { x: 88, y: 85 },
        { x: 12, y: 85 },
      ],
    };
  }

  // Vertical / square phone footage → close-range, centered
  return {
    preset: "full_corners",
    corners: [
      { x: 10, y: 30 },
      { x: 90, y: 30 },
      { x: 95, y: 90 },
      { x: 5, y: 90 },
    ],
  };
}

// ─── Frame capture ──────────────────────────────────────────────────────────

/**
 * Capture a single frame from a video element as ImageData.
 * Optionally seeks to a specific position first.
 */
export async function captureVideoFrame(
  video: HTMLVideoElement,
  seekPct: number = DEFAULT_SEEK_PCT,
): Promise<ImageData> {
  // Seek to the target position if video is loaded
  if (video.duration && isFinite(video.duration)) {
    const targetTime = video.duration * seekPct;
    if (Math.abs(video.currentTime - targetTime) > 0.5) {
      video.currentTime = targetTime;
      await new Promise<void>((resolve) => {
        const onSeeked = () => {
          video.removeEventListener("seeked", onSeeked);
          resolve();
        };
        video.addEventListener("seeked", onSeeked);
        // Timeout fallback
        setTimeout(resolve, 2000);
      });
    }
  }

  const canvas = document.createElement("canvas");
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Cannot get 2D context for frame capture");

  ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
  return ctx.getImageData(0, 0, canvas.width, canvas.height);
}

// ─── Auto-calibration ───────────────────────────────────────────────────────

/**
 * Auto-calibrate from a video element's current or seeked frame.
 *
 * Sprint 5 upgrade: uses RANSAC + FIFA template matching pipeline first.
 * Falls back to simple corner detection, then to aspect-ratio heuristic.
 *
 * Pipeline priority:
 *   1. RANSAC + template matching (multi-frame, highest accuracy)
 *   2. Direct corner detection (Canny + Hough)
 *   3. Aspect-ratio heuristic (always works)
 *
 * @param video - HTMLVideoElement with loaded video (readyState >= 2)
 * @param ballPositions - Optional ball positions for cross-validation
 * @returns AutoCalibrationResult with homography and metadata
 */
export async function autoCalibrate(
  video: HTMLVideoElement,
  ballPositions?: Array<{ x: number; y: number }>,
): Promise<AutoCalibrationResult> {
  const startMs = performance.now();
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;

  // ── Try Sprint 5 RANSAC + template matching pipeline first ──
  try {
    const ransacResult = await autoComputeHomography(video, {
      ballPositions,
      multiFrameSamples: 3,
      ransacIterations: 200,
      minConfidence: 0.45,
    });

    if (ransacResult.confidence >= AUTO_CONFIDENCE_THRESHOLD && ransacResult.method !== "heuristic_fallback") {
      // RANSAC succeeded — convert to AutoCalibrationResult format
      // Extract corners from validation for display
      const corners: Array<{ x: number; y: number }> = [];
      if (ransacResult.fieldDetection?.corners) {
        for (const c of ransacResult.fieldDetection.corners.slice(0, 4)) {
          corners.push({ x: (c[0] / vw) * 100, y: (c[1] / vh) * 100 });
        }
      }

      return {
        H: ransacResult.H,
        Hinv: ransacResult.Hinv,
        preset: "full_corners",
        confidence: ransacResult.confidence,
        autoDetected: true,
        corners: corners.length >= 4 ? corners : guessPresetFromAspectRatio(vw, vh).corners,
        fieldDetection: ransacResult.fieldDetection,
        processingTimeMs: performance.now() - startMs,
      };
    }
  } catch (err) {
    console.warn("[autoCalibrationBridge] RANSAC pipeline failed, trying direct corners:", err);
  }

  // ── Fallback: simple corner detection (original Sprint 0 logic) ──
  let fieldDetection: FieldDetectionResult | null = null;

  try {
    const imageData = await captureVideoFrame(video, DEFAULT_SEEK_PCT);
    fieldDetection = await detectFieldLines(imageData);

    if (
      fieldDetection.autoCalibrationReady &&
      fieldDetection.confidence >= AUTO_CONFIDENCE_THRESHOLD &&
      fieldDetection.corners.length >= 4
    ) {
      const cornersPct = fieldDetection.corners.slice(0, 4).map((c) => ({
        x: (c[0] / vw) * 100,
        y: (c[1] / vh) * 100,
      }));

      const { H, Hinv } = computeHomographyFromCorners(cornersPct, vw, vh);

      return {
        H,
        Hinv,
        preset: "full_corners",
        confidence: fieldDetection.confidence,
        autoDetected: true,
        corners: cornersPct,
        fieldDetection,
        processingTimeMs: performance.now() - startMs,
      };
    }
  } catch (err) {
    console.warn("[autoCalibrationBridge] Direct corner detection failed:", err);
  }

  // ── Ultimate fallback: aspect-ratio heuristic ──
  const heuristic = guessPresetFromAspectRatio(vw, vh);
  const { H, Hinv } = computeHomographyFromCorners(heuristic.corners, vw, vh);

  return {
    H,
    Hinv,
    preset: heuristic.preset,
    confidence: fieldDetection?.confidence ?? 0.3,
    autoDetected: false,
    corners: heuristic.corners,
    fieldDetection,
    processingTimeMs: performance.now() - startMs,
  };
}

// ─── Homography computation from percentage corners ─────────────────────────

/**
 * Homografía desde 4 esquinas (en %), FORMAT-AWARE: las esquinas del campo se
 * toman de las dimensiones del formato ACTIVO (fútbol-8 60×40 vs fútbol-11 105×68).
 * Sin esto, un partido F8 se medía contra 105×68 → distancias/velocidades infladas
 * ~1.75× en silencio. `dims` permite inyectar dimensiones reales/test.
 */
export function computeHomographyFromCorners(
  cornersPct: Array<{ x: number; y: number }>,
  videoWidth: number,
  videoHeight: number,
  dims: { length: number; width: number } = getFieldDimensions(),
): { H: Float64Array; Hinv: Float64Array } {
  try {
    // Esquinas del campo en el MISMO orden que FIELD_ANCHOR_PRESETS.full_corners
    // (TL, TR, BR, BL) pero con las dimensiones del formato elegido por el usuario.
    const { length: L, width: W } = dims;
    const formatCorners = [
      { field: { fx: 0, fy: 0 } },
      { field: { fx: L, fy: 0 } },
      { field: { fx: L, fy: W } },
      { field: { fx: 0, fy: W } },
    ];
    const calibrationPoints = cornersPct.map((c) => ({ x: c.x, y: c.y }));

    const anchors = buildAnchors(
      calibrationPoints,
      formatCorners,
      videoWidth,
      videoHeight,
    );

    const H = computeHomography(anchors);
    const Hinv = invertMatrix3x3(H);
    return { H, Hinv };
  } catch {
    // If homography computation fails, return identity
    return {
      H: identityHomography(),
      Hinv: identityHomography(),
    };
  }
}

// ─── Multi-frame calibration (enhanced accuracy) ────────────────────────────

/**
 * Detect field lines from multiple frames for improved accuracy.
 * Samples N frames across the video and merges detections.
 *
 * @param video - HTMLVideoElement with loaded video
 * @param numSamples - Number of frames to sample (default: 3)
 * @returns Best FieldDetectionResult from all samples
 */
export async function detectFieldLinesMultiFrame(
  video: HTMLVideoElement,
  numSamples: number = 3,
): Promise<FieldDetectionResult | null> {
  const results: FieldDetectionResult[] = [];

  for (let i = 0; i < numSamples; i++) {
    const seekPct = 0.1 + (i / numSamples) * 0.6; // Sample from 10% to 70%
    try {
      const imageData = await captureVideoFrame(video, seekPct);
      const result = await detectFieldLines(imageData);
      results.push(result);
    } catch {
      // Skip failed frames
    }
  }

  if (results.length === 0) return null;

  // Return the result with highest confidence
  return results.reduce((best, r) => (r.confidence > best.confidence ? r : best));
}
