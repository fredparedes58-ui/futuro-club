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
 * La magnitud científica válida es ageAtPHV = chronologicalAge − offset (Mirwald
 * 2002): la edad estimada del estirón. El "offset" son AÑOS respecto al PHV, no
 * un delta de edad, así que NO se suma a la edad.
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
    chronologicalAge: age,
    phvStatus,
    developmentWindow,
    formula,
    estimated,
    confidence,
  };
}

/** True si el jugador tiene datos suficientes y en rango para un PHV válido.
 *  Mirwald se validó en ~8-18 años; fuera de ese rango (o con antropometría
 *  absurda) no emitimos un estado/offset categórico. */
export function canComputeMirwald(p: {
  age?: number;
  height?: number;
  weight?: number;
}): boolean {
  const inRange = (v: unknown, lo: number, hi: number) =>
    typeof v === "number" && Number.isFinite(v) && v >= lo && v <= hi;
  return (
    inRange(p.age, 8, 18) &&
    inRange(p.height, 90, 230) &&
    inRange(p.weight, 15, 150)
  );
}
