/**
 * VITAS · Motor canónico de maduración biológica (fuente ÚNICA de verdad)
 *
 * Combina los dos métodos no invasivos validados y devuelve UN solo resultado,
 * para que ninguna pantalla (Rankings, ScoutFeed, PlayerHub, Master, PDF…)
 * contradiga a otra. Separa de forma explícita dos conceptos que el resto del
 * sector (y el código antiguo de VITAS) confundía:
 *
 *   • ESTADO de maduración (pre / circa / post-PHV): DÓNDE está el jugador en
 *     su propia curva de crecimiento AHORA. A los 9 años, TODO jugador es
 *     pre-PHV — eso no dice nada de si madura antes o después que sus pares.
 *
 *   • TIMING vs pares (precoz / en fase / tardío): si su estirón llega ANTES o
 *     DESPUÉS que la media. Es el núcleo de la tesis anti-sesgo de VITAS
 *     (el "talento oculto" = madurador TARDÍO, infravalorado hoy). Se deriva
 *     comparando la edad predicha del PHV (APHV) con la media poblacional.
 *
 * Bases científicas (sin inventar nada):
 *   • Maturity offset & APHV = edad − offset — Mirwald et al. (2002).
 *   • % de talla adulta predicha (%PAH) + bandas — Khamis-Roche (1994),
 *     bio-banding Cumming et al. (2017). Ver khamisRoche.ts.
 *   • Media de edad al PHV: chicos 13.7 (SD 1.4), chicas 12.1 (SD 1.4)
 *     — p.ej. PMC4677560 (Relationship between timing of PHV and pubertal
 *     staging). Se usa ±1.0 año como umbral de timing (conservador < 1 SD).
 *
 * BLINDAJE (sin falsos positivos): la predicción de Mirwald está sesgada hacia
 * la media y pierde validez lejos del PHV. Por eso el TIMING solo se AFIRMA con
 * confianza suficiente (%PAH disponible, o Mirwald dentro de ventana de
 * validez). Con datos insuficientes o fuera de rango → `timing: "unknown"` y
 * nota de validez, nunca una etiqueta categórica dudosa.
 *
 * Edge-safe: importable desde api/ y src/.
 */

import { computeMirwald, canComputeMirwald } from "./mirwald";
import {
  computeKhamisRoche,
  canComputeKhamisRoche,
  type PhvStatus,
  type Sex,
} from "./khamisRoche";

export type { PhvStatus, Sex };
export type MaturityMethod = "khamis_roche_pah" | "mirwald_offset" | "insufficient_data";
export type MaturityTiming = "early" | "on_time" | "late" | "unknown";
export type MaturityConfidence = "high" | "moderate" | "low" | "none";

/** Media poblacional de edad al PHV (años) y umbral de timing. */
export const APHV_REFERENCE = {
  M: 13.7,
  F: 12.1,
  /** ± años respecto a la media para clasificar precoz/tardío (conservador). */
  timingBand: 1.0,
} as const;

export interface MaturityInput {
  sex?: Sex | null;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  sittingHeightCm?: number | null;
  legLengthCm?: number | null;
  motherHeightCm?: number | null;
  fatherHeightCm?: number | null;
}

export interface MaturityAssessment {
  method: MaturityMethod;
  confidence: MaturityConfidence;
  /** Estado en la propia curva (de %PAH si hay, si no del offset). */
  status: PhvStatus | "unknown";
  /** Timing vs pares — SOLO afirmado con confianza suficiente. */
  timing: MaturityTiming;
  /** Factor de ajuste del VSI por maduración (1 = neutro). Solo ≠1 con timing firme. */
  adjustmentFactor: number;
  // ── Khamis-Roche (%PAH), si hay datos + alturas parentales ──
  percentPredictedAdultHeight?: number;
  predictedAdultHeightCm?: number;
  // ── Mirwald, si hay datos antropométricos ──
  maturityOffset?: number;
  ageAtPHV?: number;
  chronologicalAge?: number;
  /** true si sitting height / leg length fueron estimados (menor confianza). */
  estimated?: boolean;
  /** Nota honesta de validez/limitación para mostrar en UI. */
  validityNote?: string;
}

/** Ventana en la que la predicción de Mirwald es razonablemente fiable:
 *  |offset| ≤ 2.5 años del PHV (Mirwald pierde validez lejos del PHV). */
const MIRWALD_VALID_WINDOW_YEARS = 2.5;

function timingFromAphv(ageAtPHV: number, sex: Sex): MaturityTiming {
  const mean = sex === "M" ? APHV_REFERENCE.M : APHV_REFERENCE.F;
  const d = ageAtPHV - mean;
  if (d < -APHV_REFERENCE.timingBand) return "early"; // PHV antes que la media
  if (d > APHV_REFERENCE.timingBand) return "late"; // PHV después → madurador tardío
  return "on_time";
}

/** Factor de ajuste VSI: sube al tardío (infravalorado), baja al precoz. */
function adjustmentFor(timing: MaturityTiming): number {
  if (timing === "late") return 1.12;
  if (timing === "early") return 0.92;
  return 1.0;
}

