/**
 * VITAS · Heatmap Aggregator
 *
 * Convierte una serie temporal de posiciones de un jugador en bins del grid
 * 10×10. Cada bin acumula el tiempo (proporcional al sampling rate) que el
 * jugador pasó dentro de su celda. Output normalizado a fracciones [0, 1].
 *
 * Input: posiciones por frame DENTRO de una fase concreta (los samples ya
 * vienen filtrados por el caller).
 */

import { GRID_COLS, GRID_ROWS, coordToBin } from "./pitchGeometry";
import type { HeatmapBin } from "./tacticalTypes";

interface PositionSample {
  timestampMs: number;
  x: number; // 0-100
  y: number; // 0-100
}

/**
 * Acumula tiempo por bin. Usa intervalo entre samples consecutivos como peso
 * (más realista que contar samples crudos cuando el sampling rate varía).
 */
export function aggregateBins(samples: PositionSample[]): {
  bins: HeatmapBin[];
  totalTimeMs: number;
} {
  if (samples.length === 0) return { bins: [], totalTimeMs: 0 };

  // grid[bx][by] = ms acumulados
  const grid: number[][] = Array.from({ length: GRID_COLS }, () =>
    Array.from({ length: GRID_ROWS }, () => 0),
  );

  let totalMs = 0;
  for (let i = 0; i < samples.length; i++) {
    const cur = samples[i];
    const next = samples[i + 1];
    const dwellMs = next ? next.timestampMs - cur.timestampMs : 100; // tail
    const safeDwell = Math.max(0, Math.min(dwellMs, 1000)); // clamp 1s per frame
    const { bx, by } = coordToBin(cur.x, cur.y);
    grid[bx][by] += safeDwell;
    totalMs += safeDwell;
  }

  // Build bins array with non-zero weights, normalised to [0, 1]
  const bins: HeatmapBin[] = [];
  if (totalMs > 0) {
    for (let bx = 0; bx < GRID_COLS; bx++) {
      for (let by = 0; by < GRID_ROWS; by++) {
        const v = grid[bx][by];
        if (v > 0) {
          bins.push({ x: bx, y: by, weight: v / totalMs });
        }
      }
    }
  }

  return { bins, totalTimeMs: totalMs };
}

/**
 * Combina varios heatmaps en uno (vista de equipo).
 * Suma los pesos y renormaliza al total.
 */
export function combineHeatmaps(heatmaps: HeatmapBin[][]): HeatmapBin[] {
  const grid: number[][] = Array.from({ length: GRID_COLS }, () =>
    Array.from({ length: GRID_ROWS }, () => 0),
  );
  let total = 0;
  for (const hm of heatmaps) {
    for (const b of hm) {
      grid[b.x][b.y] += b.weight;
      total += b.weight;
    }
  }
  const out: HeatmapBin[] = [];
  if (total > 0) {
    for (let bx = 0; bx < GRID_COLS; bx++) {
      for (let by = 0; by < GRID_ROWS; by++) {
        const v = grid[bx][by];
        if (v > 0) out.push({ x: bx, y: by, weight: v / total });
      }
    }
  }
  return out;
}

/**
 * Detecta zonas con peso bajo o nulo en una fase que el coach esperaría
 * cubrir (coverage gaps). Útil para el agente táctico.
 *
 * Heurística: busca celdas con weight < threshold en el tercio que define
 * la fase (ej: defending → tercio defensivo).
 */
export function detectCoverageGaps(
  bins: HeatmapBin[],
  phase: "defending" | "attacking" | "build_up" | "set_piece" | "offensive_transition" | "defensive_transition",
): Array<{ x: number; y: number; weight: number }> {
  // Defining "expected zone" per phase
  const ranges: Record<string, { bxMin: number; bxMax: number }> = {
    defending: { bxMin: 0, bxMax: 3 },             // tercio defensivo (0-3)
    build_up: { bxMin: 0, bxMax: 4 },              // medio-bajo
    attacking: { bxMin: 6, bxMax: 9 },             // tercio rival
    offensive_transition: { bxMin: 3, bxMax: 7 },  // medio
    defensive_transition: { bxMin: 2, bxMax: 6 },  // medio
    set_piece: { bxMin: 0, bxMax: 9 },             // toda la cancha
  };

  const { bxMin, bxMax } = ranges[phase];
  const binMap = new Map<string, number>();
  for (const b of bins) binMap.set(`${b.x},${b.y}`, b.weight);

  const gaps: Array<{ x: number; y: number; weight: number }> = [];
  const threshold = 0.005; // <0.5% del tiempo en esa celda = gap
  for (let bx = bxMin; bx <= bxMax; bx++) {
    for (let by = 0; by < GRID_ROWS; by++) {
      const w = binMap.get(`${bx},${by}`) ?? 0;
      if (w < threshold) gaps.push({ x: bx, y: by, weight: w });
    }
  }
  return gaps;
}
