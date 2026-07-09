/**
 * VITAS · Proyección a madurez (Sprint 2.3)
 *
 * El entregable estrella del PHV como producto: "percentil p40 hoy →
 * proyectado p80 a los 21". Convierte la corrección de maduración en una
 * NARRATIVA DE FUTURO que ningún competidor ofrece (comparan contra edad
 * cronológica plana → no proyectan la convergencia biológica).
 *
 * Modelo (transparente, no caja negra):
 *   - A los ~18-19 años la ventaja/desventaja por maduración desaparece
 *     (todos han pasado el PHV). El percentil converge hacia el "percentil
 *     ajustado por maduración" (el talento real ya sin ruido biológico).
 *   - Interpolamos linealmente desde el percentil actual (crudo) hacia el
 *     percentil de madurez (ajustado) a medida que se cierra el gap PHV.
 *   - Un madurador tardío p40 hoy converge AL ALZA; un precoz p75 hoy
 *     converge A LA BAJA.
 */

import type { MaturityAssessment } from "./maturity";

export interface ProjectionPoint {
  age: number;
  /** Percentil proyectado (0-100). */
  percentile: number;
  /** true si es el punto "hoy" (dato real, no proyección). */
  isNow?: boolean;
}

export interface MaturityProjection {
  currentPercentile: number;
  projectedPercentile: number;
  /** Edad a la que consideramos "madurez" (convergencia). */
  maturityAge: number;
  delta: number;
  curve: ProjectionPoint[];
  headline: string;
  narrative: string;
}

const MATURITY_AGE = 20; // convergencia biológica ~20

/**
 * Proyecta el percentil de un jugador a madurez.
 *
 * @param currentPercentile  percentil actual (crudo, vs pares por edad)
 * @param assessment         evaluación canónica (timing + factor gateado)
 * @param chronologicalAge   edad actual
 */
export function projectToMaturity(
  currentPercentile: number,
  assessment: MaturityAssessment,
  chronologicalAge: number,
): MaturityProjection {
  const cur = Math.max(1, Math.min(99, currentPercentile));

  // Percentil "de madurez" = percentil ajustado por el factor CANÓNICO (que es
  // 1 cuando el timing no es firme → no proyecta convergencia sin base).
  const adjustedRaw = cur * assessment.adjustmentFactor;
  const projected = Math.max(1, Math.min(99, Math.round(adjustedRaw)));

  // Curva: de la edad actual a la de madurez, el gap se cierra linealmente.
  const curve: ProjectionPoint[] = [];
  const startAge = Math.round(chronologicalAge);
  const endAge = Math.max(startAge + 1, MATURITY_AGE);
  const span = endAge - startAge;

  for (let a = startAge; a <= endAge; a++) {
    const t = span > 0 ? (a - startAge) / span : 1;
    const pct = Math.round(cur + (projected - cur) * t);
    curve.push({ age: a, percentile: Math.max(1, Math.min(99, pct)), isNow: a === startAge });
  }

  const delta = projected - cur;
  const dir = delta >= 3 ? "al alza" : delta <= -3 ? "a la baja" : "estable";

  let headline: string;
  let narrative: string;

  if (assessment.timing === "unknown") {
    // Timing no afirmado (lejos del PHV o sin datos): NO proyectamos convergencia.
    headline = `Proyección preliminar (p${cur})`;
    narrative =
      `El timing de maduración aún no puede afirmarse con fiabilidad, así que no ` +
      `proyectamos una convergencia. Añade la altura de ambos padres (%talla adulta) ` +
      `o vuelve cerca del PHV para una proyección fiable.`;
  } else if (assessment.timing === "late" && delta >= 3) {
    headline = `Proyección: p${cur} hoy → p${projected} a los ${endAge}`;
    narrative =
      `Como madurador tardío, su percentil actual (p${cur}) está frenado por la maduración. ` +
      `Cuando sus pares dejen de tener ventaja física (~${endAge} años), su talento real emerge: ` +
      `proyectamos p${projected}. Este es exactamente el jugador que el sesgo del madurador precoz descarta hoy.`;
  } else if (assessment.timing === "early" && delta <= -3) {
    headline = `Proyección: p${cur} hoy → p${projected} a los ${endAge}`;
    narrative =
      `Como madurador precoz, parte de su percentil actual (p${cur}) es ventaja física temporal. ` +
      `Cuando sus pares maduren (~${endAge} años), esa ventaja se iguala: proyección realista p${projected}. ` +
      `No es descartarlo — es no sobrepagar por madurez confundida con talento.`;
  } else {
    headline = `Proyección estable: ~p${projected} a los ${endAge}`;
    narrative =
      `Su percentil se mantiene ${dir} hacia la madurez (p${cur} → p${projected}). ` +
      `Sin distorsión relevante por maduración: su nivel actual es representativo.`;
  }

  return {
    currentPercentile: cur,
    projectedPercentile: projected,
    maturityAge: endAge,
    delta,
    curve,
    headline,
    narrative,
  };
}
