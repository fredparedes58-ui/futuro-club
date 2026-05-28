/**
 * VITAS · Decision Speed Detector (Sprint 17)
 *
 * Measures milliseconds between reception and execution.
 * Input: LinkedEvent[] + PressureContext[].
 * Output: DecisionSpeedProfile with avgMs, avgMsUnderPressure,
 *         percentileForAge (from PERFORMANCE_BENCHMARKS).
 *
 * Tolerance: ±200ms (video from phone is not frame-perfect).
 */

import type { LinkedEvent, DecisionSpeedProfile, DetectorConfig } from "./types";
import { DEFAULT_DETECTOR_CONFIG } from "./types";

// ─── Age-based benchmarks (from performanceBenchmarks.ts) ────────────────

/** Decision speed benchmarks by age — milliseconds for "good" and "elite" */
const BENCHMARKS_MS: Record<string, { goodMs: number; eliteMs: number }> = {
  "sub-10":  { goodMs: 3500, eliteMs: 3000 },
  "sub-12":  { goodMs: 2500, eliteMs: 2000 },
  "sub-14":  { goodMs: 2000, eliteMs: 1500 },
  "sub-16":  { goodMs: 1500, eliteMs: 1000 },
  "sub-18":  { goodMs: 1500, eliteMs: 1000 },
  "adult":   { goodMs: 1000, eliteMs: 500 },
};

function getAgeGroup(age: number): string {
  if (age < 10) return "sub-10";
  if (age < 12) return "sub-12";
  if (age < 14) return "sub-14";
  if (age < 16) return "sub-16";
  if (age < 18) return "sub-18";
  return "adult";
}

/**
 * Estimate percentile based on average decision time vs age benchmarks.
 * Returns 0-100 where higher = faster (better).
 */
function estimatePercentile(avgMs: number, age: number): number {
  const group = getAgeGroup(age);
  const bench = BENCHMARKS_MS[group] ?? BENCHMARKS_MS["sub-14"];

  // Linear interpolation: elite = 95th percentile, good = 60th, 2x good = 10th
  if (avgMs <= bench.eliteMs) return Math.min(99, 90 + (bench.eliteMs - avgMs) / bench.eliteMs * 10);
  if (avgMs <= bench.goodMs) {
    const range = bench.goodMs - bench.eliteMs;
    const pos = (bench.goodMs - avgMs) / range;
    return 60 + pos * 30; // 60-90 range
  }
  // Slower than "good"
  const slowRatio = avgMs / bench.goodMs;
  return Math.max(1, 60 - (slowRatio - 1) * 40);
}

function median(arr: number[]): number {
  if (arr.length === 0) return 0;
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[mid - 1] + sorted[mid]) / 2
    : sorted[mid];
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = arr.reduce((s, v) => s + v, 0) / arr.length;
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Analyze decision speed for a specific player from linked events.
 */
export function detectDecisionSpeed(
  events: LinkedEvent[],
  trackId: number,
  config: Partial<DetectorConfig> = {},
): DecisionSpeedProfile {
  const cfg = { ...DEFAULT_DETECTOR_CONFIG, ...config };

  // Filter events for this player with sufficient confidence
  const playerEvents = events.filter(
    e => e.trackId === trackId && e.confidence >= cfg.minConfidence,
  );

  if (playerEvents.length === 0) {
    return {
      trackId,
      avgMs: 0,
      medianMs: 0,
      avgMsUnderPressure: 0,
      avgMsLowPressure: 0,
      percentileForAge: 50,
      sampleCount: 0,
      decisions: [],
      consistencyScore: 50,
    };
  }

  // Extract decision times
  const decisions = playerEvents.map(e => ({
    decisionTimeMs: e.decisionTimeMs,
    pressureLevel: e.pressureLevel,
    outcome: e.outcome,
    actionType: e.actionType,
  }));

  const times = decisions.map(d => d.decisionTimeMs);

  // Apply tolerance: clamp extreme outliers (>2σ from mean)
  const mean = times.reduce((s, v) => s + v, 0) / times.length;
  const sd = stdDev(times);
  const filteredTimes = sd > 0
    ? times.filter(t => Math.abs(t - mean) <= 2 * sd + cfg.temporalToleranceMs)
    : times;

  const avgMs = filteredTimes.length > 0
    ? filteredTimes.reduce((s, v) => s + v, 0) / filteredTimes.length
    : mean;

  // Split by pressure
  const highPressure = decisions.filter(d => d.pressureLevel > 60);
  const lowPressure = decisions.filter(d => d.pressureLevel < 30);

  const avgMsUnderPressure = highPressure.length > 0
    ? highPressure.reduce((s, d) => s + d.decisionTimeMs, 0) / highPressure.length
    : avgMs;

  const avgMsLowPressure = lowPressure.length > 0
    ? lowPressure.reduce((s, d) => s + d.decisionTimeMs, 0) / lowPressure.length
    : avgMs;

  // Consistency: lower std deviation → higher score (0-100)
  const sd2 = stdDev(filteredTimes);
  const consistencyScore = Math.max(0, Math.min(100,
    100 - (sd2 / (avgMs || 1)) * 100,
  ));

  return {
    trackId,
    avgMs: Math.round(avgMs),
    medianMs: Math.round(median(filteredTimes)),
    avgMsUnderPressure: Math.round(avgMsUnderPressure),
    avgMsLowPressure: Math.round(avgMsLowPressure),
    percentileForAge: Math.round(estimatePercentile(avgMs, cfg.playerAge)),
    sampleCount: decisions.length,
    decisions,
    consistencyScore: Math.round(consistencyScore),
  };
}

/**
 * Analyze decision speed for all players in events.
 */
export function detectAllDecisionSpeeds(
  events: LinkedEvent[],
  config: Partial<DetectorConfig> = {},
): DecisionSpeedProfile[] {
  const trackIds = [...new Set(events.map(e => e.trackId))];
  return trackIds.map(id => detectDecisionSpeed(events, id, config));
}
