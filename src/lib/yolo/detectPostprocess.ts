/**
 * VITAS · Detection-head postprocess (detección-primero para recall)
 *
 * Decodifica la salida de un modelo de DETECCIÓN YOLO (caja, no pose) —
 * layout `[1, 4 + numClasses, numAnchors]`, canal-mayor— a `Detection[]` de UNA
 * clase (persona = 0), en píxeles del frame/tile dado.
 *
 * Por qué existe (contra el postprocess de POSE del worker, que asume
 * `[1, 56, 8400]` = 4 bbox + 1 conf + 17×3 kp): un modelo de detección NO emite
 * keypoints y su salida son 4 bbox + N class-scores. La caja tiene un suelo de
 * tamaño más bajo que la pose (no necesita colocar 17 keypoints), así que con
 * tiling recupera el EQUIPO COMPLETO donde la pose deja fuera a los lejanos.
 * Las detecciones que devuelve llevan `keypoints: []` a propósito: la posición es
 * MEDIDA/DERIVADA, pero la biomecánica solo se rellena luego sobre las cajas
 * suficientemente grandes (ver `poseEligibility.ts`). Nunca se inventan keypoints.
 *
 * Módulo PURO (tipo estructural `ImageLike`, sin onnxruntime): el mapeo de
 * coordenadas letterbox⁻¹ se testea sin navegador. El NMS NO se hace aquí: el
 * llamante fusiona los tiles con `globalNms` de `tiling.ts` (invariante #7: una
 * sola implementación de NMS/IoU en el pipeline de tracking).
 *
 * Comparte el mismo álgebra letterbox⁻¹ que `ballDetector.detectBallFromModelOutput`
 * y que el postprocess de pose del worker; la diferencia es que aquí devolvemos
 * TODAS las cajas de la clase (no solo la mejor, como el balón que es único).
 */

import type { Detection } from "./types";
import { decodeYoloBox } from "./tiling";

/**
 * Decodifica la salida cruda de un detector YOLO a las detecciones de una clase.
 *
 * @param data          Salida del modelo (`Float32Array`), layout `[1, 4+numClasses, A]`.
 * @param numClasses    Nº de clases del modelo (COCO = 80).
 * @param classId       Índice de la clase a extraer (persona = 0).
 * @param imgW          Ancho de la imagen inferida (frame o tile), en px.
 * @param imgH          Alto de la imagen inferida, en px.
 * @param modelSize     Tamaño de entrada cuadrado del modelo (letterbox), p.ej. 640.
 * @param confThreshold Umbral de confianza de la clase.
 * @returns Detecciones en coords de píxel de la imagen dada, `keypoints: []`.
 *          SIN NMS (lo aplica el llamante con `globalNms`).
 */
export function decodeDetections(
  data: Float32Array,
  numClasses: number,
  classId: number,
  imgW: number,
  imgH: number,
  modelSize: number,
  confThreshold: number,
): Detection[] {
  // Nº de anclas derivado del tamaño real de la salida (640→8400, 1280→33600…),
  // NO hardcodeado: el nº de canales es 4 bbox + numClasses class-scores.
  const channels = 4 + numClasses;
  const numAnchors = Math.floor(data.length / channels);
  if (numAnchors <= 0) return [];

  // Inversa del letterbox: el frame se reescaló a `modelSize` con relleno centrado.
  const scale = Math.min(modelSize / imgW, modelSize / imgH);
  const padX = (modelSize - imgW * scale) / 2;
  const padY = (modelSize - imgH * scale) / 2;

  const scoreRow = (4 + classId) * numAnchors;
  const out: Detection[] = [];

  for (let i = 0; i < numAnchors; i++) {
    const conf = data[scoreRow + i];
    if (conf < confThreshold) continue;

    const cx = data[i];
    const cy = data[numAnchors + i];
    const bw = data[2 * numAnchors + i];
    const bh = data[3 * numAnchors + i];
    if (bw <= 0 || bh <= 0) continue;

    // Decode letterbox⁻¹ compartido (invariante #7): idéntico a pose y balón.
    const bbox = decodeYoloBox(cx, cy, bw, bh, scale, padX, padY);

    out.push({ bbox, confidence: conf, keypoints: [] });
  }

  return out;
}
