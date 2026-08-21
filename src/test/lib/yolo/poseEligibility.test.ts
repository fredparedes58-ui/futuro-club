import { describe, it, expect } from "vitest";
import {
  isPoseEligible,
  partitionByPoseEligibility,
  poseCoverageMetric,
} from "@/lib/yolo/poseEligibility";
import type { Detection } from "@/lib/yolo/types";

function det(height: number, x = 0): Detection {
  return { bbox: [x, 0, height / 2, height], confidence: 0.8, keypoints: [] };
}

describe("isPoseEligible", () => {
  it("es elegible si la altura de caja ≥ umbral (borde inclusivo)", () => {
    expect(isPoseEligible(det(96), 96)).toBe(true);
    expect(isPoseEligible(det(95), 96)).toBe(false);
    expect(isPoseEligible(det(200), 96)).toBe(true);
  });
});

describe("partitionByPoseEligibility", () => {
  it("separa cercanas (grandes) de lejanas (pequeñas) sin mutar la entrada", () => {
    const dets = [det(200, 1), det(40, 2), det(120, 3), det(20, 4)];
    const { poseEligible, positionOnly } = partitionByPoseEligibility(dets, 96);
    expect(poseEligible.map((d) => d.bbox[0])).toEqual([1, 3]);
    expect(positionOnly.map((d) => d.bbox[0])).toEqual([2, 4]);
    // no muta
    expect(dets).toHaveLength(4);
  });

  it("frame sin detecciones → dos listas vacías", () => {
    const { poseEligible, positionOnly } = partitionByPoseEligibility([], 96);
    expect(poseEligible).toEqual([]);
    expect(positionOnly).toEqual([]);
  });
});

describe("poseCoverageMetric", () => {
  it("sin detecciones → BLOQUEADA (value null + gate_reason), nunca un 0", () => {
    const m = poseCoverageMetric(0, 0);
    expect(m.value).toBeNull();
    expect(m.gate_reason).toBeTruthy();
    expect(m.provenance).toBe("DERIVADA");
  });

  it("con detecciones → fracción DERIVADA orientativa (no calibrada)", () => {
    const m = poseCoverageMetric(3, 12);
    expect(m.value).toBeCloseTo(0.25, 6);
    expect(m.provenance).toBe("DERIVADA");
    expect(m.calibrated).toBe(false);
    expect(m.confidence).toBeGreaterThan(0);
    expect(m.confidence).toBeLessThanOrEqual(1);
  });

  it("cobertura plena = 1", () => {
    expect(poseCoverageMetric(8, 8).value).toBe(1);
  });
});
