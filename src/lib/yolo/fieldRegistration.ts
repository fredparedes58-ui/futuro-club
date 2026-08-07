/**
 * VITAS · Auto Field Registration (Fase 0/1 — calibración automática)
 *
 * Convierte los KEYPOINTS del campo detectados por un modelo (intersecciones de
 * líneas, esquinas, área, círculo central…) en la homografía píxel↔metros, SIN
 * que el usuario marque puntos a mano. Se apoya en la geometría ya existente
 * (homography.ts: DLT de 4 puntos + RANSAC) — aquí solo añadimos:
 *   1. La PLANTILLA del campo (coords reales de cada landmark, FIFA 105×68).
 *   2. El emparejado detección↔plantilla → correspondencias → RANSAC.
 *   3. Un SCORE DE CONFIANZA (error de reproyección + inliers) para poder
 *      BLOQUEAR/etiquetar las métricas en metros cuando la calibración es pobre.
 *   4. Un acumulador temporal (la cámara de academia es ~fija: acumular
 *      detecciones entre frames da una homografía mucho más estable).
 *
 * El MODELO de keypoints (ONNX) es plug-and-play vía fieldModelConfig.ts — este
 * módulo es agnóstico de cómo se detectan los keypoints (geometría pura, testeable
 * con datos sintéticos, sin necesidad de footage real).
 *
 * Estado del arte de referencia (registro de campo deportivo): SoccerNet Camera
 * Calibration Challenge, No-Bells-Just-Whistles / PnLCalib (keypoints+líneas),
 * y el patrón YOLOv8-keypoint→homografía (Roboflow). La plantilla de abajo es la
 * "verdad de campo" a la que un modelo de keypoints debe entrenarse (mismo orden
 * de ids = canales de salida del modelo).
 */

import {
  computeHomographyRANSAC,
  invertMatrix3x3,
  fieldToPixel,
} from "./homography";
import type { FieldPoint } from "./types";

// ─── Dimensiones FIFA estándar (mismas que voronoi.ts / types.ts) ────────────
export const FIELD_LENGTH_M = 105; // fx: 0 → 105
export const FIELD_WIDTH_M = 68; //  fy: 0 → 68

// ─── Plantilla de landmarks del campo ────────────────────────────────────────
// Origen (0,0) = esquina superior-izquierda (misma convención que
// FIELD_ANCHOR_PRESETS en types.ts). `id` = índice estable = canal del modelo.

export interface FieldLandmark {
  id: number;
  name: string;
  field: FieldPoint;
}

// ─── Medidas FIFA reales (metros) ────────────────────────────────────────────
// El esquema de Roboflow (SoccerPitchConfiguration) es paramétrico pero usa un
// campo genérico 120×70 m y un área grande de 20.15 m de profundidad. Los puntos
// que el modelo detecta en vídeo son los de campos REALES (área a 16.5 m), así que
// re-derivamos las mismas 32 posiciones con medidas FIFA para no meter un error
// sistemático en la conversión a metros.
const PENALTY_BOX_WIDTH = 40.32; // ancho del área grande
const PENALTY_BOX_LENGTH = 16.5; // profundidad del área grande (FIFA; Roboflow usa 20.15)
const GOAL_BOX_WIDTH = 18.32;
const GOAL_BOX_LENGTH = 5.5;
const CENTRE_CIRCLE_RADIUS = 9.15;
const PENALTY_SPOT_DISTANCE = 11;

const L = FIELD_LENGTH_M; // 105
const W = FIELD_WIDTH_M; // 68
const PB_TOP = (W - PENALTY_BOX_WIDTH) / 2; // 13.84
const PB_BOT = (W + PENALTY_BOX_WIDTH) / 2; // 54.16
const GB_TOP = (W - GOAL_BOX_WIDTH) / 2; // 24.84
const GB_BOT = (W + GOAL_BOX_WIDTH) / 2; // 43.16

/**
 * Los 32 landmarks del campo, EN EL ORDEN EXACTO en que los emite el modelo de
 * keypoints (índice del array = `id` = canal de salida del modelo).
 *
 * Orden tomado de `SoccerPitchConfiguration.vertices` (roboflow/sports), que es el
 * esquema con el que están entrenados los modelos públicos de field-detection
 * (p.ej. `martinjolif/yolo-football-pitch-detection`, YOLOv8x-pose, kpt_shape [32,3]).
 * Las COORDENADAS son FIFA (105×68) — ver nota arriba.
 *
 * Si algún día se usa un modelo con otro esquema, basta reordenar esta tabla: el
 * resto del pipeline (RANSAC, confianza, gate) no cambia. Y si el orden no casara,
 * el gate lo detecta solo (error de reproyección alto → confianza "none").
 */
