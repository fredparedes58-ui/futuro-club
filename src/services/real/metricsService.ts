/**
 * VITAS Metrics Service — DETERMINISTA
 * Cálculos matemáticos puros: VSI, percentiles, tendencias.
 * No usa IA. Algoritmos fijos y reproducibles.
 */

export interface PlayerMetrics {
  speed: number;
  technique: number;
  vision: number;
  stamina: number;
  shooting: number;
  defending: number;
}

export interface VSIResult {
  raw: number;
  adjusted: number;
  percentile: number;
  trend: "up" | "down" | "stable";
  label: "elite" | "high" | "medium" | "developing";
}

/**
 * VSI de FICHA — pesos + fórmula (fuente ÚNICA · invariante #7). Antes esta fórmula
 * estaba triplicada idéntica en metricsService, api/players/_crud.ts y
 * api/rankings/_list.ts; ahora esas dos importan calculateFichaVsi de aquí.
 * Entradas = SLIDERS subjetivos del coach (no medida). Índice DISTINTO del VSI de VÍDEO
 * (api/agents/_vsi-calculator.ts), a propósito.
 *
 * Justificación de pesos: technique 0.22 (predictor más fuerte de éxito profesional,
 * Huijgen et al. 2009, no depende de maduración); vision 0.20 (inteligencia de juego,
 * Jordet 2005 / Savelsbergh 2006); speed 0.18 (dependiente de PHV → no sobrevalorar
 * ventajas madurativas temporales); stamina 0.15 (altamente entrenable); shooting 0.13
 * (pico tardío 27-28); defending 0.12 (capacidades defensivas maduran aún más tarde).
 */
export const FICHA_VSI_WEIGHTS: Record<keyof PlayerMetrics, number> = {
  speed: 0.18,
  technique: 0.22,
  vision: 0.2,
  stamina: 0.15,
  shooting: 0.13,
  defending: 0.12,
};

/**
 * Suma ponderada de las 6 dimensiones → VSI de ficha (0-100, un decimal). Acepta
 * métricas parciales (dimensión ausente cuenta 0), igual que las 3 rutas previas.
 */
export function calculateFichaVsi(
  metrics: Partial<Record<keyof PlayerMetrics, number>>,
): number {
  const raw = (Object.keys(FICHA_VSI_WEIGHTS) as (keyof PlayerMetrics)[]).reduce(
    (acc, key) => acc + (metrics[key] ?? 0) * FICHA_VSI_WEIGHTS[key],
    0,
  );
  return Math.round(raw * 10) / 10;
}

export const MetricsService = {
  /** VSI de FICHA (evaluación del entrenador) — delega en calculateFichaVsi (arriba). */
  calculateVSI(metrics: PlayerMetrics): number {
    return calculateFichaVsi(metrics);
  },

  /**
   * Calcula la tendencia comparando VSI actual con histórico
   */
  calculateTrend(currentVSI: number, previousVSI: number): "up" | "down" | "stable" {
    const delta = currentVSI - previousVSI;
    if (delta > 2) return "up";
    if (delta < -2) return "down";
    return "stable";
  },

  /**
   * Calcula el percentil de un jugador dentro de un grupo
   */
  calculatePercentile(playerVSI: number | null, allVSIs: (number | null)[]): number | null {
    // Un jugador sin evaluar (vsi null) no tiene percentil: no se le fabrica uno
    // (invariante #2). Y los null del grupo se excluyen de la población para no
    // ensuciar el percentil del resto (v < null daría v < 0 → false para todos).
    if (playerVSI == null) return null;
    const pop = allVSIs.filter((v): v is number => v != null);
    if (pop.length === 0) return 50;
    const below = pop.filter((v) => v < playerVSI).length;
    return Math.round((below / pop.length) * 100);
  },

  /**
   * Clasifica el VSI en etiqueta semántica
   */
  classifyVSI(vsi: number): "elite" | "high" | "medium" | "developing" {
    if (vsi >= 80) return "elite";
    if (vsi >= 65) return "high";
    if (vsi >= 50) return "medium";
    return "developing";
  },

  /**
   * Resultado VSI completo
   */
  getVSIResult(
    metrics: PlayerMetrics,
    previousVSI: number | null,
    allVSIs: number[]
  ): VSIResult {
    const raw = MetricsService.calculateVSI(metrics);
    const trend = previousVSI !== null
      ? MetricsService.calculateTrend(raw, previousVSI)
      : "stable";
    return {
      raw,
      adjusted: raw,
      // raw nunca es null aquí; el ?? 50 solo satisface el contrato null-safe
      // (grupo vacío ya devuelve 50 dentro de calculatePercentile).
      percentile: MetricsService.calculatePercentile(raw, allVSIs) ?? 50,
      trend,
      label: MetricsService.classifyVSI(raw),
    };
  },

  /**
   * Normaliza una métrica de 0-100 a 0-1
   */
  normalize(value: number): number {
    return Math.min(1, Math.max(0, value / 100));
  },

  /**
   * Calcula el promedio ponderado de métricas
   */
  weightedAverage(values: number[], weights: number[]): number {
    const total = weights.reduce((a, b) => a + b, 0);
    const sum = values.reduce((acc, val, i) => acc + val * (weights[i] / total), 0);
    return Math.round(sum * 10) / 10;
  },
};
