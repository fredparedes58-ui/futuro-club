/**
 * VITAS · Field Keypoint Model Configuration (Fase 1 — auto-calibración)
 *
 * Registry plug-and-play del modelo que detecta los KEYPOINTS del campo (para
 * calibrar la homografía sin marcar puntos a mano). Mismo patrón que
 * ballModelConfig.ts: el modelo ONNX se sirve same-origin desde /models/ (lo
 * baja scripts/download-models.mjs en prebuild desde el release del repo), y el
 * worker de tracking lo carga si hay una config activa.
 *
 * ESTADO: aún no hay pesos desplegados (default "none" → la app sigue con
 * calibración manual + gate de confianza, sin romperse). Cuando se exporte el
 * modelo (ver runbook: No-Bells/PnLCalib o YOLOv8-kpt afinado sobre SoccerNet +
 * footage propio), basta con añadir su config aquí y su URL — cero cambios en el
 * resto del pipeline. El nº de keypoints/orden DEBE coincidir con FIELD_TEMPLATE
 * (fieldRegistration.ts).
 */

import { FIELD_TEMPLATE } from "./fieldRegistration";

export interface FieldModelConfig {
  /** id de la config. */
  id: string;
  /** URL del ONNX (same-origin). undefined = sin modelo (calibración manual). */
  modelUrl?: string;
  /** Nº de keypoints que emite el modelo (= FIELD_TEMPLATE.length). */
  numKeypoints: number;
  /** Input size del modelo (px, cuadrado). */
  inputSize: number;
  /** Confianza mínima por keypoint para usarlo en el registro. */
  minKeypointConfidence: number;
  /** Umbral de reproyección RANSAC (px). */
  reprojThresholdPx: number;
  /** Cada cuántos frames re-registrar (la cámara fija no necesita cada frame). */
  registerEveryNFrames: number;
  notes?: string;
}

export const FIELD_MODEL_CONFIGS: Record<string, FieldModelConfig> = {
  /** Sin modelo: calibración manual + gate de confianza (status quo seguro). */
  none: {
    id: "none",
    numKeypoints: FIELD_TEMPLATE.length,
    inputSize: 640,
    minKeypointConfidence: 0.5,
    reprojThresholdPx: 8,
    registerEveryNFrames: 15,
    notes: "Sin pesos desplegados todavía. La app usa calibración manual.",
  },

  /**
   * Placeholder para el futuro modelo de keypoints de campo (Fase 2).
   * Cuando exista el ONNX, poner su modelUrl y activarlo con setActiveFieldModel.
   * Base recomendada: No-Bells-Just-Whistles / PnLCalib (pesos SoccerNet) o un
   * YOLOv8-pose con 27 keypoints entrenado a FIELD_TEMPLATE.
   */
  "field-keypoints-v1": {
    id: "field-keypoints-v1",
    modelUrl: "/models/field-keypoints.onnx",
    numKeypoints: FIELD_TEMPLATE.length,
    inputSize: 640,
    minKeypointConfidence: 0.5,
    reprojThresholdPx: 8,
    registerEveryNFrames: 15,
    notes: "PENDIENTE de exportar/entrenar (ver runbook). No desplegado.",
  },
};

const STORAGE_KEY = "vitas_field_model";
const DEFAULT_CONFIG = "none";

export function getActiveFieldModel(): FieldModelConfig {
  if (typeof window === "undefined") return FIELD_MODEL_CONFIGS[DEFAULT_CONFIG];
  const stored = localStorage.getItem(STORAGE_KEY);
  if (stored && FIELD_MODEL_CONFIGS[stored]) return FIELD_MODEL_CONFIGS[stored];
  return FIELD_MODEL_CONFIGS[DEFAULT_CONFIG];
}

export function setActiveFieldModel(configId: string): void {
  if (!FIELD_MODEL_CONFIGS[configId]) {
    console.warn(`[FieldModelConfig] Unknown config: ${configId}`);
    return;
  }
  localStorage.setItem(STORAGE_KEY, configId);
}

/** ¿Hay un modelo de keypoints de campo desplegado y activo? */
export function hasFieldModel(): boolean {
  return Boolean(getActiveFieldModel().modelUrl);
}
