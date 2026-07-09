/**
 * VITAS · Khamis-Roche — Predicted Adult Height (PAH) y % de talla adulta (%PAH)
 *
 * Método NO invasivo, estándar en fútbol formativo (bio-banding de la Premier
 * League) para estimar la maduración biológica SOMÁTICA. A diferencia del
 * maturity offset de Mirwald (que estima "años respecto al PHV"), el %PAH es
 * menos dependiente de la edad y es el que usan los programas de bio-banding.
 *
 * Fórmula (Khamis & Roche, 1994, Pediatrics 94:504-507 + erratum 1995;95:457):
 *   PAH(pulgadas) = B0 + bH·altura(in) + bW·peso(lb) + bMP·midparent(in)
 *   donde midparent = (altura_madre + altura_padre) / 2
 * Coeficientes específicos por SEXO y por medio año de EDAD (4.0–17.5).
 * Error estándar publicado ≈ 5.6 cm (chicos) / 4.3 cm (chicas).
 *
 * Bandas de maduración por %PAH (Cumming et al., 2017 — bio-banding):
 *   pre-PHV  < 88 %   · circa-PHV 88–95 %   · post-PHV > 95 %
 *
 * Fuente de coeficientes: paquete R `matuR` (josedv82), tabla Khamis-Roche.
 * NOTA de integridad: la tabla original de matuR contenía 3 erratas de
 * transcripción en el coeficiente de peso masculino (mW), detectadas por
 * ruptura de la tendencia suave y restauradas al valor coherente con sus
 * vecinos (edad 5.0, 7.5 y 9.0). No se ha inventado ningún valor.
 *
 * Edge-safe (sin dependencias del DOM): importable desde api/ y src/.
 */

export type Sex = "M" | "F";

/** Estado de maduración somática por %PAH (bio-banding, Cumming 2017). */
export type PhvStatus = "pre_phv" | "circa_phv" | "post_phv";

interface KRRow {
  age: number;
  mB0: number; mH: number; mW: number; mMP: number;
  fB0: number; fH: number; fW: number; fMP: number;
}

