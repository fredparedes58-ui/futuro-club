/**
 * VITAS · Curvas de Desarrollo por Edad
 *
 * Curvas basadas en papers científicos publicados + datos empíricos.
 * Cada métrica tiene su propia curva porque desarrollan a ritmos diferentes.
 *
 * factor = 0.0 a 1.0, donde 1.0 = peak de esa capacidad
 *
 * Fuentes científicas:
 * - Sprint speed: +0.36 m/s por año U13-U17 (PMC9663653)
 * - Power: +120% de 11 a 17 años en varones (pubmed/40407452)
 * - Dribbling: ventana crítica 10-14 (ResearchGate)
 * - Tactical: mejoras significativas U11→U15 (PMC10135667)
 * - PHV: 13-15 en varones, velocidad 8-10 cm/año (PMC10765433)
 *
 * Estas curvas son el FALLBACK garantizado. Si hay datos Kaggle FIFA
 * disponibles (edades 16+), se calibran contra ellos.
 */

import { getPositionGroup } from "./proPlayers";

// ─── Tipo ────────────────────────────────────────────────────────────────────

type AgeCurve = Record<number, number>;
type MetricName = "pace" | "shooting" | "passing" | "dribbling" | "defending" | "physic";

// ─── Curvas por métrica (8-35 años) ─────────────────────────────────────────

export const DEVELOPMENT_CURVES: Record<MetricName, AgeCurve> = {
  // Sprint speed: pico desarrollo 13-16, peak 25-26
  pace: {
    8: 0.30, 9: 0.34, 10: 0.38, 11: 0.43, 12: 0.48,
    13: 0.55, 14: 0.63, 15: 0.71, 16: 0.78, 17: 0.83,
    18: 0.87, 19: 0.90, 20: 0.93, 21: 0.95, 22: 0.97,
    23: 0.98, 24: 0.99, 25: 1.00, 26: 0.99, 27: 0.98,
    28: 0.96, 29: 0.94, 30: 0.91, 31: 0.88, 32: 0.84,
    33: 0.80, 34: 0.75, 35: 0.70,
  },
  // Shooting: desarrollo técnico 10-16, peak 27-28
  shooting: {
    8: 0.20, 9: 0.24, 10: 0.29, 11: 0.34, 12: 0.40,
    13: 0.46, 14: 0.52, 15: 0.59, 16: 0.66, 17: 0.72,
    18: 0.78, 19: 0.83, 20: 0.87, 21: 0.90, 22: 0.93,
    23: 0.95, 24: 0.96, 25: 0.97, 26: 0.98, 27: 1.00,
    28: 1.00, 29: 0.98, 30: 0.96, 31: 0.94, 32: 0.91,
    33: 0.87, 34: 0.83, 35: 0.78,
  },
  // Passing/Vision: desarrollo gradual, peak 28-30
  passing: {
    8: 0.18, 9: 0.22, 10: 0.27, 11: 0.32, 12: 0.37,
    13: 0.42, 14: 0.48, 15: 0.54, 16: 0.60, 17: 0.66,
    18: 0.72, 19: 0.77, 20: 0.82, 21: 0.86, 22: 0.89,
    23: 0.92, 24: 0.94, 25: 0.96, 26: 0.97, 27: 0.98,
    28: 0.99, 29: 1.00, 30: 1.00, 31: 0.98, 32: 0.96,
    33: 0.93, 34: 0.90, 35: 0.86,
  },
  // Dribbling: ventana crítica 10-14, peak 25-27
  dribbling: {
    8: 0.25, 9: 0.30, 10: 0.36, 11: 0.42, 12: 0.49,
    13: 0.56, 14: 0.63, 15: 0.70, 16: 0.76, 17: 0.81,
    18: 0.85, 19: 0.89, 20: 0.92, 21: 0.94, 22: 0.96,
    23: 0.97, 24: 0.98, 25: 1.00, 26: 1.00, 27: 0.99,
    28: 0.97, 29: 0.95, 30: 0.92, 31: 0.89, 32: 0.85,
    33: 0.81, 34: 0.76, 35: 0.71,
  },
  // Defending: desarrollo tardío, peak 29-30
  defending: {
    8: 0.15, 9: 0.18, 10: 0.22, 11: 0.26, 12: 0.31,
    13: 0.36, 14: 0.42, 15: 0.48, 16: 0.54, 17: 0.60,
    18: 0.66, 19: 0.72, 20: 0.77, 21: 0.82, 22: 0.86,
    23: 0.89, 24: 0.92, 25: 0.94, 26: 0.96, 27: 0.97,
    28: 0.98, 29: 1.00, 30: 1.00, 31: 0.98, 32: 0.96,
    33: 0.93, 34: 0.89, 35: 0.85,
  },
  // Physic/Stamina: pico fuerza 13-17, peak 27-29
  physic: {
    8: 0.22, 9: 0.26, 10: 0.30, 11: 0.35, 12: 0.41,
    13: 0.48, 14: 0.56, 15: 0.64, 16: 0.71, 17: 0.77,
    18: 0.82, 19: 0.86, 20: 0.89, 21: 0.92, 22: 0.94,
    23: 0.96, 24: 0.97, 25: 0.98, 26: 0.99, 27: 1.00,
    28: 1.00, 29: 0.99, 30: 0.97, 31: 0.94, 32: 0.91,
    33: 0.87, 34: 0.82, 35: 0.77,
  },
};

