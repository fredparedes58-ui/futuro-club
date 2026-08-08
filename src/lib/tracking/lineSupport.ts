/**
 * VITAS · Soporte de líneas (T2) — el discriminador REAL de calibración.
 *
 * Una calibración es correcta sii las LÍNEAS del campo reproyectadas por la
 * homografía caen sobre líneas reales del césped (blanco/amarillo SOBRE verde).
 * Prototipado y validado en vision-pipeline/line_support.py sobre frames reales:
 * mata el falso positivo (campo flotando / detrás de portería) que el gate
 * geométrico dejaba pasar.
 *
 * Este módulo es GEOMETRÍA PURA (testeable sin navegador): reproyecta las líneas
 * del formato y cuenta qué fracción cae sobre píxeles de línea rodeados de césped.
 * Las máscaras (lineMask = estructuras finas brillantes; greenMask = césped) las
 * calcula el worker desde el frame (top-hat + HSV) y se pasan aquí. Así el
 * discriminador se prueba con máscaras sintéticas.
 */

export interface PitchGeom {
  L: number; W: number;
  pbDepth: number; pbHalf: number;
  gbDepth: number; gbHalf: number;
  circleR: number;
}

/** Geometría de líneas por formato (m). F11 FIFA · F8 FFCV. */
export const PITCH_GEOM: Record<"f11" | "f8", PitchGeom> = {
  f11: { L: 105, W: 68, pbDepth: 16.5, pbHalf: 20.16, gbDepth: 5.5, gbHalf: 9.16, circleR: 9.15 },
  f8: { L: 60, W: 40, pbDepth: 9, pbHalf: 12, gbDepth: 3, gbHalf: 4, circleR: 6 },
};

/**
 * Polilíneas del campo (coords de campo en metros) para un formato.
 *
 * `dims` SOBREESCRIBE el largo/ancho nominal (PITCH_GEOM) — necesario porque el
 * campo F8 real suele ser una SUBDIVISIÓN de F11 (borde blanco de medio F11,
 * ~52.5×68), NO el nominal FFCV 60×40. Las áreas/círculo (pintado amarillo F8) son
 * estándar y NO escalan con el borde. El caller (worker/T3) DEBE pasar las MISMAS
 * dimensiones con las que construyó la plantilla → si no, las líneas se reproyectan
 * fuera del campo y un high/medium válido se degradaría por error (falso negativo).
 * Por defecto usa el nominal (backward-compatible).
 */
export function pitchPolylines(
  format: "f11" | "f8",
  dims?: { L?: number; W?: number },
): Array<Array<[number, number]>> {
  const base = PITCH_GEOM[format];
  const g: PitchGeom = { ...base, L: dims?.L ?? base.L, W: dims?.W ?? base.W };
  const { L, W } = g;
  const cy = W / 2;
  const polys: Array<Array<[number, number]>> = [
    [[0, 0], [L, 0], [L, W], [0, W], [0, 0]],       // perímetro
    [[L / 2, 0], [L / 2, W]],                         // línea media
    [[0, cy - g.pbHalf], [g.pbDepth, cy - g.pbHalf], [g.pbDepth, cy + g.pbHalf], [0, cy + g.pbHalf]], // área grande izq
    [[0, cy - g.gbHalf], [g.gbDepth, cy - g.gbHalf], [g.gbDepth, cy + g.gbHalf], [0, cy + g.gbHalf]], // área pequeña izq
    [[L, cy - g.pbHalf], [L - g.pbDepth, cy - g.pbHalf], [L - g.pbDepth, cy + g.pbHalf], [L, cy + g.pbHalf]], // área grande der
    [[L, cy - g.gbHalf], [L - g.gbDepth, cy - g.gbHalf], [L - g.gbDepth, cy + g.gbHalf], [L, cy + g.gbHalf]], // área pequeña der
  ];
  // Círculo central (muestreado)
  const circle: Array<[number, number]> = [];
  for (let i = 0; i <= 48; i++) {
    const t = (i / 48) * 2 * Math.PI;
    circle.push([L / 2 + g.circleR * Math.cos(t), cy + g.circleR * Math.sin(t)]);
  }
  polys.push(circle);
  return polys;
}

export interface LineSupportOptions {
  lineRadius?: number;   // ventana (px) para buscar píxel de línea
  greenRadius?: number;  // ventana (px) para exigir césped alrededor
  greenFrac?: number;    // fracción mínima de césped en la ventana
  minSamples?: number;   // muestras mínimas para dar un score fiable
}

export interface LineSupportResult {
  /** Fracción de puntos de línea reproyectados con soporte real (0..1). */
  support: number;
  /** Nº de puntos muestreados dentro del frame. */
  samples: number;
}

/** Proyecta un punto de campo→píxel con H (row-major), con guarda de w>0. */
function project(H: ArrayLike<number>, fx: number, fy: number): [number, number] | null {
  const w = H[6] * fx + H[7] * fy + H[8];
  if (w <= 1e-9) return null; // detrás de cámara / degenerado
  return [(H[0] * fx + H[1] * fy + H[2]) / w, (H[3] * fx + H[4] * fy + H[5]) / w];
}

function windowHit(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): boolean {
  const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r);
  const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r);
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (mask[y * w + x]) return true;
  return false;
}

function windowFrac(mask: Uint8Array, w: number, h: number, cx: number, cy: number, r: number): number {
  const x0 = Math.max(0, cx - r), x1 = Math.min(w - 1, cx + r);
  const y0 = Math.max(0, cy - r), y1 = Math.min(h - 1, cy + r);
  let hits = 0, tot = 0;
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { tot++; if (mask[y * w + x]) hits++; }
  return tot > 0 ? hits / tot : 0;
}

/**
 * Soporte de líneas para una homografía campo→píxel dada. `lineMask` = 1 en píxeles
 * de línea (blancos/finos), `greenMask` = 1 en césped. Ambas de tamaño w*h.
 * Un punto reproyectado "tiene soporte" si hay un píxel de línea cerca Y está
 * rodeado de césped (descarta el falso soporte de red/muro/gradas blancos).
 */
export function lineSupportScore(
  Hfield2pix: ArrayLike<number>,
  lineMask: Uint8Array,
  greenMask: Uint8Array,
  w: number,
  h: number,
  polylines: Array<Array<[number, number]>>,
  opts: LineSupportOptions = {},
): LineSupportResult {
  const lineR = opts.lineRadius ?? 4;
  const greenR = opts.greenRadius ?? 14;
  const greenMin = opts.greenFrac ?? 0.3;
  const minSamples = opts.minSamples ?? 25;

  let total = 0, hits = 0;
  for (const poly of polylines) {
    for (let i = 1; i < poly.length; i++) {
      const a = project(Hfield2pix, poly[i - 1][0], poly[i - 1][1]);
      const b = project(Hfield2pix, poly[i][0], poly[i][1]);
      if (!a || !b) continue;
      const seglen = Math.hypot(b[0] - a[0], b[1] - a[1]);
      const n = Math.max(2, Math.floor(seglen / 4));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const x = Math.round(a[0] + (b[0] - a[0]) * t);
        const y = Math.round(a[1] + (b[1] - a[1]) * t);
        if (x < 0 || x >= w || y < 0 || y >= h) continue;
        total++;
        if (windowHit(lineMask, w, h, x, y, lineR) && windowFrac(greenMask, w, h, x, y, greenR) >= greenMin) {
          hits++;
        }
      }
    }
  }
  return { support: total > minSamples ? hits / total : 0, samples: total };
}
