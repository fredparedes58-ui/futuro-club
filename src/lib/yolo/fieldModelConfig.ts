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
   * Modelo PROPIO de keypoints de campo (Fase 2b) — el recomendado.
   * yolo11s-pose entrenado por nosotros en Modal (vision-pipeline/train_field_model.py)
   * sobre el dataset público `martinjolif/football-pitch-detection` (CC-BY-4.0, 317
   * imgs, 32 kpts, esquema SoccerPitchConfiguration = mismo orden que FIELD_TEMPLATE).
   *
   * 42 MB de ONNX (vs 279 MB del YOLOv8x público) → viable en el navegador.
   * Métricas en validación: pose mAP50 0.995 · mAP50-95 0.914.
   * OJO: esas métricas son sobre el MISMO dominio del dataset (broadcast de TV).
   * En footage de móvil en campo de academia rendirá peor — el gate de confianza
   * (classifyCalibration) es justamente la red de seguridad para ese caso.
   */
  "field-keypoints-s": {
    id: "field-keypoints-s",
    modelUrl: "/models/field-keypoints-s.onnx",
    numKeypoints: FIELD_TEMPLATE.length,
    inputSize: 640,
    minKeypointConfidence: 0.5,
    reprojThresholdPx: 8,
    registerEveryNFrames: 15,
    notes: "yolo11s-pose propio · 42MB · mAP50 .995 (dominio broadcast) · CC-BY-4.0 dataset",
  },

  /**
   * Modelo público grande (YOLOv8x-pose, martinjolif). Máxima capacidad pero
   * 279 MB en ONNX → solo viable SERVER-SIDE (Modal lo carga de HF directamente).
   * No se sirve al navegador; se deja registrado para el path de servidor.
   */
  "field-keypoints-x": {
    id: "field-keypoints-x",
    numKeypoints: FIELD_TEMPLATE.length,
    inputSize: 640,
    minKeypointConfidence: 0.5,
    reprojThresholdPx: 8,
    registerEveryNFrames: 15,
    notes: "YOLOv8x-pose público (HF martinjolif) · 279MB · SOLO server-side.",
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
