/**
 * VITAS · Pitch Geometry
 *
 * Helpers para trabajar con la cancha normalizada 100×100:
 *   - x ∈ [0, 100]   eje largo (0 = portería propia, 100 = portería rival)
 *   - y ∈ [0, 100]   eje ancho (0 = banda izquierda, 100 = banda derecha)
 *
 * El grid del heatmap es 10×10 (100 bins). Convertimos coords reales a
 * índices del bin via `coordToBin` y al revés via `binToCoord` (para
 * renderizar el centro de la celda).
 */

export const GRID_COLS = 10;
export const GRID_ROWS = 10;
export const PITCH_W = 100;
export const PITCH_H = 100;

/** Normaliza coords de Modal tracking (pixeles) a 0-100 según el frame. */
export function pixelToPitch(
  px: number,
  py: number,
  frameWidth: number,
  frameHeight: number,
): { x: number; y: number } {
  return {
    x: Math.max(0, Math.min(100, (px / frameWidth) * 100)),
    y: Math.max(0, Math.min(100, (py / frameHeight) * 100)),
  };
}

/** Coords (0-100) → índices del grid (0-9, 0-9). */
export function coordToBin(x: number, y: number): { bx: number; by: number } {
  const bx = Math.min(GRID_COLS - 1, Math.floor((x / PITCH_W) * GRID_COLS));
  const by = Math.min(GRID_ROWS - 1, Math.floor((y / PITCH_H) * GRID_ROWS));
  return { bx, by };
}

/** Índice del grid → centro de la celda en coords (0-100). */
export function binToCoord(bx: number, by: number): { x: number; y: number } {
  return {
    x: ((bx + 0.5) / GRID_COLS) * PITCH_W,
    y: ((by + 0.5) / GRID_ROWS) * PITCH_H,
  };
}

/** Distancia euclídea en el sistema 0-100. */
export function dist(
  a: { x: number; y: number },
  b: { x: number; y: number },
): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Devuelve nombre humano de la zona dado (x, y). */
export function zoneLabel(x: number, y: number): string {
  // Tercios verticales
  const third =
    x < 100 / 3 ? "campo propio" : x < (2 * 100) / 3 ? "centro del campo" : "campo rival";
  // Carriles horizontales
  const lane =
    y < 30 ? "banda izquierda" : y < 70 ? "carril central" : "banda derecha";
  return `${lane} · ${third}`;
}

/** Calcula el centroide ponderado de un conjunto de bins. */
export function centroidOfBins(
  bins: Array<{ x: number; y: number; weight: number }>,
): { x: number; y: number } | null {
  if (bins.length === 0) return null;
  let sx = 0, sy = 0, sw = 0;
  for (const b of bins) {
    const c = binToCoord(b.x, b.y);
    sx += c.x * b.weight;
    sy += c.y * b.weight;
    sw += b.weight;
  }
  if (sw === 0) return null;
  return { x: sx / sw, y: sy / sw };
}
