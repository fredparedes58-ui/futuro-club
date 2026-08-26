/**
 * VITAS · Motivation Classifier (Sprint 22)
 *
 * Classifies motivation type from engagement + metrics + performance gaps.
 * 6 types: intrinsic_mastery, intrinsic_social, extrinsic_achievement,
 *          extrinsic_pressure, amotivation, mixed.
 *
 * Dropout risk by type: amotivation=90, extrinsic_pressure=70, etc.
 */

import type { EngagementSnapshot, PlayerDrillMetrics } from "../shared/sessionTypes";

// ─── Types ────────────────────────────────────────────────────────────────

export type MotivationType =
  | "intrinsic_mastery"      // loves improving skills
  | "intrinsic_social"       // loves team/friends
  | "extrinsic_achievement"  // driven by wins/goals
  | "extrinsic_pressure"     // parent/coach pressure
  | "amotivation"            // no clear motivation
  | "mixed";

export interface MotivationProfile {
  playerId: string;
  type: MotivationType;
  /** Dropout risk associated with this motivation type (0-100) */
  inherentDropoutRisk: number;
  /** Confidence in classification (0-1) */
  confidence: number;
  /** Signals used for classification */
  signals: {
    physicalEngagementAvg: number;
    socialEngagementAvg: number;
    emotionalEngagementAvg: number;
    intensityConsistency: number;
    trainingVsMatchGap: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────

const DROPOUT_RISK_BY_TYPE: Record<MotivationType, number> = {
  intrinsic_mastery: 15,
  intrinsic_social: 25,
  extrinsic_achievement: 40,
  mixed: 45,
  extrinsic_pressure: 70,
  amotivation: 90,
};

// ─── Main Function ───────────────────────────────────────────────────────

export function classifyMotivation(
  playerId: string,
  engagementHistory: EngagementSnapshot[],
  metricsHistory: PlayerDrillMetrics[],
  trainingVsMatchGap?: number,
): MotivationProfile {
  if (engagementHistory.length < 3) {
    return {
      playerId,
      type: "mixed",
      inherentDropoutRisk: DROPOUT_RISK_BY_TYPE.mixed,
      confidence: 0.3,
      signals: {
        physicalEngagementAvg: 50,
        socialEngagementAvg: 50,
        emotionalEngagementAvg: 50,
        intensityConsistency: 50,
        trainingVsMatchGap: 0,
      },
    };
  }

  const avg = (arr: number[]) => arr.length > 0
    ? arr.reduce((s, v) => s + v, 0) / arr.length
    : 0;

  const physAvg = avg(engagementHistory.map(e => e.physicalEngagement));
  const socAvg = avg(engagementHistory.map(e => e.socialEngagement));
  const emoAvg = avg(engagementHistory.map(e => e.emotionalEngagement));
  const compositeAvg = avg(engagementHistory.map(e => e.engagementScore));

  // Intensity consistency: std dev of intensity across sessions
  const intensities = metricsHistory.map(m => m.avgIntensity);
  const intMean = avg(intensities);
  const intStd = intensities.length > 1
    ? Math.sqrt(intensities.reduce((s, v) => s + (v - intMean) ** 2, 0) / intensities.length)
    : 20;
  const intensityConsistency = Math.max(0, 100 - intStd * 2);

  const gap = trainingVsMatchGap ?? 0;

  // ── Classification Logic ──
  let type: MotivationType;

  if (compositeAvg < 30) {
    type = "amotivation";
  } else if (physAvg > 65 && emoAvg > 60 && intensityConsistency > 70) {
    type = "intrinsic_mastery";
  } else if (socAvg > 65 && physAvg < 55) {
    type = "intrinsic_social";
  } else if (physAvg > 60 && emoAvg < 45 && gap > 15) {
    type = "extrinsic_pressure";
  } else if (emoAvg > 60 && gap < -10) {
    type = "extrinsic_achievement";
  } else {
    type = "mixed";
  }

  // Confidence based on signal clarity
  const maxDimension = Math.max(physAvg, socAvg, emoAvg);
  const minDimension = Math.min(physAvg, socAvg, emoAvg);
  const spread = maxDimension - minDimension;
  const confidence = Math.min(1, 0.4 + (spread / 100) * 0.6);

  return {
    playerId,
    type,
    inherentDropoutRisk: DROPOUT_RISK_BY_TYPE[type],
    confidence: Math.round(confidence * 100) / 100,
    signals: {
      physicalEngagementAvg: Math.round(physAvg),
      socialEngagementAvg: Math.round(socAvg),
      emotionalEngagementAvg: Math.round(emoAvg),
      intensityConsistency: Math.round(intensityConsistency),
      trainingVsMatchGap: gap,
    },
  };
}
