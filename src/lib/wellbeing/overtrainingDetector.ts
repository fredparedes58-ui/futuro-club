/**
 * VITAS · Overtraining Detector (Sprint 21)
 *
 * Combines signals: ACWR, fatigue index, load vs recommended,
 * PHV data, injury history.
 *
 * Output: OvertrainingAssessment with risk 0-100 and recommendations.
 */

// ─── Input types ─────────────────────────────────────────────────────────

interface ACWRResult {
  acute: number;
  chronic: number;
  ratio: number;
  zone: "undertraining" | "optimal" | "danger" | "critical";
}

interface FatigueIndex {
  value: number;   // 0-100
  severity: "normal" | "moderate" | "high" | "critical";
}

export interface OvertrainingInput {
  playerId: string;
  playerAge: number;
  /** ACWR results from last 4+ weeks */
  acwrHistory: ACWRResult[];
  /** Fatigue indices from recent sessions */
  fatigueHistory: FatigueIndex[];
  /** Weekly training load in AU */
  weeklyLoadAU: number;
  /** PHV offset (-3 to +3) */
  phvOffset?: number | null;
  /** Number of injuries in last 6 months */
  injuriesLast6Mo: number;
  /** Average session duration this week (minutes) */
  avgSessionMinutes: number;
}

// ─── Output ──────────────────────────────────────────────────────────────

export interface OvertrainingAssessment {
  playerId: string;
  /** Overall overtraining risk 0-100 */
  overtrainingRisk: number;
  /** Risk level */
  riskLevel: "low" | "moderate" | "high" | "critical";
  /** Contributing factors */
  factors: {
    acwrRisk: number;
    fatigueRisk: number;
    loadRisk: number;
    phvRisk: number;
    injuryRisk: number;
  };
  /** Recommendations */
  recommendations: string[];
  /** Suggested load adjustment */
  loadAdjustment: {
    currentLoadAU: number;
    recommendedLoadAU: number;
    adjustmentPct: number;
  };
}

// ─── Constants ───────────────────────────────────────────────────────────

/** Max recommended weekly load by age group (AU) */
const MAX_WEEKLY_LOAD: Record<string, number> = {
  "sub-10": 200,
  "sub-12": 300,
  "sub-14": 400,
  "sub-16": 500,
  "sub-18": 600,
  "adult": 700,
};

function ageGroup(age: number): string {
  if (age < 10) return "sub-10";
  if (age < 12) return "sub-12";
  if (age < 14) return "sub-14";
  if (age < 16) return "sub-16";
  if (age < 18) return "sub-18";
  return "adult";
}

// ─── Main Function ───────────────────────────────────────────────────────

export function assessOvertraining(input: OvertrainingInput): OvertrainingAssessment {
  const { playerId, playerAge, acwrHistory, fatigueHistory, weeklyLoadAU, phvOffset, injuriesLast6Mo, avgSessionMinutes } = input;

  // ── ACWR Risk ──
  const latestACWR = acwrHistory.length > 0 ? acwrHistory[acwrHistory.length - 1] : null;
  let acwrRisk = 0;
  if (latestACWR) {
    if (latestACWR.zone === "critical") acwrRisk = 90;
    else if (latestACWR.zone === "danger") acwrRisk = 65;
    else if (latestACWR.ratio > 1.3) acwrRisk = 50;
    else if (latestACWR.ratio > 1.2) acwrRisk = 30;
    else acwrRisk = 10;
  }

  // ── Fatigue Risk ──
  const avgFatigue = fatigueHistory.length > 0
    ? fatigueHistory.reduce((s, f) => s + f.value, 0) / fatigueHistory.length
    : 30;
  const fatigueRisk = Math.min(100, avgFatigue * 1.2);

  // ── Load Risk ──
  const maxLoad = MAX_WEEKLY_LOAD[ageGroup(playerAge)] ?? 400;
  const phvReduction = phvOffset !== null && phvOffset !== undefined && Math.abs(phvOffset) <= 1.0
    ? 0.75 // 25% reduction during PHV
    : 1.0;
  const adjustedMaxLoad = maxLoad * phvReduction;
  const loadRatio = weeklyLoadAU / adjustedMaxLoad;
  const loadRisk = loadRatio > 1.3 ? 90
    : loadRatio > 1.1 ? 60
    : loadRatio > 0.9 ? 20
    : 10;

  // ── PHV Risk ──
  const phvRisk = phvOffset !== null && phvOffset !== undefined && Math.abs(phvOffset) <= 1.0
    ? 40 // circa-PHV: inherent risk
    : 0;

  // ── Injury Risk ──
  const injuryRisk = Math.min(100, injuriesLast6Mo * 25);

  // ── Composite ──
  const overtrainingRisk = Math.round(
    acwrRisk * 0.30 +
    fatigueRisk * 0.25 +
    loadRisk * 0.25 +
    phvRisk * 0.10 +
    injuryRisk * 0.10,
  );

  const riskLevel: "low" | "moderate" | "high" | "critical" =
    overtrainingRisk >= 75 ? "critical" :
    overtrainingRisk >= 50 ? "high" :
    overtrainingRisk >= 25 ? "moderate" :
    "low";

  // ── Recommendations ──
  const recommendations: string[] = [];
  if (acwrRisk > 50) recommendations.push("Reducir carga aguda — ACWR en zona de peligro");
  if (fatigueRisk > 50) recommendations.push("Sesión de recuperación activa recomendada");
  if (loadRisk > 50) recommendations.push(`Carga semanal excede el máximo recomendado para sub-${Math.round(playerAge)}`);
  if (phvRisk > 0) recommendations.push("Periodo PHV: reducir ejercicios de alto impacto 20-30%");
  if (injuryRisk > 50) recommendations.push("Historial de lesiones reciente — monitorizar dolor post-sesión");
  if (recommendations.length === 0) recommendations.push("Carga dentro de parámetros normales");

  // Load adjustment
  const recommendedLoad = Math.round(adjustedMaxLoad * 0.85); // target 85% of max
  const adjustmentPct = weeklyLoadAU > 0
    ? Math.round(((recommendedLoad - weeklyLoadAU) / weeklyLoadAU) * 100)
    : 0;

  return {
    playerId,
    overtrainingRisk,
    riskLevel,
    factors: { acwrRisk, fatigueRisk, loadRisk, phvRisk, injuryRisk },
    recommendations,
    loadAdjustment: {
      currentLoadAU: weeklyLoadAU,
      recommendedLoadAU: recommendedLoad,
      adjustmentPct,
    },
  };
}