export const FIELD_TEMPLATE: readonly FieldLandmark[] = [
  // Línea de gol izquierda (x = 0)
  { id: 0, name: "left_goalline_top_corner", field: { fx: 0, fy: 0 } },
  { id: 1, name: "left_goalline_penaltybox_top", field: { fx: 0, fy: PB_TOP } },
  { id: 2, name: "left_goalline_goalbox_top", field: { fx: 0, fy: GB_TOP } },
  { id: 3, name: "left_goalline_goalbox_bot", field: { fx: 0, fy: GB_BOT } },
  { id: 4, name: "left_goalline_penaltybox_bot", field: { fx: 0, fy: PB_BOT } },
  { id: 5, name: "left_goalline_bot_corner", field: { fx: 0, fy: W } },
  // Área pequeña izquierda (x = 5.5)
  { id: 6, name: "left_goalbox_top", field: { fx: GOAL_BOX_LENGTH, fy: GB_TOP } },
  { id: 7, name: "left_goalbox_bot", field: { fx: GOAL_BOX_LENGTH, fy: GB_BOT } },
  // Punto de penalti izquierdo
  { id: 8, name: "left_penalty_spot", field: { fx: PENALTY_SPOT_DISTANCE, fy: W / 2 } },
  // Área grande izquierda (x = 16.5)
  { id: 9, name: "left_penaltybox_top", field: { fx: PENALTY_BOX_LENGTH, fy: PB_TOP } },
  { id: 10, name: "left_penaltybox_goalbox_top", field: { fx: PENALTY_BOX_LENGTH, fy: GB_TOP } },
  { id: 11, name: "left_penaltybox_goalbox_bot", field: { fx: PENALTY_BOX_LENGTH, fy: GB_BOT } },
  { id: 12, name: "left_penaltybox_bot", field: { fx: PENALTY_BOX_LENGTH, fy: PB_BOT } },
  // Línea media + círculo central (x = 52.5)
  { id: 13, name: "halfway_top", field: { fx: L / 2, fy: 0 } },
  { id: 14, name: "centre_circle_top", field: { fx: L / 2, fy: W / 2 - CENTRE_CIRCLE_RADIUS } },
  { id: 15, name: "centre_circle_bot", field: { fx: L / 2, fy: W / 2 + CENTRE_CIRCLE_RADIUS } },
  { id: 16, name: "halfway_bot", field: { fx: L / 2, fy: W } },
  // Área grande derecha (x = 88.5)
  { id: 17, name: "right_penaltybox_top", field: { fx: L - PENALTY_BOX_LENGTH, fy: PB_TOP } },
  { id: 18, name: "right_penaltybox_goalbox_top", field: { fx: L - PENALTY_BOX_LENGTH, fy: GB_TOP } },
  { id: 19, name: "right_penaltybox_goalbox_bot", field: { fx: L - PENALTY_BOX_LENGTH, fy: GB_BOT } },
  { id: 20, name: "right_penaltybox_bot", field: { fx: L - PENALTY_BOX_LENGTH, fy: PB_BOT } },
  // Punto de penalti derecho
  { id: 21, name: "right_penalty_spot", field: { fx: L - PENALTY_SPOT_DISTANCE, fy: W / 2 } },
  // Área pequeña derecha (x = 99.5)
  { id: 22, name: "right_goalbox_top", field: { fx: L - GOAL_BOX_LENGTH, fy: GB_TOP } },
  { id: 23, name: "right_goalbox_bot", field: { fx: L - GOAL_BOX_LENGTH, fy: GB_BOT } },
  // Línea de gol derecha (x = 105)
  { id: 24, name: "right_goalline_top_corner", field: { fx: L, fy: 0 } },
  { id: 25, name: "right_goalline_penaltybox_top", field: { fx: L, fy: PB_TOP } },
  { id: 26, name: "right_goalline_goalbox_top", field: { fx: L, fy: GB_TOP } },
  { id: 27, name: "right_goalline_goalbox_bot", field: { fx: L, fy: GB_BOT } },
  { id: 28, name: "right_goalline_penaltybox_bot", field: { fx: L, fy: PB_BOT } },
  { id: 29, name: "right_goalline_bot_corner", field: { fx: L, fy: W } },
  // Círculo central: extremos izquierdo y derecho (y = 34)
  { id: 30, name: "centre_circle_left", field: { fx: L / 2 - CENTRE_CIRCLE_RADIUS, fy: W / 2 } },
  { id: 31, name: "centre_circle_right", field: { fx: L / 2 + CENTRE_CIRCLE_RADIUS, fy: W / 2 } },
];

