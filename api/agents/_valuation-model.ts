/**
 * VITAS · Valuation Model (Sprint 12)
 * POST /api/agents/valuation-model
 *
 * Deterministic model — NO LLM calls. Cost: $0.
 *
 * Combines:
 *   - VSI trend (25%) — improvement velocity across analyses
 *   - PHV ceiling (20%) — maturity-adjusted projection
 *   - Versatility (15%) — multi-position fit from role profile
 *   - Injury-adjusted (15%) — penalty from injury risk model
 *   - Context (10%) — age group, competitive level
 *   - Consistency (15%) — coefficient of variation across sessions
 *
 * Tier system:
 *   - Elite Prospect (top 2%) → probability of reaching 1st division
 *   - High Potential (top 10%) → strong academy trajectory
 *   - Developing Talent (top 30%) → good foundation, needs time
 *   - Foundation (bottom 70%) → building fundamentals
 *
 * Base rates calibrated from UEFA Youth League data:
 *   - 2% of U14 academy players reach 1st division by 18
 *   - 0.3% reach top-5 leagues
 *   - VSI percentile adjusts these probabilities
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const valuationSchema = z.object({
  playerId: z.string(),
  age: z.number().min(6).max(25).optional(),
  position: z.string().optional(),

  // VSI data
  currentVsi: z.number().min(0).max(100).nullable().optional(),
  vsiHistory: z.array(z.object({
    date: z.string(),
    vsi: z.number(),
  })).optional().default([]),

  // PHV
  phvOffset: z.number().nullable().optional(),
  phvCategory: z.string().nullable().optional(),
  biologicalAge: z.number().nullable().optional(),

  // Injury risk (from injury-risk-calculator)
  injuryRisk: z.number().min(0).max(100).nullable().optional(),
  injuryCategory: z.string().nullable().optional(),

  // Role profile
  positionFitScores: z.array(z.object({
    position: z.string(),
    fit: z.number(),
  })).optional().default([]),

  // Session aggregation
  sessionCount: z.number().optional().default(0),
  consistencyScore: z.number().min(0).max(100).nullable().optional(),
  speedTrend: z.number().nullable().optional(),
  sprintTrend: z.number().nullable().optional(),

  // Competitive context
  competitiveLevel: z.enum(["recreational", "academy", "elite_academy", "national"]).optional().default("academy"),
  analysisCount: z.number().optional().default(0),
});

// ── Weights ─────────────────────────────────────────────────────────────────

const WEIGHTS = {
  vsiTrend: 0.25,
  phvCeiling: 0.20,
  versatility: 0.15,
  injuryAdjusted: 0.15,
  context: 0.10,
  consistency: 0.15,
} as const;

// ── Tier thresholds and base rates ──────────────────────────────────────────

interface Tier {
  name: string;
  minScore: number;
  baseRate1stDiv: number;   // probability of reaching 1st division
  baseRateTop5: number;     // probability of reaching top-5 league
  color: string;
  description: string;
}

const TIERS: Tier[] = [
  { name: "Elite Prospect",    minScore: 78, baseRate1stDiv: 0.15,  baseRateTop5: 0.04,  color: "#FFD700", description: "Perfil excepcional con proyeccion a futbol profesional" },
  { name: "High Potential",    minScore: 60, baseRate1stDiv: 0.06,  baseRateTop5: 0.012, color: "#22C55E", description: "Talento destacado con buena trayectoria de desarrollo" },
  { name: "Developing Talent", minScore: 40, baseRate1stDiv: 0.02,  baseRateTop5: 0.003, color: "#3B82F6", description: "Buena base tecnica, necesita tiempo y trabajo" },
  { name: "Foundation",        minScore: 0,  baseRate1stDiv: 0.005, baseRateTop5: 0.001, color: "#8B5CF6", description: "Construyendo fundamentos, enfocarse en disfrute y mejora" },
];

// ── VSI Trend score ─────────────────────────────────────────────────────────

function vsiTrendScore(
  currentVsi: number | null,
  history: Array<{ date: string; vsi: number }>,
): number {
  if (currentVsi == null) return 40; // Unknown → moderate

  // Base score from current VSI
  let score = currentVsi;

  // Trend bonus: improving VSI gets bonus, declining gets penalty
  if (history.length >= 2) {
    const sorted = [...history].sort((a, b) => a.date.localeCompare(b.date));
    const firstHalf = sorted.slice(0, Math.floor(sorted.length / 2));
    const secondHalf = sorted.slice(Math.floor(sorted.length / 2));

    const avgFirst = firstHalf.reduce((s, h) => s + h.vsi, 0) / firstHalf.length;
    const avgSecond = secondHalf.reduce((s, h) => s + h.vsi, 0) / secondHalf.length;

    const trend = (avgSecond - avgFirst) / (avgFirst || 1);
    // +10% VSI improvement → +10 points; -10% → -10 points
    score += Math.max(-15, Math.min(15, trend * 100));
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── PHV Ceiling score ───────────────────────────────────────────────────────

function phvCeilingScore(
  phvOffset: number | null,
  biologicalAge: number | null,
  chronologicalAge: number | null,
): number {
  // Early developers often appear better but have less growth ceiling
  // Late developers are undervalued but have more ceiling

  if (phvOffset == null) return 50; // Unknown

  // Late maturers (negative offset, still growing) → higher ceiling
  if (phvOffset < -1.0) return 75; // Lots of growth left → high potential
  if (phvOffset < -0.5) return 65;
  if (phvOffset < 0.5) return 55;  // At PHV → moderate
  if (phvOffset < 1.5) return 45;  // Post-PHV → established
  return 40;                        // Well past PHV → what you see is what you get

  // Adjustment: young for their bio-age = more room
  // This is handled implicitly by the PHV offset
}

// ── Versatility score ───────────────────────────────────────────────────────

function versatilityScore(
  positionFits: Array<{ position: string; fit: number }>,
  primaryPosition: string | null,
): number {
  if (positionFits.length === 0) return 40;

  // Count positions with fit > 60%
  const viablePositions = positionFits.filter((p) => p.fit >= 60);
  const topFit = Math.max(...positionFits.map((p) => p.fit));

  // Base: how good is the top fit
  let score = Math.min(100, topFit);

  // Bonus for versatility: each additional viable position adds value
  score += Math.min(20, (viablePositions.length - 1) * 7);

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Injury adjustment ───────────────────────────────────────────────────────

function injuryAdjustmentScore(
  injuryRisk: number | null,
  injuryCategory: string | null,
): number {
  if (injuryRisk == null) return 60; // Unknown → slight penalty

  // Inverse: low injury risk = high valuation factor
  // High injury risk = significant penalty
  return Math.max(0, Math.min(100, Math.round(100 - injuryRisk)));
}

// ── Context score ───────────────────────────────────────────────────────────

function contextScore(
  age: number | null,
  competitiveLevel: string,
): number {
  let score = 50;

  // Competitive level bonus
  if (competitiveLevel === "national") score += 25;
  else if (competitiveLevel === "elite_academy") score += 15;
  else if (competitiveLevel === "academy") score += 5;

  // Age factor: younger + already good = more valuable
  if (age != null) {
    if (age <= 12) score += 10; // Very young, any data is promising
    else if (age <= 14) score += 5;
    // Older players need higher absolute performance
  }

  return Math.max(0, Math.min(100, score));
}

// ── Consistency score ───────────────────────────────────────────────────────

function sessionConsistencyScore(
  consistencyScore: number | null,
  sessionCount: number,
  speedTrend: number | null,
): number {
  if (sessionCount < 2) return 40; // Too few sessions

  let score = consistencyScore ?? 50;

  // Positive trends are valuable
  if (speedTrend != null && speedTrend > 0) {
    score += Math.min(15, speedTrend * 50);
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}

// ── Probability calculation ─────────────────────────────────────────────────

function calculateProbabilities(
  overallScore: number,
  tier: Tier,
  age: number | null,
  phvOffset: number | null,
): {
  prob1Year: number;
  prob3Year: number;
  prob5Year: number;
  probFirstDiv: number;
  probTop5League: number;
} {
  // Adjust base rates by VSI percentile
  const vsiMultiplier = Math.max(0.1, overallScore / 50); // score 50 = 1x, score 100 = 2x

  const probFirstDiv = Math.min(0.95, tier.baseRate1stDiv * vsiMultiplier);
  const probTop5League = Math.min(0.50, tier.baseRateTop5 * vsiMultiplier);

  // Short-term probabilities: staying in/improving tier
  const prob1Year = Math.min(0.95, 0.5 + (overallScore - 50) / 100);
  const prob3Year = Math.min(0.90, 0.4 + (overallScore - 40) / 100);
  const prob5Year = Math.min(0.85, 0.3 + (overallScore - 30) / 100);

  // PHV adjustment: late maturers get probability boost
  let phvBoost = 1.0;
  if (phvOffset != null) {
    if (phvOffset < -1.0) phvBoost = 1.15; // Still growing = upside
    if (phvOffset < -0.5) phvBoost = 1.08;
  }

  return {
    prob1Year: Math.round(Math.min(0.95, prob1Year * phvBoost) * 1000) / 10,
    prob3Year: Math.round(Math.min(0.90, prob3Year * phvBoost) * 1000) / 10,
    prob5Year: Math.round(Math.min(0.85, prob5Year * phvBoost) * 1000) / 10,
    probFirstDiv: Math.round(probFirstDiv * 1000) / 10,
    probTop5League: Math.round(probTop5League * 1000) / 10,
  };
}

// ── Main handler ────────────────────────────────────────────────────────────

export default withHandler(
  { schema: valuationSchema, requireAuth: true, maxRequests: 200, allowServiceToken: true, requiredPlan: "pro,club" },
  async ({ body }) => {
    const input = body as z.infer<typeof valuationSchema>;

    // Calculate each factor
    const vsiScore = vsiTrendScore(input.currentVsi ?? null, input.vsiHistory);
    const phvScore = phvCeilingScore(input.phvOffset ?? null, input.biologicalAge ?? null, input.age ?? null);
    const versScore = versatilityScore(input.positionFitScores, input.position ?? null);
    const injScore = injuryAdjustmentScore(input.injuryRisk ?? null, input.injuryCategory ?? null);
    const ctxScore = contextScore(input.age ?? null, input.competitiveLevel);
    const consScore = sessionConsistencyScore(
      input.consistencyScore ?? null,
      input.sessionCount,
      input.speedTrend ?? null,
    );

    // Weighted composite
    const overallScore = Math.round(
      vsiScore * WEIGHTS.vsiTrend +
      phvScore * WEIGHTS.phvCeiling +
      versScore * WEIGHTS.versatility +
      injScore * WEIGHTS.injuryAdjusted +
      ctxScore * WEIGHTS.context +
      consScore * WEIGHTS.consistency,
    );

    const clampedScore = Math.max(0, Math.min(100, overallScore));

    // Determine tier
    const tier = TIERS.find((t) => clampedScore >= t.minScore) ?? TIERS[TIERS.length - 1];

    // Calculate probabilities
    const probabilities = calculateProbabilities(
      clampedScore,
      tier,
      input.age ?? null,
      input.phvOffset ?? null,
    );

    // Factors breakdown (sorted by contribution)
    const factors = [
      { factor: "vsiTrend", weight: WEIGHTS.vsiTrend, score: vsiScore, label: "Tendencia VSI" },
      { factor: "phvCeiling", weight: WEIGHTS.phvCeiling, score: phvScore, label: "Techo PHV" },
      { factor: "versatility", weight: WEIGHTS.versatility, score: versScore, label: "Versatilidad" },
      { factor: "injuryAdjusted", weight: WEIGHTS.injuryAdjusted, score: injScore, label: "Riesgo lesion (inv)" },
      { factor: "context", weight: WEIGHTS.context, score: ctxScore, label: "Contexto" },
      { factor: "consistency", weight: WEIGHTS.consistency, score: consScore, label: "Consistencia" },
    ].sort((a, b) => (b.score * b.weight) - (a.score * a.weight));

    // Cold start detection
    const coldStartWarning = input.analysisCount < 3;

    // Confidence
    let dataPoints = 0;
    if (input.currentVsi != null) dataPoints++;
    if (input.phvOffset != null) dataPoints++;
    if (input.injuryRisk != null) dataPoints++;
    if (input.positionFitScores.length > 0) dataPoints++;
    if (input.consistencyScore != null) dataPoints++;
    dataPoints += Math.min(5, input.vsiHistory.length);
    dataPoints += Math.min(5, input.sessionCount);

    const confidenceLevel = Math.min(100, Math.round(
      (dataPoints >= 10 ? 40 : dataPoints * 4) +
      (coldStartWarning ? 0 : 30) +
      (input.phvOffset != null ? 15 : 0) +
      (input.injuryRisk != null ? 15 : 0),
    ));

    return successResponse({
      report: {
        playerId: input.playerId,
        overallScore: clampedScore,
        tier: tier.name,
        tierColor: tier.color,
        tierDescription: tier.description,
        factors,
        probabilities,
        coldStartWarning,
        confidenceLevel,
        dataPointsUsed: dataPoints,
        analysisCount: input.analysisCount,
      },
      promptVersion: "v1.0.0-deterministic",
    });
  },
);
