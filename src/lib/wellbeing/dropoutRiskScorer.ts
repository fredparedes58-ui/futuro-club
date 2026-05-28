/**
 * VITAS · Dropout Risk Scorer (Sprint 22)
 *
 * Composite model with 8 weighted factors.
 * Factor `lowResilience` uses BehavioralScores.resilience if available
 * (optional chaining) — otherwise excluded and weight redistributed.
 *
 * 4 levels: low (<25), moderate (25-50), high (50-75), critical (>75).
 */

import type { BehavioralScores } from "@/lib/shared/sessionTypes";
import type { MotivationProfile } from "./motivationClassifier";
import type { OvertrainingAssessment } from "./overtrainingDetector";
import type { AttendanceProfile } from "./attendanceTracker";

// ─── Types ────────────────────────────────────────────────────────────────

export interface DropoutRiskInput {
  playerId: string;
  /** Engagement decline: 0 = stable, 100 = severe decline */
  engagementDecline: number;
  /** Motivation classification */
  motivation: MotivationProfile;
  /** Overtraining assessment */
  overtraining: OvertrainingAssessment;
  /** VSI stagnation: 0 = improving, 100 = stagnant/declining */
  vsiStagnation: number;
  /** Attendance profile */
  attendance: AttendanceProfile;
  /** Injury recurrence risk 0-100 */
  injuryRecurrence: number;
  /** PHV growth spurt stress 0-100 */
  growthSpurtStress: number;
  /** Behavioral scores (OPTIONAL — from BPE Sprint 17-19) */
  behavioralScores?: BehavioralScores | null;
}

export interface DropoutRiskOutput {
  playerId: string;
  /** Overall dropout risk 0-100 */
  riskScore: number;
  /** Risk level */
  riskLevel: "low" | "moderate" | "high" | "critical";
  /** Factor breakdown with individual scores */
  factors: {
    engagementDecline: { score: number; weight: number };
    motivationType: { score: number; weight: number };
    overtrainingRisk: { score: number; weight: number };
    vsiStagnation: { score: number; weight: number };
    attendanceDecline: { score: number; weight: number };
    injuryRecurrence: { score: number; weight: number };
    growthSpurtStress: { score: number; weight: number };
    lowResilience: { score: number; weight: number } | null;
  };
  /** Primary factor driving the risk */
  primaryFactor: string;
  /** Has BPE data available? */
  hasBehavioralData: boolean;
}

// ─── Base Weights ────────────────────────────────────────────────────────

const BASE_WEIGHTS = {
  engagementDecline: 0.25,
  motivationType: 0.20,
  overtrainingRisk: 0.15,
  vsiStagnation: 0.12,
  attendanceDecline: 0.10,
  injuryRecurrence: 0.08,
  growthSpurtStress: 0.05,
  lowResilience: 0.05,
};

// ─── Main Function ───────────────────────────────────────────────────────

export function scoreDropoutRisk(input: DropoutRiskInput): DropoutRiskOutput {
  const {
    playerId, engagementDecline, motivation, overtraining,
    vsiStagnation, attendance, injuryRecurrence, growthSpurtStress,
    behavioralScores,
  } = input;

  const hasBPE = behavioralScores !== null && behavioralScores !== undefined;

  // Resilience score: invert (high resilience = low dropout risk)
  const resilienceScore = hasBPE
    ? Math.max(0, 100 - (behavioralScores!.resilience ?? 50))
    : null;

  // If no BPE, redistribute resilience weight to engagement and motivation
  const weights = { ...BASE_WEIGHTS };
  if (resilienceScore === null) {
    weights.engagementDecline += weights.lowResilience * 0.6;
    weights.motivationType += weights.lowResilience * 0.4;
    weights.lowResilience = 0;
  }

  // Attendance score
  const attendanceScore = Math.max(0, 100 - attendance.rate);

  // Factor scores
  const factorScores = {
    engagementDecline,
    motivationType: motivation.inherentDropoutRisk,
    overtrainingRisk: overtraining.overtrainingRisk,
    vsiStagnation,
    attendanceDecline: attendanceScore,
    injuryRecurrence,
    growthSpurtStress,
    lowResilience: resilienceScore ?? 0,
  };

  // Weighted sum
  let riskScore = 0;
  for (const [key, weight] of Object.entries(weights)) {
    riskScore += (factorScores[key as keyof typeof factorScores] ?? 0) * weight;
  }
  riskScore = Math.round(Math.min(100, Math.max(0, riskScore)));

  // Risk level
  const riskLevel: "low" | "moderate" | "high" | "critical" =
    riskScore >= 75 ? "critical" :
    riskScore >= 50 ? "high" :
    riskScore >= 25 ? "moderate" :
    "low";

  // Primary factor
  const factorEntries = Object.entries(factorScores)
    .filter(([k]) => weights[k as keyof typeof weights] > 0)
    .map(([k, v]) => ({
      key: k,
      contribution: v * weights[k as keyof typeof weights],
    }))
    .sort((a, b) => b.contribution - a.contribution);

  const primaryFactor = factorEntries[0]?.key ?? "engagementDecline";

  return {
    playerId,
    riskScore,
    riskLevel,
    factors: {
      engagementDecline: { score: engagementDecline, weight: weights.engagementDecline },
      motivationType: { score: motivation.inherentDropoutRisk, weight: weights.motivationType },
      overtrainingRisk: { score: overtraining.overtrainingRisk, weight: weights.overtrainingRisk },
      vsiStagnation: { score: vsiStagnation, weight: weights.vsiStagnation },
      attendanceDecline: { score: attendanceScore, weight: weights.attendanceDecline },
      injuryRecurrence: { score: injuryRecurrence, weight: weights.injuryRecurrence },
      growthSpurtStress: { score: growthSpurtStress, weight: weights.growthSpurtStress },
      lowResilience: resilienceScore !== null
        ? { score: resilienceScore, weight: weights.lowResilience }
        : null,
    },
    primaryFactor,
    hasBehavioralData: hasBPE,
  };
}