const TEMPLATE_BY_ID = new Map(FIELD_TEMPLATE.map((l) => [l.id, l]));

// ─── Detección del modelo de keypoints ───────────────────────────────────────

export interface DetectedLandmark {
  /** id que coincide con FIELD_TEMPLATE (canal del modelo). */
  id: number;
  /** Posición en píxeles del keypoint en el frame. */
  px: number;
  py: number;
  /** Confianza 0-1 del modelo para este keypoint. */
  confidence: number;
}

// ─── Confianza de calibración ─────────────────────────────────────────────────

export type CalibrationConfidence = "high" | "medium" | "low" | "none";

export interface FieldRegistration {
  /** Homografía PÍXEL→campo(m) — la que usa el tracking para pasar a metros. */
  Hpix2field: Float64Array | null;
  /** Homografía campo(m)→PÍXEL — para render/overlay. */
  Hfield2pix: Float64Array | null;
  confidence: CalibrationConfidence;
  /** Error medio de reproyección sobre inliers (px). */
  meanReprojErrorPx: number;
  inlierCount: number;
  usedLandmarks: number;
  source: "model" | "manual" | "none";
}

export const NO_REGISTRATION: FieldRegistration = {
  Hpix2field: null,
  Hfield2pix: null,
  confidence: "none",
  meanReprojErrorPx: Infinity,
  inlierCount: 0,
  usedLandmarks: 0,
  source: "none",
};

// Umbrales de clasificación (px de error de reproyección + nº de inliers).
const HIGH = { minInliers: 6, maxErrPx: 3.0, minInlierRatio: 0.7 };
const MEDIUM = { minInliers: 5, maxErrPx: 6.0, minInlierRatio: 0.5 };
const LOW = { minInliers: 4, maxErrPx: 10.0 };

/**
 * Clasifica la fiabilidad de una calibración a partir de sus inliers y su error
 * de reproyección. Es el corazón del "gate": por debajo de 'medium' NO deben
 * reportarse métricas en metros como si fueran medidas.
 */
export function classifyCalibration(
  inlierCount: number,
  usedLandmarks: number,
  meanReprojErrorPx: number,
): CalibrationConfidence {
  if (inlierCount < 4 || !isFinite(meanReprojErrorPx)) return "none";
  const inlierRatio = usedLandmarks > 0 ? inlierCount / usedLandmarks : 0;
  if (
    inlierCount >= HIGH.minInliers &&
    meanReprojErrorPx <= HIGH.maxErrPx &&
    inlierRatio >= HIGH.minInlierRatio
  ) {
    return "high";
  }
  if (
    inlierCount >= MEDIUM.minInliers &&
    meanReprojErrorPx <= MEDIUM.maxErrPx &&
    inlierRatio >= MEDIUM.minInlierRatio
  ) {
    return "medium";
  }
  if (inlierCount >= LOW.minInliers && meanReprojErrorPx <= LOW.maxErrPx) {
    return "low";
  }
  return "none";
}

/**
 * EL GATE. ¿Se pueden reportar métricas en METROS (velocidad, distancia,
 * sprints) con esta calibración? Solo con confianza high/medium. Con low/none
 * las cifras "en m/s" serían píxeles disfrazados → no se muestran como medidas.
 */
export function metricsTrustworthy(confidence: CalibrationConfidence): boolean {
  return confidence === "high" || confidence === "medium";
}

