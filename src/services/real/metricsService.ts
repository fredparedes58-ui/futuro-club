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
 * Pesos por dimensión para el VSI (VITAS Scouting Index).
 *
 * Justificación científica de cada peso:
 *
 * technique (0.22): Más predictivo de éxito profesional a largo plazo.
 *   Huijgen et al. 2009 demostró que la habilidad técnica en juveniles es el
 *   predictor más fuerte de alcanzar nivel profesional. La técnica no depende
 *   de la maduración biológica y se mantiene estable o mejora con la edad.
 *
 * vision (0.20): Inteligencia de juego, segundo predictor más fuerte.
 *   Estudios de Jordet (2005) y Savelsbergh (2006) muestran correlación directa
 *   entre frecuencia de escaneo visual y calidad de decisión. La visión/lectura
 *   de juego diferencia consistentemente a jugadores élite de promedio.
 *
 * speed (0.18): Importante pero menos predictivo en juveniles por maduración.
 *   La velocidad depende fuertemente del estado de maduración (PHV). Un jugador
 *   "lento" pre-PHV puede ser rápido post-PHV. Peso moderado para no sobrevaluar
 *   ventajas madurativas temporales (late maturers pierden en speed pero no en talento).
 *
 * stamina (0.15): Altamente entrenable, influenciado por PHV.
 *   La resistencia aeróbica tiene ventana sensible durante PHV y es la capacidad
 *   física más entrenable. Peso menor porque mejora con entrenamiento sistemático
 *   independiente del talento base.
 *
 * shooting (0.13): Se desarrolla tarde (peak 27-28 años).
 *   Las curvas de desarrollo muestran que el disparo tiene su pico más tarde que
 *   otras capacidades. Un jugador juvenil con shooting bajo no es limitante si
 *   tiene buena técnica base — la finalización mejora con madurez y experiencia.
 *
 * defending (0.12): Se desarrolla más tarde (peak 29-30 años).
 *   Las capacidades defensivas (anticipación, posicionamiento, duelo) son las que
 *   más tardan en madurar. Peso más bajo porque un jugador juvenil con defending
 *   bajo pero buena visión/técnica tiene alto potencial de mejora defensiva.
 */
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
