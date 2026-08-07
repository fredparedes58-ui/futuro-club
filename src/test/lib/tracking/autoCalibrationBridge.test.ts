/**
 * Test del fix format-aware de la auto-calibración: las mismas esquinas en píxeles
 * deben producir METROS distintos según el formato (F8 60×40 vs F11 105×68). Antes,
 * un partido F8 se medía contra 105×68 → distancias/velocidades infladas ~1.75×.
 */
import { describe, it, expect } from "vitest";
import { computeHomographyFromCorners } from "@/lib/tracking/autoCalibrationBridge";
import { pixelToField } from "@/lib/yolo/homography";

// Esquinas de frame completo (TL, TR, BR, BL) en %, vídeo 1000×1000.
const CORNERS = [
  { x: 0, y: 0 },
  { x: 100, y: 0 },
  { x: 100, y: 100 },
  { x: 0, y: 100 },
];
const W = 1000, H = 1000;

describe("auto-calibración format-aware (computeHomographyFromCorners)", () => {
  it("el píxel central mapea al centro del campo del FORMATO (60×40 vs 105×68)", () => {
    const f11 = computeHomographyFromCorners(CORNERS, W, H, { length: 105, width: 68 });
    const f8 = computeHomographyFromCorners(CORNERS, W, H, { length: 60, width: 40 });

    const c11 = pixelToField(f11.Hinv, 500, 500);
    const c8 = pixelToField(f8.Hinv, 500, 500);

    expect(c11.fx).toBeCloseTo(52.5, 1);
    expect(c11.fy).toBeCloseTo(34, 1);
    expect(c8.fx).toBeCloseTo(30, 1);
    expect(c8.fy).toBeCloseTo(20, 1);
  });

  it("la esquina superior-derecha mapea a (L,0) del formato", () => {
    const f8 = computeHomographyFromCorners(CORNERS, W, H, { length: 60, width: 40 });
    const tr = pixelToField(f8.Hinv, 1000, 0);
    expect(tr.fx).toBeCloseTo(60, 0);
    expect(tr.fy).toBeCloseTo(0, 0);
  });

  it("la MISMA distancia en píxeles da menos metros en F8 que en F11 (ratio ~1.75×)", () => {
    const f11 = computeHomographyFromCorners(CORNERS, W, H, { length: 105, width: 68 });
    const f8 = computeHomographyFromCorners(CORNERS, W, H, { length: 60, width: 40 });
    // 100 px horizontales por el centro.
    const d11 = pixelToField(f11.Hinv, 600, 500).fx - pixelToField(f11.Hinv, 500, 500).fx;
    const d8 = pixelToField(f8.Hinv, 600, 500).fx - pixelToField(f8.Hinv, 500, 500).fx;
    expect(d11 / d8).toBeCloseTo(105 / 60, 1); // ~1.75
  });
});