// ─── Sanity GEOMÉTRICA de la homografía (anti falso-positivo de dominio) ──────
// classifyCalibration mira solo inliers+reproyección, y se afinó con broadcast.
// En footage de academia (campos juveniles con doble juego de líneas, ángulo bajo)
// el modelo confunde qué línea es cuál: RANSAC ajusta un subconjunto internamente
// consistente (reproyección baja ENTRE esos puntos) pero la homografía es
// geométricamente FALSA. Verificado con overlays reales: frames "high" (1-2.7px,
// 6-12 inliers) con el campo reproyectado flotando o dibujado fuera del césped.
// Este chequeo exige que los inliers estén REPARTIDOS por el campo (no agrupados →
// no extrapolación) y que las esquinas del campo reproyecten a un cuadrilátero
// convexo delante de la cámara. Es NECESARIO, no suficiente (el discriminador
// definitivo es el soporte de líneas sobre el frame, que vive en el worker).

// Condición NECESARIA conservadora: rechaza solo homografías degeneradas
// (inliers casi colineales/agrupados → extrapolación) o geométricamente imposibles
// (esquinas detrás de cámara / cuadrilátero cruzado). NO exige ver todo el campo
// (eso rechazaría tomas cerradas legítimas). NO es suficiente para el dominio
// academia: el discriminador definitivo es el soporte de líneas sobre el frame
// (lineSupportScore, se aplica en el worker de tracking con acceso al píxel).
// Umbrales como FRACCIÓN de las dimensiones del campo → válido para F11 y F8.
const GEO = { minFxSpreadFrac: 0.19, minFySpreadFrac: 0.15, minAreaFrac: 0.03, minRegions: 1 } as const;

export interface FieldGeometryAssessment {
  ok: boolean;
  fxSpreadM: number;
  fySpreadM: number;
  areaFrac: number;
  regions: number;
  convex: boolean;
}

function crossSign(o: { px: number; py: number }, a: { px: number; py: number }, b: { px: number; py: number }): number {
  return Math.sign((a.px - o.px) * (b.py - o.py) - (a.py - o.py) * (b.px - o.px));
}

/** ¿Los 4 vértices (en orden) forman un cuadrilátero convexo sin auto-intersección? */
function isConvexQuad(p: Array<{ px: number; py: number }>): boolean {
  if (p.length !== 4) return false;
  const signs: number[] = [];
  for (let i = 0; i < 4; i++) signs.push(crossSign(p[i], p[(i + 1) % 4], p[(i + 2) % 4]));
  return signs.every((s) => s > 0) || signs.every((s) => s < 0);
}

/**
 * Evalúa si una homografía campo→píxel es geométricamente plausible dados los
 * puntos de campo (m) que quedaron como inliers. Rechaza calibraciones fundadas
 * en puntos agrupados (extrapolación) o que proyectan un campo imposible.
 */
export function assessFieldGeometry(
  Hfield2pix: Float64Array,
  inlierField: Array<{ fx: number; fy: number }>,
  fieldLength: number = FIELD_LENGTH_M,
  fieldWidth: number = FIELD_WIDTH_M,
): FieldGeometryAssessment {
  if (inlierField.length < 4) {
    return { ok: false, fxSpreadM: 0, fySpreadM: 0, areaFrac: 0, regions: 0, convex: false };
  }
  const fxs = inlierField.map((p) => p.fx);
  const fys = inlierField.map((p) => p.fy);
  const fxSpread = Math.max(...fxs) - Math.min(...fxs);
  const fySpread = Math.max(...fys) - Math.min(...fys);
  const areaFrac = (fxSpread * fySpread) / (fieldLength * fieldWidth);
  // Tercios del campo relativos a su largo (F11 105, F8 ~60) → format-agnostic.
  const regions = new Set(fxs.map((fx) => (fx < fieldLength / 3 ? 0 : fx < (2 * fieldLength) / 3 ? 1 : 2))).size;

  // Reproyectar las 4 esquinas del campo; deben quedar delante de cámara y convexas.
  const cornerFields = [[0, 0], [fieldLength, 0], [fieldLength, fieldWidth], [0, fieldWidth]];
  let allFront = true;
  const cornerPx = cornerFields.map(([fx, fy]) => {
    const w = Hfield2pix[6] * fx + Hfield2pix[7] * fy + Hfield2pix[8];
    if (w <= 1e-9) allFront = false;
    return fieldToPixel(Hfield2pix, fx, fy);
  });
  const convex = allFront && isConvexQuad(cornerPx);

  const ok =
    convex &&
    fxSpread >= GEO.minFxSpreadFrac * fieldLength &&
    fySpread >= GEO.minFySpreadFrac * fieldWidth &&
    areaFrac >= GEO.minAreaFrac &&
    regions >= GEO.minRegions;
  return { ok, fxSpreadM: fxSpread, fySpreadM: fySpread, areaFrac, regions, convex };
}

