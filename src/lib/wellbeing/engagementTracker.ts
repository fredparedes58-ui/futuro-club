/**
 * VITAS · Engagement Tracker (Sprint 21)
 *
 * Calculates longitudinal engagement. Reuses engagementCalculator from Sprint 15.
 * Adds: trend over last 12 sessions, comparison with player's historical average.
 *
 * Input: PlayerDrillMetrics[] + EngagementSnapshot[] + PostureFatigueResult.
 * Output: EngagementSnapshot with trend.
 */

import type { EngagementSnapshot, PlayerDrillMetrics } from "@/lib/shared/sessionTypes";

// ─── Types ────────────────────────────────────────────────────────────────

export interface EngagementTrackerInput {
  playerId: string;
  sessionId: string;
  date: string;
  /** Current session metrics */
  currentMetrics: PlayerDrillMetrics[];
  /** Historical engagement snapshots (last 12 sessions) */
  historicalSnapshots: EngagementSnapshot[];
}

export interface LongitudinalEngagement extends EngagementSnapshot {
  /** Comparison vs player's own historical average */
  vsHistoricalAvg: number; // positive = above, negative = below
  /** Number of consecutive declining sessions */
  consecutiveDeclines: number;
  /** Alert level */
  alertLevel: "none" | "watch" | "concern" | "critical";
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function detectTrend(snapshots: EngagementSnapshot[]): "rising" | "stable" | "declining" {
  if (snapshots.length < 4) return "stable";
  const recent = snapshots.slice(-4);
  const older = snapshots.slice(-8, -4);
  if (older.length === 0) return "stable";

  const recentAvg = avg(recent.map(s => s.engagementScore));
  const olderAvg = avg(older.map(s => s.engagementScore));
  const delta = recentAvg - olderAvg;

  if (delta > 5) return "rising";
  if (delta < -5) return "declining";
  return "stable";
}

function countConsecutiveDeclines(snapshots: EngagementSnapshot[]): number {
  let count = 0;
  for (let i = snapshots.length - 1; i > 0; i--) {
    if (snapshots[i].engagementScore < snapshots[i - 1].engagementScore) {
      count++;
    } else {
      break;
    }
  }
  return count;
}

// ─── Main ────────────────────────────────────────────────────────────────

/**
 * Calculate longitudinal engagement for a player including trends and alerts.
 */
export function trackEngagement(input: EngagementTrackerInput): LongitudinalEngagement {
  const { playerId, sessionId, date, currentMetrics, historicalSnapshots } = input;

  // Calculate current session engagement using simple formula
  // (matches engagementCalculator.ts pattern from Sprint 15)
  const participationScores = currentMetrics.map(m => m.participationScore);
  const intensities = currentMetrics.map(m => m.avgIntensity);
  const centroids = currentMetrics.map(m => m.distanceToCentroidM);

  const physical = Math.min(100,
    avg(participationScores) * 0.5 + avg(intensities) * 0.5,
  );

  // Social: closer to centroid = more engaged. Invert distance.
  const avgCentroid = avg(centroids);
  const social = Math.min(100, Math.max(0, 100 - avgCentroid * 12));

  // Emotional: proxy from intensity maintenance + touch consistency
  const touchVariance = currentMetrics.length > 1
    ? Math.sqrt(currentMetrics.reduce((s, m) => s + (m.touches - avg(currentMetrics.map(x => x.touches))) ** 2, 0) / currentMetrics.length)
    : 10;
  const emotional = Math.min(100, Math.max(0,
    avg(intensities) * 0.6 + (100 - Math.min(100, touchVariance * 3)) * 0.4,
  ));

  const engagementScore = Math.round(physical * 0.4 + social * 0.3 + emotional * 0.3);

  // Historical comparison
  const historicalAvg = avg(historicalSnapshots.map(s => s.engagementScore));
  const vsHistoricalAvg = engagementScore - historicalAvg;

  // Trend
  const allSnapshots = [...historicalSnapshots, {
    playerId, sessionId, date,
    physicalEngagement: Math.round(physical),
    socialEngagement: Math.round(social),
    emotionalEngagement: Math.round(emotional),
    engagementScore,
    engagementTrend: "stable" as const,
    weeklyAvg: 0,
  }];
  const trend = detectTrend(allSnapshots);
  const weeklyAvg = avg(allSnapshots.slice(-4).map(s => s.engagementScore));
  const consecutiveDeclines = countConsecutiveDeclines(allSnapshots);

  // Alert level
  const alertLevel =
    consecutiveDeclines >= 4 || engagementScore < 25 ? "critical" :
    consecutiveDeclines >= 3 || engagementScore < 35 ? "concern" :
    consecutiveDeclines >= 2 || engagementScore < 45 ? "watch" :
    "none";

  return {
    playerId,
    sessionId,
    date,
    physicalEngagement: Math.round(physical),
    socialEngagement: Math.round(social),
    emotionalEngagement: Math.round(emotional),
    engagementScore,
    engagementTrend: trend,
    weeklyAvg: Math.round(weeklyAvg),
    vsHistoricalAvg: Math.round(vsHistoricalAvg),
    consecutiveDeclines,
    alertLevel,
  };
}
