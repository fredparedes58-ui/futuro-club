/**
 * VITAS · Pose eligibility (frontera de honestidad de la biomecánica)
 *
 * La ruta "detección-primero para recall" (ver `recallPipeline.ts`) obtiene la
 * POSICIÓN de TODOS los jugadores con el modelo de detección + tiling. Pero la
 * biomecánica (zancada/gait/escaneos) exige píxeles suficientes para colocar 17
 * keypoints con fiabilidad: en un jugador lejano (caja pequeña) la pose es ruido.
 *
 * Este módulo decide, por altura de caja, qué detecciones son elegibles para
 * pose (cercanas) y cuáles quedan SOLO con posición (lejanas). Es la frontera que
 * hace honesto el pipeline: posición sí (MEDIDA/DERIVADA con procedencia),
 * biomecánica solo donde hay píxeles fiables, y NUNCA keypoints inventados en los
 * lejanos.
 *
 * El umbral `minBoxHeightPx` es un PARÁMETRO (vive en `recallConfig.ts` con su
 * procedencia declarada), no una constante mágica de esta ruta: así el audit de
 * literales no encuentra números desnudos aquí y el umbral se valida en un solo
 * sitio contra ground truth anotado (pendiente).
 *
 * Módulo PURO y testable sin navegador.
 */

import type { Detection } from "./types";
import { derived, gated, ORIENTATIVE_CONFIDENCE, type MetricResult } from "@/lib/metrics/MetricResult";

/** Partición de las detecciones de un frame por elegibilidad de biomecánica. */
export interface PosePartition {
  /** Cajas suficientemente grandes (cercanas) → se les corre POSE. */
  poseEligible: Detection[];
  /** Cajas pequeñas (lejanas) → posición sí, biomecánica no (honestidad). */
  positionOnly: Detection[];
}

/**
 * ¿La caja es lo bastante grande (alta) para una pose fiable de 17 keypoints?
 * Usa la ALTURA de la bbox: en fútbol la altura del jugador es la señal estable
 * de cercanía a cámara (el ancho varía con la postura/carrera).
 */
export function isPoseEligible(det: Detection, minBoxHeightPx: number): boolean {
  return det.bbox[3] >= minBoxHeightPx;
}

/**
 * Divide las detecciones en elegibles-para-pose (cercanas) y solo-posición
 * (lejanas), según la altura mínima de caja. No muta la entrada.
 */
export function partitionByPoseEligibility(
  dets: Detection[],
  minBoxHeightPx: number,
): PosePartition {
  const poseEligible: Detection[] = [];
  const positionOnly: Detection[] = [];
  for (const det of dets) {
    if (isPoseEligible(det, minBoxHeightPx)) poseEligible.push(det);
    else positionOnly.push(det);
  }
  return { poseEligible, positionOnly };
}

/**
 * Cobertura de biomecánica: fracción de las detecciones del frame que tienen
 * píxeles suficientes para pose. Es una cifra HONESTA de "de todo lo que veo,
 * en cuánto puedo medir gait" — DERIVADA y orientativa (depende del umbral, aún
 * sin validar con ground truth → confidence reducida). Si no hay detecciones se
 * BLOQUEA (nunca un 0 que signifique "no medido").
 *
 * @param eligibleCount nº de detecciones elegibles para pose (cercanas)
 * @param totalCount    nº total de detecciones del frame
 */
export function poseCoverageMetric(
  eligibleCount: number,
  totalCount: number,
): MetricResult<number> {
  if (totalCount <= 0) {
    return gated("Sin detecciones en el frame — cobertura de biomecánica no definida");
  }
  return derived(eligibleCount / totalCount, {
    units: null,
    calibrated: false,
    confidence: ORIENTATIVE_CONFIDENCE,
    source_ref: "src/lib/yolo/poseEligibility.ts",
  });
}
