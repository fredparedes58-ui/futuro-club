/**
 * VITAS · Intervalos de confianza por métrica (Sprint 3.1 · Explicabilidad calibrada)
 *
 * Ninguna plataforma juvenil muestra incertidumbre por métrica — todas presentan
 * el número como verdad absoluta. VITAS declara el margen: "72 ± 4" en vez de "72".
 * Ataca directamente la caja negra de la competencia (aiScout).
 *
 * IMPORTANTE — calibración: los márgenes son ESTIMACIONES CONSERVADORAS por
 * volumen de datos + tipo de métrica + fuente. Se sustituirán por error empírico
 * (RMSE) cuando el piloto acumule ground-truth. Nunca sobre-vendemos precisión.
 */

export type MetricType = "physical" | "technical" | "tactical" | "cognitive" | "generic";
export type DataSource = "tracking" | "video" | "ai" | "coach" | "unknown";

export interface IntervalInput {
  /** Nº de observaciones (p.ej. vídeos analizados). */
  sampleSize?: number;
  /** Tipo de métrica — las cognitivas/tácticas son más difíciles de medir → banda mayor. */
  metricType?: MetricType;
  /** Fuente del dato — tracking es más preciso que evaluación de coach. */
  dataSource?: DataSource;
  /** Fiabilidad directa 0-1 (si se conoce, tiene prioridad sobre sampleSize). */
  reliability?: number;
  /** Límites de la escala (default 0-100). */
  min?: number;
  max?: number;
}

export interface MetricInterval {
  point: number;
  lower: number;
  upper: number;
  /** Margen ± en puntos de la escala. */
  margin: number;
  /** Nivel de confianza 0-100 (mayor = banda más estrecha). */
  confidenceLevel: number;
  /** Etiqueta corta, p.ej. "± 4". */
  label: string;
  /** Rango, p.ej. "68–76". */
  rangeLabel: string;
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v));
const clamp01 = (v: number) => clamp(v, 0, 1);

/** Margen base por volumen de datos (puntos sobre escala 0-100). */
function sampleTierMargin(sampleSize?: number): number {
  if (sampleSize == null) return 12; // desconocido → prudente
  if (sampleSize <= 0) return 18;
  if (sampleSize === 1) return 14;
  if (sampleSize <= 3) return 9;
  if (sampleSize <= 6) return 5;
  return 3; // 7+ observaciones
}

const TYPE_MULT: Record<MetricType, number> = {
  physical: 0.85, // medible con tracking
  technical: 1.0,
  tactical: 1.2,
  cognitive: 1.3, // lo más difícil de inferir
  generic: 1.0,
};

const SOURCE_MULT: Record<DataSource, number> = {
  tracking: 0.7,
  video: 1.0,
  ai: 1.1,
  coach: 1.2, // más subjetivo
  unknown: 1.3,
};

/**
 * Calcula el intervalo de confianza de una métrica.
 * Devuelve punto, banda inferior/superior, margen y nivel de confianza.
 */
export function computeMetricInterval(value: number, input: IntervalInput = {}): MetricInterval {
  const min = input.min ?? 0;
  const max = input.max ?? 100;
  const point = clamp(value, min, max);

  // Margen base: por fiabilidad si se conoce, si no por volumen de datos.
  const base =
    input.reliability != null
      ? 2 + (1 - clamp01(input.reliability)) * 16 // 2..18
      : sampleTierMargin(input.sampleSize);

  const typeMult = TYPE_MULT[input.metricType ?? "generic"];
  const sourceMult = SOURCE_MULT[input.dataSource ?? "unknown"];

  const scale = (max - min) / 100;
  const margin = clamp(base * typeMult * sourceMult, 1.5, 25) * scale;

  const lower = clamp(point - margin, min, max);
  const upper = clamp(point + margin, min, max);
  const confidenceLevel = clamp(Math.round(100 - (margin / scale) * 2.6), 20, 99);

  const dec = max - min <= 10 ? 1 : 0;
  const m = Number(margin.toFixed(dec));

  return {
    point,
    lower,
    upper,
    margin,
    confidenceLevel,
    label: `± ${m}`,
    rangeLabel: `${lower.toFixed(dec)}–${upper.toFixed(dec)}`,
  };
}
