/**
 * VITAS · Refinamiento no lineal de la homografía (Levenberg-Marquardt)
 *
 * El DLT solo usa 4 puntos y minimiza error ALGEBRAICO. Con 32 keypoints de campo
 * detectados, tirar 28 es desperdiciar señal. Aquí minimizamos el error GEOMÉTRICO
 * (reproyección en píxeles) sobre TODOS los inliers, que es lo que hace el estado
 * del arte de registro de campo (PnLCalib/No-Bells refinan por optimización).
 *
 * Modelo: H mapea CAMPO(m) → PÍXEL (misma convención que homography.ts).
 *   u = (h0·X + h1·Y + h2) / (h6·X + h7·Y + 1)
 *   v = (h3·X + h4·Y + h5) / (h6·X + h7·Y + 1)
 * Se optimizan 8 parámetros (h8 se fija a 1 escalando H; válido para homografías de
 * cámara reales, donde h8 ≠ 0).
 *
 * Robustez:
 *  - Pesos por confianza del keypoint: la incertidumbre de un keypoint escala como
 *    σ ≈ σ0/conf, luego el peso de máxima verosimilitud es 1/σ² ∝ conf².
 *  - Huber: acota la influencia de residuos grandes (outliers que pasaron RANSAC).
 *  - SALVAGUARDA: si el RMS no mejora, o aparecen no-finitos, se devuelve la H
 *    inicial intacta. El refinamiento nunca puede empeorar la calibración.
 *
 * Sin dependencias externas. No importa de homography.ts (evita ciclo: homography
 * importa de aquí).
 */

export interface RefineCorrespondence {
  /** Píxel observado (detección del modelo). */
  pixel: { x: number; y: number };
  /** Coordenada real del landmark en el campo, en metros. */
  field: { x: number; y: number };
  /** Confianza del keypoint 0..1 (opcional; default 1). */
  weight?: number;
}

export interface RefineOptions {
  maxIterations?: number;
  /** Amortiguación inicial de Marquardt. */
  initialLambda?: number;
  /** Umbral de Huber en px (null = sin Huber). Default: 8. */
  huberDeltaPx?: number | null;
  /** Exponente del peso por confianza (γ). Default 2 (∝ conf²). */
  weightExponent?: number;
}

export interface RefineResult {
  /** Homografía refinada campo→píxel (o la inicial si no se pudo mejorar). */
  H: Float64Array;
  /** RMS de reproyección (px) antes y después. */
  initialRmsPx: number;
  finalRmsPx: number;
  /** true si el refinamiento mejoró y se aplicó. */
  improved: boolean;
  iterations: number;
}

const DEFAULTS = {
  maxIterations: 40,
  initialLambda: 1e-3,
  huberDeltaPx: 8 as number | null,
  weightExponent: 2,
};

/** Escala H para que h8 = 1. Devuelve null si h8 ≈ 0 (homografía degenerada). */
function normalizeScale(H: Float64Array): Float64Array | null {
  const h8 = H[8];
  if (!isFinite(h8) || Math.abs(h8) < 1e-12) return null;
  const out = new Float64Array(9);
  for (let i = 0; i < 9; i++) out[i] = H[i] / h8;
  return out;
}

/** Peso robusto de Huber para un residuo de magnitud r (px). */
function huberWeight(r: number, delta: number | null): number {
  if (delta === null || r <= delta) return 1;
  return delta / r;
}

/**
 * RMS ponderado del error de reproyección (campo→píxel) de una H dada.
 * Exportado para poder medir calidad sin refinar.
 */
export function reprojectionRms(
  H: Float64Array,
  cs: RefineCorrespondence[],
): number {
  if (cs.length === 0) return Infinity;
  let sum = 0;
  for (const c of cs) {
    const w = H[6] * c.field.x + H[7] * c.field.y + H[8];
    if (!isFinite(w) || Math.abs(w) < 1e-12) return Infinity;
    const du = (H[0] * c.field.x + H[1] * c.field.y + H[2]) / w - c.pixel.x;
    const dv = (H[3] * c.field.x + H[4] * c.field.y + H[5]) / w - c.pixel.y;
    sum += du * du + dv * dv;
  }
  return Math.sqrt(sum / cs.length);
}

/** Resuelve A·x = b (n×n, simétrica definida positiva) por eliminación gaussiana. */
function solveDense(A: number[][], b: number[], n: number): number[] | null {
  const M: number[][] = A.map((row, i) => [...row, b[i]]);
  for (let col = 0; col < n; col++) {
    let piv = col;
    let best = Math.abs(M[col][col]);
    for (let r = col + 1; r < n; r++) {
      const v = Math.abs(M[r][col]);
      if (v > best) { best = v; piv = r; }
    }
    if (best < 1e-14) return null;
    [M[col], M[piv]] = [M[piv], M[col]];
    const p = M[col][col];
    for (let r = col + 1; r < n; r++) {
      const f = M[r][col] / p;
      if (f === 0) continue;
      for (let k = col; k <= n; k++) M[r][k] -= f * M[col][k];
    }
  }
  const x = new Array<number>(n).fill(0);
  for (let r = n - 1; r >= 0; r--) {
    let s = M[r][n];
    for (let c = r + 1; c < n; c++) s -= M[r][c] * x[c];
    x[r] = s / M[r][r];
  }
  return x.every((v) => isFinite(v)) ? x : null;
}

