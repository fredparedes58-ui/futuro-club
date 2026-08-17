/**
 * VITAS · Tiling (SAHI — Slicing Aided Hyper Inference)
 *
 * Recupera recall de jugadores pequeños/lejanos partiendo el frame en una malla
 * NxN de tiles solapados, infiriendo cada tile a resolución nativa del modelo, y
 * fusionando las detecciones en coordenadas del frame completo con NMS global.
 *
 * Benchmark #26 (clips reales 4K, headless): yolov11m-pose a 640 → ~0 det/frame;
 * a 1280 → 4-13; tiling 3×3 @640 → hasta 20 (equipo entero). El tiling es el
 * verdadero arreglo de recall para ángulos de banda/lejanos.
 *
 * COSTE: una malla GxG son G² inferencias por frame (3×3 = 9×). A 8 fps eso es
 * ~72 inf/s en el navegador → NO real-time en máquinas débiles. Por eso el tiling
 * es OPT-IN y está pensado para la ruta de análisis DIFERIDO (offline), no para el
 * tracking en vivo (que se queda en 1280 plano). Ver `getTilingConfig`.
 *
 * Este módulo es PURO y no depende de `ImageData` (usa el tipo estructural
 * `ImageLike`) ni de onnxruntime — para que el mapeo de coordenadas y el NMS
 * global se puedan testear sin navegador. El worker (`trackingWorker.ts`)
 * orquesta: crop → preprocess → inferir → postprocess → offset → NMS global.
 */

import type { Detection } from "./types";

// ─── Tipos ─────────────────────────────────────────────────────────────────

/**
 * Forma estructural mínima de una imagen RGBA. `ImageData` la satisface
 * (mismo `data`/`width`/`height`), de modo que el worker puede pasar su
 * `ImageData` directamente y los tests pueden construir imágenes a mano.
 */
export interface ImageLike {
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/** Rectángulo de un tile en píxeles del frame ORIGINAL (source). */
export interface TileRect {
  /** x del borde izquierdo en el frame original */
  sx: number;
  /** y del borde superior en el frame original */
  sy: number;
  /** ancho del tile en px */
  sw: number;
  /** alto del tile en px */
  sh: number;
}

/** Configuración de tiling. `grid` = 1 equivale a inferencia de un solo paso. */
export interface TilingConfig {
  /** Nº de divisiones por eje (3 ⇒ malla 3×3 ⇒ 9 tiles). */
  grid: number;
  /**
   * Solape entre tiles adyacentes como fracción del tamaño base del tile
   * (0.15 = 15%). Evita cortar jugadores que caen en el borde entre dos tiles.
   * Rango válido [0, 0.5).
   */
  overlap: number;
}

// ─── Geometría de tiles ──────────────────────────────────────────────────────

interface Span {
  start: number;
  size: number;
}

/**
 * Reparte una longitud (ancho o alto) en `count` tramos solapados.
 *
 * Los tramos base `[i·base, (i+1)·base)` teselan la longitud exactamente; el
 * solape solo EXTIENDE cada tramo hacia fuera (clamp en los bordes 0 y length),
 * de modo que la unión SIEMPRE cubre `[0, length)` sin huecos.
 */
function computeSpans(length: number, count: number, overlap: number): Span[] {
  if (count <= 1) return [{ start: 0, size: length }];

  const base = length / count;
  const ov = base * overlap;
  const spans: Span[] = [];

  for (let i = 0; i < count; i++) {
    const start = Math.max(0, Math.round(i * base - ov));
    const end = Math.min(length, Math.round((i + 1) * base + ov));
    spans.push({ start, size: end - start });
  }
  return spans;
}

/**
 * Malla de tiles GxG (con solape) sobre un frame `width×height`.
 * Devuelve rects en coordenadas de píxel del frame original, fila mayor
 * (row-major: fila 0 completa, luego fila 1, …). La unión cubre todo el frame.
 */
export function computeTileRects(
  width: number,
  height: number,
  grid: number,
  overlap: number,
): TileRect[] {
  if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0) {
    throw new Error(`computeTileRects: dimensiones inválidas ${width}×${height}`);
  }
  const g = Math.max(1, Math.floor(grid));
  const ov = clampOverlap(overlap);

  const cols = computeSpans(width, g, ov);
  const rows = computeSpans(height, g, ov);

  const rects: TileRect[] = [];
  for (const row of rows) {
    for (const col of cols) {
      rects.push({ sx: col.start, sy: row.start, sw: col.size, sh: row.size });
    }
  }
  return rects;
}

/** Restringe el solape a [0, 0.5): 0.5+ solaparía tiles enteros (sin sentido). */
export function clampOverlap(overlap: number): number {
  if (!Number.isFinite(overlap) || overlap <= 0) return 0;
  return Math.min(0.49, overlap);
}

// ─── Recorte de tile ─────────────────────────────────────────────────────────

/**
 * Extrae el sub-rectángulo `rect` de `img` a una nueva `ImageLike` RGBA.
 * El rect se recorta contra los límites de la imagen (defensivo). Copia por filas.
 */
