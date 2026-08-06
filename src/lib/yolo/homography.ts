/**
 * VITAS · Homografía — Transformación Píxeles ↔ Campo Real
 *
 * Calcula la matriz de homografía H (3×3) a partir de 4 puntos de calibración.
 * Usa DLT (Direct Linear Transform) — exacto para 4 puntos coplanares.
 *
 * Campo FIFA estándar: 105m × 68m
 */

import type { PixelPoint, FieldPoint, CalibrationAnchor } from "./types";

// ─── Tipos internos ───────────────────────────────────────────────────────────

type Matrix3 = [
  number, number, number,
  number, number, number,
  number, number, number
];

// ─── DLT: calcular homografía desde 4 correspondencias ───────────────────────

// ─── Normalización de Hartley (condiciona el DLT) ────────────────────────────
// Un DLT sin normalizar a escala de píxel (u*X ~ 1e5 junto a 1) es numéricamente
// inestable: el error de reproyección queda en varios px aunque los datos sean
// exactos. Normalizar (centroide→0, distancia media→√2) antes de resolver, y
// desnormalizar después, hace el sistema bien condicionado (error ~0 en datos
// exactos). Mejora tanto la calibración manual como el RANSAC automático.

function multiply3x3(A: Float64Array, B: Float64Array): Float64Array {
  const C = new Float64Array(9);
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      let s = 0;
      for (let k = 0; k < 3; k++) s += A[r * 3 + k] * B[k * 3 + c];
      C[r * 3 + c] = s;
    }
  }
  return C;
}

function normalizingTransform(
  pts: Array<{ x: number; y: number }>,
): { T: Float64Array; norm: Array<{ x: number; y: number }> } {
  const n = pts.length;
  let cx = 0, cy = 0;
  for (const p of pts) { cx += p.x; cy += p.y; }
  cx /= n; cy /= n;
  let meanDist = 0;
  for (const p of pts) meanDist += Math.hypot(p.x - cx, p.y - cy);
  meanDist /= n;
  const s = meanDist > 1e-9 ? Math.SQRT2 / meanDist : 1;
  const T = new Float64Array([s, 0, -s * cx, 0, s, -s * cy, 0, 0, 1]);
  const norm = pts.map((p) => ({ x: s * (p.x - cx), y: s * (p.y - cy) }));
  return { T, norm };
}

/**
 * Dadas 4 correspondencias pixel↔campo, calcula la matriz H 3×3 (pixel→campo).
 * Devuelve un Float64Array de 9 elementos (fila mayor). DLT con normalización
 * de Hartley para estabilidad numérica.
 */
export function computeHomography(anchors: CalibrationAnchor[]): Float64Array {
  if (anchors.length < 4) {
    throw new Error("Se necesitan al menos 4 puntos de calibración");
  }

  const quad = anchors.slice(0, 4);
  const pix = quad.map((a) => ({ x: a.pixel.px, y: a.pixel.py }));
  const fld = quad.map((a) => ({ x: a.field.fx, y: a.field.fy }));

  const { T, norm: pn } = normalizingTransform(pix); // normaliza píxeles
  const { T: U, norm: fn } = normalizingTransform(fld); // normaliza campo

  // Construir sistema Ax=0 (8 ecuaciones, 8 incógnitas) sobre coords normalizadas
  const A: number[][] = [];
  for (let i = 0; i < 4; i++) {
    const u = pn[i].x, v = pn[i].y;
    const X = fn[i].x, Y = fn[i].y;
    A.push([-X, -Y, -1,  0,  0,  0, u * X, u * Y, u]);
    A.push([ 0,  0,  0, -X, -Y, -1, v * X, v * Y, v]);
  }

  // H mapea campo→píxel (fuente=campo, destino=píxel; ver A arriba). H' está en
  // coords normalizadas: pixel'=T·pixel, campo'=U·campo → H = T⁻¹ · H' · U.
  const Hnorm = new Float64Array(solveLinear8x9(A));
  const Tinv = invertMatrix3x3(T);
  return multiply3x3(multiply3x3(Tinv, Hnorm), U);
}

/**
 * Transformar un punto de píxeles a coordenadas de campo (metros).
 */
export function pixelToField(H: Float64Array, px: number, py: number): FieldPoint {
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = H;
  const w = h6 * px + h7 * py + h8;
  return {
    fx: (h0 * px + h1 * py + h2) / w,
    fy: (h3 * px + h4 * py + h5) / w,
  };
}

/**
 * Transformar un punto de campo (metros) a píxeles (para renderizado en canvas).
 */
export function fieldToPixel(Hinv: Float64Array, fx: number, fy: number): PixelPoint {
  const [h0, h1, h2, h3, h4, h5, h6, h7, h8] = Hinv;
  const w = h6 * fx + h7 * fy + h8;
  return {
    px: (h0 * fx + h1 * fy + h2) / w,
    py: (h3 * fx + h4 * fy + h5) / w,
  };
}

/**
 * Invertir una matriz 3×3.
 */