export interface RegisterOptions {
  /** Confianza mínima del keypoint del modelo para usarlo (default 0.5). */
  minKeypointConfidence?: number;
  /** Umbral de reproyección RANSAC en px (default 8). */
  reprojThresholdPx?: number;
  /** Iteraciones RANSAC (default 300). */
  maxIterations?: number;
  /**
   * Plantilla de landmarks del FORMATO (fútbol-11 por defecto; fútbol-8 = otra).
   * El formato lo elige el usuario ANTES del análisis y determina plantilla +
   * dimensiones (metros) + sanity geométrica. Ver fieldFormatConfig.getFieldTemplate.
   */
  template?: readonly FieldLandmark[];
}

/**
 * Registra el campo a partir de los landmarks detectados por el modelo.
 * Geometría pura: empareja cada detección con su coord real de plantilla,
 * corre RANSAC, y devuelve la homografía + confianza. Sin efectos secundarios.
 * `opts.template` selecciona el formato (F11 por defecto, F8 para campo reducido).
 */
export function registerFieldFromLandmarks(
  detections: DetectedLandmark[],
  opts: RegisterOptions = {},
): FieldRegistration {
  const minConf = opts.minKeypointConfidence ?? 0.5;
  const reproj = opts.reprojThresholdPx ?? 8.0;
  const template = opts.template ?? FIELD_TEMPLATE;
  const byId = template === FIELD_TEMPLATE ? TEMPLATE_BY_ID : new Map(template.map((l) => [l.id, l]));
  // Dimensiones del formato (metros) = extensión de la plantilla → sanity geométrica.
  let fieldLength = 0;
  let fieldWidth = 0;
  for (const l of template) {
    if (l.field.fx > fieldLength) fieldLength = l.field.fx;
    if (l.field.fy > fieldWidth) fieldWidth = l.field.fy;
  }

  const filtered = detections.filter(
    (d) => d.confidence >= minConf && byId.has(d.id),
  );
  if (filtered.length < 4) return NO_REGISTRATION;

  const correspondences = filtered.map((d) => {
    const tpl = byId.get(d.id)!;
    return {
      pixel: { x: d.px, y: d.py },
      field: { x: tpl.field.fx, y: tpl.field.fy },
    };
  });

  const res = computeHomographyRANSAC(
    correspondences,
    opts.maxIterations ?? 300,
    reproj,
  );
  if (!res) return NO_REGISTRATION;

  // res.H mapea campo→píxel. Error medio de reproyección sobre inliers:
  // proyectar el punto de campo a píxel y comparar con el píxel detectado.
  let sum = 0;
  for (const i of res.inlierIndices) {
    const c = correspondences[i];
    const rp = fieldToPixel(res.H, c.field.x, c.field.y);
    sum += Math.hypot(rp.px - c.pixel.x, rp.py - c.pixel.y);
  }
  const meanErr = res.inlierIndices.length ? sum / res.inlierIndices.length : Infinity;

  let Hpix2field: Float64Array | null = null;
  try {
    Hpix2field = invertMatrix3x3(res.H);
  } catch {
    return NO_REGISTRATION; // H singular → sin calibración usable
  }

  let confidence = classifyCalibration(res.inlierCount, filtered.length, meanErr);
  // Sanity geométrica: si es fiable POR NÚMEROS pero la homografía es implausible
  // (inliers agrupados / campo reproyectado imposible), degradar a 'low' para que
  // el gate NO deje pasar métricas en metros. Evita el falso-positivo de dominio.
  if (confidence === "high" || confidence === "medium") {
    const inlierField = res.inlierIndices.map((i) => ({
      fx: correspondences[i].field.x,
      fy: correspondences[i].field.y,
    }));
    if (!assessFieldGeometry(res.H, inlierField, fieldLength, fieldWidth).ok) confidence = "low";
  }

  return {
    Hpix2field,
    Hfield2pix: res.H,
    confidence,
    meanReprojErrorPx: meanErr,
    inlierCount: res.inlierCount,
    usedLandmarks: filtered.length,
    source: "model",
  };
}

// ─── Acumulador temporal (cámara ~fija de academia) ──────────────────────────

