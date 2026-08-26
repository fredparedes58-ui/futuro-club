/**
 * VITAS · Engagement Calculator
 *
 * Calculates EngagementSnapshot from PlayerDrillMetrics[].
 * Three dimensions: physical, social, emotional engagement.
 *
 * CRITICAL: This output is the direct INPUT of the Burnout module (Sprint 21).
 * Changes to EngagementSnapshot structure require coordinated updates in:
 *   - src/lib/wellbeing/engagementTracker.ts (Sprint 21)
 *   - src/components/coaching/EngagementMiniCard.tsx (Sprint 16)
 *   - src/components/wellbeing/EngagementTimeline.tsx (Sprint 23)
 *
 * Sprint 15: Coaching Assistant — Analysis & Recommendations
 */

import type {
  PlayerDrillMetrics,
  EngagementSnapshot,
} from "@/lib/shared/sessionTypes";

// ─── Configuration ────────────────────────────────────────────────────────

interface EngagementConfig {
  /** Weight for physical engagement (default: 0.40) */
  physicalWeight: number;
  /** Weight for social engagement (default: 0.30) */
  socialWeight: number;
  /** Weight for emotional engagement (default: 0.30) */
  emotionalWeight: number;
  /** Max centroid distance for full social score (meters) (default: 5) */
  maxSocialDistanceM: number;
  /** Number of sessions for trend calculation (default: 4) */
  trendWindowSize: number;
}

const DEFAULT_CONFIG: EngagementConfig = {
  physicalWeight: 0.40,
  socialWeight: 0.30,
  emotionalWeight: 0.30,
  maxSocialDistanceM: 5,
  trendWindowSize: 4,
};

// ─── Composite (definición ÚNICA) ─────────────────────────────────────────

/**
 * Pesos canónicos del composite de engagement. Una sola definición
 * (invariante #7: un concepto se implementa una vez). La usan
 * `calculateEngagement`, el tracker longitudinal (`engagementTracker`) y la
 * entrada manual del entrenador (`EngagementLogForm`).
 */
export const ENGAGEMENT_WEIGHTS = {
  physical: 0.40,
  social: 0.30,
  emotional: 0.30,
} as const;

/**
 * Composite 0-100 a partir de las tres dimensiones (0-100). Sin defaults ni
 * relleno: es una media ponderada pura de lo que se le pase.
 */
export function compositeEngagement(
  physical: number,
  social: number,
  emotional: number,
  weights: { physical: number; social: number; emotional: number } = ENGAGEMENT_WEIGHTS,
): number {
  return Math.round(
    physical * weights.physical +
    social * weights.social +
    emotional * weights.emotional,
  );
}

// ─── Physical Engagement ──────────────────────────────────────────────────

/**
 * Physical engagement (0-100):
 * - participationScore relative to group
 * - intensity relative to own baseline
 * - active time vs idle time
 */
function calculatePhysicalEngagement(
  metrics: PlayerDrillMetrics[],
): number {
  if (metrics.length === 0) return 50;

  const avgParticipation =
    metrics.reduce((s, m) => s + m.participationScore, 0) / metrics.length;

  const avgIntensity =
    metrics.reduce((s, m) => s + m.avgIntensity, 0) / metrics.length;

  const avgIdlePct =
    metrics.reduce((s, m) => s + m.idlePct, 0) / metrics.length;

  // Participation (40%) + Intensity (35%) + Active time (25%)
  const activeScore = Math.max(0, 100 - avgIdlePct);
  const physical =
    avgParticipation * 0.40 +
    avgIntensity * 0.35 +
    activeScore * 0.25;

  return Math.round(Math.min(100, Math.max(0, physical)));
}

// ─── Social Engagement ────────────────────────────────────────────────────

/**
 * Social engagement (0-100):
 * - Distance to group centroid (closer = more social)
 * - Scan count (more scanning = more awareness of teammates)
 * - Consistency across drills (always near group vs sometimes isolated)
 */
function calculateSocialEngagement(
  metrics: PlayerDrillMetrics[],
  config: EngagementConfig,
): number {
  if (metrics.length === 0) return 50;

  // Proximity score: closer to centroid = higher score
  const avgCentroidDist =
    metrics.reduce((s, m) => s + m.distanceToCentroidM, 0) / metrics.length;
  const proximityScore = Math.max(
    0,
    100 * (1 - avgCentroidDist / (config.maxSocialDistanceM * 3)),
  );

  // Scanning score: more scans = more social awareness
  const avgScans =
    metrics.reduce((s, m) => s + m.scanCount, 0) / metrics.length;
  const scanScore = Math.min(100, avgScans * 15); // ~7 scans = 100

  // Consistency: low variance in centroid distance = consistently engaged
  const centroidVariance =
    metrics.length > 1
      ? metrics.reduce(
          (s, m) => s + (m.distanceToCentroidM - avgCentroidDist) ** 2,
          0,
        ) / metrics.length
      : 0;
  const consistencyScore = Math.max(0, 100 - centroidVariance * 5);

  const social =
    proximityScore * 0.50 +
    scanScore * 0.25 +
    consistencyScore * 0.25;

  return Math.round(Math.min(100, Math.max(0, social)));
}

// ─── Emotional Engagement ─────────────────────────────────────────────────

