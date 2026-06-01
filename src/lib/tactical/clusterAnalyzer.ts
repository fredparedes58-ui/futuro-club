/**
 * VITAS · Cluster Analyzer
 *
 * Detecta "zonas calientes" en un heatmap aplicando un greedy clustering
 * sobre los bins con mayor peso. Equivalente a un DBSCAN simplificado para
 * datos en grid:
 *
 *   1. Ordena bins por peso descendente
 *   2. Mientras queden bins sin asignar:
 *      a. Toma el de mayor peso → semilla
 *      b. Anexa vecinos (8-connectivity) cuya weight > seed * 0.4
 *      c. Calcula centroide ponderado + radio efectivo
 *      d. Marca todos como asignados
 *   3. Devuelve hasta `maxZones` clusters ordenados por share
 *
 * No usa K-means para no obligar a fijar K — la densidad real decide.
 */

import { HeatmapBin, HotZone } from "./tacticalTypes";
import { binToCoord, dist, zoneLabel } from "./pitchGeometry";

interface ClusterOptions {
  maxZones?: number;
  /** Multiplicador del peso semilla para incluir vecinos. */
  neighborRatio?: number;
}

const DEFAULT_MAX_ZONES = 3;
const DEFAULT_NEIGHBOR_RATIO = 0.4;

export function findHotZones(
  bins: HeatmapBin[],
  options: ClusterOptions = {},
): HotZone[] {
  const maxZones = options.maxZones ?? DEFAULT_MAX_ZONES;
  const neighborRatio = options.neighborRatio ?? DEFAULT_NEIGHBOR_RATIO;

  if (bins.length === 0) return [];

  // Build lookup: "x,y" -> bin
  const binMap = new Map<string, HeatmapBin>();
  for (const b of bins) binMap.set(`${b.x},${b.y}`, b);

  // Bins sorted desc by weight
  const sorted = [...bins].sort((a, b) => b.weight - a.weight);
  const assigned = new Set<string>();
  const zones: HotZone[] = [];

  for (const seed of sorted) {
    const seedKey = `${seed.x},${seed.y}`;
    if (assigned.has(seedKey)) continue;

    // BFS over 8-connected neighbors above threshold
    const threshold = seed.weight * neighborRatio;
    const cluster: HeatmapBin[] = [];
    const stack: HeatmapBin[] = [seed];
    while (stack.length > 0) {
      const cur = stack.pop()!;
      const key = `${cur.x},${cur.y}`;
      if (assigned.has(key)) continue;
      assigned.add(key);
      cluster.push(cur);
      // 8-connectivity
      for (let dx = -1; dx <= 1; dx++) {
        for (let dy = -1; dy <= 1; dy++) {
          if (dx === 0 && dy === 0) continue;
          const nKey = `${cur.x + dx},${cur.y + dy}`;
          const n = binMap.get(nKey);
          if (n && !assigned.has(nKey) && n.weight >= threshold) {
            stack.push(n);
          }
        }
      }
    }

    if (cluster.length === 0) continue;

    // Weighted centroid in field coords (0-100)
    let sx = 0, sy = 0, sw = 0;
    for (const b of cluster) {
      const c = binToCoord(b.x, b.y);
      sx += c.x * b.weight;
      sy += c.y * b.weight;
      sw += b.weight;
    }
    const centroid = { x: sx / sw, y: sy / sw };

    // Effective radius = avg distance from centroid to bins, weighted
    let rNum = 0;
    let rDen = 0;
    for (const b of cluster) {
      const c = binToCoord(b.x, b.y);
      rNum += dist(centroid, c) * b.weight;
      rDen += b.weight;
    }
    const radius = rDen > 0 ? rNum / rDen : 5;

    zones.push({
      centroidX: Math.round(centroid.x * 10) / 10,
      centroidY: Math.round(centroid.y * 10) / 10,
      radius: Math.max(3, Math.round(radius * 10) / 10),
      share: sw,
      label: zoneLabel(centroid.x, centroid.y),
    });
  }

  return zones
    .sort((a, b) => b.share - a.share)
    .slice(0, maxZones);
}
