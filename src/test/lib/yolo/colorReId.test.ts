/**
 * VITAS · colour re-ID histogram — regression tests with synthetic kit patches.
 *
 * Bug fixed: the hue section (16 bins) and the saturation section (4 bins) were
 * normalised to 1 EACH, so the histogram summed to 2 and the Bhattacharyya
 * coefficient ranged over [0,2]; after clamping BC to 1 the distance was 0
 * whenever BC_hue + BC_sat ≥ 1 → red vs blue (same saturation) looked identical,
 * white fell into the red hue bin, and black kits (V<0.1 skipped) had no signature.
 *
 * Colour only (torso crop) — never the face (.claude/rules/identidad.md).
 */
import { describe, it, expect } from "vitest";
import {
  extractTorsoHistogram,
  compareHistograms,
  colorReId,
  isEmptyHistogram,
  HistogramCache,
  DEFAULT_REID_THRESHOLD,
} from "@/lib/yolo/colorReId";
import { KITS, kitPatch, multiPlayerFrame, PATCH_BBOX, type RGB, type PatchOptions } from "./kitPatches";

function hist(kit: RGB, opts?: PatchOptions): Float32Array {
  return extractTorsoHistogram(kitPatch(kit, opts), PATCH_BBOX);
}

function dist(a: RGB, b: RGB, optsA?: PatchOptions, optsB?: PatchOptions): number {
  return compareHistograms(hist(a, optsA), hist(b, { seed: 99, ...optsB }));
}

function sum(h: Float32Array): number {
  let s = 0;
  for (let i = 0; i < h.length; i++) s += h[i];
  return s;
}

/** Clearly different kits must sit far above the "same kit" gate. */
const DIFFERENT_KIT_MIN = 0.8;

describe("extractTorsoHistogram — normalisation", () => {
  it("the WHOLE histogram sums to 1 (was 2: two sections normalised separately)", () => {
    for (const kit of Object.values(KITS)) {
      expect(sum(hist(kit))).toBeCloseTo(1, 5);
    }
  });

  it("an off-frame bbox yields an empty histogram (no colour evidence)", () => {
    const h = extractTorsoHistogram(kitPatch(KITS.red), [500, 500, 40, 80]);
    expect(isEmptyHistogram(h)).toBe(true);
  });

  it("a black kit gets a usable signature (dark pixels are no longer dropped)", () => {
    const h = hist(KITS.black);
    expect(isEmptyHistogram(h)).toBe(false);
    expect(sum(h)).toBeCloseTo(1, 5);
  });
});

describe("compareHistograms — Bhattacharyya distance in [0,1]", () => {
  it("identical histograms → 0; scale does not matter (re-normalised by mass)", () => {
    const h = hist(KITS.blue);
    expect(compareHistograms(h, h)).toBeCloseTo(0, 5);
    const doubled = new Float32Array(h.map((v) => v * 2));
    expect(compareHistograms(h, doubled)).toBeCloseTo(0, 3);
  });

  it("empty histogram → 1 (no evidence of similarity, never a match)", () => {
    const empty = new Float32Array(hist(KITS.red).length);
    expect(compareHistograms(empty, hist(KITS.red))).toBe(1);
    expect(compareHistograms(empty, empty)).toBe(1);
  });

  it("red vs blue (same saturation, different hue) separate", () => {
    expect(dist(KITS.red, KITS.blue)).toBeGreaterThan(DIFFERENT_KIT_MIN);
  });

  it("orange vs maroon separate", () => {
    expect(dist(KITS.orange, KITS.maroon)).toBeGreaterThan(DIFFERENT_KIT_MIN);
  });

  it("white vs yellow separate", () => {
    expect(dist(KITS.white, KITS.yellow)).toBeGreaterThan(DIFFERENT_KIT_MIN);
  });

  it("white vs red separate (achromatic pixels no longer land in the red hue bin)", () => {
    expect(dist(KITS.white, KITS.red)).toBeGreaterThan(DIFFERENT_KIT_MIN);
  });

  it("black vs white separate", () => {
    expect(dist(KITS.black, KITS.white)).toBeGreaterThan(DIFFERENT_KIT_MIN);
  });

  it("black kit teammates match each other", () => {
    expect(dist(KITS.black, KITS.black, { seed: 3 }, { shade: 0.8, noise: 20 })).toBeLessThan(
      DEFAULT_REID_THRESHOLD,
    );
  });
});

