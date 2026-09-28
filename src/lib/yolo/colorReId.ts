/**
 * VITAS · Color Histogram Re-ID
 *
 * Extracts HSV color histograms from the player torso region
 * for re-identification when IoU matching fails (occlusion,
 * players crossing, camera jumps).
 *
 * Torso = upper 40-70% of bounding box height — excludes head,
 * legs, and grass to focus on jersey color.
 *
 * Identity boundary (.claude/rules/identidad.md): this module only reads KIT
 * COLOUR from the torso crop. It never looks at the face.
 *
 * Histogram layout (one bin per pixel, whole histogram L1-normalised to 1):
 *   [0..15]  hue of CHROMATIC pixels (saturation and brightness high enough
 *            for hue to mean something) — red, blue, orange, yellow…
 *   [16..18] brightness of ACHROMATIC pixels (black / grey / white kits and
 *            deep shadow), where hue is undefined or pure noise.
 *
 * Why (bug fixed): the previous layout normalised a 16-bin hue section and a
 * 4-bin saturation section to 1 EACH, so the histogram summed to 2 and the
 * Bhattacharyya coefficient ranged over [0,2]. After clamping BC to 1 the
 * distance was 0 whenever BC_hue + BC_sat ≥ 1 — red vs blue (same saturation)
 * came out identical. Achromatic pixels also fell into the "red" hue bin
 * (hue 0), and pixels with V<0.1 were dropped, so black kits had no signature.
 *
 * Known limit: chromatic pixels are binned by hue only, so two kits of the same
 * hue family that differ only in brightness (red vs maroon) are NOT separable —
 * a red kit in shadow is physically close to maroon.
 */

// ─── Constants ───────────────────────────────────────────────────────────────
// Engineering parameters of the colour signature, not metric thresholds.
// Provenance: pendiente de validar — tuned only on synthetic patches
// (src/test/lib/yolo/colorReId.test.ts); no hand-annotated kit ground truth yet.

/** Number of hue bins for chromatic pixels. 16 bins = 22.5 degrees per bin. */
const HUE_BINS = 16;
/**
 * Brightness cut-points for achromatic pixels: black < 0.3 ≤ grey < 0.6 ≤ white.
 * Deliberately coarse and wide: a white kit in shade (~70% brightness) must
 * stay "white", while a black kit never reaches "grey".
 */
const VALUE_CUTS = [0.3, 0.6] as const;
/** Number of brightness bins for achromatic pixels: black · grey · white. */
const VALUE_BINS = VALUE_CUTS.length + 1;
/** Total histogram length: hue bins + achromatic brightness bins. */
const HIST_LENGTH = HUE_BINS + VALUE_BINS;
/** Below this saturation, hue is unreliable (white/grey kits) → binned by brightness. */
const ACHROMATIC_SAT_MAX = 0.2;
/** Below this brightness, hue is noise (black kits, deep shadow) → binned by brightness. */
const ACHROMATIC_VAL_MAX = 0.2;
/** Torso region: starts at 25% from top of bbox. */
const TORSO_TOP_RATIO = 0.25;
/** Torso region: ends at 65% from top of bbox. */
const TORSO_BOTTOM_RATIO = 0.65;
/** Horizontal padding to avoid bbox edges (arms, background). */
const TORSO_PAD_X_RATIO = 0.15;
/**
 * Maximum Bhattacharyya distance at which two torso histograms are treated as
 * the SAME KIT (colour-compatible). Used for colour re-ID and as the "same kit"
 * radius when seeding the team clustering. Colour alone cannot tell teammates
 * apart — only kits — so this is a compatibility gate, never an identity.
 * Synthetic check: same kit under lighting/noise/15% grass ≲ 0.35, different
 * kits ≳ 0.8. Provenance: pendiente de validar.
 */
export const DEFAULT_REID_THRESHOLD = 0.5;

// ─── RGB to HSV conversion ──────────────────────────────────────────────────

/**
 * Convert RGB (0-255 each) to HSV.
 * @returns [h, s, v] where h in [0, 360), s in [0, 1], v in [0, 1]
 */
function rgbToHsv(r: number, g: number, b: number): [number, number, number] {
  const rn = r / 255;
  const gn = g / 255;
  const bn = b / 255;

  const max = Math.max(rn, gn, bn);
  const min = Math.min(rn, gn, bn);
  const delta = max - min;

  let h = 0;
  if (delta > 0) {
    if (max === rn) {
      h = 60 * (((gn - bn) / delta) % 6);
    } else if (max === gn) {
      h = 60 * ((bn - rn) / delta + 2);
    } else {
      h = 60 * ((rn - gn) / delta + 4);
    }
    if (h < 0) h += 360;
  }

  const s = max === 0 ? 0 : delta / max;
  return [h, s, max];
}

