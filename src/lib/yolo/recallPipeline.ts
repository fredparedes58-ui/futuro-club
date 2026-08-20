/**
 * VITAS · Recall Pipeline (detección-primero para recall) — orquestador PURO
 *
 * Un frame de análisis diferido en tres pasos honestos:
 *   1. DETECCIÓN con tiling → cajas/posición de TODOS los jugadores (equipo
 *      completo). Reutiliza la geometría de `tiling.ts` (computeTileRects /
 *      cropImage / offsetDetection / globalNms) — NO se duplica tiling ni NMS.
 *   2. Partición por elegibilidad de pose (`poseEligibility.ts`): cercanas vs
 *      lejanas.
 *   3. POSE solo sobre las cajas cercanas (recorte con margen) → biomecánica solo
 *      donde hay píxeles fiables. Las lejanas conservan `keypoints: []`. Nunca se
 *      inventan keypoints.
 *
 * PURO e inyectable: recibe las dos inferencias (`detect`, `pose`) como funciones,
 * de modo que toda la lógica de orquestación y mapeo de coordenadas se testea sin
 * navegador ni onnxruntime. El worker (`trackingWorker.ts`) provee las inferencias
 * reales (detector con `detectPostprocess`, pose con el modelo de pose ya cargado).
 */

import type { Detection } from "./types";
import {
  computeTileRects,
  cropImage,
  offsetDetection,
  globalNms,
  type ImageLike,
  type TilingConfig,
  type TileRect,
} from "./tiling";
import { partitionByPoseEligibility } from "./poseEligibility";

/** Inferencias reales inyectadas por el worker. Coords LOCALES a la imagen dada. */
export interface RecallInferers {
  /** Detección (caja) sobre un tile o frame → personas, `keypoints: []`. */
  detect: (img: ImageLike) => Promise<Detection[]>;
  /** Pose sobre un recorte → mejor detección con keypoints, o `null` si nada fiable. */
  pose: (crop: ImageLike) => Promise<Detection | null>;
}

export interface RecallOptions {
  /** Malla de tiling para la detección (de `vitas_tiling` o el default de recall). */
  tiling: TilingConfig;
  /** Altura mínima de caja (px) para correr pose (cercanía). */
  minPoseBoxHeightPx: number;
  /** IoU del NMS global que fusiona detecciones de tiles solapados. */
  nmsIouThresh: number;
  /** Margen (fracción de w/h) alrededor de la caja al recortar para pose. */
  posePadFrac: number;
}

export interface RecallFrameResult {
  /** Personas del frame: posición para todas; keypoints solo en las cercanas. */
  detections: Detection[];
  /** Nº de detecciones elegibles para pose (cercanas). */
  poseEligibleCount: number;
  /** Nº total de detecciones del frame. */
  totalCount: number;
}

/**
 * Rectángulo de recorte para pose alrededor de una bbox `[x,y,w,h]`, con margen
 * y recortado contra los límites de la imagen. Margen: la pose necesita algo de
 * contexto alrededor del jugador (extremidades que salen de la caja de detección).
 */
export function bboxToPoseCrop(
  bbox: readonly [number, number, number, number],
  imgW: number,
  imgH: number,
  padFrac: number,
): TileRect {
  const [x, y, w, h] = bbox;
  const padX = w * padFrac;
  const padY = h * padFrac;
  const sx = Math.max(0, Math.floor(x - padX));
  const sy = Math.max(0, Math.floor(y - padY));
  const ex = Math.min(imgW, Math.ceil(x + w + padX));
  const ey = Math.min(imgH, Math.ceil(y + h + padY));
  return { sx, sy, sw: Math.max(0, ex - sx), sh: Math.max(0, ey - sy) };
}

/**
 * Corre un frame por la ruta detección-primero. Devuelve las personas (posición
 * de todas, biomecánica solo de las cercanas) y los contadores de cobertura.
 */
export async function runRecallFrame(
  img: ImageLike,
  opts: RecallOptions,
  inferers: RecallInferers,
): Promise<RecallFrameResult> {
  // 1. Detección con tiling → cajas en coords del frame completo.
  const rects = computeTileRects(img.width, img.height, opts.tiling.grid, opts.tiling.overlap);
  const all: Detection[] = [];
  for (const rect of rects) {
    const tile = cropImage(img, rect);
    if (tile.width === 0 || tile.height === 0) continue;
    const dets = await inferers.detect(tile);
    for (const d of dets) all.push(offsetDetection(d, rect.sx, rect.sy));
  }
  // NMS global: deduplica el mismo jugador visto en dos tiles solapados.
  const persons = globalNms(all, opts.nmsIouThresh);

  // 2. Partición por cercanía (elegibilidad de pose).
  const { poseEligible } = partitionByPoseEligibility(persons, opts.minPoseBoxHeightPx);
  const eligible = new Set(poseEligible);

  // 3. Pose SOLO sobre las cercanas. Las lejanas conservan keypoints: [] (honesto).
  const detections: Detection[] = [];
  for (const det of persons) {
    if (!eligible.has(det)) {
      detections.push(det); // lejano → posición sí, biomecánica no
      continue;
    }
    const rect = bboxToPoseCrop(det.bbox, img.width, img.height, opts.posePadFrac);
    if (rect.sw <= 0 || rect.sh <= 0) {
      detections.push(det);
      continue;
    }
    const crop = cropImage(img, rect);
    const poseDet = await inferers.pose(crop);
    if (poseDet && poseDet.keypoints.length > 0) {
      // Keypoints en coords del recorte → coords del frame completo.
      const offset = offsetDetection(poseDet, rect.sx, rect.sy);
      detections.push({ ...det, keypoints: offset.keypoints });
    } else {
      // La pose no halló nada fiable en la caja → no inventamos keypoints.
      detections.push(det);
    }
  }

  return {
    detections,
    poseEligibleCount: poseEligible.length,
    totalCount: persons.length,
  };
}
