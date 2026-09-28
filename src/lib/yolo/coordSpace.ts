/**
 * VITAS · Espacios de coordenadas del tracking en navegador (una sola fuente)
 *
 * En la ruta VitasLab → useTracking → trackingWorker conviven varios espacios de
 * píxel. Mezclarlos en silencio fue lo que dejaba las físicas a 0: el worker
 * detectaba sobre un frame 640×640 aplastado mientras la homografía y los overlays
 * trabajaban en píxeles nativos del vídeo.
 *
 *   · FRAME   — lo que ve el modelo: `frameExtractor` dibuja el vídeo APLASTADO a
 *               640×640 (escalas distintas en x e y). Solo vive dentro del worker
 *               (y del worker del balón).
 *   · SOURCE  — píxeles NATIVOS del vídeo (videoWidth×videoHeight). ESPACIO CANÓNICO:
 *               las cajas/keypoints que salen del worker, la homografía px→m del
 *               tracker, los overlays y los recortes de color (Re-ID) usan este.
 *   · PERCENT — los puntos de calibración del Lab: % del frame del vídeo (0-100),
 *               independiente de la resolución.
 *   · DISPLAY — el canvas del overlay: el <video object-contain> queda centrado con
 *               bandas (letterbox) dentro del contenedor.
 *
 * Regla: ninguna coordenada cruza de un espacio a otro sin pasar por una función de
 * este módulo. FRAME↔SOURCE↔PERCENT son escalados por eje (afines diagonales), así que
 * la IoU entre cajas se conserva y una homografía se re-expresa EXACTAMENTE con una
 * matriz diagonal (`rescalePixelToField`).
 *
 * Convención de homografías: aquí solo circula la matriz PÍXEL→CAMPO (la que consume
 * `pixelToField`). `computeHomography` devuelve CAMPO→PÍXEL; ver homography.ts.
 */

import type { Detection, Keypoint, PixelSpace } from "./types";
import {
  buildAnchors,
  computePixelToFieldHomography,
  identityHomography,
  invertMatrix3x3,
} from "./homography";

export type { PixelSpace };

/** Espacio de los puntos de calibración del Lab (porcentaje del frame del vídeo). */
export const PERCENT_SPACE: PixelSpace = { width: 100, height: 100 };

/** ¿Dimensiones utilizables (finitas y > 0)? */
export function isValidSpace(s: PixelSpace | null | undefined): s is PixelSpace {
  return !!s && Number.isFinite(s.width) && Number.isFinite(s.height) && s.width > 0 && s.height > 0;
}

/**
 * Espacio NATIVO de un <video> (videoWidth×videoHeight). null si aún no tiene
 * dimensiones (metadata sin cargar) — el llamante decide el fallback, sin inventar
 * una resolución por defecto.
 */
export function videoSpaceOf(
  video: { videoWidth: number; videoHeight: number } | null | undefined,
): PixelSpace | null {
  if (!video || !(video.videoWidth > 0) || !(video.videoHeight > 0)) return null;
  return { width: video.videoWidth, height: video.videoHeight };
}

/** ¿Mismo espacio (mismas dimensiones)? */
export function sameSpace(a: PixelSpace, b: PixelSpace): boolean {
  return a.width === b.width && a.height === b.height;
}

// ─── FRAME ↔ SOURCE ↔ PERCENT (escalado por eje) ─────────────────────────────

/** Factores por eje para llevar un punto de `from` a `to`. */
export function spaceScale(from: PixelSpace, to: PixelSpace): { sx: number; sy: number } {
  return { sx: to.width / from.width, sy: to.height / from.height };
}

/** Caja [x, y, w, h] de `from` a `to`. */
export function scaleBox(
  bbox: [number, number, number, number],
  from: PixelSpace,
  to: PixelSpace,
): [number, number, number, number] {
  const { sx, sy } = spaceScale(from, to);
  return [bbox[0] * sx, bbox[1] * sy, bbox[2] * sx, bbox[3] * sy];
}

/**
 * Cualquier objeto con caja + keypoints (Detection, Track) de `from` a `to`. Copia
 * superficial con caja y keypoints reescalados; el resto de campos (confianza, id,
 * posiciones en METROS…) no cambia. Devuelve el MISMO objeto si los espacios
 * coinciden (sin copia).
 */
export function scaleBoxed<T extends { bbox: [number, number, number, number]; keypoints: Keypoint[] }>(
  item: T,
  from: PixelSpace,
  to: PixelSpace,
): T {
  if (sameSpace(from, to)) return item;
  const { sx, sy } = spaceScale(from, to);
  return {
    ...item,
    bbox: [item.bbox[0] * sx, item.bbox[1] * sy, item.bbox[2] * sx, item.bbox[3] * sy],
    keypoints: item.keypoints.map((k) => ({ x: k.x * sx, y: k.y * sy, confidence: k.confidence })),
  };
}

/** Detección (caja + keypoints) de `from` a `to`. */
export function scaleDetection(det: Detection, from: PixelSpace, to: PixelSpace): Detection {
  return scaleBoxed(det, from, to);
}

/** Lote de detecciones de `from` a `to` (el paso 640²→nativo del worker). */
export function scaleDetections(dets: Detection[], from: PixelSpace, to: PixelSpace): Detection[] {
  if (sameSpace(from, to)) return dets;
  return dets.map((d) => scaleBoxed(d, from, to));
}

