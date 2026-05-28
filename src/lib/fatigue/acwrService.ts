/**
 * VITAS · ACWR Service (Acute:Chronic Workload Ratio)
 *
 * Computes the Acute:Chronic Workload Ratio using EWMA (Exponentially
 * Weighted Moving Average) method, which is preferred over the rolling
 * average method because it:
 * - Assigns decreasing weight to older loads
 * - Better accounts for non-uniform training schedules
 * - Is more sensitive to recent workload spikes
 *
 * EWMA formula:
 *   Load_today = Load_raw × λ + Load_yesterday × (1 - λ)
 *   λ_acute = 2 / (7 + 1)  = 0.25   (7-day window)
 *   λ_chronic = 2 / (28 + 1) = 0.069  (28-day window)
 *   ACWR = Acute_EWMA / Chronic_EWMA
 *
 * Risk zones (Blanch & Gabbett 2016, Hulin et al. 2014):
 *   0.8 - 1.3  → Optimal (sweet spot)
 *   1.3 - 1.5  → Caution (elevated risk)
 *   > 1.5      → Danger (high injury risk)
 *   < 0.8      → Undertrained (fitness loss)
 *
 * References:
 * - Hulin et al. 2014 (The ACWR in sport)
 * - Blanch & Gabbett 2016 (Has the athlete trained enough?)
 * - Williams et al. 2017 (EWMA vs rolling average)
 * - Murray et al. 2017 (Calculating ACWR using EWMA)
 */

import type { ACWRResult, ACWRZone, FatigueThresholds } from "./types";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface SessionLoad {
  /** Date of the session (YYYY-MM-DD or ISO string) */
  date: string;
  /** Total session load metric (distance × avg metabolic power, or custom) */
  load: number;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const LAMBDA_ACUTE = 2 / (7 + 1);     // 0.25  — 7-day decay
const LAMBDA_CHRONIC = 2 / (28 + 1);  // 0.069 — 28-day decay
const MIN_SESSIONS_RELIABLE = 4;       // Minimum sessions for reliable ACWR

// ─── ACWR Computation ───────────────────────────────────────────────────────

/**
 * Compute ACWR for a player given their session history and current session.
 *
 * @param historicalSessions - Past sessions (last 28+ days), sorted by date ascending
 * @param currentSessionLoad - Load from the session just completed
 * @param thresholds - PHV-adjusted thresholds for zone classification
 * @returns ACWRResult with value, zone, and recommendation
 */
export function computeACWR(
  historicalSessions: SessionLoad[],
  currentSessionLoad: number,
  thresholds: FatigueThresholds,
): ACWRResult {
  // Combine historical + current session
  const allSessions = [
    ...historicalSessions.map(s => ({ ...s })),
    { date: new Date().toISOString().slice(0, 10), load: currentSessionLoad },
  ];

  // Sort by date ascending
  allSessions.sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  if (allSessions.length < 2) {
    return insufficientData(thresholds);
  }

  // ── Compute EWMA ──
  let acuteEWMA = allSessions[0].load;
  let chronicEWMA = allSessions[0].load;

  for (let i = 1; i < allSessions.length; i++) {
    const load = allSessions[i].load;

    // Days since previous session — normalize for gaps
    const dayGap = daysBetween(allSessions[i - 1].date, allSessions[i].date);

    // If there's a gap, we need to decay the EWMA for the missing days
    // Each missing day applies the (1 - λ) decay factor
    if (dayGap > 1) {
      const missingDays = dayGap - 1;
      acuteEWMA *= Math.pow(1 - LAMBDA_ACUTE, missingDays);
      chronicEWMA *= Math.pow(1 - LAMBDA_CHRONIC, missingDays);
    }

    // Apply EWMA formula
    acuteEWMA = load * LAMBDA_ACUTE + acuteEWMA * (1 - LAMBDA_ACUTE);
    chronicEWMA = load * LAMBDA_CHRONIC + chronicEWMA * (1 - LAMBDA_CHRONIC);
  }

  // ── Compute ACWR ──
  const acwr = chronicEWMA > 0 ? acuteEWMA / chronicEWMA : 0;
  const reliable = allSessions.length >= MIN_SESSIONS_RELIABLE;

  // ── Classify zone ──
  const zone = classifyZone(acwr, thresholds);

  // ── Generate recommendation ──
  const recommendation = getRecommendation(zone, acwr, thresholds);

  return {
    value: Math.round(acwr * 100) / 100,
    zone,
    acuteLoad: Math.round(acuteEWMA * 100) / 100,
    chronicLoad: Math.round(chronicEWMA * 100) / 100,
    sessionsUsed: allSessions.length,
    reliable,
    recommendation,
  };
}

// ─── Zone Classification ────────────────────────────────────────────────────

function classifyZone(acwr: number, thresholds: FatigueThresholds): ACWRZone {
  if (acwr >= thresholds.acwrDangerThreshold) return "danger";
  if (acwr >= thresholds.acwrCautionThreshold) return "caution";
  if (acwr >= 0.8) return "optimal";
  return "undertrained";
}

// ─── Recommendations (in Spanish for VITAS users) ───────────────────────────

function getRecommendation(zone: ACWRZone, acwr: number, thresholds: FatigueThresholds): string {
  const phvNote = thresholds.band !== "post_phv"
    ? ` (umbrales ajustados por maduración ${thresholds.band === "pre_phv" ? "pre" : "circa"}-PHV)`
    : "";

  switch (zone) {
    case "danger":
      return `ACWR ${acwr.toFixed(2)} — ZONA DE PELIGRO${phvNote}. `
        + `Spike de carga aguda detectado. Reducir intensidad los próximos 3-5 días. `
        + `Alto riesgo de lesión muscular. Priorizar recuperación activa.`;

    case "caution":
      return `ACWR ${acwr.toFixed(2)} — PRECAUCIÓN${phvNote}. `
        + `La carga aguda está elevándose. Monitorear cuidadosamente. `
        + `Evitar sesiones de alta intensidad consecutivas.`;

    case "optimal":
      return `ACWR ${acwr.toFixed(2)} — ZONA ÓPTIMA${phvNote}. `
        + `Buena relación carga aguda/crónica. El jugador está bien preparado `
        + `para el nivel de exigencia actual.`;

    case "undertrained":
      return `ACWR ${acwr.toFixed(2)} — SUBENTRENADO${phvNote}. `
        + `Carga aguda muy baja respecto al historial. Riesgo de pérdida de fitness. `
        + `Incrementar gradualmente la carga (+10-15% por semana).`;
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function daysBetween(dateA: string, dateB: string): number {
  const a = new Date(dateA).getTime();
  const b = new Date(dateB).getTime();
  return Math.max(1, Math.round(Math.abs(b - a) / (1000 * 60 * 60 * 24)));
}

function insufficientData(thresholds: FatigueThresholds): ACWRResult {
  return {
    value: 0,
    zone: "optimal",
    acuteLoad: 0,
    chronicLoad: 0,
    sessionsUsed: 0,
    reliable: false,
    recommendation: "Datos insuficientes para calcular ACWR. "
      + `Se necesitan al menos ${MIN_SESSIONS_RELIABLE} sesiones registradas.`,
  };
}
