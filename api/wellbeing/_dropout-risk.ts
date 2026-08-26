/**
 * VITAS · Dropout Risk Endpoint (Sprint 22 · real scorer)
 * GET /api/wellbeing/dropout-risk?playerId=xxx
 *
 * Computa el riesgo de abandono a partir de SEÑALES REALES en Supabase
 * (attendance_records, engagement_snapshots, fatigue_sessions, behavioral_profiles)
 * → construye las entradas del scorer → scoreDropoutRisk() + generateIntervention().
 *
 * HONESTIDAD (invariante #2): si el jugador NO tiene ninguna señal real, NO se
 * inventa un riesgo (un 0 vestido de "riesgo bajo" también es mentira). Se devuelve
 * un estado "insufficient_data" (source ≠ "computed" → el cliente lo marca isMock y
 * la UI muestra el DemoDataBanner) y NO se persiste ninguna fila.
 *
 * Antes este endpoint devolvía SIEMPRE un valor derivado del HASH del id del
 * jugador (mock disfrazado, prohibido por rules/metricas.md). Eso se retira.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { ownsPlayer } from "../_lib/ownership";
import { calculateAttendanceProfile } from "../../src/lib/wellbeing/attendanceTracker";
import { classifyMotivation } from "../../src/lib/wellbeing/motivationClassifier";
import { scoreDropoutRisk } from "../../src/lib/wellbeing/dropoutRiskScorer";
import { generateIntervention } from "../../src/lib/wellbeing/interventionProtocol";
import type { AttendanceRecord } from "../../src/lib/wellbeing/attendanceTracker";
import type { MotivationProfile } from "../../src/lib/wellbeing/motivationClassifier";
import type { OvertrainingAssessment } from "../../src/lib/wellbeing/overtrainingDetector";
import type { EngagementSnapshot } from "../../src/lib/shared/sessionTypes";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const dropoutRiskQuerySchema = z.object({
  playerId: z.string().min(1, "playerId is required"),
});

const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

/** SELECT a PostgREST (service key). Devuelve [] ante cualquier fallo. */
async function selRows(path: string): Promise<Array<Record<string, unknown>>> {
  try {
    const res = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
      headers: { apikey: SUPABASE_KEY, Authorization: `Bearer ${SUPABASE_KEY}` },
    });
    if (!res.ok) return [];
    const data = await res.json();
    return Array.isArray(data) ? data : [];
  } catch {
    return [];
  }
}

// ── Neutrales HAND-BUILT (contribución 0) para señales ausentes ─────────────
// NO llamar a assessOvertraining/classifyMotivation con datos vacíos: inyectan
// ~12 y ~45 pts de riesgo respectivamente sobre un jugador sin datos.
function neutralOvertraining(playerId: string): OvertrainingAssessment {
  return {
    playerId,
    overtrainingRisk: 0,
    riskLevel: "low",
    factors: { acwrRisk: 0, fatigueRisk: 0, loadRisk: 0, phvRisk: 0, injuryRisk: 0 },
    recommendations: [],
    loadAdjustment: { currentLoadAU: 0, recommendedLoadAU: 0, adjustmentPct: 0 },
  };
}
function neutralMotivation(playerId: string): MotivationProfile {
  return {
    playerId,
    type: "mixed",
    inherentDropoutRisk: 0,
    confidence: 0,
    signals: {
      physicalEngagementAvg: 0,
      socialEngagementAvg: 0,
      emotionalEngagementAvg: 0,
      intensityConsistency: 0,
      trainingVsMatchGap: 0,
    },
  };
}

/** Overtraining a partir del fatigue_index ya calculado (dato real almacenado). */
function overtrainingFromFatigue(playerId: string, rows: Array<Record<string, unknown>>): OvertrainingAssessment {
  const latest = rows[0] ?? {};
  const fi = typeof latest.fatigue_index === "number" ? latest.fatigue_index : 0;
  const risk = clamp(Math.round(fi));
  const load = typeof latest.total_load === "number" ? Math.round(latest.total_load) : 0;
  return {
    playerId,
    overtrainingRisk: risk,
    riskLevel: risk >= 75 ? "critical" : risk >= 50 ? "high" : risk >= 25 ? "moderate" : "low",
    factors: { acwrRisk: 0, fatigueRisk: risk, loadRisk: 0, phvRisk: 0, injuryRisk: 0 },
    recommendations: [],
    loadAdjustment: { currentLoadAU: load, recommendedLoadAU: load, adjustmentPct: 0 },
  };
}