// ─── Ajuste por posición ────────────────────────────────────────────────────
// Defensores pican más tarde en lectura de juego, delanteros antes en velocidad

export const POSITION_PEAK_OFFSET: Record<string, number> = {
  GK: +2,
  CB: +1,
  FB:  0,
  DM: +1,
  CM:  0,
  AM: -1,
  W:  -1,
  ST: -1,
};

// ─── Ajuste por maduración (PHV) ────────────────────────────────────────────

/**
 * Ajuste madurativo basado en PHV offset.
 * - Early maturers (offset > 0): ventaja temporal a 13-15, se normaliza después
 * - Late maturers (offset < 0): desventaja temporal, alcanzan o superan después
 *
 * Retorna un factor multiplicador (0.85 - 1.15)
 */
export function phvAdjustment(age: number, phvOffset: number): number {
  if (!phvOffset || age > 20) return 1.0; // Sin efecto después de los 20

  // Ventana de impacto PHV: 11-18 años
  if (age < 11 || age > 18) return 1.0;

  // El efecto es mayor cuanto más cerca del pico PHV (13-15)
  const phvProximity = 1 - Math.abs(age - 14) / 4; // máximo a los 14
  const effect = phvOffset * 0.03 * Math.max(0, phvProximity);

  return Math.max(0.85, Math.min(1.15, 1 + effect));
}

// ─── Funciones principales ──────────────────────────────────────────────────

/**
 * Factor de desarrollo (0-1) para una edad, posición y métrica.
 * Interpola linealmente entre edades.
 */
export function developmentFactor(
  age: number,
  posGroup: string,
  metric?: MetricName
): number {
  const curve = metric ? DEVELOPMENT_CURVES[metric] : DEVELOPMENT_CURVES.passing; // default
  const offset = POSITION_PEAK_OFFSET[posGroup] ?? 0;

  // Ajustar edad efectiva por offset de posición
  const effectiveAge = age - offset;
  const clampedAge = Math.max(8, Math.min(35, effectiveAge));

  // Interpolación lineal entre los dos años más cercanos
  const lower = Math.floor(clampedAge);
  const upper = Math.ceil(clampedAge);

  if (lower === upper) return curve[lower] ?? 0.5;

  const lowerVal = curve[lower] ?? 0.5;
  const upperVal = curve[upper] ?? 0.5;
  const fraction = clampedAge - lower;

  return lowerVal + (upperVal - lowerVal) * fraction;
}

/**
 * Promedio de development factor para TODAS las métricas a una edad.
 */
export function developmentFactorAvg(age: number, posGroup: string): number {
  const metrics: MetricName[] = ["pace", "shooting", "passing", "dribbling", "defending", "physic"];
  const sum = metrics.reduce((acc, m) => acc + developmentFactor(age, posGroup, m), 0);
  return sum / metrics.length;
}

