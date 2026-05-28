/**
 * VITAS · Clutch Detector (Sprint 18)
 *
 * Compares performance under high vs low pressure.
 * Input: LinkedEvent[] + PressureContext[] segmented by match quarters.
 * Output: ClutchProfile with overallClutchFactor (>1.0 = thrives under pressure).
 */

import type { LinkedEvent, PressureContext } from "./types";

// ─── Output ──────────────────────────────────────────────────────────────

export interface ClutchProfile {
  trackId: number;
  /** Overall clutch factor: >1.0 = better under pressure, <1.0 = worse */
  overallClutchFactor: number;
  /** Clutch factor per metric */
  metricFactors: {
    decisionSpeed: number;
    successRate: number;
    scanning: number;
    ballRetention: number;
  };
  /** Performance by quarter (for heatmap visualization) */
  quarterPerformance: QuarterPerformance[];
  /** Number of high-pressure events analyzed */
  highPressureEvents: number;
  /** Number of low-pressure events analyzed */
  lowPressureEvents: number;
  /** Classification */
  category: "clutch_player" | "consistent" | "pressure_sensitive";
}

interface QuarterPerformance {
  quarter: 1 | 2 | 3 | 4;
  avgDecisionMs: number;
  successRate: number;
  eventCount: number;
  avgPressure: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const HIGH_PRESSURE_THRESHOLD = 60;
const LOW_PRESSURE_THRESHOLD = 30;

// ─── Helpers ─────────────────────────────────────────────────────────────

function avgArr(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function assignQuarter(eventMs: number, matchDurationMs: number): 1 | 2 | 3 | 4 {
  const pct = eventMs / matchDurationMs;
  if (pct < 0.25) return 1;
  if (pct < 0.5) return 2;
  if (pct < 0.75) return 3;
  return 4;
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Detect clutch performance for a specific player.
 */
export function detectClutch(
  events: LinkedEvent[],
  trackId: number,
  matchDurationMs?: number,
): ClutchProfile {
  const playerEvents = events.filter(e => e.trackId === trackId && e.confidence >= 0.4);

  if (playerEvents.length < 3) {
    return {
      trackId,
      overallClutchFactor: 1.0,
      metricFactors: { decisionSpeed: 1.0, successRate: 1.0, scanning: 1.0, ballRetention: 1.0 },
      quarterPerformance: [],
      highPressureEvents: 0,
      lowPressureEvents: 0,
      category: "consistent",
    };
  }

  // Split by pressure
  const highPressure = playerEvents.filter(e => e.pressureLevel > HIGH_PRESSURE_THRESHOLD);
  const lowPressure = playerEvents.filter(e => e.pressureLevel < LOW_PRESSURE_THRESHOLD);

  // Decision speed factor: ratio of low-pressure avg / high-pressure avg
  // >1.0 means faster decisions under pressure
  const avgHighDecision = avgArr(highPressure.map(e => e.decisionTimeMs));
  const avgLowDecision = avgArr(lowPressure.map(e => e.decisionTimeMs));
  const decisionSpeedFactor = avgHighDecision > 0 && avgLowDecision > 0
    ? avgLowDecision / avgHighDecision
    : 1.0;

  // Success rate factor
  const highSuccessRate = highPressure.length > 0
    ? highPressure.filter(e => e.outcome === "successful").length / highPressure.length
    : 0.5;
  const lowSuccessRate = lowPressure.length > 0
    ? lowPressure.filter(e => e.outcome === "successful").length / lowPressure.length
    : 0.5;
  const successRateFactor = lowSuccessRate > 0
    ? highSuccessRate / lowSuccessRate
    : 1.0;

  // Ball retention: dribble/reception success under pressure
  const retentionActions = ["dribble", "reception", "turn"];
  const highRetention = highPressure.filter(e => retentionActions.includes(e.actionType));
  const lowRetention = lowPressure.filter(e => retentionActions.includes(e.actionType));
  const highRetRate = highRetention.length > 0
    ? highRetention.filter(e => e.outcome === "successful").length / highRetention.length
    : 0.5;
  const lowRetRate = lowRetention.length > 0
    ? lowRetention.filter(e => e.outcome === "successful").length / lowRetention.length
    : 0.5;
  const ballRetentionFactor = lowRetRate > 0 ? highRetRate / lowRetRate : 1.0;

  // Scanning factor placeholder (enriched when scanning data available)
  const scanningFactor = 1.0;

  // Overall clutch factor: weighted average
  const overallClutchFactor =
    decisionSpeedFactor * 0.30 +
    successRateFactor * 0.35 +
    ballRetentionFactor * 0.25 +
    scanningFactor * 0.10;

  // Quarter performance
  const duration = matchDurationMs ??
    (playerEvents.length > 1
      ? playerEvents[playerEvents.length - 1].executionMs - playerEvents[0].receptionMs
      : 90 * 60 * 1000);

  const firstEventMs = playerEvents[0]?.receptionMs ?? 0;
  const quarterPerformance: QuarterPerformance[] = ([1, 2, 3, 4] as const).map(q => {
    const qEvents = playerEvents.filter(
      e => assignQuarter(e.receptionMs - firstEventMs, duration) === q,
    );
    return {
      quarter: q,
      avgDecisionMs: Math.round(avgArr(qEvents.map(e => e.decisionTimeMs))),
      successRate: qEvents.length > 0
        ? Math.round((qEvents.filter(e => e.outcome === "successful").length / qEvents.length) * 100) / 100
        : 0,
      eventCount: qEvents.length,
      avgPressure: Math.round(avgArr(qEvents.map(e => e.pressureLevel))),
    };
  });

  // Classify
  const category: "clutch_player" | "consistent" | "pressure_sensitive" =
    overallClutchFactor >= 1.1 ? "clutch_player" :
    overallClutchFactor >= 0.85 ? "consistent" :
    "pressure_sensitive";

  return {
    trackId,
    overallClutchFactor: Math.round(overallClutchFactor * 100) / 100,
    metricFactors: {
      decisionSpeed: Math.round(decisionSpeedFactor * 100) / 100,
      successRate: Math.round(successRateFactor * 100) / 100,
      scanning: Math.round(scanningFactor * 100) / 100,
      ballRetention: Math.round(ballRetentionFactor * 100) / 100,
    },
    quarterPerformance,
    highPressureEvents: highPressure.length,
    lowPressureEvents: lowPressure.length,
    category,
  };
}
