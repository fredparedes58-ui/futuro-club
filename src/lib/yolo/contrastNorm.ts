/**
 * VITAS · Adaptive Contrast Normalization (CLAHE-lite)
 *
 * Simplified CLAHE (Contrast Limited Adaptive Histogram Equalization)
 * for frames with uneven lighting — common in outdoor football footage
 * where one half of the pitch is in shadow.
 *
 * Divides the image into tiles, equalizes each tile's histogram with
 * a clip limit, then bilinearly interpolates tile boundaries to avoid
 * visible block artifacts.
 */

// ─── Constants ───────────────────────────────────────────────────────────────

/** Default tile size in pixels. Smaller = more adaptive, slower. */
const DEFAULT_TILE_SIZE = 32;
/** Default clip limit for histogram equalization. Higher = more contrast. */
const DEFAULT_CLIP_LIMIT = 3.0;
/** Threshold for deciding if normalization is needed. */
const DYNAMIC_RANGE_THRESHOLD = 0.35;

// ─── Main functions ──────────────────────────────────────────────────────────

/**
 * Apply simplified CLAHE to an ImageData.
 *
 * Algorithm:
 * 1. Convert to grayscale
 * 2. Divide into tiles of tileSize x tileSize
 * 3. For each tile: build histogram, clip at clipLimit, redistribute, build CDF
 * 4. For each pixel: bilinearly interpolate the mapping from the 4 nearest tile CDFs
 * 5. Apply the mapping to the V channel (preserving color ratios)
 *
 * @param imageData Full frame pixel data (will NOT be mutated)
 * @param tileSize  Tile size in pixels (default 32)
 * @param clipLimit Histogram clip limit as a multiplier (default 3.0)
 * @returns         New ImageData with normalized contrast
 */
export function adaptiveContrastNormalize(
  imageData: ImageData,
  tileSize = DEFAULT_TILE_SIZE,
  clipLimit = DEFAULT_CLIP_LIMIT,
): ImageData {
  const { width, height, data } = imageData;

  // Number of tiles in each dimension
  const tilesX = Math.max(1, Math.ceil(width / tileSize));
  const tilesY = Math.max(1, Math.ceil(height / tileSize));

  // ── Step 1: Extract grayscale ──────────────────────────────────────────────
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < width * height; i++) {
    const idx = i * 4;
    gray[i] = Math.round(
      0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2],
    );
  }

  // ── Step 2: Build CDFs for each tile ───────────────────────────────────────
  // Each CDF maps input gray (0-255) to output gray (0-255)
  const tileCDFs: Uint8Array[] = new Array(tilesX * tilesY);

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      const x1 = Math.min(x0 + tileSize, width);
      const y1 = Math.min(y0 + tileSize, height);
      const tilePixels = (x1 - x0) * (y1 - y0);

      // Build histogram
      const hist = new Uint32Array(256);
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          hist[gray[y * width + x]]++;
        }
      }

      // Clip histogram and redistribute
      const clipCount = Math.floor(clipLimit * tilePixels / 256);
      let excess = 0;
      for (let i = 0; i < 256; i++) {
        if (hist[i] > clipCount) {
          excess += hist[i] - clipCount;
          hist[i] = clipCount;
        }
      }
      // Redistribute excess evenly
      const perBin = Math.floor(excess / 256);
      const remainder = excess - perBin * 256;
      for (let i = 0; i < 256; i++) {
        hist[i] += perBin + (i < remainder ? 1 : 0);
      }

      // Build CDF and normalize to 0-255
      const cdf = new Uint8Array(256);
      let cumulative = 0;
      for (let i = 0; i < 256; i++) {
        cumulative += hist[i];
        cdf[i] = Math.round((cumulative / tilePixels) * 255);
      }

      tileCDFs[ty * tilesX + tx] = cdf;
    }
  }

  // ── Step 3: Bilinear interpolation of tile CDFs ────────────────────────────
  const output = new Uint8ClampedArray(data.length);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = (y * width + x) * 4;
      const grayVal = gray[y * width + x];

      // Find which tile center this pixel is relative to
      const tfx = (x / tileSize) - 0.5;
      const tfy = (y / tileSize) - 0.5;

      const tx0 = Math.max(0, Math.floor(tfx));
      const ty0 = Math.max(0, Math.floor(tfy));
      const tx1 = Math.min(tilesX - 1, tx0 + 1);
      const ty1 = Math.min(tilesY - 1, ty0 + 1);

      const dx = Math.max(0, Math.min(1, tfx - tx0));
      const dy = Math.max(0, Math.min(1, tfy - ty0));

      // Bilinear interpolation of 4 tile CDFs
      const v00 = tileCDFs[ty0 * tilesX + tx0][grayVal];
      const v10 = tileCDFs[ty0 * tilesX + tx1][grayVal];
      const v01 = tileCDFs[ty1 * tilesX + tx0][grayVal];
      const v11 = tileCDFs[ty1 * tilesX + tx1][grayVal];

      const top = v00 + dx * (v10 - v00);
      const bot = v01 + dx * (v11 - v01);
      const newGray = top + dy * (bot - top);

      // Scale original RGB channels proportionally
      const scale = grayVal > 0 ? newGray / grayVal : 1;
      output[idx]     = Math.min(255, Math.round(data[idx] * scale));
      output[idx + 1] = Math.min(255, Math.round(data[idx + 1] * scale));
      output[idx + 2] = Math.min(255, Math.round(data[idx + 2] * scale));
      output[idx + 3] = data[idx + 3]; // alpha unchanged
    }
  }

  return new ImageData(output, width, height);
}

/**
 * Quick check if adaptive contrast normalization is needed.
 *
 * Computes the coefficient of variation of tile-level mean brightness.
 * High variation = uneven lighting = normalization recommended.
 *
 * @param imageData Full frame pixel data
 * @returns         true if normalization would improve the frame
 */
export function needsNormalization(imageData: ImageData): boolean {
  const { width, height, data } = imageData;
  const tileSize = 64; // larger tiles for quick assessment
  const tilesX = Math.max(1, Math.ceil(width / tileSize));
  const tilesY = Math.max(1, Math.ceil(height / tileSize));

  const tileMeans: number[] = [];

  for (let ty = 0; ty < tilesY; ty++) {
    for (let tx = 0; tx < tilesX; tx++) {
      const x0 = tx * tileSize;
      const y0 = ty * tileSize;
      const x1 = Math.min(x0 + tileSize, width);
      const y1 = Math.min(y0 + tileSize, height);

      let sum = 0;
      let count = 0;
      // Sample every 4th pixel for speed
      for (let y = y0; y < y1; y += 4) {
        for (let x = x0; x < x1; x += 4) {
          const idx = (y * width + x) * 4;
          sum += 0.299 * data[idx] + 0.587 * data[idx + 1] + 0.114 * data[idx + 2];
          count++;
        }
      }
      if (count > 0) tileMeans.push(sum / count);
    }
  }

  if (tileMeans.length < 2) return false;

  // Coefficient of variation = std / mean
  const mean = tileMeans.reduce((a, b) => a + b, 0) / tileMeans.length;
  if (mean < 1) return false;

  const variance =
    tileMeans.reduce((acc, v) => acc + (v - mean) * (v - mean), 0) / tileMeans.length;
  const cv = Math.sqrt(variance) / mean;

  return cv > DYNAMIC_RANGE_THRESHOLD;
}
