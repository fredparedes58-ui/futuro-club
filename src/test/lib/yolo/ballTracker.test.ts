/**
 * Regresión de F1 (fallo silencioso): BallTracker llamaba pixelToField con los
 * argumentos en orden equivocado (pos.x, pos.y, H) en vez de (H, px, py) → lanzaba
 * dentro del try/catch → fieldPos del balón SIEMPRE null → posesión/eventos de balón
 * nunca se emitían. Este test fija que, con una homografía válida, fieldPos se calcula.
 */

import { describe, it, expect } from "vitest";
import { BallTracker } from "@/lib/yolo/ballTracker";
import type { BallDetection } from "@/lib/yolo/ballDetector";
import { computeHomography, invertMatrix3x3 } from "@/lib/yolo/homography";

// Homografía píxel→campo (invirtiendo una campo→píxel conocida, cámara F11).
const anchors = [
  { pixel: { px: 300, py: 200 }, field: { fx: 0, fy: 0 } },
  { pixel: { px: 980, py: 200 }, field: { fx: 105, fy: 0 } },
  { pixel: { px: 1150, py: 620 }, field: { fx: 105, fy: 68 } },
  { pixel: { px: 130, py: 620 }, field: { fx: 0, fy: 68 } },
];
const Hpix2field = invertMatrix3x3(computeHomography(anchors));

function ballAt(x: number, y: number): BallDetection {
  return { bbox: [x - 8, y - 8, 16, 16], confidence: 0.9, center: { x, y }, source: "model" };
}

describe("BallTracker — fieldPos con homografía válida (regresión F1)", () => {
  it("calcula fieldPos (no null) para un balón dentro del campo", () => {
    const tracker = new BallTracker();
    // Balón cerca del centro de la imagen → cae dentro del campo en metros.
    const track = tracker.update(ballAt(640, 400), Hpix2field, 1000);
    expect(track.fieldPos).not.toBeNull();
    expect(track.fieldPos!.fx).toBeGreaterThan(0);
    expect(track.fieldPos!.fx).toBeLessThan(105);
    expect(track.fieldPos!.fy).toBeGreaterThan(0);
    expect(track.fieldPos!.fy).toBeLessThan(68);
  });

  it("con homografía IDENTIDAD (sin calibrar) → fieldPos null (no cuela píxeles como metros)", () => {
    const tracker = new BallTracker();
    const identity = new Float64Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    // pixelToField(identity, 640, 400) = (640, 400) → fuera de [-5,110]×[-5,73] → rechazado.
    const track = tracker.update(ballAt(640, 400), identity, 1000);
    expect(track.fieldPos).toBeNull();
  });
});
