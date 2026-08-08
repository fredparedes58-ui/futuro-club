import { describe, it, expect } from "vitest";
import { detectCameraMotion, type MotionLandmark } from "@/lib/tracking/cameraMotion";

// 8 landmarks estáticos del campo (px), todos fiables.
const base: MotionLandmark[] = [
  { id: 0, px: 100, py: 100, confidence: 1 },
  { id: 1, px: 300, py: 110, confidence: 1 },
  { id: 2, px: 500, py: 120, confidence: 1 },
  { id: 3, px: 700, py: 130, confidence: 1 },
  { id: 4, px: 150, py: 400, confidence: 1 },
  { id: 5, px: 350, py: 410, confidence: 1 },
  { id: 6, px: 550, py: 420, confidence: 1 },
  { id: 7, px: 750, py: 430, confidence: 1 },
];
const shift = (dx: number, dy: number) => base.map((l) => ({ ...l, px: l.px + dx, py: l.py + dy }));
const jitter = () => base.map((l, i) => ({ ...l, px: l.px + (i % 2 ? 2 : -2), py: l.py + (i % 2 ? -1 : 1) }));
const zoom = (k: number) => base.map((l) => ({ ...l, px: 400 + (l.px - 400) * k, py: 265 + (l.py - 265) * k }));

describe("detectCameraMotion (T2)", () => {
  it("cámara fija (frames idénticos) → no movida", () => {
    const r = detectCameraMotion(base, base);
    expect(r.moved).toBe(false);
    expect(r.medianShiftPx).toBeCloseTo(0, 5);
    expect(r.decidable).toBe(true);
  });

  it("jitter de detección (±2px) → no movida", () => {
    const r = detectCameraMotion(base, jitter());
    expect(r.moved).toBe(false);
    expect(r.medianShiftPx).toBeLessThan(10);
  });

  it("paneo (+30px) → movida", () => {
    const r = detectCameraMotion(base, shift(30, 0));
    expect(r.moved).toBe(true);
    expect(r.medianShiftPx).toBeCloseTo(30, 0);
  });

  it("zoom (×1.1) → movida", () => {
    const r = detectCameraMotion(base, zoom(1.1));
    expect(r.moved).toBe(true);
  });

  it("pocos emparejamientos → no decidible (no afirma movimiento)", () => {
    const two = shift(50, 0).slice(0, 2);
    const r = detectCameraMotion(base, two);
    expect(r.decidable).toBe(false);
    expect(r.moved).toBe(false);
    expect(r.matched).toBe(2);
  });

  it("ignora landmarks de baja confianza", () => {
    const lowConf = shift(40, 0).map((l) => ({ ...l, confidence: 0.2 }));
    const r = detectCameraMotion(base, lowConf);
    expect(r.matched).toBe(0);
    expect(r.decidable).toBe(false);
  });
});
