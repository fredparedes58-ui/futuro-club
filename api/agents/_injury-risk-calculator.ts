/**
 * VITAS · Injury Risk Calculator (Sprint 10)
 * POST /api/agents/injury-risk-calculator
 *
 * Deterministic model — NO LLM calls. Cost: $0.
 *
 * Combines existing data sources:
 *   - ACWR (from acwrService / fatigue_sessions)
 *   - Biomechanics injury risk + asymmetry (from biomechanicsEngine)
 *   - PHV growth window risk
 *   - Injury history
 *   - Fatigue severity
 *
 * Weights (based on literature: Hulin 2014, Gabbett 2016, Murray 2017):
 *   ACWR zone:       30%
 *   PHV window:      25%
 *   Asymmetry:       20%
 *   Injury history:  15%
 *   Fatigue severity: 10%
 *
 * Output: overallRisk 0-100, riskCategory, riskFactors[], recommendations[]
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const injuryRiskSchema = z.object({
  playerId: z.string(),
  age: z.number().min(6).max(25).optional(),
  phvOffset: z.number().nullable().optional(),
  phvCategory: z.string().nullable().optional(),

  // From ACWR (acwrService — already exists)
  acwrValue: z.number().nullable().optional(),
  acwrZone: z.enum(["undertrained", "optimal", "caution", "danger"]).nullable().optional(),

  // From fatigueEngine (already exists)
  fatigueIndex: z.number().min(0).max(100).nullable().optional(),
  fatigueSeverity: z.enum(["normal", "moderate", "high", "critical"]).nullable().optional(),

  // From biomechanicsEngine (already exists)
  biomechanicsInjuryRisk: z.number().min(0).max(100).nullable().optional(),
  asymmetryPct: z.number().min(0).max(100).nullable().optional(),

  // From player_injuries table (Sprint 9 migration)
  injuryHistory: z.array(z.object({
    type: z.string(),
    severity: z.string(),
    daysOut: z.number().nullable().optional(),
    date: z.string(),
    bodyPart: z.string().optional(),
  })).optional().default([]),

  daysSinceLastInjury: z.number().nullable().optional(),
  sessionsLast28Days: z.number().optional().default(0),
  matchesLast7Days: z.number().optional().default(0),
});

// ── Risk factor weights ─────────────────────────────────────────────────────

const WEIGHTS = {
  acwr: 0.30,
  phvWindow: 0.25,
  asymmetry: 0.20,
  injuryHistory: 0.15,
  fatigue: 0.10,
} as const;

// ── ACWR zone → risk score ──────────────────────────────────────────────────

function acwrRisk(zone: string | null, value: number | null): number {
  if (!zone && value == null) return 30; // Unknown → moderate baseline
  if (zone === "danger" || (value != null && value > 1.5)) return 95;
  if (zone === "caution" || (value != null && value > 1.3)) return 65;
  if (zone === "optimal") return 15;
  if (zone === "undertrained" || (value != null && value < 0.8)) return 45; // Spike risk
  return 30;
}

// ── PHV window → risk multiplier ────────────────────────────────────────────

function phvWindowRisk(
  offset: number | null,
  category: string | null,
  age: number | null,
): number {
  // PHV offset near 0 (± 0.5 years) = peak growth velocity = highest risk
  if (offset != null) {
    const absOffset = Math.abs(offset);
    if (absOffset <= 0.5) return 90;   // At PHV peak — maximum risk
    if (absOffset <= 1.0) return 70;   // Near PHV — high risk
    if (absOffset <= 1.5) return 50;   // Moderate risk zone
    if (absOffset <= 2.0) return 30;   // Lower risk
    return 15;                          // Far from PHV — baseline
  }

  // Fallback by category
  if (category === "circa" || category === "ontime") return 80;
  if (category === "early" || category === "pre") return 40;
  if (category === "late" || category === "post") return 20;

  // Fallback by age (crude estimate)
  if (age != null) {
    if (age >= 12 && age <= 14) return 60; // Common PHV range
    if (age >= 11 && age <= 15) return 40;
    return 20;
  }

  return 30; // Unknown
}

// ── Asymmetry risk ──────────────────────────────────────────────────────────

function asymmetryRisk(asymmetryPct: number | null, biomechRisk: number | null): number {
  const asymScore = asymmetryPct != null
    ? Math.min(100, asymmetryPct * 5)  // 20% asymmetry → 100 risk
    : 20;

  const biomScore = biomechRisk ?? 30;

  // Blend: 60% asymmetry, 40% biomech engine risk
  return Math.round(asymScore * 0.6 + biomScore * 0.4);
}

// ── Injury history risk ─────────────────────────────────────────────────────

function injuryHistoryRisk(
  injuries: Array<{ severity: string; daysOut?: number | null; date: string }>,
  daysSinceLast: number | null,
): number {
  if (injuries.length === 0) return 5; // No history → low baseline

  let score = 0;

  // Recency: recent injuries = higher risk
  if (daysSinceLast != null) {
    if (daysSinceLast < 30) score += 40;
    else if (daysSinceLast < 90) score += 25;
    else if (daysSinceLast < 180) score += 15;
    else score += 5;
  }

  // Frequency: more injuries = higher risk
  const recentInjuries = injuries.filter((i) => {
    const d = new Date(i.date);
    const monthsAgo = (Date.now() - d.getTime()) / (1000 * 60 * 60 * 24 * 30);
    return monthsAgo <= 12;
  });
  score += Math.min(30, recentInjuries.length * 10);

  // Severity: severe injuries have lasting impact
  const hasSevere = injuries.some((i) => i.severity === "severe");
  if (hasSevere) score += 20;
  const hasModeratePlus = injuries.some((i) => i.severity === "moderate" && (i.daysOut ?? 0) > 14);
  if (hasModeratePlus) score += 10;

  return Math.min(100, score);
}

// ── Fatigue risk ────────────────────────────────────────────────────────────

function fatigueRisk(severity: string | null, index: number | null): number {
  if (severity === "critical") return 90;
  if (severity === "high") return 70;
  if (severity === "moderate") return 45;
  if (index != null) return Math.min(100, index);
  return 15;
}

// ── Generate recommendations ────────────────────────────────────────────────

function generateRecommendations(
  riskCategory: string,
  factors: Array<{ factor: string; score: number }>,
): string[] {
  const recs: string[] = [];

  const topFactor = factors.sort((a, b) => b.score - a.score)[0];

  if (riskCategory === "critical") {
    recs.push("Reducir carga de entrenamiento al 50% durante esta semana");
    recs.push("Evaluacion medica preventiva recomendada");
  }

  if (riskCategory === "high" || riskCategory === "critical") {
    recs.push("Evitar sesiones de alta intensidad consecutivas");
    recs.push("Priorizar recuperacion activa (hidroterapia, estiramientos)");
  }

  if (topFactor?.factor === "acwr") {
    recs.push("El ratio de carga aguda/cronica esta elevado — moderar volumen");
  }

  if (topFactor?.factor === "phvWindow") {
    recs.push("Jugador en ventana de crecimiento — riesgo de lesion osea elevado");
    recs.push("Limitar sprints maximos y cambios de direccion bruscos");
  }

  if (topFactor?.factor === "asymmetry") {
    recs.push("Asimetria biomecanica detectada — trabajo correctivo bilateral recomendado");
  }

  if (topFactor?.factor === "injuryHistory") {
    recs.push("Historial de lesiones previas — protocolo de prevencion reforzado");
  }

  if (riskCategory === "low") {
    recs.push("Riesgo bajo — mantener plan de entrenamiento actual");
    recs.push("Continuar monitorizando ACWR semanalmente");
  }

  return recs.slice(0, 5);
}

// ── Main handler ────────────────────────────────────────────────────────────

export default withHandler(
  { schema: injuryRiskSchema, requireAuth: false, maxRequests: 200 },
  async ({ body }) => {
    const input = body as z.infer<typeof injuryRiskSchema>;

    // Calculate each factor
    const acwrScore = acwrRisk(input.acwrZone ?? null, input.acwrValue ?? null);
    const phvScore = phvWindowRisk(input.phvOffset ?? null, input.phvCategory ?? null, input.age ?? null);
    const asymScore = asymmetryRisk(input.asymmetryPct ?? null, input.biomechanicsInjuryRisk ?? null);
    const historyScore = injuryHistoryRisk(input.injuryHistory, input.daysSinceLastInjury ?? null);
    const fatigueScore = fatigueRisk(input.fatigueSeverity ?? null, input.fatigueIndex ?? null);

    // Weighted composite
    const overallRisk = Math.round(
      acwrScore * WEIGHTS.acwr +
      phvScore * WEIGHTS.phvWindow +
      asymScore * WEIGHTS.asymmetry +
      historyScore * WEIGHTS.injuryHistory +
      fatigueScore * WEIGHTS.fatigue,
    );

    const clampedRisk = Math.max(0, Math.min(100, overallRisk));

    // Categorize
    const riskCategory =
      clampedRisk >= 75 ? "critical" :
      clampedRisk >= 50 ? "high" :
      clampedRisk >= 30 ? "moderate" :
      "low";

    const riskFactors = [
      { factor: "acwr", weight: WEIGHTS.acwr, score: acwrScore, description: `ACWR zone: ${input.acwrZone ?? "unknown"} (ratio: ${input.acwrValue?.toFixed(2) ?? "N/A"})` },
      { factor: "phvWindow", weight: WEIGHTS.phvWindow, score: phvScore, description: `PHV offset: ${input.phvOffset?.toFixed(1) ?? "N/A"} (${input.phvCategory ?? "unknown"})` },
      { factor: "asymmetry", weight: WEIGHTS.asymmetry, score: asymScore, description: `Asimetria: ${input.asymmetryPct?.toFixed(1) ?? "N/A"}%` },
      { factor: "injuryHistory", weight: WEIGHTS.injuryHistory, score: historyScore, description: `${input.injuryHistory.length} lesiones registradas` },
      { factor: "fatigue", weight: WEIGHTS.fatigue, score: fatigueScore, description: `Fatiga: ${input.fatigueSeverity ?? "unknown"} (index: ${input.fatigueIndex?.toFixed(0) ?? "N/A"})` },
    ];

    const recommendations = generateRecommendations(riskCategory, riskFactors);

    // Cold-start detection
    const coldStartWarning = (input.sessionsLast28Days ?? 0) < 4;

    // Data points used for confidence
    let dataPoints = 0;
    if (input.acwrValue != null) dataPoints++;
    if (input.biomechanicsInjuryRisk != null) dataPoints++;
    if (input.asymmetryPct != null) dataPoints++;
    if (input.fatigueIndex != null) dataPoints++;
    if (input.phvOffset != null) dataPoints++;
    if (input.injuryHistory.length > 0) dataPoints++;
    dataPoints += input.sessionsLast28Days ?? 0;

    const confidenceLevel = Math.min(100, Math.round(
      (dataPoints >= 10 ? 40 : dataPoints * 4) +
      (coldStartWarning ? 0 : 30) +
      (input.injuryHistory.length > 0 ? 15 : 0) +
      (input.phvOffset != null ? 15 : 0),
    ));

    return successResponse({
      report: {
        playerId: input.playerId,
        overallRisk: clampedRisk,
        riskCategory,
        riskFactors: riskFactors.sort((a, b) => b.score - a.score),
        acuteChronicRatio: input.acwrValue ?? null,
        phvRiskMultiplier: phvScore / 50, // normalized around 1.0
        recommendations,
        returnToPlayReady: clampedRisk < 40 && (input.daysSinceLastInjury == null || input.daysSinceLastInjury > 14),
        confidenceLevel,
        dataPointsUsed: dataPoints,
        coldStartWarning,
      },
      promptVersion: "v1.0.0-deterministic",
    });
  },
);