describe("DEFAULT_REID_THRESHOLD — same kit vs different kit", () => {
  const kits = Object.entries(KITS) as Array<[string, RGB]>;
  // Teammate variation: lighting (shade), sensor noise, grass in the crop.
  const teammateVariants: PatchOptions[] = [
    { shade: 1, noise: 20 },
    { shade: 0.85, noise: 20 },
    { shade: 0.75, noise: 20 },
    { shade: 0.85, noise: 20, grass: 0.15 },
  ];

  it("threshold is a sane distance on the [0,1] scale", () => {
    expect(DEFAULT_REID_THRESHOLD).toBeGreaterThan(0);
    expect(DEFAULT_REID_THRESHOLD).toBeLessThan(1);
  });

  it("same-kit teammates (lighting/noise/grass) fall under the threshold", () => {
    for (const [name, kit] of kits) {
      for (const v of teammateVariants) {
        const d = dist(kit, kit, { seed: 3 }, v);
        expect(d, `${name} ${JSON.stringify(v)}`).toBeLessThan(DEFAULT_REID_THRESHOLD);
      }
    }
  });

  it("different kits fall above the threshold with margin", () => {
    const pairs: Array<[keyof typeof KITS, keyof typeof KITS]> = [
      ["red", "blue"], ["orange", "maroon"], ["white", "yellow"], ["black", "white"],
      ["black", "blue"], ["green", "white"], ["yellow", "orange"], ["red", "green"],
    ];
    for (const [a, b] of pairs) {
      const d = dist(KITS[a], KITS[b], undefined, { shade: 0.85, noise: 20 });
      expect(d, `${a} vs ${b}`).toBeGreaterThan(DEFAULT_REID_THRESHOLD);
      expect(d, `${a} vs ${b}`).toBeGreaterThan(DIFFERENT_KIT_MIN);
    }
  });
});

describe("colorReId — greedy re-identification by kit colour", () => {
  it("re-attaches a lost red track to the red detection, not the blue one", () => {
    const { frame, bboxes } = multiPlayerFrame([
      { kit: KITS.blue, opts: { seed: 5 } },
      { kit: KITS.red, opts: { seed: 6, shade: 0.85 } },
    ]);
    const lost = [{ id: 7, histogram: hist(KITS.red, { seed: 1 }) }];
    const dets = bboxes.map((bbox) => ({ bbox, imageData: frame }));
    const result = colorReId(lost, dets);
    expect(result.get(7)).toBe(1);
  });

  it("abstains when only a different kit is available", () => {
    const { frame, bboxes } = multiPlayerFrame([{ kit: KITS.blue, opts: { seed: 5 } }]);
    const lost = [{ id: 7, histogram: hist(KITS.red, { seed: 1 }) }];
    const result = colorReId(lost, bboxes.map((bbox) => ({ bbox, imageData: frame })));
    expect(result.size).toBe(0);
  });
});

describe("HistogramCache", () => {
  it("does not blend an empty (off-frame) crop into the cached signature", () => {
    const cache = new HistogramCache(1, 0.5);
    const frame = kitPatch(KITS.red);
    const first = cache.maybeExtract(1, frame, PATCH_BBOX, 0);
    const before = new Float32Array(first!);
    cache.maybeExtract(1, frame, [500, 500, 40, 80], 1);
    const after = cache.get(1)!;
    expect(sum(after)).toBeCloseTo(1, 5);
    expect(compareHistograms(before, after)).toBeCloseTo(0, 5);
  });
});
