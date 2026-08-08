/**
 * VITAS · Procedencia y fiabilidad de métricas deterministas (anti-fallo-silencioso).
 *
 * Lógica PURA (sin dependencias) para que el informe NO presente como "medido" lo
 * que en realidad es una estimación/placeholder. La usa _pipeline-orchestrator.ts.
 *
 * Hallazgo (red-team): 3/5 sub-scores del VSI son constantes hardcodeadas
 * (technique/mental/tactical) pero el VSI resultante se mostraba como cifra dura en
 * rankings/informe/email. Y la fatiga (ACWR) se calculaba con 1 sola sesión, sin
 * los ~28 días de histórico que necesita → riesgo de lesión "sólido" con datos
 * insuficientes. Estas funciones exponen esa verdad para que la UI/email la muestren.
 */

export type SubscoreProvenance = "measured" | "placeholder";

export type VsiSubscoreKey = "technique" | "physical" | "mental" | "tactical" | "projection";

export interface VsiProvenance {
  /** Origen de cada sub-score: medido de señales reales vs placeholder. */
  perSubscore: Record<VsiSubscoreKey, SubscoreProvenance>;
  /** Fracción de sub-scores realmente medidos (0..1). */
  measuredFraction: number;
  /** true si algún sub-score es placeholder (VSI parcialmente estimado). */
  partiallyEstimated: boolean;
}

interface BiomechanicsLike {
  stride_frequency_hz?: number | null;
  asymmetry_pct?: number | null;
}
interface AnthroLike {
  adjusted_vsi?: number | null;
}

/**
 * Determina qué sub-scores del VSI están MEDIDOS y cuáles son placeholder.
 * - technique/mental/tactical: aún NO los mide el pipeline de visión → placeholder.
 * - physical: medido solo si hay señales biomecánicas reales (zancada/asimetría).
 * - projection: medido solo si hay VSI antropométrico ajustado (PHV/anthro real).
 */
export function computeVsiProvenance(
  bm: BiomechanicsLike | null | undefined,
  anthro: AnthroLike | null | undefined,
): VsiProvenance {
  const physicalMeasured =
    !!bm && (bm.stride_frequency_hz != null || bm.asymmetry_pct != null);
  const projectionMeasured = !!anthro && anthro.adjusted_vsi != null;

  const perSubscore: Record<VsiSubscoreKey, SubscoreProvenance> = {
    technique: "placeholder",
    physical: physicalMeasured ? "measured" : "placeholder",
    mental: "placeholder",
    tactical: "placeholder",
    projection: projectionMeasured ? "measured" : "placeholder",
  };

  const measuredCount = Object.values(perSubscore).filter((p) => p === "measured").length;
  const measuredFraction = measuredCount / 5;
  return { perSubscore, measuredFraction, partiallyEstimated: measuredFraction < 1 };
}

/**
 * ACWR (acute:chronic workload ratio) necesita ~4 semanas de carga para ser fiable.
 * Con menos sesiones, el índice de fatiga/ACWR NO debe alimentar riesgo de lesión ni
 * valoración como si fuera un dato sólido.
 */
export const MIN_FATIGUE_SESSIONS = 4;

export function fatigueIsReliable(sessionCount: number): boolean {
  return sessionCount >= MIN_FATIGUE_SESSIONS;
}
