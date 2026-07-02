/**
 * VITAS · Maduración peer-relativa (Sprint 2.4)
 *
 * Traduce el `offset` de Mirwald (relativo al PHV propio) a la terminología
 * de PARES que entiende un scout/coach/padre y que es el núcleo de la tesis
 * anti-sesgo de VITAS:
 *
 *   offset < 0 (biológicamente por detrás de su edad) → MADURADOR TARDÍO
 *     · físicamente por detrás de sus pares HOY
 *     · su rendimiento actual INFRAVALORA su talento → VSI ajustado al alza
 *     · el "talento oculto" que Wyscout/aiScout descartan
 *
 *   offset > 0 (biológicamente por delante) → MADURADOR PRECOZ
 *     · ventaja física TEMPORAL sobre sus pares
 *     · su rendimiento actual SOBREVALORA su talento → VSI ajustado a la baja
 *     · el "falso crack" que el sesgo del madurador precoz sobre-selecciona
 *
 * OJO: el codebase usa internamente category "early"/"late" con significado
 * INVERTIDO (early = pre-PHV = tardío vs pares). Esta capa NORMALIZA a
 * lenguaje claro para que el producto nunca confunda.
 */

import type { MirwaldResult } from "./mirwald";

export type MaturationStatus = "late_maturer" | "on_time" | "early_maturer";

export interface MaturationAssessment {
  status: MaturationStatus;
  /** Etiqueta ES lista para UI. */
  label: string;
  /** Años por delante(+)/detrás(-) de su edad cronológica (= offset). */
  yearsVsPeers: number;
  biologicalAge: number;
  chronologicalAge: number;
  /** Factor aplicado al VSI/métricas físicas (>1 sube, <1 baja). */
  adjustmentFactor: number;
  /** Color temático para UI. */
  tone: "boost" | "neutral" | "discount";
  /** Explicación de una frase. */
  rationale: string;
}

/**
 * Deriva el estado de maduración vs pares desde el resultado Mirwald.
 * Umbral ±1.0 año (mismo que el categorize del agente).
 */
export function assessMaturation(m: MirwaldResult): MaturationAssessment {
  const yearsVsPeers = m.offset; // biologicalAge - chronologicalAge

  let status: MaturationStatus;
  let label: string;
  let adjustmentFactor: number;
  let tone: MaturationAssessment["tone"];
  let rationale: string;

  if (yearsVsPeers < -1.0) {
    status = "late_maturer";
    label = "Madurador tardío";
    adjustmentFactor = 1.12; // sube: su rendimiento infravalora el talento
    tone = "boost";
    rationale =
      `Biológicamente ${Math.abs(yearsVsPeers).toFixed(1)} años por detrás de su edad. ` +
      `Su rendimiento actual está frenado por la maduración, no por el talento: ` +
      `alta probabilidad de despegar tras el estirón. Es el perfil que la mayoría de scouts descarta.`;
  } else if (yearsVsPeers > 1.0) {
    status = "early_maturer";
    label = "Madurador precoz";
    adjustmentFactor = 0.92; // baja: ventaja física temporal
    tone = "discount";
    rationale =
      `Biológicamente ${yearsVsPeers.toFixed(1)} años por delante de su edad. ` +
      `Parte de su dominio actual es ventaja física temporal que sus pares igualarán: ` +
      `hay que separar el talento real de la madurez precoz para no sobrevalorarlo.`;
  } else {
    status = "on_time";
    label = "Maduración en fase";
    adjustmentFactor = 1.0;
    tone = "neutral";
    rationale =
      `Maduración alineada con su edad cronológica (${yearsVsPeers >= 0 ? "+" : ""}${yearsVsPeers.toFixed(1)} años). ` +
      `Su rendimiento refleja su nivel real sin distorsión por maduración.`;
  }

  return {
    status,
    label,
    yearsVsPeers,
    biologicalAge: m.biologicalAge,
    chronologicalAge: m.chronologicalAge,
    adjustmentFactor,
    tone,
    rationale,
  };
}