/**
 * Resuelve la maduración de un jugador a partir de sus datos antropométricos.
 * Preferencia de método: Khamis-Roche %PAH (más robusto, estándar bio-banding)
 * > Mirwald offset. Nunca inventa: si no hay datos, method "insufficient_data".
 */
export function resolveMaturity(input: MaturityInput): MaturityAssessment {
  const sex: Sex = input.sex === "F" ? "F" : "M";
  const age =
    typeof input.ageYears === "number" && Number.isFinite(input.ageYears)
      ? input.ageYears
      : undefined;

  const kr = canComputeKhamisRoche({
    sex,
    ageYears: age,
    heightCm: input.heightCm ?? undefined,
    weightKg: input.weightKg ?? undefined,
    motherHeightCm: input.motherHeightCm ?? undefined,
    fatherHeightCm: input.fatherHeightCm ?? undefined,
  })
    ? computeKhamisRoche({
        sex,
        ageYears: age as number,
        heightCm: input.heightCm as number,
        weightKg: input.weightKg as number,
        motherHeightCm: input.motherHeightCm as number,
        fatherHeightCm: input.fatherHeightCm as number,
      })
    : null;

  const mir = canComputeMirwald({
    age,
    height: input.heightCm ?? undefined,
    weight: input.weightKg ?? undefined,
  })
    ? computeMirwald({
        chronologicalAge: age as number,
        height: input.heightCm as number,
        weight: input.weightKg as number,
        gender: sex,
        sittingHeight: input.sittingHeightCm ?? undefined,
        legLength: input.legLengthCm ?? undefined,
      })
    : null;

  // Sin ningún método → no afirmamos nada.
  if (!kr && !mir) {
    return {
      method: "insufficient_data",
      confidence: "none",
      status: "unknown",
      timing: "unknown",
      adjustmentFactor: 1,
      validityNote:
        "Faltan datos antropométricos (edad, altura, peso) para estimar la maduración.",
    };
  }

  const chronologicalAge = mir?.chronologicalAge ?? age;
  const ageAtPHV = mir?.ageAtPHV;
  const offset = mir?.offset;

  // ── ESTADO (pre/circa/post-PHV): %PAH si hay, si no signo del offset ──
  let status: PhvStatus | "unknown" = "unknown";
  if (kr) {
    status = kr.status;
  } else if (offset !== undefined) {
    status = offset < -1 ? "pre_phv" : offset > 1 ? "post_phv" : "circa_phv";
  }

  // ── TIMING vs pares + CONFIANZA (blindaje anti-falso-positivo) ──
  let timing: MaturityTiming = "unknown";
  let confidence: MaturityConfidence;
  let method: MaturityMethod;
  let validityNote: string | undefined;

  if (kr) {
    // %PAH disponible → método preferido, confianza alta.
    method = "khamis_roche_pah";
    confidence = "high";
    // El timing vs pares se deriva del APHV de Mirwald si está en ventana; si no,
    // se apoya en la banda %PAH interpretada por edad (misma dirección).
    if (ageAtPHV !== undefined && offset !== undefined && Math.abs(offset) <= MIRWALD_VALID_WINDOW_YEARS) {
      timing = timingFromAphv(ageAtPHV, sex);
    } else {
      // Fuera de ventana Mirwald: no forzamos una etiqueta de APHV poco fiable;
      // el %PAH da el ESTADO con confianza, pero el timing queda indeterminado.
      timing = "unknown";
      validityNote =
        "Estado por %talla adulta (Khamis-Roche) fiable; el timing vs pares no se afirma por estar lejos del PHV.";
    }
  } else if (mir && offset !== undefined && ageAtPHV !== undefined) {
    method = "mirwald_offset";
    const nearPhv = Math.abs(offset) <= MIRWALD_VALID_WINDOW_YEARS;
    if (nearPhv) {
      confidence = mir.estimated ? "moderate" : "high";
      timing = timingFromAphv(ageAtPHV, sex);
    } else {
      // Lejos del PHV (p.ej. pre-púber de 9 años): Mirwald está sesgado hacia la
      // media → NO afirmamos precoz/tardío (evita falso positivo). Confianza baja.
      confidence = "low";
      timing = "unknown";
      validityNote =
        "Estimación preliminar: la edad está lejos del PHV, donde la predicción de Mirwald pierde fiabilidad. Añade altura de ambos padres para un cálculo por %talla adulta (Khamis-Roche).";
    }
  } else {
    method = "insufficient_data";
    confidence = "none";
  }

  return {
    method,
    confidence,
    status,
    timing,
    adjustmentFactor: adjustmentFor(timing),
    percentPredictedAdultHeight: kr?.percentOfPredictedAdultHeight,
    predictedAdultHeightCm: kr?.predictedAdultHeightCm,
    maturityOffset: offset,
    ageAtPHV,
    chronologicalAge,
    estimated: mir?.estimated,
    validityNote,
  };
}