/**
 * Emotional engagement (0-100):
 * Proxy from observable behavior (no direct emotion detection):
 * - Speed after errors (maintain intensity = emotionally engaged)
 * - Participation consistency (don't drop off = staying motivated)
 * - Touch seeking (request ball = emotionally invested)
 *
 * Note: In Sprint 17+, the BPE will provide direct emotional signals
 * via gesture classification and posture energy analysis.
 */
function calculateEmotionalEngagement(
  metrics: PlayerDrillMetrics[],
): number {
  if (metrics.length === 0) return 50;

  // Intensity maintenance across drills (don't fade = emotional investment)
  const intensities = metrics.map((m) => m.avgIntensity);
  const firstHalf = intensities.slice(0, Math.ceil(intensities.length / 2));
  const secondHalf = intensities.slice(Math.ceil(intensities.length / 2));

  const avgFirst =
    firstHalf.reduce((s, v) => s + v, 0) / (firstHalf.length || 1);
  const avgSecond =
    secondHalf.reduce((s, v) => s + v, 0) / (secondHalf.length || 1);

  // Maintenance score: not dropping off = 100, big drop = 0
  const maintenanceRatio = avgFirst > 0 ? avgSecond / avgFirst : 1;
  const maintenanceScore = Math.min(100, maintenanceRatio * 80);

  // Touch seeking: requesting ball throughout session
  const touchConsistency =
    metrics.every((m) => m.touches > 0) ? 80 : metrics.filter((m) => m.touches > 0).length / metrics.length * 80;

  // Participation trend: increasing = excited, decreasing = disengaged
  const participations = metrics.map((m) => m.participationScore);
  const trend = participations.length > 1
    ? (participations[participations.length - 1] - participations[0]) / (participations.length - 1)
    : 0;
  const trendScore = 50 + Math.min(50, Math.max(-50, trend * 2));

  const emotional =
    maintenanceScore * 0.40 +
    touchConsistency * 0.30 +
    trendScore * 0.30;

  return Math.round(Math.min(100, Math.max(0, emotional)));
}

// ─── Trend Detection ──────────────────────────────────────────────────────

function detectTrend(
  currentScore: number,
  previousScores: number[],
): "rising" | "stable" | "declining" {
  if (previousScores.length < 2) return "stable";

  const recentAvg =
    previousScores.slice(-3).reduce((s, v) => s + v, 0) /
    Math.min(3, previousScores.length);

  const delta = currentScore - recentAvg;

  if (delta > 5) return "rising";
  if (delta < -5) return "declining";
  return "stable";
}

// ─── Main Calculator ──────────────────────────────────────────────────────

export interface EngagementInput {
  /** Per-drill metrics for the player in this session */
  playerMetrics: PlayerDrillMetrics[];
  playerId: string;
  sessionId: string;
  date: string;
  /** Previous engagement scores for trend calculation */
  previousSnapshots?: EngagementSnapshot[];
}

/**
 * Calculate engagement snapshot for a single player in a session.
 *
 * Formula:
 *   physical  = f(participationScore, intensityRelative, activePct)
 *   social    = f(distanceToCentroidM, scanCount, consistency)
 *   emotional = f(intensityMaintenance, touchConsistency, participationTrend)
 *   composite = weighted average (40% physical, 30% social, 30% emotional)
 */
export function calculateEngagement(
  input: EngagementInput,
  configOverrides?: Partial<EngagementConfig>,
): EngagementSnapshot {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const { playerMetrics, playerId, sessionId, date, previousSnapshots } = input;

  const physical = calculatePhysicalEngagement(playerMetrics);
  const social = calculateSocialEngagement(playerMetrics, config);
  const emotional = calculateEmotionalEngagement(playerMetrics);

  const composite = compositeEngagement(physical, social, emotional, {
    physical: config.physicalWeight,
    social: config.socialWeight,
    emotional: config.emotionalWeight,
  });

  // Calculate trend from previous snapshots
  const previousScores = (previousSnapshots ?? []).map((s) => s.engagementScore);
  const trend = detectTrend(composite, previousScores);

  // Weekly average (last 4 sessions including current)
  const recentScores = [...previousScores.slice(-(config.trendWindowSize - 1)), composite];
  const weeklyAvg = Math.round(
    recentScores.reduce((s, v) => s + v, 0) / recentScores.length,
  );

  return {
    playerId,
    sessionId,
    date,
    physicalEngagement: physical,
    socialEngagement: social,
    emotionalEngagement: emotional,
    engagementScore: composite,
    engagementTrend: trend,
    weeklyAvg,
  };
}

/**
 * Calculate engagement snapshots for all players in a session.
 * Batch convenience method.
 */
export function calculateTeamEngagement(
  allMetrics: PlayerDrillMetrics[],
  sessionId: string,
  date: string,
  previousByPlayer?: Map<string, EngagementSnapshot[]>,
): EngagementSnapshot[] {
  // Group metrics by player
  const byPlayer = new Map<string, PlayerDrillMetrics[]>();
  for (const m of allMetrics) {
    const existing = byPlayer.get(m.playerId) ?? [];
    existing.push(m);
    byPlayer.set(m.playerId, existing);
  }

  const snapshots: EngagementSnapshot[] = [];

  for (const [playerId, metrics] of byPlayer) {
    const previousSnapshots = previousByPlayer?.get(playerId) ?? [];
    snapshots.push(
      calculateEngagement({
        playerMetrics: metrics,
        playerId,
        sessionId,
        date,
        previousSnapshots,
      }),
    );
  }

  return snapshots;
}
