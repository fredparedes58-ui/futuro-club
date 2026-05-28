/**
 * VITAS · Dropout Risk Endpoint (Sprint 22)
 * GET /api/wellbeing/dropout-risk?playerId=xxx
 *
 * Computes dropout risk on-demand by reading engagement_snapshots,
 * fatigue_sessions, attendance_records, behavioral_profiles (if exists),
 * and questionnaires → runs dropout scorer → persists in dropout_risk_assessments.
 *
 * Falls back to mock data when Supabase is not configured.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const dropoutRiskQuerySchema = z.object({
  playerId: z.string().min(1, "playerId is required"),
});

export default withHandler(
  { method: "GET", requireAuth: false, maxRequests: 60 },
  async ({ query }) => {
    const parsed = dropoutRiskQuerySchema.safeParse(query);
    if (!parsed.success) {
      return errorResponse("playerId query parameter required", 400);
    }

    const { playerId } = parsed.data;

    // In production, this would read from Supabase tables:
    // - engagement_snapshots → compute engagementDecline
    // - fatigue_sessions + acwr → compute overtraining
    // - attendance_records → compute attendanceDecline
    // - behavioral_profiles → get resilience (optional)
    // - wellbeing_questionnaires → supplement data
    // Then run scoreDropoutRisk() and generateIntervention()

    // For now, return mock assessment
    const mockAssessment = generateMockAssessment(playerId);

    return successResponse({
      assessment: mockAssessment,
      source: "mock",
      computedAt: new Date().toISOString(),
    });
  },
);

// ─── Mock Data ──────────────────────────────────────────────────────────────

interface MockAssessment {
  playerId: string;
  riskScore: number;
  riskLevel: string;
  primaryFactor: string;
  factors: Record<string, { score: number; weight: number } | null>;
  hasBehavioralData: boolean;
  intervention: {
    urgency: string;
    actions: Array<{ audience: string; action: string; priority: string }>;
    followUpDate: string;
    escalationNeeded: boolean;
  };
  engagement: {
    current: number;
    historical: number;
    trend: string;
    consecutiveDeclines: number;
  };
  overtraining: {
    risk: number;
    riskLevel: string;
    currentLoadAU: number;
    recommendedLoadAU: number;
    adjustmentPct: number;
  };
  motivation: {
    type: string;
    dropoutRisk: number;
    confidence: number;
  };
  attendance: {
    rate: number;
    consecutiveAbsences: number;
    recentTrend: string;
  };
}

function generateMockAssessment(playerId: string): MockAssessment {
  // Deterministic seed from playerId for consistent mock data
  const seed = playerId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const r = (min: number, max: number) => min + (seed % (max - min + 1));

  const engagementDecline = r(10, 60);
  const motivationRisk = r(15, 70);
  const overtrainingRisk = r(10, 50);
  const vsiStagnation = r(5, 45);
  const attendanceDecline = r(5, 40);
  const injuryRecurrence = r(0, 30);
  const growthSpurtStress = r(0, 25);
  const lowResilience = r(10, 40);

  const riskScore = Math.round(
    engagementDecline * 0.25 +
    motivationRisk * 0.20 +
    overtrainingRisk * 0.15 +
    vsiStagnation * 0.12 +
    attendanceDecline * 0.10 +
    injuryRecurrence * 0.08 +
    growthSpurtStress * 0.05 +
    lowResilience * 0.05,
  );

  const riskLevel =
    riskScore >= 75 ? "critical" :
    riskScore >= 50 ? "high" :
    riskScore >= 25 ? "moderate" :
    "low";

  // Find primary factor
  const factorContributions = [
    { key: "engagementDecline", value: engagementDecline * 0.25 },
    { key: "motivationType", value: motivationRisk * 0.20 },
    { key: "overtrainingRisk", value: overtrainingRisk * 0.15 },
    { key: "vsiStagnation", value: vsiStagnation * 0.12 },
    { key: "attendanceDecline", value: attendanceDecline * 0.10 },
    { key: "injuryRecurrence", value: injuryRecurrence * 0.08 },
    { key: "growthSpurtStress", value: growthSpurtStress * 0.05 },
    { key: "lowResilience", value: lowResilience * 0.05 },
  ].sort((a, b) => b.value - a.value);

  const primaryFactor = factorContributions[0].key;

  const urgency =
    riskLevel === "critical" ? "immediate" :
    riskLevel === "high" ? "this_week" :
    riskLevel === "moderate" ? "this_month" :
    "monitor";

  const followUp = new Date();
  followUp.setDate(followUp.getDate() + (urgency === "immediate" ? 3 : urgency === "this_week" ? 7 : 14));

  return {
    playerId,
    riskScore,
    riskLevel,
    primaryFactor,
    factors: {
      engagementDecline: { score: engagementDecline, weight: 0.25 },
      motivationType: { score: motivationRisk, weight: 0.20 },
      overtrainingRisk: { score: overtrainingRisk, weight: 0.15 },
      vsiStagnation: { score: vsiStagnation, weight: 0.12 },
      attendanceDecline: { score: attendanceDecline, weight: 0.10 },
      injuryRecurrence: { score: injuryRecurrence, weight: 0.08 },
      growthSpurtStress: { score: growthSpurtStress, weight: 0.05 },
      lowResilience: { score: lowResilience, weight: 0.05 },
    },
    hasBehavioralData: false,
    intervention: {
      urgency,
      actions: [
        { audience: "coach", action: "Hablar individualmente con el jugador sobre su estado anímico", priority: urgency },
        { audience: "parent", action: "Consultar si ha habido cambios en el entorno familiar o escolar", priority: "this_week" },
        { audience: "club", action: "Revisar si la carga de entrenamiento es adecuada", priority: "this_month" },
      ],
      followUpDate: followUp.toISOString().split("T")[0],
      escalationNeeded: riskLevel === "critical",
    },
    engagement: {
      current: Math.max(20, 100 - engagementDecline),
      historical: 70,
      trend: engagementDecline > 40 ? "declining" : engagementDecline > 20 ? "stable" : "improving",
      consecutiveDeclines: engagementDecline > 40 ? 3 : engagementDecline > 20 ? 1 : 0,
    },
    overtraining: {
      risk: overtrainingRisk,
      riskLevel: overtrainingRisk >= 50 ? "high" : overtrainingRisk >= 25 ? "moderate" : "low",
      currentLoadAU: 350 + r(0, 150),
      recommendedLoadAU: 340,
      adjustmentPct: overtrainingRisk > 40 ? -20 : -5,
    },
    motivation: {
      type: motivationRisk > 60 ? "extrinsic_pressure" : motivationRisk > 40 ? "mixed" : "intrinsic_mastery",
      dropoutRisk: motivationRisk,
      confidence: 0.65,
    },
    attendance: {
      rate: Math.max(50, 100 - attendanceDecline),
      consecutiveAbsences: attendanceDecline > 30 ? 2 : 0,
      recentTrend: attendanceDecline > 30 ? "declining" : "stable",
    },
  };
}