/** Coste ponderado (robusto) de un vector de parámetros h (8). */
function cost(
  h: number[],
  cs: RefineCorrespondence[],
  wConf: number[],
  huber: number | null,
): number {
  let total = 0;
  for (let i = 0; i < cs.length; i++) {
    const { field: F, pixel: P } = cs[i];
    const w = h[6] * F.x + h[7] * F.y + 1;
    if (!isFinite(w) || Math.abs(w) < 1e-12) return Infinity;
    const du = (h[0] * F.x + h[1] * F.y + h[2]) / w - P.x;
    const dv = (h[3] * F.x + h[4] * F.y + h[5]) / w - P.y;
    const r = Math.hypot(du, dv);
    total += wConf[i] * huberWeight(r, huber) * (du * du + dv * dv);
  }
  return total;
}

/**
 * Refina H minimizando el error de reproyección sobre TODAS las correspondencias.
 * Nunca empeora: si no mejora el RMS, devuelve la H inicial.
 */
export function refineHomographyLM(
  H0: Float64Array,
  correspondences: RefineCorrespondence[],
  options: RefineOptions = {},
): RefineResult {
  const opts = { ...DEFAULTS, ...options };
  const cs = correspondences;
  const initialRmsPx = reprojectionRms(H0, cs);
  const fail: RefineResult = {
    H: H0,
    initialRmsPx,
    finalRmsPx: initialRmsPx,
    improved: false,
    iterations: 0,
  };

  // Necesitamos al menos 4 puntos (8 ecuaciones para 8 incógnitas).
  if (cs.length < 4) return fail;
  const scaled = normalizeScale(H0);
  if (!scaled) return fail;

  // Pesos por confianza del keypoint: ∝ conf^γ
  const wConf = cs.map((c) => {
    const conf = Math.min(1, Math.max(0.05, c.weight ?? 1));
    return Math.pow(conf, opts.weightExponent);
  });

  let h = Array.from(scaled.slice(0, 8));
  let lambda = opts.initialLambda;
  let currentCost = cost(h, cs, wConf, opts.huberDeltaPx);
  if (!isFinite(currentCost)) return fail;

  let iterations = 0;
  for (let it = 0; it < opts.maxIterations; it++) {
    iterations++;

    // Acumular JᵀWJ (8×8) y JᵀWr (8)
    const JtJ: number[][] = Array.from({ length: 8 }, () => new Array(8).fill(0));
    const Jtr: number[] = new Array(8).fill(0);

    for (let i = 0; i < cs.length; i++) {
      const { field: F, pixel: P } = cs[i];
      const X = F.x, Y = F.y;
      const w = h[6] * X + h[7] * Y + 1;
      if (!isFinite(w) || Math.abs(w) < 1e-12) return fail;
      const iw = 1 / w;
      const u = (h[0] * X + h[1] * Y + h[2]) * iw;
      const v = (h[3] * X + h[4] * Y + h[5]) * iw;
      const ru = u - P.x;
      const rv = v - P.y;
      const wi = wConf[i] * huberWeight(Math.hypot(ru, rv), opts.huberDeltaPx);

      // Filas del jacobiano (∂u/∂h y ∂v/∂h)
      const Ju = [X * iw, Y * iw, iw, 0, 0, 0, -u * X * iw, -u * Y * iw];
      const Jv = [0, 0, 0, X * iw, Y * iw, iw, -v * X * iw, -v * Y * iw];

      for (let a = 0; a < 8; a++) {
        Jtr[a] += wi * (Ju[a] * ru + Jv[a] * rv);
        for (let b = a; b < 8; b++) {
          JtJ[a][b] += wi * (Ju[a] * Ju[b] + Jv[a] * Jv[b]);
        }
      }
    }
    // Simetrizar
    for (let a = 0; a < 8; a++) for (let b = 0; b < a; b++) JtJ[a][b] = JtJ[b][a];

    // Paso LM con amortiguación escalada por la diagonal (Marquardt)
    let stepped = false;
    for (let tries = 0; tries < 8; tries++) {
      const A = JtJ.map((row, a) =>
        row.map((val, b) => (a === b ? val * (1 + lambda) + 1e-12 : val)),
      );
      const delta = solveDense(A, Jtr.map((g) => -g), 8);
      if (delta) {
        const cand = h.map((v, i) => v + delta[i]);
        const candCost = cost(cand, cs, wConf, opts.huberDeltaPx);
        if (isFinite(candCost) && candCost < currentCost) {
          const rel = (currentCost - candCost) / Math.max(currentCost, 1e-30);
          h = cand;
          currentCost = candCost;
          lambda = Math.max(lambda * 0.3, 1e-12);
          stepped = true;
          if (rel < 1e-10) tries = 99; // convergido
          break;
        }
      }
      lambda *= 10; // rechazado → más amortiguación (más cerca de gradiente)
      if (lambda > 1e12) break;
    }
    if (!stepped) break;
  }

  const Hout = new Float64Array([...h, 1]);
  if (!Hout.every((v) => isFinite(v))) return fail;

  const finalRmsPx = reprojectionRms(Hout, cs);
  // Salvaguarda dura: solo aceptamos si mejora de verdad.
  if (!isFinite(finalRmsPx) || finalRmsPx >= initialRmsPx) return fail;

  return { H: Hout, initialRmsPx, finalRmsPx, improved: true, iterations };
}
