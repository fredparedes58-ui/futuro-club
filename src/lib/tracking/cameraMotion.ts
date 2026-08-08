/**
 * VITAS · Detección de movimiento de cámara (T2 — validador de calibración).
 *
 * Todo el pipeline de calibración asume CÁMARA FIJA: la homografía se calcula una vez
 * (o se acumulan keypoints entre frames como si fueran el mismo píxel) y se reutiliza.
 * Si la cámara panea o hace zoom, esa homografía deja de valer y las métricas en
 * metros salen mal de forma variable e invisible.
 *
 * Los LANDMARKS del campo (esquinas, líneas, área) son ESTÁTICOS en el mundo: sus
 * posiciones en píxel solo cambian si la CÁMARA se mueve. Así que el desplazamiento
 * mediano de los landmarks emparejados (mismo id) entre dos frames es una medida
 * directa del movimiento de cámara — independiente de que los jugadores se muevan.
 *
 * Geometría pura y testeable. La usa el worker/acumulador para NO fusionar frames
 * de una cámara que se movió (y degradar la calibración a "sin calibrar").
 */

export interface MotionLandmark {
  id: number;
  px: number;
  py: number;
  confidence: number;
}

export interface CameraMotionOptions {
  /** Confianza mínima del landmark para usarlo (default 0.5). */
  minConfidence?: number;
  /** Nº mínimo de landmarks emparejados para decidir (default 4). */
  minMatched?: number;
  /** Umbral de desplazamiento mediano (px) por encima del cual = cámara movida. */
  thresholdPx?: number;
}

export interface CameraMotionResult {
  /** ¿La cámara se movió entre los dos frames? */
  moved: boolean;
  /** Desplazamiento mediano (px) de los landmarks emparejados. */
  medianShiftPx: number;
  /** Nº de landmarks emparejados (mismo id, ambos fiables). */
  matched: number;
  /** ¿Había suficientes emparejamientos para decidir? */
  decidable: boolean;
}

function median(xs: number[]): number {
  if (xs.length === 0) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

/**
 * Compara los landmarks de campo de dos frames y estima el movimiento de cámara.
 * Si no hay suficientes emparejamientos, `decidable=false` y `moved=false`
 * (fail-open aquí: la decisión de fiabilidad la toma el gate con otros validadores).
 */
export function detectCameraMotion(
  prev: MotionLandmark[],
  curr: MotionLandmark[],
  opts: CameraMotionOptions = {},
): CameraMotionResult {
  const minConf = opts.minConfidence ?? 0.5;
  const minMatched = opts.minMatched ?? 4;
  const threshold = opts.thresholdPx ?? 10;

  const currById = new Map<number, MotionLandmark>();
  for (const c of curr) if (c.confidence >= minConf) currById.set(c.id, c);

  const shifts: number[] = [];
  for (const p of prev) {
    if (p.confidence < minConf) continue;
    const c = currById.get(p.id);
    if (!c) continue;
    shifts.push(Math.hypot(c.px - p.px, c.py - p.py));
  }

  const matched = shifts.length;
  const medianShiftPx = median(shifts);
  const decidable = matched >= minMatched;
  return {
    moved: decidable && medianShiftPx > threshold,
    medianShiftPx,
    matched,
    decidable,
  };
}
