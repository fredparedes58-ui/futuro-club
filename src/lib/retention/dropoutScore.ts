/**
 * VITAS · Retención — Scorer de abandono determinista (Sprint 3.7)
 *
 * Modelo de 8 factores (mismos pesos que api/wellbeing/_dropout-risk.ts).
 * Sin datos reales todavía (Sprint 0 pendiente) → estima cada factor con un hash
 * determinista por-jugador (mismo modelo que el digest del director), de modo que
 * el dashboard y el email mensual coinciden.
 * Cuando existan señales reales (engagement, asistencia, fatiga) se pasan en
 * `signals` y sustituyen a la estimación por-defecto.
 */

export type RiskLevel = "critical" | "high" | "moderate" | "low";

export interface DropoutFactors {
  engagementDecline: number;
  motivationRisk: number;
  overtrainingRisk: number;
  vsiStagnation: number;
  attendanceDecline: number;
  injuryRecurrence: number;
  growthSpurtStress: number;
  lowResilience: number;
}

export interface DropoutAssessment {
  playerId: string;
  riskScore: number;
  riskLevel: RiskLevel;
  primaryFactor: keyof DropoutFactors;
  factors: DropoutFactors;
}

const WEIGHTS: Record<keyof DropoutFactors, number> = {
  engagementDecline: 0.25,
  motivationRisk: 0.2,
  overtrainingRisk: 0.15,
  vsiStagnation: 0.12,
  attendanceDecline: 0.1,
  injuryRecurrence: 0.08,
  growthSpurtStress: 0.05,
  lowResilience: 0.05,
};

/** Hash entero determinista (mezcla bits para varianza por-factor). */
function hash32(x: number): number {
  let h = x >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * Factores deterministas desde el id, con varianza independiente por factor
 * (cada factor usa un hash distinto → distribución realista de riesgo).
 * Mismo modelo que el digest del director (api/crons/director-risk-digest.ts).
 */
function seededFactors(playerId: string): DropoutFactors {
  const base = playerId.split("").reduce((s, c) => s + c.charCodeAt(0), 0);
  const pick = (i: number, min: number, max: number) =>
    min + (hash32(base * 131 + i * 977) % (max - min + 1));
  // Rangos calibrados para que el composite ponderado cubra ~10-80 (low→critical).
  return {
    engagementDecline: pick(1, 10, 90),
    motivationRisk: pick(2, 15, 90),
    overtrainingRisk: pick(3, 10, 80),
    vsiStagnation: pick(4, 5, 75),
    attendanceDecline: pick(5, 5, 70),
    injuryRecurrence: pick(6, 0, 60),
    growthSpurtStress: pick(7, 0, 50),
    lowResilience: pick(8, 10, 70),
  };
}

export function levelFromScore(riskScore: number): RiskLevel {
  if (riskScore >= 75) return "critical";
  if (riskScore >= 50) return "high";
  if (riskScore >= 25) return "moderate";
  return "low";
}

/**
 * Calcula el riesgo de abandono de un jugador.
 * @param signals señales reales opcionales (0-100 por factor) que sustituyen la estimación.
 */
export function estimateDropoutRisk(
  playerId: string,
  signals?: Partial<DropoutFactors>,
): DropoutAssessment {
  const factors: DropoutFactors = { ...seededFactors(playerId), ...signals };

  const riskScore = Math.round(
    (Object.keys(WEIGHTS) as Array<keyof DropoutFactors>).reduce(
      (sum, k) => sum + factors[k] * WEIGHTS[k],
      0,
    ),
  );

  const primaryFactor = (Object.keys(WEIGHTS) as Array<keyof DropoutFactors>)
    .map((k) => ({ k, contribution: factors[k] * WEIGHTS[k] }))
    .sort((a, b) => b.contribution - a.contribution)[0].k;

  return { playerId, riskScore, riskLevel: levelFromScore(riskScore), primaryFactor, factors };
}

export interface RiskBuckets {
  critical: number;
  high: number;
  moderate: number;
  low: number;
  /** high + critical — los que requieren intervención "este mes". */
  atRisk: number;
  total: number;
}

export function bucketRisk(assessments: DropoutAssessment[]): RiskBuckets {
  const b: RiskBuckets = { critical: 0, high: 0, moderate: 0, low: 0, atRisk: 0, total: assessments.length };
  for (const a of assessments) b[a.riskLevel] += 1;
  b.atRisk = b.high + b.critical;
  return b;
}

/** Etiqueta humana del factor (es-ES) para la UI/email. */
export const FACTOR_LABELS: Record<keyof DropoutFactors, string> = {
  engagementDecline: "Caída de implicación",
  motivationRisk: "Motivación en riesgo",
  overtrainingRisk: "Sobreentrenamiento",
  vsiStagnation: "Estancamiento (VSI)",
  attendanceDecline: "Baja asistencia",
  injuryRecurrence: "Lesiones recurrentes",
  growthSpurtStress: "Estrés de crecimiento",
  lowResilience: "Baja resiliencia",
};

export const RISK_META: Record<RiskLevel, { label: string; color: string; dot: string }> = {
  critical: { label: "Crítico", color: "text-rose-400", dot: "bg-rose-500" },
  high: { label: "Alto", color: "text-orange-400", dot: "bg-orange-500" },
  moderate: { label: "Moderado", color: "text-amber-400", dot: "bg-amber-500" },
  low: { label: "Bajo", color: "text-emerald-400", dot: "bg-emerald-500" },
};