export function invertMatrix3x3(H: Float64Array): Float64Array {
  const [a, b, c, d, e, f, g, h, i] = H;
  const det = a*(e*i - f*h) - b*(d*i - f*g) + c*(d*h - e*g);
  if (Math.abs(det) < 1e-10) throw new Error("Matriz singular, calibra de nuevo");
  const inv = 1 / det;
  return new Float64Array([
     (e*i - f*h)*inv, -(b*i - c*h)*inv,  (b*f - c*e)*inv,
    -(d*i - f*g)*inv,  (a*i - c*g)*inv, -(a*f - c*d)*inv,
     (d*h - e*g)*inv, -(a*h - b*g)*inv,  (a*e - b*d)*inv,
  ]);
}

/**
 * Construir CalibrationAnchors desde los puntos del LAB (0-100%) y un preset.
 */
export function buildAnchors(
  labPoints: Array<{ x: number; y: number }>,
  fieldCoords: Array<{ field: { fx: number; fy: number } }>,
  videoWidth: number,
  videoHeight: number
): CalibrationAnchor[] {
  return labPoints.map((p, i) => ({
    pixel: {
      px: (p.x / 100) * videoWidth,
      py: (p.y / 100) * videoHeight,
    },
    field: fieldCoords[i].field,
  }));
}

// ─── Solver lineal 8×9 (eliminación gaussiana) ───────────────────────────────

function solveLinear8x9(A: number[][]): number[] {
  // Construir matriz aumentada 8×9 y resolver Ax = 0 con h8 = 1
  // Reducir a sistema 8×8 al fijar h8 = 1

  const n = 8;
  const M: number[][] = A.map(row => row.slice(0, n)); // 8×8
  const b: number[]   = A.map(row => -row[n]);          // columna derecha (negado h8=1)

  // Eliminación gaussiana con pivoteo parcial
  const aug: number[][] = M.map((row, i) => [...row, b[i]]);

  for (let col = 0; col < n; col++) {
    // Buscar pivote máximo
    let maxRow = col;
    let maxVal = Math.abs(aug[col][col]);
    for (let row = col + 1; row < n; row++) {
      if (Math.abs(aug[row][col]) > maxVal) {
        maxVal = Math.abs(aug[row][col]);
        maxRow = row;
      }
    }
    [aug[col], aug[maxRow]] = [aug[maxRow], aug[col]];

    const pivot = aug[col][col];
    if (Math.abs(pivot) < 1e-12) continue;

    for (let row = col + 1; row < n; row++) {
      const factor = aug[row][col] / pivot;
      for (let k = col; k <= n; k++) {
        aug[row][k] -= factor * aug[col][k];
      }
    }
  }

  // Sustitución hacia atrás
  const x = new Array(n).fill(0);
  for (let row = n - 1; row >= 0; row--) {
    x[row] = aug[row][n];
    for (let col = row + 1; col < n; col++) {
      x[row] -= aug[row][col] * x[col];
    }
    x[row] /= aug[row][row];
  }

  return [...x, 1]; // añadir h8 = 1
}

// ─── RANSAC Homography (Sprint 5 — Auto Homography) ─────────────────────────

export interface RANSACResult {
  /** Best homography found */
  H: Float64Array;
  /** Number of inliers with the best model */
  inlierCount: number;
  /** Indices of inlier correspondences */
  inlierIndices: number[];
  /** Total iterations run */
  iterations: number;
}

/**
 * Compute homography using RANSAC for outlier rejection.
 *
 * Given N ≥ 4 correspondences (some potentially wrong), iteratively:
 *   1. Sample 4 random correspondences
 *   2. Compute homography from these 4
 *   3. Count inliers (reprojection error < threshold)
 *   4. Keep best model
 *
 * @param correspondences - pixel↔field point pairs
 * @param maxIterations - RANSAC iterations (default: 200)
 * @param reprojThreshold - Max reprojection error in pixels (default: 5.0)
 * @returns Best homography with inlier info, or null if failed
 */
