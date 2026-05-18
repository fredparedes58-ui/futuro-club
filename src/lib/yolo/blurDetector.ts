/**
 * VITAS · Blur Detector + Frame Skip
 *
 * Uses Laplacian variance to detect blurry frames.
 * Returns a score 0-100 (100 = perfectly sharp).
 * Blurry frames produce unreliable keypoint detections and should
 * be skipped during tracking to avoid noisy metrics.
 *
 * The Laplacian kernel [-1,-1,-1; -1,8,-1; -1,-1,-1] highlights
 * edges. Sharp images have high variance in the Laplacian response;
 * blurry images have low variance because edges are smeared.
 */

/** Default sharpness threshold. Frames below this score are considered blurry. */
const DEFAULT_BLUR_THRESHOLD = 15;

/**
 * Size of center crop relative to full image.
 * We only analyze the center to avoid edge artifacts and focus on
 * the playing field area.
 */
const CENTER_CROP_RATIO = 0.5;

/**
 * 3x3 Laplacian kernel for edge detection.
 * Sum = 0, center weight = 8.
 */
const LAPLACIAN_KERNEL = [
  -1, -1, -1,
  -1,  8, -1,
  -1, -1, -1,
];

/**
 * Compute the sharpness of an ImageData using Laplacian variance on a center crop.
 *
 * Algorithm:
 * 1. Convert center crop to grayscale
 * 2. Apply 3x3 Laplacian convolution
 * 3. Compute variance of the Laplacian response
 * 4. Normalize to 0-100 scale
 *
 * @param imageData The frame's ImageData (from canvas)
 * @returns         Sharpness score 0-100 (100 = very sharp)
 */
export function computeSharpness(imageData: ImageData): number {
  const { width, height, data } = imageData;

  // Determine center crop bounds
  const cropW = Math.floor(width * CENTER_CROP_RATIO);
  const cropH = Math.floor(height * CENTER_CROP_RATIO);
  const x0 = Math.floor((width - cropW) / 2);
  const y0 = Math.floor((height - cropH) / 2);

  // Convert crop to grayscale
  const gray = new Float32Array(cropW * cropH);
  for (let cy = 0; cy < cropH; cy++) {
    for (let cx = 0; cx < cropW; cx++) {
      const srcIdx = ((y0 + cy) * width + (x0 + cx)) * 4;
      // ITU-R BT.601 luma coefficients
      gray[cy * cropW + cx] =
        0.299 * data[srcIdx] + 0.587 * data[srcIdx + 1] + 0.114 * data[srcIdx + 2];
    }
  }

  // Apply Laplacian convolution (skip 1px border)
  const lapW = cropW - 2;
  const lapH = cropH - 2;
  if (lapW <= 0 || lapH <= 0) return 0;

  let sum = 0;
  let sumSq = 0;
  const count = lapW * lapH;

  for (let y = 0; y < lapH; y++) {
    for (let x = 0; x < lapW; x++) {
      let val = 0;
      for (let ky = 0; ky < 3; ky++) {
        for (let kx = 0; kx < 3; kx++) {
          val += gray[(y + ky) * cropW + (x + kx)] * LAPLACIAN_KERNEL[ky * 3 + kx];
        }
      }
      sum += val;
      sumSq += val * val;
    }
  }

  // Variance of Laplacian response
  const mean = sum / count;
  const variance = sumSq / count - mean * mean;

  // Normalize to 0-100 scale.
  // Empirically, sharp 1080p footage has Laplacian variance ~500-2000,
  // blurry footage ~10-100. We use a sigmoid-like mapping.
  const normalized = Math.min(100, (variance / 500) * 100);

  return Math.round(Math.max(0, normalized));
}

/**
 * Check if a frame should be skipped due to blur.
 *
 * @param imageData The frame's ImageData
 * @param threshold Minimum sharpness score to be considered usable (default 15)
 * @returns         true if the frame is too blurry and should be skipped
 */
export function isBlurry(imageData: ImageData, threshold = DEFAULT_BLUR_THRESHOLD): boolean {
  return computeSharpness(imageData) < threshold;
}
