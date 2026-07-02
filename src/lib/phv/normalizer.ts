/**
 * VITAS · Normalizador PHV (Sprint 2.1)
 *
 * Generaliza el ajuste ×1.12 / ×0.92 que hoy solo aplica al VSI, a CUALQUIER
 * métrica. Ese es el salto de "PHV como agente escondido" a "PHV como capa
 * que normaliza cada número que ve el usuario".
 *
 * Diseño:
 *   - `sensitivity` 0-1 por métrica: cuánto le afecta la maduración.
 *     Métricas físicas (velocidad, fuerza, físico) → sensitivity alta (~1).
 *     Métricas cognitivas/técnicas (visión, técnica, scan) → baja (~0.2)
 *     porque el estirón no distorsiona tanto la cognición.
 *   - Para maduradores tardíos SUBE la métrica física (su valor real está
 *     frenado); para precoces la BAJA (ventaja temporal).
 */

import type { MaturationAssessment } from "./maturation";

/** Sensibilidad a la maduración por tipo de métrica (0 = nada, 1 = total). */
export const METRIC_MATURATION_SENSITIVITY: Record<string, number> = {
  // Físicas — muy afectadas por el estirón
  speed: 1.0,
  stamina: 0.9,
  physical: 1.0,
  strength: 1.0,
  power: 1.0,
  // Técnicas / cognitivas — poco afectadas
  technique: 0.2,
  vision: 0.15,
  scanning: 0.1,
  passing: 0.25,
  shooting: 0.4,
  defending: 0.5,
  // VSI compuesto — sensibilidad media (mezcla física + cognitiva)
  vsi: 0.6,
};

export interface NormalizedMetric {
  key: string;
  raw: number;
  adjusted: number;
  delta: number;
  sensitivity: number;
  /** Nota corta ES. */
  note: string;
}

/**
 * Normaliza una métrica por maduración. El factor efectivo se atenúa por la
 * sensibilidad: factorEfectivo = 1 + (adjustmentFactor - 1) × sensitivity.
 */
export function normalizeMetric(
  key: string,
  rawValue: number,
  maturation: MaturationAssessment,
  sensitivityOverride?: number,
): NormalizedMetric {
  const sensitivity =
    sensitivityOverride ?? METRIC_MATURATION_SENSITIVITY[key] ?? 0.5;
  const effectiveFactor = 1 + (maturation.adjustmentFactor - 1) * sensitivity;
  const adjusted = Math.max(0, Math.min(100, Number((rawValue * effectiveFactor).toFixed(1))));
  const delta = Number((adjusted - rawValue).toFixed(1));

  let note = "";
  if (Math.abs(delta) >= 0.5) {
    note =
      delta > 0
        ? `+${delta} ajustado al alza (madurador tardío, valor real infravalorado)`
        : `${delta} ajustado a la baja (ventaja física temporal de madurador precoz)`;
  } else {
    note = "sin ajuste significativo por maduración";
  }

  return { key, raw: rawValue, adjusted, delta, sensitivity, note };
}

/** Normaliza un conjunto de métricas de golpe. */
export function normalizeMetrics(
  metrics: Record<string, number>,
  maturation: MaturationAssessment,
): NormalizedMetric[] {
  return Object.entries(metrics)
    .filter(([, v]) => typeof v === "number" && isFinite(v))
    .map(([k, v]) => normalizeMetric(k, v, maturation));
}
