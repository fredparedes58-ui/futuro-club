/**
 * Tests del refinamiento no lineal (Levenberg-Marquardt) de la homografía.
 * Campo sintético: proyectamos FIELD_TEMPLATE por una H conocida, añadimos ruido
 * determinista y comprobamos que LM reduce el error de reproyección respecto al
 * DLT de 4 puntos, y que NUNCA empeora ni produce no-finitos.
 */
import { describe, it, expect } from "vitest";
import { computeHomography, fieldToPixel } from "@/lib/yolo/homography";
import {
  refineHomographyLM,
  reprojectionRms,
  type RefineCorrespondence,
} from "@/lib/yolo/homographyRefine";
import { FIELD_TEMPLATE } from "@/lib/yolo/fieldRegistration";

// Cámara ficticia (misma convención que fieldRegistration.test.ts): campo→píxel.
const ANCHORS = [
  { pixel: { px: 300, py: 200 }, field: { fx: 0, fy: 0 } },
  { pixel: { px: 980, py: 200 }, field: { fx: 105, fy: 0 } },
  { pixel: { px: 1150, py: 620 }, field: { fx: 105, fy: 68 } },
  { pixel: { px: 130, py: 620 }, field: { fx: 0, fy: 68 } },
];
const H_TRUE = computeHomography(ANCHORS);

// LCG determinista (sin Math.random → cero flakiness).
function makeRng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 2 ** 32;
  };
}

function corrForAll(noisePx: number, seed: number): RefineCorrespondence[] {
  const rnd = makeRng(seed);
  return FIELD_TEMPLATE.map((l) => {
    const p = fieldToPixel(H_TRUE, l.field.fx, l.field.fy);
    return {
      pixel: {
        x: p.px + (rnd() - 0.5) * 2 * noisePx,
        y: p.py + (rnd() - 0.5) * 2 * noisePx,
      },
      field: { x: l.field.fx, y: l.field.fy },
      weight: 1,
    };
  });
}

describe("refineHomographyLM", () => {
  it("con datos exactos alcanza error ~0 y no rompe H_TRUE", () => {
    const cs = corrForAll(0, 1);
    const r = refineHomographyLM(H_TRUE, cs);
    expect(r.finalRmsPx).toBeLessThan(1e-6);
    expect([...r.H].every((v) => Number.isFinite(v))).toBe(true);
  });

  it("con ruido, reduce el RMS respecto a la H inicial", () => {
    const cs = corrForAll(2.5, 42);
    // H inicial "razonable pero imperfecta": DLT de 4 esquinas con ruido.
    const seed = computeHomography(
      [0, 5, 29, 24].map((i) => ({
        pixel: { px: cs[i].pixel.x, py: cs[i].pixel.y },
        field: { fx: cs[i].field.x, fy: cs[i].field.y },
      })),
    );
    const before = reprojectionRms(seed, cs);
    const r = refineHomographyLM(seed, cs);
    expect(r.improved).toBe(true);
    expect(r.finalRmsPx).toBeLessThanOrEqual(before);
    expect(r.finalRmsPx).toBeLessThan(r.initialRmsPx);
  });

  it("NUNCA empeora: si no puede mejorar, devuelve la H inicial intacta", () => {
    const cs = corrForAll(0, 7);
    const r = refineHomographyLM(H_TRUE, cs);
    // Con datos perfectos partiendo de la H perfecta, no hay margen → no degrada.
    expect(r.finalRmsPx).toBeLessThanOrEqual(r.initialRmsPx + 1e-9);
  });

  it("es robusto a entradas degeneradas (H con NaN → devuelve la inicial)", () => {
    const cs = corrForAll(1, 3);
    const bad = new Float64Array([NaN, 0, 0, 0, NaN, 0, 0, 0, 1]);
    const r = refineHomographyLM(bad, cs);
    expect(r.improved).toBe(false);
    expect(r.H).toBe(bad);
  });

  it("<4 correspondencias → no refina", () => {
    const cs = corrForAll(1, 9).slice(0, 3);
    const r = refineHomographyLM(H_TRUE, cs);
    expect(r.improved).toBe(false);
  });

  it("los pesos por confianza mejoran la robustez frente a outliers", () => {
    const clean = corrForAll(1, 11);
    // Corromper 6 puntos con 12px de error, weight bajo.
    const withOutliers = clean.map((c, i) =>
      [2, 7, 13, 18, 24, 29].includes(i)
        ? { ...c, pixel: { x: c.pixel.x + 12, y: c.pixel.y - 12 }, weight: 0.2 }
        : { ...c, weight: 1 },
    );
    const seed = computeHomography(
      [0, 5, 29, 24].map((i) => ({
        pixel: { px: withOutliers[i].pixel.x, py: withOutliers[i].pixel.y },
        field: { fx: withOutliers[i].field.x, fy: withOutliers[i].field.y },
      })),
    );
    const weighted = refineHomographyLM(seed, withOutliers, { huberDeltaPx: 6 });
    // El error contra los puntos LIMPIOS debe bajar respecto a la semilla.
    const cleanOnly = clean.filter((_, i) => ![2, 7, 13, 18, 24, 29].includes(i));
    expect(reprojectionRms(weighted.H, cleanOnly)).toBeLessThan(
      reprojectionRms(seed, cleanOnly),
    );
  });
});