export function cropImage(img: ImageLike, rect: TileRect): ImageLike {
  const sx = Math.max(0, Math.min(img.width, Math.round(rect.sx)));
  const sy = Math.max(0, Math.min(img.height, Math.round(rect.sy)));
  const sw = Math.max(0, Math.min(img.width - sx, Math.round(rect.sw)));
  const sh = Math.max(0, Math.min(img.height - sy, Math.round(rect.sh)));

  const out = new Uint8ClampedArray(sw * sh * 4);
  for (let y = 0; y < sh; y++) {
    const srcStart = ((sy + y) * img.width + sx) * 4;
    const dstStart = y * sw * 4;
    // Copia una fila completa del tile de una vez (4 canales × sw px).
    out.set(img.data.subarray(srcStart, srcStart + sw * 4), dstStart);
  }
  return { data: out, width: sw, height: sh };
}

// ─── Mapeo de coordenadas tile → frame completo ──────────────────────────────

/**
 * Traslada una detección desde coordenadas LOCALES del tile a coordenadas del
 * frame ORIGINAL sumando el offset del tile `(dx, dy) = (rect.sx, rect.sy)`.
 * Desplaza tanto la bbox como TODOS los keypoints; el tamaño (w, h) y las
 * confianzas no cambian. No muta la detección de entrada.
 */
export function offsetDetection(det: Detection, dx: number, dy: number): Detection {
  const [x, y, w, h] = det.bbox;
  return {
    bbox: [x + dx, y + dy, w, h],
    confidence: det.confidence,
    keypoints: det.keypoints.map((kp) => ({
      x: kp.x + dx,
      y: kp.y + dy,
      confidence: kp.confidence,
    })),
  };
}

// ─── IoU + NMS global ────────────────────────────────────────────────────────

/**
 * IoU de dos cajas en formato `[x, y, w, h]` (x,y = esquina superior-izquierda).
 * Implementación ÚNICA de IoU sobre cajas xywh en el pipeline de tracking
 * (invariante #7: un concepto, una implementación) — el worker la importa en
 * lugar de duplicarla.
 */
export function iouXYWH(
  a: readonly [number, number, number, number],
  b: readonly [number, number, number, number],
): number {
  const ax2 = a[0] + a[2], ay2 = a[1] + a[3];
  const bx2 = b[0] + b[2], by2 = b[1] + b[3];
  const ix = Math.max(0, Math.min(ax2, bx2) - Math.max(a[0], b[0]));
  const iy = Math.max(0, Math.min(ay2, by2) - Math.max(a[1], b[1]));
  const inter = ix * iy;
  if (!inter) return 0;
  return inter / (a[2] * a[3] + b[2] * b[3] - inter);
}

/**
 * Non-Maximum Suppression GLOBAL sobre detecciones ya mapeadas a coordenadas del
 * frame completo. Deduplica el mismo jugador detectado en dos tiles solapados:
 * ordena por confianza descendente y descarta las cajas con IoU > `iouThresh`
 * respecto a una ya conservada. Devuelve las supervivientes en orden de confianza
 * (no muta la entrada).
 */
export function globalNms(dets: Detection[], iouThresh: number): Detection[] {
  const order = dets
    .map((d, i) => ({ i, s: d.confidence }))
    .sort((a, b) => b.s - a.s)
    .map((o) => o.i);

  const keep: Detection[] = [];
  const suppressed = new Set<number>();

  for (const i of order) {
    if (suppressed.has(i)) continue;
    keep.push(dets[i]);
    for (const j of order) {
      if (i === j || suppressed.has(j)) continue;
      if (iouXYWH(dets[i].bbox, dets[j].bbox) > iouThresh) suppressed.add(j);
    }
  }
  return keep;
}

// ─── Opt-in del tiling (override por localStorage) ───────────────────────────

const STORAGE_KEY = "vitas_tiling";

/**
 * Valida un objeto arbitrario como `TilingConfig`. Devuelve `null` si no es una
 * malla útil (grid < 2 ⇒ equivale a un solo paso: no tiene sentido activarlo).
 */
export function parseTilingConfig(raw: unknown): TilingConfig | null {
  if (!raw || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;
  const grid = Math.floor(Number(obj.grid));
  if (!Number.isFinite(grid) || grid < 2) return null;
  const overlap = clampOverlap(Number(obj.overlap ?? 0.15));
  return { grid: Math.min(grid, 6), overlap };
}

/**
 * Config de tiling ACTIVA para el pipeline. Por defecto `null` (tracking en vivo
 * plano, sin regresión de latencia). Solo se activa con un override consciente en
 * localStorage `vitas_tiling` — pensado para la ruta de análisis DIFERIDO, donde
 * la latencia no importa y el recall pleno sí. Idéntico patrón a `vitas_active_model`
 * y `vitas_ball_config`.
 *
 *   localStorage.setItem('vitas_tiling', JSON.stringify({ grid: 3, overlap: 0.15 }))
 */
export function getTilingConfig(): TilingConfig | null {
  if (typeof localStorage === "undefined") return null;
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return null;
    return parseTilingConfig(JSON.parse(stored));
  } catch {
    return null;
  }
}
