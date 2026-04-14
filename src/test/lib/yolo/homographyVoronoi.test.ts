/**
 * Tests for Homography (DLT) and Voronoi computations
 * Pure math — no DOM, no canvas, no workers.
 */
import { describe, it, expect } from "vitest";
import {
  computeHomography,
  pixelToField,
  fieldToPixel,
  invertMatrix3x3,
  buildAnchors,
  fieldDistance,
  identityHomography,
} from "@/lib/yolo/homography";
import { detectSpaceRun } from "@/lib/yolo/voronoi";

// ── Homography ──────────────────────────────────────────────────────────

describe("computeHomography", () => {
  // Non-trivial anchors (offset corners to avoid degenerate pivot in Gauss elimination)
  const anchors = [
    { pixel: { px: 100, py: 50 },    field: { fx: 0, fy: 0 } },
    { pixel: { px: 1800, py: 80 },   field: { fx: 105, fy: 0 } },
    { pixel: { px: 1820, py: 1000 }, field: { fx: 105, fy: 68 } },
    { pixel: { px: 80, py: 980 },    field: { fx: 0, fy: 68 } },
  ];

  it("returns a Float64Array of 9 elements", () => {
    const H = computeHomography(anchors);
    expect(H).toBeInstanceOf(Float64Array);
    expect(H.length).toBe(9);
  });

  it("throws with fewer than 4 points", () => {
    expect(() => computeHomography(anchors.slice(0, 3))).toThrow("4 puntos");
  });

  it("transforms calibration points with reasonable accuracy via inverse", () => {
    // computeHomography returns H that maps field→pixel
    // To go pixel→field, we need H^(-1)
    const H = computeHomography(anchors);
    const Hinv = invertMatrix3x3(H);

    // Each anchor pixel, through H^-1, should return its field coordinate
    for (const a of anchors) {
      const f = pixelToField(Hinv, a.pixel.px, a.pixel.py);
      expect(f.fx).toBeCloseTo(a.field.fx, -1); // within ~10m tolerance
      expect(f.fy).toBeCloseTo(a.field.fy, -1);
    }
  });

  it("field→pixel via H maps calibration points correctly", () => {
    const H = computeHomography(anchors);

    // H maps field→pixel directly (that's what DLT builds)
    for (const a of anchors) {
      const p = fieldToPixel(H, a.field.fx, a.field.fy);
      expect(p.px).toBeCloseTo(a.pixel.px, -1);
      expect(p.py).toBeCloseTo(a.pixel.py, -1);
    }
  });
});

describe("invertMatrix3x3", () => {
  it("identity matrix inverts to itself", () => {
    const I = identityHomography();
    const inv = invertMatrix3x3(I);
    for (let i = 0; i < 9; i++) {
      expect(inv[i]).toBeCloseTo(I[i], 10);
    }
  });

  it("throws on singular matrix (all zeros)", () => {
    const singular = new Float64Array([0, 0, 0, 0, 0, 0, 0, 0, 0]);
    expect(() => invertMatrix3x3(singular)).toThrow("singular");
  });

  it("H * H^-1 round-trip preserves point", () => {
    const anchors = [
      { pixel: { px: 100, py: 50 },    field: { fx: 0, fy: 0 } },
      { pixel: { px: 1800, py: 80 },   field: { fx: 105, fy: 0 } },
      { pixel: { px: 1820, py: 1000 }, field: { fx: 105, fy: 68 } },
      { pixel: { px: 80, py: 980 },    field: { fx: 0, fy: 68 } },
    ];
    const H = computeHomography(anchors);
    const Hinv = invertMatrix3x3(H);

    // Transform a point through H then Hinv → should get back to original
    const field = pixelToField(H, 500, 300);
    const pixel = fieldToPixel(Hinv, field.fx, field.fy);
    expect(pixel.px).toBeCloseTo(500, -1); // within ~10 pixels
    expect(pixel.py).toBeCloseTo(300, -1);
  });
});