/** engagement_snapshots (row DB) → EngagementSnapshot del dominio. */
function toEngagementSnapshot(playerId: string, r: Record<string, unknown>): EngagementSnapshot {
  const num = (v: unknown) => (typeof v === "number" ? v : 0);
  return {
    playerId,
    sessionId: String(r.session_id ?? ""),
    date: String(r.date ?? ""),
    physicalEngagement: num(r.physical),
    socialEngagement: num(r.social),
    emotionalEngagement: num(r.emotional),
    engagementScore: num(r.composite),
    engagementTrend: (r.trend === "rising" || r.trend === "declining" || r.trend === "stable" ? r.trend : "stable") as EngagementSnapshot["engagementTrend"],
    weeklyAvg: num(r.weekly_avg),
  };
}

/** Resumen de engagement para la UI + engagementDecline (0 = estable, 100 = caída). */
function buildEngagement(rows: Array<Record<string, unknown>>): {
  decline: number;
  summary: { current: number; historical: number; trend: "declining" | "stable" | "improving"; consecutiveDeclines: number };
} {
  // rows vienen ordenadas por date DESC (la más reciente primero).
  const comps = rows.map((r) => (typeof r.composite === "number" ? r.composite : 0));
  const current = comps[0] ?? 0;
  const historical = Math.round(comps.reduce((s, v) => s + v, 0) / (comps.length || 1));
  const decline = clamp(historical - current);
  // Rachas de caída consecutiva (de más reciente a más antigua).
  let consecutiveDeclines = 0;
  for (let i = 0; i < comps.length - 1; i++) {
    if (comps[i] < comps[i + 1]) consecutiveDeclines++;
    else break;
  }
  const trend: "declining" | "stable" | "improving" =
    current < historical - 3 ? "declining" : current > historical + 3 ? "improving" : "stable";
  return { decline, summary: { current: Math.round(current), historical, trend, consecutiveDeclines } };
}

/** Evaluación honesta "sin datos": todo neutro, source ≠ "computed". */
function insufficientAssessment(playerId: string) {
  return {
    playerId,
    riskScore: 0,
    riskLevel: "low" as const,
    primaryFactor: "insufficient_data",
    factors: {
      engagementDecline: { score: 0, weight: 0.25 },
      motivationType: { score: 0, weight: 0.2 },
      overtrainingRisk: { score: 0, weight: 0.15 },
      vsiStagnation: { score: 0, weight: 0.12 },
      attendanceDecline: { score: 0, weight: 0.1 },
      injuryRecurrence: { score: 0, weight: 0.08 },
      growthSpurtStress: { score: 0, weight: 0.05 },
      lowResilience: null,
    },
    hasBehavioralData: false,
    intervention: { urgency: "monitor", actions: [], followUpDate: "", escalationNeeded: false },
    engagement: { current: 0, historical: 0, trend: "stable", consecutiveDeclines: 0 },
    overtraining: { risk: 0, riskLevel: "low", currentLoadAU: 0, recommendedLoadAU: 0, adjustmentPct: 0 },
    motivation: { type: "mixed", dropoutRisk: 0, confidence: 0 },
    attendance: { rate: 0, consecutiveAbsences: 0, recentTrend: "stable" },
  };
}