/** Coeficientes Khamis-Roche por medio año (imperial: in, lb). */
const KR_COEFFS: readonly KRRow[] = [
  { age: 4, mB0: -10.2567, mH: 1.23812, mW: -0.0087235, mMP: 0.50286, fB0: -8.1325, fH: 1.24768, fW: -0.019435, fMP: 0.44774 },
  { age: 4.5, mB0: -10.719, mH: 1.15964, mW: -0.0074454, mMP: 0.52887, fB0: -6.47656, fH: 1.22177, fW: -0.018519, fMP: 0.41381 },
  { age: 5, mB0: -11.0213, mH: 1.10674, mW: -0.0064778, mMP: 0.53919, fB0: -5.13582, fH: 1.19932, fW: -0.01753, fMP: 0.38467 },
  { age: 5.5, mB0: -11.1556, mH: 1.0748, mW: -0.005776, mMP: 0.53691, fB0: -4.13791, fH: 1.1788, fW: -0.016484, fMP: 0.36039 },
  { age: 6, mB0: -11.1138, mH: 1.05923, mW: -0.0052947, mMP: 0.52513, fB0: -3.51039, fH: 1.15866, fW: -0.0154, fMP: 0.34105 },
  { age: 6.5, mB0: -11.0221, mH: 1.05542, mW: -0.0049892, mMP: 0.50692, fB0: -3.14322, fH: 1.13737, fW: -0.014294, fMP: 0.32672 },
  { age: 7, mB0: -10.9984, mH: 1.05877, mW: -0.0048144, mMP: 0.48538, fB0: -2.87645, fH: 1.11342, fW: -0.013184, fMP: 0.31748 },
  { age: 7.5, mB0: -11.0214, mH: 1.06467, mW: -0.0047256, mMP: 0.46361, fB0: -2.66291, fH: 1.08525, fW: -0.012086, fMP: 0.3134 },
  { age: 8, mB0: -11.0696, mH: 1.06853, mW: -0.0046778, mMP: 0.44469, fB0: -2.45559, fH: 1.05135, fW: -0.011019, fMP: 0.31457 },
  { age: 8.5, mB0: -11.122, mH: 1.06572, mW: -0.0046261, mMP: 0.43171, fB0: -2.20728, fH: 1.01018, fW: -0.009999, fMP: 0.32105 },
  { age: 9, mB0: -11.1571, mH: 1.05166, mW: -0.0045254, mMP: 0.42776, fB0: -1.87098, fH: 0.9602, fW: -0.009044, fMP: 0.33291 },
  { age: 9.5, mB0: -11.1405, mH: 1.02174, mW: -0.0043311, mMP: 0.43593, fB0: -1.0633, fH: 0.89989, fW: -0.008171, fMP: 0.35025 },
  { age: 10, mB0: -11.038, mH: 0.97135, mW: -0.0039981, mMP: 0.45932, fB0: 0.33468, fH: 0.82771, fW: -0.007397, fMP: 0.37312 },
  { age: 10.5, mB0: -10.8286, mH: 0.89589, mW: -0.0034814, mMP: 0.50101, fB0: 1.97366, fH: 0.74213, fW: -0.006739, fMP: 0.40161 },
  { age: 11, mB0: -10.4917, mH: 0.81239, mW: -0.002905, mMP: 0.54781, fB0: 3.50436, fH: 0.67173, fW: -0.006136, fMP: 0.42042 },
  { age: 11.5, mB0: -10.0065, mH: 0.74134, mW: -0.0024167, mMP: 0.58409, fB0: 4.57747, fH: 0.6415, fW: -0.005518, fMP: 0.41686 },
  { age: 12, mB0: -9.3522, mH: 0.68325, mW: -0.0020076, mMP: 0.60927, fB0: 4.84365, fH: 0.64452, fW: -0.004894, fMP: 0.3949 },
  { age: 12.5, mB0: -8.6055, mH: 0.63869, mW: -0.0016681, mMP: 0.62279, fB0: 4.27869, fH: 0.67386, fW: -0.004272, fMP: 0.3585 },
  { age: 13, mB0: -7.8632, mH: 0.60818, mW: -0.0013895, mMP: 0.62407, fB0: 3.21417, fH: 0.7226, fW: -0.003661, fMP: 0.31163 },
  { age: 13.5, mB0: -7.1348, mH: 0.59228, mW: -0.0011624, mMP: 0.61253, fB0: 1.83456, fH: 0.78383, fW: -0.003067, fMP: 0.25826 },
  { age: 14, mB0: -6.4299, mH: 0.59151, mW: -0.0009776, mMP: 0.58762, fB0: 0.32425, fH: 0.85062, fW: -0.0025, fMP: 0.20235 },
  { age: 14.5, mB0: -5.7578, mH: 0.60643, mW: -0.0008261, mMP: 0.54875, fB0: -1.13224, fH: 0.91605, fW: -0.001967, fMP: 0.14787 },
  { age: 15, mB0: -5.1282, mH: 0.63757, mW: -0.0006988, mMP: 0.49536, fB0: -2.35055, fH: 0.97319, fW: -0.001477, fMP: 0.0988 },
  { age: 15.5, mB0: -4.5092, mH: 0.68548, mW: -0.0005863, mMP: 0.42687, fB0: -3.10326, fH: 1.01514, fW: -0.001037, fMP: 0.05909 },
  { age: 16, mB0: -3.9292, mH: 0.75069, mW: -0.0004795, mMP: 0.34271, fB0: -3.17885, fH: 1.03496, fW: -0.000655, fMP: 0.03272 },
  { age: 16.5, mB0: -3.4873, mH: 0.83375, mW: -0.0003695, mMP: 0.24231, fB0: -2.41657, fH: 1.02573, fW: -0.00034, fMP: 0.02364 },
  { age: 17, mB0: -3.283, mH: 0.9352, mW: -0.000247, mMP: 0.1251, fB0: -0.65579, fH: 0.98054, fW: -0.0001, fMP: 0.03584 },
  { age: 17.5, mB0: -3.4156, mH: 1.05558, mW: -0.0001027, mMP: -0.0095, fB0: 2.26429, fH: 0.89246, fW: 0.000057, fMP: 0.07327 },
] as const;

export const KR_MIN_AGE = 4;
export const KR_MAX_AGE = 17.5;

