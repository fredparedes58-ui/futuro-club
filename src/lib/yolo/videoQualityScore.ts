/**
 * VITAS · Video Quality Score
 *
 * Continuous quality assessment per frame, aggregated per video.
 * The quality score drives a confidence factor that scales metrics —
 * low-quality video produces less certain physical measurements.
 */

import { computeSharpness } from "./blurDetector";

// ─── Types ───────────────────────────────────────────────────────────────────

/** Quality breakdown for a single frame. */
export interface FrameQuality {
  /** Sharpness score 0-100 from Laplacian variance */
  sharpness: number;
  /** Temporal stability 0-100 based on frame-to-frame pixel difference */
  stability: number;
  /** Mean keypoint confidence 0-100 */
  keypointConf: number;
  /** Lighting uniformity 0-100 based on histogram spread */
  lighting: number;
}

// ─── Constants ───────────────────────────────────────────────────────────────

/**
 * Weights for combining the four quality dimensions into a single score.
 * Sharpness and keypoint confidence matter most for tracking accuracy.
 */
const WEIGHTS = {
  sharpness: 0.30,
  stability: 0.20,
  keypointConf: 0.30,
  lighting: 0.20,
};

/** Minimum confidence factor — even terrible video gets 0.65x */
const MIN_CONFIDENCE = 0.65;
/** Maximum confidence factor — perfect video gets 1.0x */
const MAX_CONFIDENCE = 1.0;

// ─── Frame-level quality ─────────────────────────────────────────────────────

/**
 * Compute quality metrics for a single frame.
 *
 * @param imageData           Current frame pixel data
 * @param prevImageData       Previous frame pixel data (null for first frame)
 * @param keypointConfidences Array of keypoint confidence values (0-1) from YOLO
 * @returns                   Quality breakdown for this frame
 */
export function computeFrameQuality(
  imageData: ImageData,
  prevImageData: ImageData | null,
  keypointConfidences: number[],
): FrameQuality {
  const sharpness = computeSharpness(imageData);
  const stability = prevImageData
    ? computeStability(imageData, prevImageData)
    : 100; // first frame assumed stable
  const keypointConf = computeKeypointScore(keypointConfidences);
  const lighting = computeLightingScore(imageData);

  return { sharpness, stability, keypointConf, lighting };
}

/**
 * Compute temporal stability between two consecutive frames.
 *
 * Downsamples both frames and computes mean absolute pixel difference.
 * Small differences = stable camera, large = shaky or scene change.
 *
 * @returns Score 0-100 (100 = perfectly stable)
 */
function computeStability(current: ImageData, previous: ImageData): number {
  const { width, height, data: curData } = current;
  const prevData = previous.data;

  // Downsample: sample every 8th pixel for speed
  const step = 8;
  let totalDiff = 0;
  let count = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      // Grayscale diff
      const curGray = 0.299 * curData[idx] + 0.587 * curData[idx + 1] + 0.114 * curData[idx + 2];
      const prevGray = 0.299 * prevData[idx] + 0.587 * prevData[idx + 1] + 0.114 * prevData[idx + 2];
      totalDiff += Math.abs(curGray - prevGray);
      count++;
    }
  }

  if (count === 0) return 100;

  const meanDiff = totalDiff / count;
  // Map: 0 diff → 100 score, 50+ diff → 0 score
  const score = Math.max(0, 100 - meanDiff * 2);
  return Math.round(score);
}

/**
 * Compute mean keypoint confidence as a 0-100 score.
 *
 * @param confidences Array of confidence values (0-1)
 * @returns           Score 0-100
 */
function computeKeypointScore(confidences: number[]): number {
  if (confidences.length === 0) return 0;
  const mean = confidences.reduce((a, b) => a + b, 0) / confidences.length;
  return Math.round(Math.min(100, mean * 100));
}

/**
 * Compute lighting uniformity using grayscale histogram spread.
 *
 * A well-lit frame uses the full dynamic range (good spread).
 * Under/over-exposed frames cluster at extremes (poor spread).
 *
 * @returns Score 0-100 (100 = good, uniform lighting)
 */
function computeLightingScore(imageData: ImageData): number {
  const { width, height, data } = imageData;

  // Build 256-bin grayscale histogram (downsampled for speed)
  const histogram = new Uint32Array(256);
  const step = 4;
  let count = 0;

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const idx = (y * width + x) * 4;
      const gray = Math.round(
        0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
      );
      histogram[Math.min(255, Math.max(0, gray))]++;
      count++;
    }
  }

  if (count === 0) return 0;

  // Find effective range (5th to 95th percentile)
  const p5Target = count * 0.05;
  const p95Target = count * 0.95;
  let cumulative = 0;
  let p5 = 0;
  let p95 = 255;

  for (let i = 0; i < 256; i++) {
    cumulative += histogram[i];
    if (cumulative >= p5Target && p5 === 0) p5 = i;
    if (cumulative >= p95Target) {
      p95 = i;
      break;
    }
  }

  // Good lighting: range > 150 (uses most of 0-255)
  // Poor lighting: range < 50 (everything compressed)
  const range = p95 - p5;
  const score = Math.min(100, (range / 180) * 100);
  return Math.round(Math.max(0, score));
}

// ─── Video-level aggregation ─────────────────────────────────────────────────

/**
 * Aggregate per-frame quality scores into a single video quality score.
 *
 * Uses weighted average of each dimension, then combines them.
 * Outlier frames (bottom 10%) are excluded to avoid penalizing
 * occasional scene transitions.
 *
 * @param frameQualities Array of per-frame quality breakdowns
 * @returns              Overall video quality score 0-100
 */
export function computeVideoQualityScore(frameQualities: FrameQuality[]): number {
  if (frameQualities.length === 0) return 0;

  // Compute composite score per frame
  const composites = frameQualities.map(
    (fq) =>
      WEIGHTS.sharpness * fq.sharpness +
      WEIGHTS.stability * fq.stability +
      WEIGHTS.keypointConf * fq.keypointConf +
      WEIGHTS.lighting * fq.lighting,
  );

  // Trim bottom 10% outliers
  const sorted = [...composites].sort((a, b) => a - b);
  const trimStart = Math.floor(sorted.length * 0.1);
  const trimmed = sorted.slice(trimStart);

  if (trimmed.length === 0) return 0;

  const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
  return Math.round(Math.min(100, Math.max(0, avg)));
}

/**
 * Map a video quality score to a confidence scaling factor.
 *
 * High quality (80-100) → factor ~1.0 (trust metrics fully)
 * Low quality (0-20)    → factor ~0.65 (scale down confidence)
 *
 * @param qualityScore Video quality score 0-100
 * @returns            Confidence factor between 0.65 and 1.0
 */
export function qualityToConfidenceFactor(qualityScore: number): number {
  const clamped = Math.min(100, Math.max(0, qualityScore));
  // Linear mapping: 0 → MIN_CONFIDENCE, 100 → MAX_CONFIDENCE
  return MIN_CONFIDENCE + (clamped / 100) * (MAX_CONFIDENCE - MIN_CONFIDENCE);
}