// ─── Histogram extraction ────────────────────────────────────────────────────

/**
 * Extract a 16+3 bin colour histogram from the torso region of a bounding box.
 *
 * Every sampled pixel votes exactly once: chromatic pixels by hue, achromatic
 * pixels (low saturation or low brightness) by brightness. The WHOLE histogram
 * is L1-normalized (sums to 1.0, or all zeros if the crop is empty) so it can
 * be compared across different-sized bounding boxes.
 *
 * @param imageData Full frame pixel data
 * @param bbox      Bounding box [x, y, w, h] in pixels
 * @returns         Float32Array of length 19 (16 hue + 3 achromatic brightness bins)
 */
export function extractTorsoHistogram(
  imageData: ImageData,
  bbox: [number, number, number, number],
): Float32Array {
  const { width, height, data } = imageData;
  const [bx, by, bw, bh] = bbox;

  // Torso crop within bbox
  const x0 = Math.max(0, Math.floor(bx + bw * TORSO_PAD_X_RATIO));
  const x1 = Math.min(width - 1, Math.floor(bx + bw * (1 - TORSO_PAD_X_RATIO)));
  const y0 = Math.max(0, Math.floor(by + bh * TORSO_TOP_RATIO));
  const y1 = Math.min(height - 1, Math.floor(by + bh * TORSO_BOTTOM_RATIO));

  const histogram = new Float32Array(HIST_LENGTH);
  let count = 0;

  // Sample every 2nd pixel for speed
  const step = 2;
  for (let y = y0; y <= y1; y += step) {
    for (let x = x0; x <= x1; x += step) {
      const idx = (y * width + x) * 4;
      const r = data[idx];
      const g = data[idx + 1];
      const b = data[idx + 2];

      const [h, s, v] = rgbToHsv(r, g, b);

      if (s < ACHROMATIC_SAT_MAX || v < ACHROMATIC_VAL_MAX) {
        // Achromatic (white / grey / black kit, deep shadow): hue is undefined
        // or noise here, so bin by brightness instead of dropping the pixel —
        // a black kit must still get a signature distinct from a white one.
        let valueBin = 0;
        while (valueBin < VALUE_CUTS.length && v >= VALUE_CUTS[valueBin]) valueBin++;
        histogram[HUE_BINS + valueBin] += 1;
      } else {
        // Chromatic: hue bin (0-360 → 0-15)
        const hueBin = Math.min(HUE_BINS - 1, Math.floor(h / (360 / HUE_BINS)));
        histogram[hueBin] += 1;
      }

      count++;
    }
  }

  // L1 normalize the WHOLE histogram (one vote per pixel ⇒ sums to 1),
  // so the Bhattacharyya coefficient stays in [0, 1].
  if (count > 0) {
    for (let i = 0; i < HIST_LENGTH; i++) histogram[i] /= count;
  }

  return histogram;
}

/** Total mass of a histogram (1 for a normalised one, 0 for an empty crop). */
function histogramMass(h: Float32Array): number {
  let sum = 0;
  for (let i = 0; i < h.length; i++) sum += h[i];
  return sum;
}

/** True when the histogram carries no colour evidence (empty / off-frame crop). */
export function isEmptyHistogram(h: Float32Array): boolean {
  return histogramMass(h) <= 0;
}

/**
 * Compare two histograms using Bhattacharyya distance.
 *
 * BC = sum(sqrt(p[i] * q[i]))   with p, q normalised to mass 1
 * Distance = sqrt(1 - BC)
 *
 * Both inputs are re-normalised by their mass, so BC ∈ [0, 1] by
 * Cauchy–Schwarz even for EMA-blended or averaged histograms.
 *
 * @param h1 First histogram (Float32Array)
 * @param h2 Second histogram (Float32Array)
 * @returns  Distance in [0, 1]. 0 = identical, 1 = completely different.
 *           An empty histogram carries no evidence of similarity → 1.
 */
