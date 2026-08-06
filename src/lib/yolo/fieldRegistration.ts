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

export const FIELD_TEMPLATE: readonly FieldLandmark[] = [
  // Esquinas
  { id: 0, name: "corner_tl", field: { fx: 0, fy: 0 } },
  { id: 1, name: "corner_tr", field: { fx: 105, fy: 0 } },
  { id: 2, name: "corner_br", field: { fx: 105, fy: 68 } },
  { id: 3, name: "corner_bl", field: { fx: 0, fy: 68 } },
  // Área grande izquierda (16.5m; ancho 13.84–54.16)
  { id: 4, name: "lpa_top_goal", field: { fx: 0, fy: 13.84 } },
  { id: 5, name: "lpa_top_field", field: { fx: 16.5, fy: 13.84 } },
  { id: 6, name: "lpa_bot_field", field: { fx: 16.5, fy: 54.16 } },
  { id: 7, name: "lpa_bot_goal", field: { fx: 0, fy: 54.16 } },
  // Área grande derecha (88.5–105)
  { id: 8, name: "rpa_top_goal", field: { fx: 105, fy: 13.84 } },
  { id: 9, name: "rpa_top_field", field: { fx: 88.5, fy: 13.84 } },
  { id: 10, name: "rpa_bot_field", field: { fx: 88.5, fy: 54.16 } },
  { id: 11, name: "rpa_bot_goal", field: { fx: 105, fy: 54.16 } },
  // Área pequeña izquierda (5.5m; ancho 24.84–43.16)
  { id: 12, name: "lga_top_goal", field: { fx: 0, fy: 24.84 } },
  { id: 13, name: "lga_top_field", field: { fx: 5.5, fy: 24.84 } },
  { id: 14, name: "lga_bot_field", field: { fx: 5.5, fy: 43.16 } },
  { id: 15, name: "lga_bot_goal", field: { fx: 0, fy: 43.16 } },
  // Área pequeña derecha (99.5–105)
  { id: 16, name: "rga_top_goal", field: { fx: 105, fy: 24.84 } },
  { id: 17, name: "rga_top_field", field: { fx: 99.5, fy: 24.84 } },
  { id: 18, name: "rga_bot_field", field: { fx: 99.5, fy: 43.16 } },
  { id: 19, name: "rga_bot_goal", field: { fx: 105, fy: 43.16 } },
  // Puntos de penalti
  { id: 20, name: "lpen_spot", field: { fx: 11, fy: 34 } },
  { id: 21, name: "rpen_spot", field: { fx: 94, fy: 34 } },
  // Línea media
  { id: 22, name: "center_top", field: { fx: 52.5, fy: 0 } },
  { id: 23, name: "center_bot", field: { fx: 52.5, fy: 68 } },
  { id: 24, name: "center_mark", field: { fx: 52.5, fy: 34 } },
  // Círculo central (r 9.15)
  { id: 25, name: "cc_top", field: { fx: 52.5, fy: 24.85 } },
  { id: 26, name: "cc_bot", field: { fx: 52.5, fy: 43.15 } },
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

export interface RegisterOptions {
  /** Confianza mínima del keypoint del modelo para usarlo (default 0.5). */
  minKeypointConfidence?: number;
  /** Umbral de reproyección RANSAC en px (default 8). */
  reprojThresholdPx?: number;
  /** Iteraciones RANSAC (default 300). */
  maxIterations?: number;
}

/**
 * Registra el campo a partir de los landmarks detectados por el modelo.
 * Geometría pura: empareja cada detección con su coord real de plantilla,
 * corre RANSAC, y devuelve la homografía + confianza. Sin efectos secundarios.
 */
export function registerFieldFromLandmarks(
  detections: DetectedLandmark[],
  opts: RegisterOptions = {},
): FieldRegistration {
  const minConf = opts.minKeypointConfidence ?? 0.5;
  const reproj = opts.reprojThresholdPx ?? 8.0;

  const filtered = detections.filter(
    (d) => d.confidence >= minConf && TEMPLATE_BY_ID.has(d.id),
  );
  if (filtered.length < 4) return NO_REGISTRATION;

  const correspondences = filtered.map((d) => {
    const tpl = TEMPLATE_BY_ID.get(d.id)!;
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

  return {
    Hpix2field,
    Hfield2pix: res.H,
    confidence: classifyCalibration(res.inlierCount, filtered.length, meanErr),
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

  /** Añade las detecciones de un frame, quedándose con la de mayor confianza por id. */
  add(detections: DetectedLandmark[]): void {
    for (const d of detections) {
      if (!TEMPLATE_BY_ID.has(d.id)) continue;
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

  /** Registra el campo con todo lo acumulado hasta ahora. */
  register(opts: RegisterOptions = {}): FieldRegistration {
    return registerFieldFromLandmarks([...this.best.values()], opts);
  }

  reset(): void {
    this.best.clear();
  }
}
