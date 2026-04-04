/**
 * VITAS · Voronoi Engine — Espacios Libres
 *
 * Calcula el diagrama de Voronoi sobre las posiciones de campo
 * para determinar qué área controla cada jugador.
 *
 * Usa d3-delaunay (Delaunay/Voronoi de D3).
 * Campo FIFA estándar: 105m × 68m
 */

import { Delaunay } from "d3-delaunay";
import type { Track, VoronoiRegion } from "./types";
import { fieldToPixel } from "./homography";

const FIELD_W = 105; // metros
const FIELD_H = 68;

/**
 * Calcula regiones de Voronoi para todos los tracks activos.
 * @param tracks  Tracks con posición de campo válida
 * @param Hinv    Matriz homografía inversa (campo→píxeles) para renderizado
 */
export function computeVoronoi(
  tracks:    Track[],
  Hinv:      Float64Array
): VoronoiRegion[] {
  const activeTracks = tracks.filter(t => t.lastFieldPos !== null && t.age === 0);
  if (activeTracks.length < 2) return [];

  // Puntos en coordenadas de campo
  const points: [number, number][] = activeTracks.map(t => [
    t.lastFieldPos!.fx,
    t.lastFieldPos!.fy,
  ]);

  const delaunay = Delaunay.from(points);
  const voronoi  = delaunay.voronoi([0, 0, FIELD_W, FIELD_H]);

  return activeTracks.map((track, i) => {
    const cell    = voronoi.cellPolygon(i);
    const areaM2  = cell ? polygonArea(cell) : 0;

    // Convertir polígono de campo a píxeles para renderizado en canvas
    const pixelPolygon: [number, number][] = cell
      ? cell.map(([fx, fy]) => {
          const p = fieldToPixel(Hinv, fx, fy);
          return [p.px, p.py];
        })
      : [];

    return {
      trackId:      track.id,
      fieldPos:     track.lastFieldPos!,
      areaM2,
      pixelPolygon,
    };
  });
}

/**
 * Área de un polígono (fórmula de Shoelace).
 */
function polygonArea(polygon: [number, number][]): number {
  let area = 0;
  const n  = polygon.length;
  for (let i = 0; i < n; i++) {
    const [x1, y1] = polygon[i];
    const [x2, y2] = polygon[(i + 1) % n];
    area += x1 * y2 - x2 * y1;
  }
  return Math.abs(area) / 2;
}

/**
 * Detectar si un jugador se movió hacia espacio libre (región Voronoi vacía).
 * Compara la región Voronoi del frame anterior vs actual.
 */
export function detectSpaceRun(
  prevAreaM2: number,
  currAreaM2: number,
  threshold = 5 // metros²
): boolean {
  return currAreaM2 - prevAreaM2 > threshold;
}