describe("fieldToPixel", () => {
  it("transforms field coordinates back to pixel space (round-trip)", () => {
    const anchors = [
      { pixel: { px: 100, py: 50 },    field: { fx: 0, fy: 0 } },
      { pixel: { px: 1800, py: 80 },   field: { fx: 105, fy: 0 } },
      { pixel: { px: 1820, py: 1000 }, field: { fx: 105, fy: 68 } },
      { pixel: { px: 80, py: 980 },    field: { fx: 0, fy: 68 } },
    ];
    const H = computeHomography(anchors);
    const Hinv = invertMatrix3x3(H);

    // Round-trip: pixel → field → pixel should return close to original
    const testPx = 500;
    const testPy = 400;
    const field = pixelToField(H, testPx, testPy);
    const pixel = fieldToPixel(Hinv, field.fx, field.fy);
    expect(pixel.px).toBeCloseTo(testPx, -1);
    expect(pixel.py).toBeCloseTo(testPy, -1);
  });
});

describe("buildAnchors", () => {
  it("converts lab percentage points to pixel coordinates", () => {
    const labPoints = [
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 100 },
      { x: 0, y: 100 },
    ];
    const fieldCoords = [
      { field: { fx: 0, fy: 0 } },
      { field: { fx: 105, fy: 0 } },
      { field: { fx: 105, fy: 68 } },
      { field: { fx: 0, fy: 68 } },
    ];

    const anchors = buildAnchors(labPoints, fieldCoords, 1920, 1080);
    expect(anchors).toHaveLength(4);

    expect(anchors[0].pixel.px).toBe(0);
    expect(anchors[0].pixel.py).toBe(0);
    expect(anchors[1].pixel.px).toBe(1920);
    expect(anchors[1].pixel.py).toBe(0);
    expect(anchors[2].pixel.px).toBe(1920);
    expect(anchors[2].pixel.py).toBe(1080);

    expect(anchors[0].field.fx).toBe(0);
    expect(anchors[1].field.fx).toBe(105);
  });

  it("50% lab point maps to half video dimensions", () => {
    const labPoints = [{ x: 50, y: 50 }];
    const fieldCoords = [{ field: { fx: 52.5, fy: 34 } }];
    const anchors = buildAnchors(labPoints, fieldCoords, 1920, 1080);
    expect(anchors[0].pixel.px).toBe(960);
    expect(anchors[0].pixel.py).toBe(540);
  });
});

describe("fieldDistance", () => {
  it("calculates distance between two field points", () => {
    const d = fieldDistance({ fx: 0, fy: 0 }, { fx: 3, fy: 4 });
    expect(d).toBeCloseTo(5, 5);
  });

  it("distance is 0 for same point", () => {
    const d = fieldDistance({ fx: 50, fy: 34 }, { fx: 50, fy: 34 });
    expect(d).toBe(0);
  });

  it("full pitch diagonal is ~125m", () => {
    const d = fieldDistance({ fx: 0, fy: 0 }, { fx: 105, fy: 68 });
    expect(d).toBeCloseTo(125.1, 0);
  });
});

describe("identityHomography", () => {
  it("returns 3x3 identity matrix", () => {
    const I = identityHomography();
    expect(I).toBeInstanceOf(Float64Array);
    expect(I.length).toBe(9);
    expect(I[0]).toBe(1);
    expect(I[4]).toBe(1);
    expect(I[8]).toBe(1);
    expect(I[1]).toBe(0);
    expect(I[3]).toBe(0);
  });

  it("identity preserves points", () => {
    const I = identityHomography();
    const p = pixelToField(I, 100, 200);
    expect(p.fx).toBeCloseTo(100, 5);
    expect(p.fy).toBeCloseTo(200, 5);
  });
});

// ── Voronoi ─────────────────────────────────────────────────────────────

describe("detectSpaceRun", () => {
  it("detects space run when area increases > threshold", () => {
    expect(detectSpaceRun(20, 30, 5)).toBe(true); // +10 > 5
  });

  it("does not detect when area increase <= threshold", () => {
    expect(detectSpaceRun(20, 24, 5)).toBe(false); // +4 <= 5
  });

  it("does not detect when area decreases", () => {
    expect(detectSpaceRun(30, 20, 5)).toBe(false); // -10 < 0
  });

  it("uses default threshold of 5", () => {
    expect(detectSpaceRun(10, 16)).toBe(true);  // +6 > 5
    expect(detectSpaceRun(10, 14)).toBe(false);  // +4 <= 5
  });

  it("exactly at threshold is not a space run", () => {
    expect(detectSpaceRun(10, 15, 5)).toBe(false); // +5 = 5, not > 5
  });
});
