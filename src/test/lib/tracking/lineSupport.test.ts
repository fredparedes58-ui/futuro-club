/**
 * Test del discriminador de calibración (T2): el soporte de líneas debe ser ALTO
 * cuando la homografía reproyecta las líneas sobre líneas reales rodeadas de césped,
 * y BAJO cuando la homografía está desplazada (falsa) o cuando no hay césped
 * alrededor (falso soporte de red/muro/gradas blancos).
 */
import { describe, it, expect } from "vitest";
import { lineSupportScore, pitchPolylines } from "@/lib/tracking/lineSupport";

const W = 200, H = 200;
// Homografía AFÍN correcta: campo F8 (60×40) → imagen (10..190). Row-major.
//   x = 3*fx + 10 ; y = 4.5*fy + 10
const H_OK = new Float64Array([3, 0, 10, 0, 4.5, 10, 0, 0, 1]);
// Homografía FALSA: misma escala, desplazada 40 px → las líneas caen fuera de sitio.
const H_BAD = new Float64Array([3, 0, 50, 0, 4.5, 50, 0, 0, 1]);

const polys = pitchPolylines("f8");

/** Rasteriza las polilíneas del campo (vía H) en una máscara — simula líneas reales. */
function drawLines(Hm: Float64Array): Uint8Array {
  const mask = new Uint8Array(W * H);
  for (const poly of polys) {
    for (let i = 1; i < poly.length; i++) {
      const a = [Hm[0] * poly[i - 1][0] + Hm[1] * poly[i - 1][1] + Hm[2], Hm[3] * poly[i - 1][0] + Hm[4] * poly[i - 1][1] + Hm[5]];
      const b = [Hm[0] * poly[i][0] + Hm[1] * poly[i][1] + Hm[2], Hm[3] * poly[i][0] + Hm[4] * poly[i][1] + Hm[5]];
      const n = Math.max(2, Math.floor(Math.hypot(b[0] - a[0], b[1] - a[1])));
      for (let s = 0; s <= n; s++) {
        const t = s / n;
        const x = Math.round(a[0] + (b[0] - a[0]) * t);
        const y = Math.round(a[1] + (b[1] - a[1]) * t);
        if (x >= 0 && x < W && y >= 0 && y < H) mask[y * W + x] = 1;
      }
    }
  }
  return mask;
}

const allGreen = new Uint8Array(W * H).fill(1);
const noGreen = new Uint8Array(W * H); // 0 = sin césped (red/muro)
const correctLines = drawLines(H_OK);

describe("lineSupportScore (T2)", () => {
  it("H correcta sobre líneas reales + césped → soporte ALTO", () => {
    const r = lineSupportScore(H_OK, correctLines, allGreen, W, H, polys);
    expect(r.samples).toBeGreaterThan(25);
    expect(r.support).toBeGreaterThan(0.8);
  });

  it("H FALSA (desplazada) → soporte BAJO aunque haya líneas y césped", () => {
    const r = lineSupportScore(H_BAD, correctLines, allGreen, W, H, polys);
    expect(r.support).toBeLessThan(0.3);
  });

  it("sin césped alrededor (red/muro blancos) → soporte BAJO aunque la H sea correcta", () => {
    const r = lineSupportScore(H_OK, correctLines, noGreen, W, H, polys);
    expect(r.support).toBeLessThan(0.3);
  });

  it("pitchPolylines difiere por formato (F8 60×40 vs F11 105×68)", () => {
    const f8 = pitchPolylines("f8");
    const f11 = pitchPolylines("f11");
    expect(Math.max(...f8.flat().map((p) => p[0]))).toBe(60);
    expect(Math.max(...f11.flat().map((p) => p[0]))).toBe(105);
  });
});