// ─── Homografía PÍXEL→CAMPO por espacio ──────────────────────────────────────

/**
 * Re-expresa una homografía PÍXEL→CAMPO definida en `from` para píxeles de `to`
 * (misma imagen a otra resolución). Si p_from = S·p_to con
 * S = diag(from.w/to.w, from.h/to.h, 1), entonces H_to = H_from · S: se escalan las
 * dos primeras COLUMNAS. Exacto (sin re-estimar nada).
 */
export function rescalePixelToField(
  pixelToFieldFrom: Float64Array,
  from: PixelSpace,
  to: PixelSpace,
): Float64Array {
  const kx = from.width / to.width;
  const ky = from.height / to.height;
  const H = pixelToFieldFrom;
  return new Float64Array([
    H[0] * kx, H[1] * ky, H[2],
    H[3] * kx, H[4] * ky, H[5],
    H[6] * kx, H[7] * ky, H[8],
  ]);
}

/** Calibración del campo: homografía PÍXEL→CAMPO + el espacio en que está definida. */
export interface PixelToFieldCalibration {
  /** Matriz PÍXEL→CAMPO (metros), fila mayor — la convención de `pixelToField`. */
  pixelToField: Float64Array;
  /** Espacio de píxel en el que está expresada. */
  space: PixelSpace;
}

/**
 * Calibración desde los puntos del Lab (en % del frame del vídeo) y las posiciones
 * de campo del preset. No depende de la resolución del vídeo (antes se construía
 * con 1280×720 por defecto si el vídeo aún no había cargado → escala equivocada).
 * Devuelve null si hay < 4 puntos o la geometría es degenerada.
 */
export function calibrationFromPercentPoints(
  points: Array<{ x: number; y: number }>,
  fieldAnchors: ReadonlyArray<{ field: { fx: number; fy: number } }>,
): PixelToFieldCalibration | null {
  if (points.length < 4 || fieldAnchors.length < 4) return null;
  try {
    const anchors = buildAnchors(
      points,
      fieldAnchors as Array<{ field: { fx: number; fy: number } }>,
      PERCENT_SPACE.width,
      PERCENT_SPACE.height,
    );
    const pixelToField = computePixelToFieldHomography(anchors);
    if (!Array.from(pixelToField).every(Number.isFinite)) return null;
    return { pixelToField, space: PERCENT_SPACE };
  } catch {
    return null; // puntos colineales / matriz singular
  }
}

/**
 * Homografía PÍXEL→CAMPO lista para píxeles de `space`. Sin calibración → identidad
 * (comportamiento previo: el tracker descarta las posiciones fuera del rango del
 * campo; las físicas quedan con calibrated:false en cualquier caso).
 */
export function pixelToFieldIn(
  calib: PixelToFieldCalibration | null,
  space: PixelSpace,
): Float64Array {
  if (!calib || !isValidSpace(space)) return identityHomography();
  return rescalePixelToField(calib.pixelToField, calib.space, space);
}

/** Homografía CAMPO→PÍXEL en `space` (render: Voronoi). Identidad si no invertible. */
export function fieldToPixelIn(
  calib: PixelToFieldCalibration | null,
  space: PixelSpace,
): Float64Array {
  try {
    return invertMatrix3x3(pixelToFieldIn(calib, space));
  } catch {
    return identityHomography();
  }
}

// ─── SOURCE/PERCENT ↔ DISPLAY (object-contain) ───────────────────────────────

/** Transformación afín por eje content→display: (x·sx + ox, y·sy + oy). */
export interface DisplayTransform {
  sx: number;
  sy: number;
  ox: number;
  oy: number;
}

/**
 * Transformación de un espacio de contenido (SOURCE para tracks, PERCENT para la
 * calibración) al canvas del overlay, cuando el vídeo se pinta con
 * `object-fit: contain` dentro del contenedor (centrado, con bandas).
 * Sin vídeo (`video` null/0×0) el contenido llena el contenedor (comportamiento
 * previo, p. ej. la imagen del campo antes de cargar un vídeo).
 */
export function containTransform(
  content: PixelSpace,
  video: PixelSpace | null,
  container: PixelSpace,
): DisplayTransform {
  if (!isValidSpace(video)) {
    return {
      sx: container.width / content.width,
      sy: container.height / content.height,
      ox: 0,
      oy: 0,
    };
  }
  const scale = Math.min(container.width / video.width, container.height / video.height);
  const shownW = video.width * scale;
  const shownH = video.height * scale;
  return {
    sx: shownW / content.width,
    sy: shownH / content.height,
    ox: (container.width - shownW) / 2,
    oy: (container.height - shownH) / 2,
  };
}

/** Punto de contenido → display. */
export function toDisplay(t: DisplayTransform, x: number, y: number): { x: number; y: number } {
  return { x: x * t.sx + t.ox, y: y * t.sy + t.oy };
}

/** Punto de display (p. ej. el ratón) → contenido. */
export function fromDisplay(t: DisplayTransform, x: number, y: number): { x: number; y: number } {
  return { x: (x - t.ox) / t.sx, y: (y - t.oy) / t.sy };
}
