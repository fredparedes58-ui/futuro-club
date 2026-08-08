/**
 * VITAS · Confianza HONESTA de la auto-calibración (T1 — gate en tracking vivo).
 *
 * La auto-calibración de producción (autoCalibrationBridge) es HEURÍSTICA: líneas
 * Hough / detección de esquinas / heurística por aspect-ratio, con una "confidence"
 * 0-1 que NO pasa por el gate de landmarks+geometría (classifyCalibration /
 * assessFieldGeometry). Por eso NO puede afirmar honestamente 'high'/'medium' —
 * eso desbloquearía métricas en metros que serían píxeles disfrazados.
 *
 * Fail-closed:
 *   - sin detección real (heurística pura) → 'none'
 *   - detectada pero SIN validar por líneas/escala/temporal (T2) → 'low'
 * El 'medium'/'high' solo llegará cuando existan los validadores reales (T2) y el
 * modelo de keypoints de campo en vivo (T3). Mientras, metricsTrustworthy()===false
 * → la UI muestra "sin calibrar" en vez de un número inventado.
 */

import type { CalibrationConfidence } from "@/lib/yolo/fieldRegistration";

export interface AutoCalibLike {
  /** ¿Se detectó el campo de verdad (no heurística de aspect-ratio)? */
  autoDetected: boolean;
  /** Confianza 0-1 del detector heurístico (NO es el gate honesto). */
  confidence: number;
}

/** Umbral por debajo del cual ni siquiera la heurística detectó algo usable. */
const MIN_AUTO_DETECT = 0.5;

export function autoCalibrationConfidence(
  r: AutoCalibLike | null | undefined,
): CalibrationConfidence {
  if (!r || !r.autoDetected || r.confidence < MIN_AUTO_DETECT) return "none";
  // Detectado pero sin validación real → 'low' (no fiable para métricas en metros).
  return "low";
}
