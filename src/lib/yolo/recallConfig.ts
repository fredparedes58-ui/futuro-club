/**
 * VITAS · Recall Config (detección-primero para recall) — opt-in análisis diferido
 *
 * Activa la ruta "detección-primero": correr el modelo de DETECCIÓN
 * (`yolo11s-detect`, el mismo que ya usa el balón) con tiling para recuperar la
 * POSICIÓN del EQUIPO COMPLETO, y correr la POSE solo sobre las cajas grandes
 * (cercanas) para biomecánica honesta. Ver `recallPipeline.ts` y CLAUDE.md
 * (§Vision Pipeline).
 *
 * Es CARO (G² inferencias de detección + una pose por caja cercana) → pensado
 * para ANÁLISIS DIFERIDO, no para el tracking en vivo. Igual patrón de override
 * consciente en localStorage que `vitas_active_model`, `vitas_ball_config` y
 * `vitas_tiling`:
 *
 *   localStorage.setItem('vitas_recall', JSON.stringify({ enabled: true }))
 *
 * Se COORDINA con `getTilingConfig`: la malla de tiling la fija `vitas_tiling`
 * (misma perilla que la pose-tiling); `vitas_recall` solo decide "detección
 * primero". Si el recall está activo pero no hay tiling, el llamante usa una
 * malla por defecto (`DEFAULT_RECALL_TILING`) — la detección-primero sin tiling
 * no recupera a los lejanos, que es justo el objetivo.
 */

import type { TilingConfig } from "./tiling";
import { BALL_CONFIGS } from "./ballModelConfig";

/** Config resuelta de la ruta de recall (todo lo que el worker necesita en INIT). */
export interface RecallConfig {
  /** URL del ONNX del detector (same-origin, lo trae el prebuild). */
  detectModelUrl: string;
  /** Nº de clases del detector (COCO = 80). */
  numClasses: number;
  /** Índice de la clase persona en el detector (COCO = 0). */
  personClassId: number;
  /** Umbral de confianza de persona para el barrido de recall. */
  confThreshold: number;
  /** Tamaño de entrada cuadrado del detector (letterbox), p.ej. 640. */
  inputSize: number;
  /**
   * Altura mínima de caja (px, en el espacio del frame que ve el worker) para
   * correr POSE sobre esa detección. Debajo del umbral: posición sí, biomecánica
   * no (honestidad). PROCEDENCIA: pendiente de validar con ground truth anotado
   * (fixtures/identidad) — por eso las métricas de pose derivadas de aquí llevan
   * confidence reducida y este umbral no debe presentarse como calibrado.
   */
  minPoseBoxHeightPx: number;
}

// ─── El detector se reutiliza del registro del balón (invariante #7: un fichero
//     de modelo, una fuente de verdad). El balón lo usa como "sports ball"
//     (clase 32); aquí lo usamos como "person" (clase 0). Mismo ONNX. ───────────
const DETECT = BALL_CONFIGS["yolo11s-detect"];

/**
 * Umbral de confianza de PERSONA en el barrido de recall. Distinto del balón
 * (0.15, un objeto diminuto): una persona es mayor y un umbral tan bajo dispara
 * falsos positivos. PROCEDENCIA: pendiente de validar con ground truth anotado
 * (el benchmark de 1 frame ya mostró 1-2 posibles falsos positivos).
 */
const PERSON_CONF_THRESHOLD = 0.25;

/**
 * Altura mínima de caja por defecto para elegibilidad de pose, en px sobre el
 * frame de 640 que ve el worker (~15% de la altura). PROCEDENCIA: pendiente de
 * validar con ground truth anotado.
 */
const DEFAULT_MIN_POSE_BOX_HEIGHT_PX = 96;

/**
 * Malla de tiling por defecto cuando el recall está activo pero `vitas_tiling`
 * no. Detección-primero sin tiling no recuperaría a los lejanos (el objetivo),
 * así que 3×3 con el solape estándar es el mínimo sensato.
 */
export const DEFAULT_RECALL_TILING: TilingConfig = { grid: 3, overlap: 0.15 };

const STORAGE_KEY = "vitas_recall";

const DEFAULT_RECALL: RecallConfig = {
  detectModelUrl: DETECT.modelUrl ?? "/models/yolo11s-detect.onnx",
  numClasses: DETECT.numClasses ?? 80,
  personClassId: DETECT.personClassId,
  confThreshold: PERSON_CONF_THRESHOLD,
  inputSize: DETECT.inputSize ?? 640,
  minPoseBoxHeightPx: DEFAULT_MIN_POSE_BOX_HEIGHT_PX,
};

/**
 * Valida un objeto arbitrario como override de recall. `null` si no está activo
 * (`enabled` ausente/false) — igual criterio que `parseTilingConfig` (grid < 2 =
 * apagado). Solo `enabled`, `confThreshold` y `minPoseBoxHeightPx` son ajustables;
 * el resto (modelo, clases) viene del registro del detector.
 */
export function parseRecallConfig(raw: unknown): RecallConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  if (obj.enabled !== true) return null;

  const cfg: RecallConfig = { ...DEFAULT_RECALL };

  const conf = Number(obj.confThreshold);
  if (Number.isFinite(conf) && conf > 0 && conf < 1) cfg.confThreshold = conf;

  const minH = Number(obj.minPoseBoxHeightPx);
  if (Number.isFinite(minH) && minH > 0) cfg.minPoseBoxHeightPx = Math.floor(minH);

  return cfg;
}

/**
 * Config de recall ACTIVA. Por defecto `null` (tracking normal, sin regresión).
 * Solo se activa con override consciente en localStorage `vitas_recall`.
 */
export function getRecallConfig(): RecallConfig | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return parseRecallConfig(JSON.parse(stored));
  } catch {
    return null;
  }
}

/**
 * Setter simétrico: persiste `{ enabled: true, ... }` o lo elimina con `null`
 * (= recall apagado, el estado por defecto). Una config que no valida equivale a
 * apagar, nunca a un estado intermedio silencioso.
 */
export function setRecallConfig(config: { enabled: boolean; confThreshold?: number; minPoseBoxHeightPx?: number } | null): void {
  if (typeof localStorage === "undefined") return;
  if (config && parseRecallConfig(config)) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}
