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

/**
 * Dadas 4 correspondencias pixel↔campo, calcula la matriz H 3×3.
 * Devuelve un Float64Array de 9 elementos (fila mayor).
 */
export function computeHomography(anchors: CalibrationAnchor[]): Float64Array {
  if (anchors.length < 4) {
    throw new Error("Se necesitan al menos 4 puntos de calibración");
  }

  // Construir sistema Ax=0 (8 ecuaciones, 8 incógnitas)
  const A: number[][] = [];

  for (const { pixel, field } of anchors.slice(0, 4)) {
    const { px: u, py: v } = pixel;
    const { fx: X, fy: Y } = field;

    A.push([-X, -Y, -1,  0,  0,  0, u*X, u*Y, u]);
    A.push([ 0,  0,  0, -X, -Y, -1, v*X, v*Y, v]);
  }

  // SVD simplificada: resolver via eliminación gaussiana con normalización
  // Para 4 puntos exactos, el sistema tiene solución única
  const h = solveLinear8x9(A);

  return new Float64Array(h);
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
