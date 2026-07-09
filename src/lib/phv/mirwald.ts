/**
 * VITAS · Mirwald cliente (Sprint 2.1)
 *
 * Port client-side de la fórmula Mirwald (2002) que hoy vive en el agente
 * `api/agents/_phv-calculator.ts`. Permite calcular el PHV **offline, sin
 * Supabase ni Anthropic**, con solo los datos antropométricos que cada
 * jugador ya tiene (altura, peso, edad, género).
 *
 * Diferencia con el agente servidor: el servidor EXIGE altura-sentado y
 * longitud-de-pierna reales (rechaza estimaciones). Aquí, para que el
 * producto funcione con datos parciales, ESTIMAMOS esas dos medidas cuando
 * faltan (sittingHeight ≈ altura×0.52, legLength ≈ altura×0.48) y bajamos
 * la confianza + marcamos el flag `estimated`. Honestidad sobre la calidad
 * del dato — nunca ocultar que fue estimado.
 *
 * biologicalAge = chronologicalAge + offset
 *   offset < 0 → biológicamente por DETRÁS de su edad (pre-PHV)
 *   offset > 0 → biológicamente por DELANTE (post-PHV)
 */

export interface MirwaldInput {
  chronologicalAge: number;
  height: number;            // cm
  weight: number;            // kg
  gender?: "M" | "F";
  sittingHeight?: number;    // cm — si falta se estima
  legLength?: number;        // cm — si falta se estima
}

export interface MirwaldResult {
  offset: number;                // años respecto al PHV (Mirwald maturity offset)
  /**
   * Edad predicha del PHV = edad cronológica − maturity offset (Mirwald 2002).
   * Es la magnitud científicamente válida: "a qué edad se estima el estirón".
   */
  ageAtPHV: number;
  /**
   * @deprecated NO tiene base científica: el maturity offset son "años respecto
   * al PHV", no un delta de edad, así que `edad + offset` produce valores
   * absurdos (un niño de 9 con offset −3.8 daría "5.2"). Se mantiene solo para
   * compatibilidad temporal; usar `ageAtPHV` (APHV) y el motor de maduración
   * (src/lib/phv/maturity.ts). Se eliminará al migrar los consumidores.
   */
  biologicalAge: number;
  chronologicalAge: number;
  /** Convención interna del codebase (timeline propio, NO vs pares). */
  phvStatus: "pre_phv" | "during_phv" | "post_phv";
  developmentWindow: "critical" | "active" | "stable";
  formula: "mirwald_male" | "mirwald_female";
  /** true si sittingHeight/legLength fueron estimados desde la altura. */
  estimated: boolean;
  confidence: number;            // 0-1
}

/** Calcula el maturity offset (Mirwald) client-side, con estimación si falta. */
export function computeMirwald(input: MirwaldInput): MirwaldResult {
  const age = input.chronologicalAge;
  const height = input.height;
  const weight = input.weight;
  const gender = input.gender ?? "M";

  const estimated = input.sittingHeight == null || input.legLength == null;
  const sittingHeight = input.sittingHeight ?? height * 0.52;
  const legLength = input.legLength ?? height * 0.48;

  let offset: number;
  let formula: MirwaldResult["formula"];

  if (gender === "M") {
    formula = "mirwald_male";
    offset =
      -9.236 +
      0.0002708 * (legLength * sittingHeight) -
      0.001663 * (age * legLength) +
      0.007216 * (age * sittingHeight) +
      (height > 0 ? 0.02292 * ((weight / height) * 100) : 0);
  } else {
    formula = "mirwald_female";
    offset =
      -9.376 +
      0.0001882 * (legLength * sittingHeight) +
      0.0022 * (age * legLength) +
      0.005841 * (age * sittingHeight) -
      0.002658 * (age * weight) +
      (height > 0 ? 0.07693 * ((weight / height) * 100) : 0);
  }

  offset = Number(offset.toFixed(2));
  // APHV = edad − offset (Mirwald 2002: el offset se RESTA de la edad).
  const ageAtPHV = Number((age - offset).toFixed(2));
  // Legacy inválido (ver @deprecated en la interfaz). No usar.
  const biologicalAge = Number((age + offset).toFixed(2));

  let phvStatus: MirwaldResult["phvStatus"];
  if (offset < -1.0) phvStatus = "pre_phv";
  else if (offset > 1.0) phvStatus = "post_phv";
  else phvStatus = "during_phv";

  let developmentWindow: MirwaldResult["developmentWindow"];
  if (phvStatus === "during_phv") developmentWindow = "critical";
  else if ((offset >= -2 && offset < -1) || (offset > 1 && offset <= 2))
    developmentWindow = "active";
  else developmentWindow = "stable";

  // Confianza: alta con medidas reales, penalizada con estimación
  const confidence = estimated ? 0.65 : 0.92;

  return {
    offset,
    ageAtPHV,
    biologicalAge,
    chronologicalAge: age,
    phvStatus,
    developmentWindow,
    formula,
    estimated,
    confidence,
  };
}

/** True si el jugador tiene datos suficientes para un PHV client-side. */
export function canComputeMirwald(p: {
  age?: number;
  height?: number;
  weight?: number;
}): boolean {
  return (
    typeof p.age === "number" &&
    typeof p.height === "number" &&
    p.height > 0 &&
    typeof p.weight === "number" &&
    p.weight > 0
  );
}