export function computeHomographyRANSAC(
  correspondences: Array<{
    pixel: { x: number; y: number };
    field: { x: number; y: number };
  }>,
  maxIterations: number = 200,
  reprojThreshold: number = 5.0,
): RANSACResult | null {
  const n = correspondences.length;
  if (n < 4) return null;

  // If exactly 4, just compute directly
  if (n === 4) {
    try {
      const anchors = correspondences.map((c) => ({
        pixel: { px: c.pixel.x, py: c.pixel.y },
        field: { fx: c.field.x, fy: c.field.y },
      }));
      const H = computeHomography(anchors);
      return {
        H,
        inlierCount: 4,
        inlierIndices: [0, 1, 2, 3],
        iterations: 1,
      };
    } catch {
      return null;
    }
  }

  let bestH: Float64Array | null = null;
  let bestInlierCount = 0;
  let bestInlierIndices: number[] = [];

  for (let iter = 0; iter < maxIterations; iter++) {
    // 1. Sample 4 random correspondences (without replacement)
    const sampleIndices = randomSample4(n);

    try {
      // 2. Compute homography from sample
      const anchors = sampleIndices.map((i) => ({
        pixel: { px: correspondences[i].pixel.x, py: correspondences[i].pixel.y },
        field: { fx: correspondences[i].field.x, fy: correspondences[i].field.y },
      }));

      const H = computeHomography(anchors);

      // Quick degeneracy check
      let degenerate = false;
      for (let k = 0; k < 9; k++) {
        if (!isFinite(H[k])) { degenerate = true; break; }
      }
      if (degenerate) continue;

      const det = H[0] * (H[4] * H[8] - H[5] * H[7])
                - H[1] * (H[3] * H[8] - H[5] * H[6])
                + H[2] * (H[3] * H[7] - H[4] * H[6]);
      if (det <= 1e-10) continue;

      // 3. Count inliers. H mapea campo→píxel, así que la reproyección de una
      // correspondencia es fieldToPixel(H, campo) comparado con el píxel medido.
      // (La degeneración de H ya se filtró con el chequeo de determinante arriba.)
      const inlierIndices: number[] = [];

      for (let i = 0; i < n; i++) {
        const c = correspondences[i];
        // Reproject field → pixel and measure error
        const reproj = fieldToPixel(H, c.field.x, c.field.y);
        const dx = reproj.px - c.pixel.x;
        const dy = reproj.py - c.pixel.y;
        const err = Math.sqrt(dx * dx + dy * dy);

        if (err < reprojThreshold) {
          inlierIndices.push(i);
        }
      }

      // 4. Update best
      if (inlierIndices.length > bestInlierCount) {
        bestInlierCount = inlierIndices.length;
        bestInlierIndices = inlierIndices;
        bestH = H;

        // Early termination: all points are inliers
        if (bestInlierCount === n) break;
      }
    } catch {
      // Invalid sample → skip
      continue;
    }
  }

  if (!bestH || bestInlierCount < 4) return null;

  // Refine: recompute homography from a subset of inliers. Nuestro solver solo
  // toma 4, así que elegimos los 4 inliers MÁS SEPARADOS (evita subconjuntos casi
  // colineales que degeneran la H) y SOLO aceptamos el refinamiento si no reduce
  // los inliers (si no, mantenemos la mejor H del muestreo, que ya ajustaba bien).
  if (bestInlierCount > 4) {
    try {
      const spread = pickSpreadIndices(correspondences, bestInlierIndices, 4);
      const refinedAnchors = spread.map((i) => ({
        pixel: { px: correspondences[i].pixel.x, py: correspondences[i].pixel.y },
        field: { fx: correspondences[i].field.x, fy: correspondences[i].field.y },
      }));
      const refinedH = computeHomography(refinedAnchors);
      let refinedInliers = 0;
      for (const i of bestInlierIndices) {
        const c = correspondences[i];
        const rp = fieldToPixel(refinedH, c.field.x, c.field.y);
        if (Math.hypot(rp.px - c.pixel.x, rp.py - c.pixel.y) < reprojThreshold) {
          refinedInliers++;
        }
      }
      if (refinedInliers >= bestInlierCount) bestH = refinedH;
    } catch {
      // Keep original best if refinement fails
    }
  }

  return {
    H: bestH,
    inlierCount: bestInlierCount,
    inlierIndices: bestInlierIndices,
    iterations: maxIterations,
  };
}

/**
 * Elige `k` índices bien SEPARADOS en espacio de píxeles (farthest-point
 * sampling) entre los candidatos. Evita subconjuntos casi colineales/clusterados
 * que degeneran la homografía en el refinamiento.
 */
function pickSpreadIndices(
  correspondences: Array<{ pixel: { x: number; y: number } }>,
  candidates: number[],
  k: number,
): number[] {
  if (candidates.length <= k) return candidates.slice(0, k);
  // Semilla: el punto más a la izquierda.
  let start = candidates[0];
  for (const i of candidates) {
    if (correspondences[i].pixel.x < correspondences[start].pixel.x) start = i;
  }
  const picked: number[] = [start];
  while (picked.length < k) {
    let bestI = -1;
    let bestD = -1;
    for (const i of candidates) {
      if (picked.includes(i)) continue;
      let minD = Infinity;
      for (const p of picked) {
        const d = Math.hypot(
          correspondences[i].pixel.x - correspondences[p].pixel.x,
          correspondences[i].pixel.y - correspondences[p].pixel.y,
        );
        if (d < minD) minD = d;
      }
      if (minD > bestD) {
        bestD = minD;
        bestI = i;
      }
    }
    if (bestI < 0) break;
    picked.push(bestI);
  }
  return picked;
}

/** Sample 4 unique random indices from [0, n) */
function randomSample4(n: number): [number, number, number, number] {
  const indices = new Set<number>();
  while (indices.size < 4) {
    indices.add(Math.floor(Math.random() * n));
  }
  return [...indices] as [number, number, number, number];
}

// ─── Utilidad: calcular distancia en campo ───────────────────────────────────

export function fieldDistance(a: FieldPoint, b: FieldPoint): number {
  const dx = b.fx - a.fx;
  const dy = b.fy - a.fy;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── Matriz identidad (fallback sin calibración) ─────────────────────────────

export function identityHomography(): Float64Array {
  return new Float64Array([1,0,0, 0,1,0, 0,0,1]);
}