export function compareHistograms(h1: Float32Array, h2: Float32Array): number {
  const len = Math.min(h1.length, h2.length);
  let bc = 0;
  let m1 = 0;
  let m2 = 0;

  for (let i = 0; i < len; i++) {
    bc += Math.sqrt(h1[i] * h2[i]);
    m1 += h1[i];
    m2 += h2[i];
  }

  if (m1 <= 0 || m2 <= 0) return 1;
  bc /= Math.sqrt(m1 * m2);

  // Clamp BC to [0, 1] (floating point can slightly exceed)
  bc = Math.min(1, Math.max(0, bc));

  return Math.sqrt(1 - bc);
}

// ─── Rate-limited histogram extraction (Sprint 4 optimization) ──────────────

/**
 * Manages frame-rate-limited histogram extraction with EMA temporal blending.
 * Call `maybeExtract()` every frame — internally skips frames based on interval.
 */
export class HistogramCache {
  private histograms = new Map<number, Float32Array>();
  private frameCounts = new Map<number, number>();
  private readonly interval: number;
  private readonly emaAlpha: number;

  constructor(frameInterval = 5, emaAlpha = 0.15) {
    this.interval = frameInterval;
    this.emaAlpha = emaAlpha;
  }

  /**
   * Extract and cache histogram for a track, rate-limited to every Nth frame.
   * Uses EMA blending for temporal stability.
   *
   * @returns The current (blended) histogram, or null if skipped this frame
   */
  maybeExtract(
    trackId: number,
    imageData: ImageData,
    bbox: [number, number, number, number],
    frameIndex: number,
  ): Float32Array | null {
    const count = this.frameCounts.get(trackId) ?? 0;
    if (count > 0 && frameIndex % this.interval !== 0) {
      return this.histograms.get(trackId) ?? null;
    }

    const hist = extractTorsoHistogram(imageData, bbox);
    // Empty crop (off-frame bbox): no colour evidence — do not blend it in.
    if (isEmptyHistogram(hist)) return this.histograms.get(trackId) ?? null;
    const existing = this.histograms.get(trackId);

    if (existing) {
      // EMA blend: new = alpha * current + (1 - alpha) * previous
      for (let i = 0; i < hist.length; i++) {
        existing[i] = this.emaAlpha * hist[i] + (1 - this.emaAlpha) * existing[i];
      }
    } else {
      this.histograms.set(trackId, new Float32Array(hist));
    }

    this.frameCounts.set(trackId, count + 1);
    return this.histograms.get(trackId) ?? null;
  }

  /** Get cached histogram for a track */
  get(trackId: number): Float32Array | null {
    return this.histograms.get(trackId) ?? null;
  }

  /** Clear all cached data */
  reset(): void {
    this.histograms.clear();
    this.frameCounts.clear();
  }
}

/**
 * Re-ID helper: given lost tracks and new detections, find the best
 * color match for each lost track.
 *
 * Uses a greedy approach — best matches are assigned first.
 *
 * @param lostTracks    Tracks that lost their IoU match, with stored histograms
 * @param newDetections Unmatched detections with their bboxes
 * @param threshold     Maximum Bhattacharyya distance to accept (default DEFAULT_REID_THRESHOLD)
 * @returns             Map of trackId → detectionIndex for successful re-IDs
 */
export function colorReId(
  lostTracks: Array<{ id: number; histogram: Float32Array }>,
  newDetections: Array<{ bbox: [number, number, number, number]; imageData: ImageData }>,
  threshold = DEFAULT_REID_THRESHOLD,
): Map<number, number> {
  const result = new Map<number, number>();
  if (lostTracks.length === 0 || newDetections.length === 0) return result;

  // Extract histograms for all new detections
  const detHistograms = newDetections.map((det) =>
    extractTorsoHistogram(det.imageData, det.bbox),
  );

  // Build distance matrix and find best matches greedily
  const pairs: Array<[number, number, number]> = []; // [trackIdx, detIdx, distance]

  for (let ti = 0; ti < lostTracks.length; ti++) {
    for (let di = 0; di < newDetections.length; di++) {
      const dist = compareHistograms(lostTracks[ti].histogram, detHistograms[di]);
      if (dist < threshold) {
        pairs.push([ti, di, dist]);
      }
    }
  }

  // Sort by distance ascending (best matches first)
  pairs.sort((a, b) => a[2] - b[2]);

  const usedTracks = new Set<number>();
  const usedDets = new Set<number>();

  for (const [ti, di] of pairs) {
    if (usedTracks.has(ti) || usedDets.has(di)) continue;
    usedTracks.add(ti);
    usedDets.add(di);
    result.set(lostTracks[ti].id, di);
  }

  return result;
}
