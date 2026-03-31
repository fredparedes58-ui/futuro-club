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

// Pesos por dimensión para el VSI
const VSI_WEIGHTS: Record<keyof PlayerMetrics, number> = {
  speed:     0.18,
  technique: 0.22,
  vision:    0.20,
  stamina:   0.15,
  shooting:  0.13,
  defending: 0.12,
};

export const MetricsService = {
  /**
   * Calcula el VSI (VITAS Scouting Index) — índice compuesto 0-100
   */
  calculateVSI(metrics: PlayerMetrics): number {
    const raw = Object.entries(VSI_WEIGHTS).reduce((acc, [key, weight]) => {
      return acc + metrics[key as keyof PlayerMetrics] * weight;
    }, 0);
    return Math.round(raw * 10) / 10;
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
  calculatePercentile(playerVSI: number, allVSIs: number[]): number {
    if (allVSIs.length === 0) return 50;
    const below = allVSIs.filter((v) => v < playerVSI).length;
    return Math.round((below / allVSIs.length) * 100);
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
      percentile: MetricsService.calculatePercentile(raw, allVSIs),
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