export default withHandler(
  { method: "GET", requireAuth: true, maxRequests: 60, allowServiceToken: true, requiredPlan: "pro,club" },
  async ({ query, userId, isServiceCall }) => {
    const parsed = dropoutRiskQuerySchema.safeParse(query);
    if (!parsed.success) return errorResponse("playerId query parameter required", 400);
    const { playerId } = parsed.data;

    // Ownership: el service_role salta RLS → hay que comprobar la propiedad en código.
    if (!isServiceCall && !(await ownsPlayer(playerId, userId))) {
      return errorResponse("No autorizado para este jugador", 403, "FORBIDDEN");
    }

    // Sin Supabase → NO se inventa riesgo (mock por hash retirado): estado honesto.
    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({
        assessment: insufficientAssessment(playerId),
        source: "insufficient_data",
        computedAt: new Date().toISOString(),
      });
    }

    const pid = encodeURIComponent(playerId);
    const [attRows, engRows, fatRows] = await Promise.all([
      selRows(`attendance_records?player_id=eq.${pid}&select=player_id,date,status,source,session_id&order=date.desc&limit=90`),
      selRows(`engagement_snapshots?player_id=eq.${pid}&select=session_id,date,physical,social,emotional,composite,trend,weekly_avg&order=date.desc&limit=60`),
      selRows(`fatigue_sessions?player_id=eq.${pid}&select=session_date,total_load,fatigue_index,fatigue_severity,acwr_value&order=session_date.desc&limit=28`),
    ]);

    const hasAtt = attRows.length > 0;
    const hasEng = engRows.length > 0;
    const hasFat = fatRows.length > 0;

    // Invariante #2: sin NINGUNA señal real → no se computa ni se persiste nada.
    // Un 0 presentado como "riesgo bajo" es tan deshonesto como el mock por hash.
    if (!hasAtt && !hasEng && !hasFat) {
      return successResponse({
        assessment: insufficientAssessment(playerId),
        source: "insufficient_data",
        computedAt: new Date().toISOString(),
      });
    }

    // ── Construir entradas: reales donde hay datos, NEUTRO (contribución 0) donde no ──
    const attendance = calculateAttendanceProfile(playerId, hasAtt ? (attRows.map((r) => ({
      playerId,
      date: String(r.date ?? ""),
      status: r.status as AttendanceRecord["status"],
      source: (r.source === "video" || r.source === "manual" || r.source === "auto" ? r.source : "manual") as AttendanceRecord["source"],
      sessionId: r.session_id ? String(r.session_id) : undefined,
    })) as AttendanceRecord[]) : []);

    const eng = hasEng ? buildEngagement(engRows) : { decline: 0, summary: { current: 0, historical: 0, trend: "stable" as const, consecutiveDeclines: 0 } };

    // classifyMotivation necesita ≥3 snapshots reales; si no, neutro (no inventa 45).
    const motivation: MotivationProfile =
      hasEng && engRows.length >= 3
        ? classifyMotivation(playerId, engRows.map((r) => toEngagementSnapshot(playerId, r)), [])
        : neutralMotivation(playerId);

    // Overtraining desde fatigue_index real; si no hay sesiones, neutro (no inventa 12).
    const overtraining = hasFat ? overtrainingFromFatigue(playerId, fatRows) : neutralOvertraining(playerId);

    const out = scoreDropoutRisk({
      playerId,
      engagementDecline: eng.decline,
      motivation,
      overtraining,
      // Sin señal real todavía → contribución 0 (neutro honesto, no inventa riesgo).
      vsiStagnation: 0,
      attendance,
      injuryRecurrence: 0,
      growthSpurtStress: 0,
      behavioralScores: null,
    });
    const proto = generateIntervention(out);

    // recentTrend de asistencia (AttendanceProfile no lo trae): de la alerta/racha.
    const recentTrend =
      attendance.consecutiveAbsences >= 2 ? "declining" : attendance.rate >= 85 ? "stable" : "declining";

    const assessment = {
      playerId,
      riskScore: out.riskScore,
      riskLevel: out.riskLevel,
      primaryFactor: out.primaryFactor,
      factors: out.factors,
      hasBehavioralData: out.hasBehavioralData,
      intervention: {
        urgency: proto.urgency,
        actions: proto.actions,
        followUpDate: proto.followUpDate,
        escalationNeeded: proto.escalationNeeded,
      },
      engagement: {
        current: eng.summary.current,
        historical: eng.summary.historical,
        trend: eng.summary.trend,
        consecutiveDeclines: eng.summary.consecutiveDeclines,
      },
      overtraining: {
        risk: overtraining.overtrainingRisk,
        riskLevel: overtraining.riskLevel,
        currentLoadAU: overtraining.loadAdjustment.currentLoadAU,
        recommendedLoadAU: overtraining.loadAdjustment.recommendedLoadAU,
        adjustmentPct: overtraining.loadAdjustment.adjustmentPct,
      },
      motivation: {
        type: motivation.type,
        dropoutRisk: motivation.inherentDropoutRisk,
        confidence: motivation.confidence,
      },
      attendance: {
        rate: attendance.rate,
        consecutiveAbsences: attendance.consecutiveAbsences,
        recentTrend,
      },
    };

    // Persistir SOLO una evaluación real computada (nunca el estado insufficient).
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/dropout_risk_assessments`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal",
        },
        body: JSON.stringify({
          player_id: playerId,
          risk_score: out.riskScore,
          risk_level: out.riskLevel,
          factors: out.factors,
          intervention: assessment.intervention,
        }),
      });
    } catch {
      // La persistencia es best-effort; la respuesta se devuelve igual.
    }

    return successResponse({
      assessment,
      source: "computed",
      computedAt: new Date().toISOString(),
    });
  },
);
