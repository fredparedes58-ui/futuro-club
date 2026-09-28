/**
 * Synthetic kit patches for the colour re-ID / team-split tests.
 *
 * Builds a plain ImageData-shaped object (jsdom has no canvas) whose torso
 * region is filled with a kit colour plus deterministic per-pixel noise, an
 * optional lighting factor (shade) and an optional fraction of grass pixels —
 * the conditions two teammates in the same kit actually differ by.
 *
 * Test fixture only: these are NOT ground truth and never feed any metric.
 */

export type RGB = [number, number, number];

export const KITS = {
  red: [215, 30, 40] as RGB,
  blue: [30, 60, 200] as RGB,
  orange: [250, 130, 10] as RGB,
  maroon: [120, 10, 20] as RGB,
  white: [238, 238, 234] as RGB,
  yellow: [240, 225, 30] as RGB,
  black: [22, 22, 26] as RGB,
  green: [20, 150, 60] as RGB,
} as const;

const GRASS: RGB = [70, 135, 60];

export const PATCH_W = 40;
export const PATCH_H = 80;
/** Bounding box covering the whole patch. */
export const PATCH_BBOX: [number, number, number, number] = [0, 0, PATCH_W, PATCH_H];

/** Tiny deterministic LCG so every run draws the same noise. */
function lcg(seed: number): () => number {
  let s = (seed >>> 0) || 1;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function clamp255(v: number): number {
  return Math.max(0, Math.min(255, Math.round(v)));
}

export interface PatchOptions {
  /** Max absolute per-channel noise (default 14). */
  noise?: number;
  /** Lighting multiplier on the kit colour (default 1). */
  shade?: number;
  /** Fraction of torso pixels replaced by grass (default 0). */
  grass?: number;
  /** Noise seed. */
  seed?: number;
}

/** A PATCH_W×PATCH_H frame filled with one kit colour (+ lighting/noise/grass). */
export function kitPatch(kit: RGB, opts: PatchOptions = {}): ImageData {
  const { noise = 14, shade = 1, grass = 0, seed = 1 } = opts;
  const rand = lcg(seed);
  const data = new Uint8ClampedArray(PATCH_W * PATCH_H * 4);
  for (let i = 0; i < PATCH_W * PATCH_H; i++) {
    const base = rand() < grass ? GRASS : kit;
    for (let c = 0; c < 3; c++) {
      const jitter = (rand() * 2 - 1) * noise;
      data[i * 4 + c] = clamp255(base[c] * shade + jitter);
    }
    data[i * 4 + 3] = 255;
  }
  return { width: PATCH_W, height: PATCH_H, data, colorSpace: "srgb" } as ImageData;
}

/**
 * A wide frame with several players side by side, one kit each. Returns the
 * frame and the bbox of every player (for re-ID / classifier tests).
 */
export function multiPlayerFrame(
  players: Array<{ kit: RGB; opts?: PatchOptions }>,
): { frame: ImageData; bboxes: Array<[number, number, number, number]> } {
  const width = PATCH_W * players.length;
  const height = PATCH_H;
  const data = new Uint8ClampedArray(width * height * 4);
  const bboxes: Array<[number, number, number, number]> = [];
  players.forEach((p, idx) => {
    const patch = kitPatch(p.kit, p.opts);
    for (let y = 0; y < PATCH_H; y++) {
      for (let x = 0; x < PATCH_W; x++) {
        const src = (y * PATCH_W + x) * 4;
        const dst = (y * width + idx * PATCH_W + x) * 4;
        data[dst] = patch.data[src];
        data[dst + 1] = patch.data[src + 1];
        data[dst + 2] = patch.data[src + 2];
        data[dst + 3] = 255;
      }
    }
    bboxes.push([idx * PATCH_W, 0, PATCH_W, PATCH_H]);
  });
  return { frame: { width, height, data, colorSpace: "srgb" } as ImageData, bboxes };
}