/** Bandas de bio-banding por %PAH (Cumming et al., 2017). */
export const PHV_BANDS = {
  prePhvMax: 88, // < 88 % → pre-PHV
  postPhvMin: 95, // > 95 % → post-PHV (88–95 = circa-PHV)
} as const;

const CM_PER_IN = 2.54;
const LB_PER_KG = 2.2046226218;

/** Redondea la edad al medio año más cercano dentro del rango válido KR. */
function nearestHalfYear(age: number): number {
  const rounded = Math.round(age * 2) / 2;
  return Math.min(KR_MAX_AGE, Math.max(KR_MIN_AGE, rounded));
}

export interface KhamisRocheInput {
  sex: Sex;
  ageYears: number;
  heightCm: number;
  weightKg: number;
  /** Altura de la madre (cm). */
  motherHeightCm: number;
  /** Altura del padre (cm). */
  fatherHeightCm: number;
}

export interface KhamisRocheResult {
  predictedAdultHeightCm: number;
  /** % de la talla adulta ya alcanzado (indicador de maduración somática). */
  percentOfPredictedAdultHeight: number;
  status: PhvStatus;
  midparentHeightCm: number;
}

/** ¿Hay datos suficientes y en rango para un cálculo Khamis-Roche válido? */
export function canComputeKhamisRoche(p: {
  sex?: unknown;
  ageYears?: number | null;
  heightCm?: number | null;
  weightKg?: number | null;
  motherHeightCm?: number | null;
  fatherHeightCm?: number | null;
}): boolean {
  const pos = (v: unknown) => typeof v === "number" && Number.isFinite(v) && v > 0;
  return (
    (p.sex === "M" || p.sex === "F") &&
    typeof p.ageYears === "number" &&
    Number.isFinite(p.ageYears) &&
    p.ageYears >= KR_MIN_AGE &&
    p.ageYears <= KR_MAX_AGE &&
    pos(p.heightCm) &&
    pos(p.weightKg) &&
    pos(p.motherHeightCm) &&
    pos(p.fatherHeightCm)
  );
}

/** Clasifica el %PAH en banda de maduración (Cumming 2017). */
export function bandFromPercentPAH(pct: number): PhvStatus {
  if (pct < PHV_BANDS.prePhvMax) return "pre_phv";
  if (pct > PHV_BANDS.postPhvMin) return "post_phv";
  return "circa_phv";
}

/**
 * Calcula PAH + %PAH + banda. Devuelve null si los datos son insuficientes o
 * están fuera del rango de validez (4–17.5 años) → nunca produce un resultado
 * "inventado" con datos incompletos (evita falsos positivos).
 */
export function computeKhamisRoche(input: KhamisRocheInput): KhamisRocheResult | null {
  if (!canComputeKhamisRoche(input)) return null;

  const row = KR_COEFFS.find((r) => r.age === nearestHalfYear(input.ageYears));
  if (!row) return null;

  const midparentCm = (input.motherHeightCm + input.fatherHeightCm) / 2;

  const hIn = input.heightCm / CM_PER_IN;
  const wLb = input.weightKg * LB_PER_KG;
  const mpIn = midparentCm / CM_PER_IN;

  const [b0, bH, bW, bMP] =
    input.sex === "M"
      ? [row.mB0, row.mH, row.mW, row.mMP]
      : [row.fB0, row.fH, row.fW, row.fMP];

  const pahIn = b0 + bH * hIn + bW * wLb + bMP * mpIn;
  const pahCm = pahIn * CM_PER_IN;

  // Guarda de plausibilidad: la talla adulta predicha debe superar la altura
  // actual (aún está creciendo). Si el modelo devuelve algo incoherente por
  // datos extremos, no lo publicamos como válido.
  if (!Number.isFinite(pahCm) || pahCm <= input.heightCm) return null;

  const pct = Number(((input.heightCm / pahCm) * 100).toFixed(1));

  return {
    predictedAdultHeightCm: Number(pahCm.toFixed(1)),
    percentOfPredictedAdultHeight: pct,
    status: bandFromPercentPAH(pct),
    midparentHeightCm: Number(midparentCm.toFixed(1)),
  };
}
