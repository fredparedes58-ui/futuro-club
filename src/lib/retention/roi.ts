/**
 * VITAS · Retención — Calculadora de ROI en € (Sprint 3.7)
 *
 * Traduce el "Radar de Retención" a dinero para el director:
 *   ~70% de los niños abandonan el fútbol antes de los 13 (dropout juvenil).
 *   Si VITAS ayuda a retener N jugadores/año, ¿cuánto ahorra frente a lo que cuesta?
 *
 * Es el único módulo de VITAS con ROI directo demostrable en euros.
 * Determinista, sin IA. Todos los supuestos son parametrizables y transparentes.
 */

export interface RetentionROIInput {
  /** Nº de jugadores en riesgo alto/crítico de abandono ahora mismo. */
  playersAtRisk: number;
  /** Jugadores que se asume retener al año (si se omite, se estima desde los en riesgo). */
  retainedPerYear?: number;
  /** Cuota media anual por jugador (€/año). Default academia España ~600. */
  annualFeePerPlayer?: number;
  /** Coste anual de VITAS (€/año). Default plan Club 79 €/mes = 948 €/año. */
  vitasAnnualCost?: number;
  /** Tasa base de abandono juvenil (para la narrativa). Default 0.70. */
  dropoutBaselinePct?: number;
  /** Fracción de los en-riesgo que se retiene con intervención temprana. Default 0.4. */
  interventionSuccessRate?: number;
}

export interface RetentionROIResult {
  playersAtRisk: number;
  retainedPerYear: number;
  annualFeePerPlayer: number;
  revenueSaved: number;
  vitasAnnualCost: number;
  netBenefit: number;
  /** revenueSaved / vitasAnnualCost (ej. 1.9 = casi 2× lo que cuesta). */
  roiMultiple: number;
  /** Jugadores retenidos para cubrir el coste de VITAS (umbral de rentabilidad). */
  paybackPlayers: number;
  dropoutBaselinePct: number;
  paysForItself: boolean;
  headline: string;
  narrative: string;
}

export const RETENTION_DEFAULTS = {
  annualFeePerPlayer: 600,
  vitasAnnualCost: 948, // Club: 79 €/mes × 12
  dropoutBaselinePct: 0.7,
  interventionSuccessRate: 0.4,
} as const;

/** Formatea un número como € sin decimales (es-ES). */
export function eur(n: number): string {
  return new Intl.NumberFormat("es-ES", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(Math.round(n));
}

export function computeRetentionROI(input: RetentionROIInput): RetentionROIResult {
  const annualFeePerPlayer = input.annualFeePerPlayer ?? RETENTION_DEFAULTS.annualFeePerPlayer;
  const vitasAnnualCost = input.vitasAnnualCost ?? RETENTION_DEFAULTS.vitasAnnualCost;
  const dropoutBaselinePct = input.dropoutBaselinePct ?? RETENTION_DEFAULTS.dropoutBaselinePct;
  const successRate = input.interventionSuccessRate ?? RETENTION_DEFAULTS.interventionSuccessRate;

  const playersAtRisk = Math.max(0, Math.round(input.playersAtRisk));

  // Si no se especifica, estimamos: al menos 1 si hay riesgo, o una fracción de los en-riesgo.
  const estimatedRetained =
    playersAtRisk > 0 ? Math.max(1, Math.round(playersAtRisk * successRate)) : 0;
  const retainedPerYear = Math.max(0, Math.round(input.retainedPerYear ?? estimatedRetained));

  const revenueSaved = retainedPerYear * annualFeePerPlayer;
  const netBenefit = revenueSaved - vitasAnnualCost;
  const roiMultiple = vitasAnnualCost > 0 ? revenueSaved / vitasAnnualCost : 0;
  const paybackPlayers = Math.max(1, Math.ceil(vitasAnnualCost / annualFeePerPlayer));
  const paysForItself = revenueSaved >= vitasAnnualCost;

  const pctLabel = Math.round(dropoutBaselinePct * 100);

  const headline = paysForItself
    ? `Reteniendo ${retainedPerYear} jugador${retainedPerYear === 1 ? "" : "es"}/año, VITAS se paga solo`
    : `Con solo ${paybackPlayers} jugador${paybackPlayers === 1 ? "" : "es"} retenido${paybackPlayers === 1 ? "" : "s"}/año, VITAS se paga solo`;

  const narrative =
    `~${pctLabel}% de los niños abandonan el fútbol antes de los 13. ` +
    `Cada jugador retenido vale ${eur(annualFeePerPlayer)}/año en cuotas. ` +
    (paysForItself
      ? `Reteniendo ${retainedPerYear} este año recuperas ${eur(revenueSaved)} — VITAS cuesta ${eur(vitasAnnualCost)}/año, ` +
        `un retorno de ${roiMultiple.toFixed(1)}× (${eur(netBenefit)} netos).`
      : `Basta con retener ${paybackPlayers} jugador${paybackPlayers === 1 ? "" : "es"}/año (${eur(paybackPlayers * annualFeePerPlayer)}) ` +
        `para cubrir el coste de VITAS (${eur(vitasAnnualCost)}/año).`);

  return {
    playersAtRisk,
    retainedPerYear,
    annualFeePerPlayer,
    revenueSaved,
    vitasAnnualCost,
    netBenefit,
    roiMultiple,
    paybackPlayers,
    dropoutBaselinePct,
    paysForItself,
    headline,
    narrative,
  };
}
