/**
 * VITAS · DM-Score — Benchmarks por edad (estructurados)
 *
 * Codifica en datos los benchmarks que viven como texto en
 * `src/data/knowledgeBase/performanceBenchmarks.ts`:
 *
 *   FRECUENCIA DE ESCANEO (giros de cabeza por posesión, antes de recibir):
 *     Sub-12: 0-1 (1+ excepcional) · Sub-14: 1-2 (3+ = top 5%) ·
 *     Sub-16: 2-3 · Sub-18: 2-4 · Profesional élite (MC): 4-6
 *
 *   VELOCIDAD DE DECISIÓN (segundos recepción → acción):
 *     Sub-10: 3-4s · Sub-12: 2-3s (<2 excepcional) · Sub-14: 1.5-2.5s (<1.5 élite)
 *     Sub-16: 1-2s (<1 élite) · Sub-18: <1.5s esperado · Pro: <1s (<0.5 world class)
 *
 * Base científica: investigación de escaneo de Geir Jordet (Premier League) —
 * los jugadores que llegaron a profesional escaneaban 2x más a los 12-14 años.
 * Es el indicador más temprano y estable de potencial élite.
 *
 * Los percentiles (p25/p50/p75/p95) son interpolaciones razonables de los
 * rangos del KB. Se calibrarán con datos del piloto (Sprint 2.6 del plan).
 */

export interface AgeBandBenchmark {
  /** Edad mínima incluida (años). */
  minAge: number;
  /** Edad máxima incluida (años). */
  maxAge: number;
  /** Etiqueta humana. */
  label: string;
  /** Edad representativa de la banda (para "escanea como un jugador de X años"). */
  representativeAge: number;
  /** Percentiles de scans por recepción. */
  p25: number;
  p50: number;
  p75: number;
  p95: number;
}

/** Bandas de frecuencia de escaneo (scans por recepción, pre-recepción). */
export const SCAN_BENCHMARKS: AgeBandBenchmark[] = [
  { minAge: 0,  maxAge: 12, label: "Sub-12", representativeAge: 11, p25: 0.2, p50: 0.5, p75: 1.0, p95: 1.8 },
  { minAge: 13, maxAge: 14, label: "Sub-14", representativeAge: 13.5, p25: 0.8, p50: 1.5, p75: 2.2, p95: 3.0 },
  { minAge: 15, maxAge: 16, label: "Sub-16", representativeAge: 15.5, p25: 1.5, p50: 2.5, p75: 3.2, p95: 4.0 },
  { minAge: 17, maxAge: 18, label: "Sub-18", representativeAge: 17.5, p25: 2.0, p50: 3.0, p75: 3.8, p95: 4.8 },
  { minAge: 19, maxAge: 99, label: "Senior/Pro", representativeAge: 22, p25: 3.0, p50: 4.5, p75: 5.5, p95: 6.5 },
];

/** Devuelve la banda de edad correspondiente. */
export function scanBandForAge(age: number): AgeBandBenchmark {
  return (
    SCAN_BENCHMARKS.find((b) => age >= b.minAge && age <= b.maxAge) ??
    SCAN_BENCHMARKS[SCAN_BENCHMARKS.length - 1]
  );
}

/**
 * Velocidad de decisión (segundos recepción→acción) por banda — referencia
 * para narrativas y tooltips. El BPE ya entrega decisionSpeed 0-100; esta
 * tabla sirve para contextualizar valores crudos en ms cuando existan.
 */
export const DECISION_SPEED_BENCHMARKS: Array<{
  minAge: number;
  maxAge: number;
  label: string;
  goodSecMax: number;   // hasta aquí = "bueno"
  eliteSecMax: number;  // hasta aquí = "élite"
}> = [
  { minAge: 0,  maxAge: 10, label: "Sub-10", goodSecMax: 4.0, eliteSecMax: 3.0 },
  { minAge: 11, maxAge: 12, label: "Sub-12", goodSecMax: 3.0, eliteSecMax: 2.0 },
  { minAge: 13, maxAge: 14, label: "Sub-14", goodSecMax: 2.5, eliteSecMax: 1.5 },
  { minAge: 15, maxAge: 16, label: "Sub-16", goodSecMax: 2.0, eliteSecMax: 1.0 },
  { minAge: 17, maxAge: 18, label: "Sub-18", goodSecMax: 1.5, eliteSecMax: 1.0 },
  { minAge: 19, maxAge: 99, label: "Senior/Pro", goodSecMax: 1.0, eliteSecMax: 0.5 },
];