/**
 * Acumula detecciones de landmarks a lo largo de varios frames. Como la cámara
 * de una academia suele estar en trípode (fija), el mismo punto del campo cae
 * siempre en el mismo píxel: acumular la mejor detección de cada landmark entre
 * frames da muchos más puntos y una homografía mucho más estable que un solo
 * frame. Si la cámara panea/zoom, esta suposición se rompe — por eso la guía de
 * grabación insiste en cámara fija (y por eso el gate de confianza sigue
 * mandando: si el acumulado no cuadra, la confianza baja y se bloquean métricas).
 */
export class FieldRegistrationAccumulator {
  private best = new Map<number, DetectedLandmark>();
  private readonly template: readonly FieldLandmark[];
  private readonly byId: Map<number, FieldLandmark>;

  /**
   * @param template plantilla del FORMATO (F11 por defecto; F8 para campo reducido).
   * Determina qué ids se aceptan y qué plantilla usa register().
   */
  constructor(template: readonly FieldLandmark[] = FIELD_TEMPLATE) {
    this.template = template;
    this.byId = template === FIELD_TEMPLATE ? TEMPLATE_BY_ID : new Map(template.map((l) => [l.id, l]));
  }

  /** Añade las detecciones de un frame, quedándose con la de mayor confianza por id. */
  add(detections: DetectedLandmark[]): void {
    for (const d of detections) {
      if (!this.byId.has(d.id)) continue;
      const prev = this.best.get(d.id);
      if (!prev || d.confidence > prev.confidence) {
        this.best.set(d.id, d);
      }
    }
  }

  /** Nº de landmarks distintos acumulados. */
  get size(): number {
    return this.best.size;
  }

  /** Registra el campo con todo lo acumulado (usa la plantilla del formato). */
  register(opts: RegisterOptions = {}): FieldRegistration {
    return registerFieldFromLandmarks([...this.best.values()], { template: this.template, ...opts });
  }

  reset(): void {
    this.best.clear();
  }
}

// ─── Decoder de la salida ONNX (YOLOv8/YOLO11-pose) ──────────────────────────

/**
 * Decodifica el tensor de salida de un modelo de pose (1 clase = "campo",
 * K keypoints) en las detecciones de landmarks, deshaciendo el letterbox.
 *
 * Layout YOLO-pose: canales = 4 (caja xywh) + 1 (conf objeto) + K*3 (x,y,conf por
 * keypoint), en formato canal-mayor: outputData[c*numAnchors + i]. Para K=32 son
 * 101 canales × 8400 anclas. El "campo" es un único objeto → tomamos el ancla de
 * mayor confianza y leemos sus K keypoints. Keypoints en espacio del modelo
 * (letterboxed a modelSize×modelSize) → se convierten a píxeles de la imagen.
 *
 * Geometría pura, testeable sin ONNX real (se le pasa un Float32Array sintético).
 */
export function decodeFieldKeypoints(
  outputData: Float32Array,
  numKeypoints: number,
  imgW: number,
  imgH: number,
  modelSize = 640,
  opts: { minObjectConfidence?: number } = {},
): DetectedLandmark[] {
  const channels = 5 + numKeypoints * 3;
  const numAnchors = Math.round(outputData.length / channels);
  if (numAnchors <= 0) return [];

  // Letterbox (idéntico a preprocessBall: escala isótropa + padding centrado).
  const scale = Math.min(modelSize / imgW, modelSize / imgH);
  const padX = (modelSize - imgW * scale) / 2;
  const padY = (modelSize - imgH * scale) / 2;

  // Ancla de mayor confianza de objeto (canal 4).
  let best = -1;
  let bestConf = opts.minObjectConfidence ?? 0.3;
  for (let i = 0; i < numAnchors; i++) {
    const c = outputData[4 * numAnchors + i];
    if (c > bestConf) { bestConf = c; best = i; }
  }
  if (best < 0) return [];

  const dets: DetectedLandmark[] = [];
  for (let k = 0; k < numKeypoints; k++) {
    const base = (5 + k * 3) * numAnchors + best;
    const kx = outputData[base];
    const ky = outputData[base + numAnchors];
    const kc = outputData[base + 2 * numAnchors];
    dets.push({
      id: k,
      px: (kx - padX) / scale,
      py: (ky - padY) / scale,
      confidence: kc,
    });
  }
  return dets;
}
