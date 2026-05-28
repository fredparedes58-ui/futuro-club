/**
 * VITAS · Mental Fatigue Curve (Sprint 19)
 *
 * Separates physical fatigue curve from cognitive fatigue curve
 * by analyzing performance in 15-minute segments.
 *
 * Input: FatigueWindowMetrics[] + DecisionSpeedProfile per segment + ScanningProfile per segment.
 * Output: mentalResistanceRatio (cognitive/physical decay).
 *   <0.5 = mental fortress, >1.5 = mental fragile
 */

import type { DecisionSpeedProfile, ScanningProfile } from "./types";

// ─── Input types (from fatigueEngine) ────────────────────────────────────

interface FatigueWindowMetrics {
  windowIndex: number;
  startMinute: number;
  endMinute: number;
  avgSpeedMs: number;
  maxSpeedMs: number;
  sprintCount: number;
  highIntensityDistanceM: number;
  distanceM: number;
}

export interface MentalFatigueCurveInput {
  /** Physical fatigue metrics per 15-min window */
  fatigueWindows: FatigueWindowMetrics[];
  /** Decision speed profiles per segment (parallel to fatigueWindows) */
  decisionSpeedBySegment: Array<{ segmentIndex: number; avgMs: number }>;
  /** Scanning profiles per segment (parallel to fatigueWindows) */
  scanningBySegment: Array<{ segmentIndex: number; scansPerMinute: number }>;
}

// ─── Output ──────────────────────────────────────────────────────────────

export interface MentalFatigueCurveResult {
  /** Physical decay rate (0-1, higher = more decay) */
  physicalDecayRate: number;
  /** Cognitive decay rate (0-1, higher = more decay) */
  cognitiveDecayRate: number;
  /** Ratio: cognitive / physical. <0.5 = mental fortress, >1.5 = mental fragile */
  mentalResistanceRatio: number;
  /** Per-segment breakdown */
  segments: SegmentBreakdown[];
  /** Mental fatigue score 0-100 (100 = no mental fatigue, 0 = severe) */
  mentalFatigueScore: number;
  /** Classification */
  category: "mental_fortress" | "balanced" | "mental_fragile";
}

interface SegmentBreakdown {
  segmentIndex: number;
  physicalPct: number;     // % of initial physical performance
  cognitivePct: number;    // % of initial cognitive performance
  decisionMs: number;
  scansPerMinute: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function linearDecay(values: number[]): number {
  if (values.length < 2) return 0;
  const first = values[0];
  const last = values[values.length - 1];
  if (first === 0) return 0;
  return Math.max(0, (first - last) / first);
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Compute mental fatigue curve separating physical from cognitive decay.
 */
export function computeMentalFatigueCurve(input: MentalFatigueCurveInput): MentalFatigueCurveResult {
  const { fatigueWindows, decisionSpeedBySegment, scanningBySegment } = input;

  if (fatigueWindows.length < 2) {
    return {
      physicalDecayRate: 0,
      cognitiveDecayRate: 0,
      mentalResistanceRatio: 1.0,
      segments: [],
      mentalFatigueScore: 75,
      category: "balanced",
    };
  }

  // Physical metrics per segment
  const physicalValues = fatigueWindows.map(w =>
    w.avgSpeedMs * 0.4 + w.sprintCount * 0.3 + w.highIntensityDistanceM * 0.3,
  );

  // Cognitive metrics per segment
  const decisionMap = new Map(decisionSpeedBySegment.map(d => [d.segmentIndex, d.avgMs]));
  const scanMap = new Map(scanningBySegment.map(s => [s.segmentIndex, s.scansPerMinute]));

  // Build cognitive values: inverse of decision time (faster = better) + scans
  const cognitiveValues: number[] = [];
  for (let i = 0; i < fatigueWindows.length; i++) {
    const decMs = decisionMap.get(i) ?? decisionMap.get(fatigueWindows[i].windowIndex) ?? 0;
    const scans = scanMap.get(i) ?? scanMap.get(fatigueWindows[i].windowIndex) ?? 0;

    // Normalize: inverse decision (lower ms = better), scans (higher = better)
    const decScore = decMs > 0 ? 1000 / decMs : 0; // invert and normalize
    const scanScore = scans;
    cognitiveValues.push(decScore * 0.6 + scanScore * 0.4);
  }

  // Calculate decay rates
  const physicalDecayRate = linearDecay(physicalValues);
  const cognitiveDecayRate = linearDecay(cognitiveValues);

  // Mental resistance ratio
  const mentalResistanceRatio = physicalDecayRate > 0.01
    ? cognitiveDecayRate / physicalDecayRate
    : cognitiveDecayRate > 0.1 ? 2.0 : 1.0;

  // Build segment breakdown
  const initialPhysical = physicalValues[0] || 1;
  const initialCognitive = cognitiveValues[0] || 1;

  const segments: SegmentBreakdown[] = fatigueWindows.map((w, i) => ({
    segmentIndex: w.windowIndex,
    physicalPct: Math.round((physicalValues[i] / initialPhysical) * 100),
    cognitivePct: Math.round(((cognitiveValues[i] || 0) / initialCognitive) * 100),
    decisionMs: decisionMap.get(i) ?? decisionMap.get(w.windowIndex) ?? 0,
    scansPerMinute: scanMap.get(i) ?? scanMap.get(w.windowIndex) ?? 0,
  }));

  // Mental fatigue score: 100 = no mental fatigue, 0 = severe
  // Low ratio = mental fortress = high score; high ratio = fragile = low score
  const mentalFatigueScore = Math.round(
    Math.max(0, Math.min(100, 100 - (mentalResistanceRatio - 0.5) * 50)),
  );

  // Classify
  const category: "mental_fortress" | "balanced" | "mental_fragile" =
    mentalResistanceRatio < 0.5 ? "mental_fortress" :
    mentalResistanceRatio <= 1.5 ? "balanced" :
    "mental_fragile";

  return {
    physicalDecayRate: Math.round(physicalDecayRate * 1000) / 1000,
    cognitiveDecayRate: Math.round(cognitiveDecayRate * 1000) / 1000,
    mentalResistanceRatio: Math.round(mentalResistanceRatio * 100) / 100,
    segments,
    mentalFatigueScore,
    category,
  };
}