/**
 * Estima el rating de un jugador a una edad diferente.
 *
 * Ejemplo: estimateAtAge(88, 28, 14, "CM", "passing") → ~47
 * "Rodri tiene passing 88 a 28 años → estimado ~47 a los 14"
 */
export function estimateAtAge(
  currentRating: number,
  currentAge: number,
  targetAge: number,
  posGroup: string,
  metric?: MetricName
): number {
  const currentFactor = developmentFactor(currentAge, posGroup, metric);
  const targetFactor = developmentFactor(targetAge, posGroup, metric);

  if (currentFactor === 0) return 0;
  return Math.round(currentRating * (targetFactor / currentFactor));
}

/**
 * Edad equivalente: dado un rating, ¿a qué edad típica corresponde?
 * Busca en la curva el punto más cercano.
 *
 * Ejemplo: inverseAge(52, "CM", "passing") → ~14.3
 */
export function inverseAge(
  rating: number,
  posGroup: string,
  metric: MetricName,
  maxRating = 99
): number {
  const normalizedRating = rating / maxRating;
  const offset = POSITION_PEAK_OFFSET[posGroup] ?? 0;

  const curve = DEVELOPMENT_CURVES[metric];
  const ages = Object.keys(curve).map(Number).sort((a, b) => a - b);

  // Buscar los dos puntos que encierran el valor
  for (let i = 0; i < ages.length - 1; i++) {
    const a1 = ages[i], a2 = ages[i + 1];
    const v1 = curve[a1], v2 = curve[a2];

    // Solo buscar en la fase ascendente (antes del peak)
    if (v1 <= normalizedRating && v2 >= normalizedRating && v2 >= v1) {
      const fraction = (normalizedRating - v1) / (v2 - v1);
      return a1 + fraction + offset;
    }
  }

  // Si no se encontró en la fase ascendente, devolver la edad del peak
  const peakAge = ages.reduce((best, a) => curve[a] > curve[best] ? a : best, ages[0]);
  return peakAge + offset;
}

// ─── Confianza por rango de edad ────────────────────────────────────────────

export function ageConfidence(age: number): { confidence: number; disclaimer?: string } {
  if (age <= 12) return {
    confidence: 0.4,
    disclaimer: "Proyección basada en curvas de desarrollo científicas. A esta edad los factores ambientales y madurativos tienen un impacto muy alto.",
  };
  if (age <= 15) return {
    confidence: 0.6,
    disclaimer: "Proyección basada en curvas de desarrollo científicas. Factores como lesiones, entorno y dedicación pueden alterar significativamente el resultado.",
  };
  if (age <= 17) return { confidence: 0.8 };
  return { confidence: 0.95 };
}

// ─── Mapping VSI ↔ EA metrics ───────────────────────────────────────────────

export const VSI_TO_EA_METRIC: Record<string, MetricName> = {
  speed:     "pace",
  shooting:  "shooting",
  vision:    "passing",
  technique: "dribbling",
  defending: "defending",
  stamina:   "physic",
};

export const EA_TO_VSI_METRIC: Record<MetricName, string> = {
  pace:      "speed",
  shooting:  "shooting",
  passing:   "vision",
  dribbling: "technique",
  defending: "defending",
  physic:    "stamina",
};

// ─── Ventanas de desarrollo por edad ────────────────────────────────────────
// Qué capacidades se desarrollan más rápido a cada edad

export function getDevelopmentWindow(age: number): MetricName[] {
  if (age <= 10) return ["dribbling", "passing"];           // Técnica y visión
  if (age <= 13) return ["dribbling", "pace", "passing"];   // Técnica + velocidad + visión
  if (age <= 15) return ["pace", "physic", "shooting"];     // Explosividad + potencia + definición
  if (age <= 17) return ["physic", "shooting", "defending"]; // Físico + tiro + defensa
  if (age <= 20) return ["defending", "passing", "shooting"]; // Madurez táctica
  return ["passing", "defending"];                           // Experiencia
}

// ─── Horizonte de planificación por edad ────────────────────────────────────

export function getHorizonMonths(age: number): number {
  if (age <= 10) return 3;
  if (age <= 13) return 6;
  if (age <= 16) return 12;
  return 18;
}
