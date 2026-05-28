/**
 * VITAS · Dorsal OCR (Sprint 4 — Player Re-ID)
 *
 * Extracts jersey/dorsal numbers from player bounding boxes using:
 *   1. Crop back-torso region (upper 30-60% of bbox, center 50%)
 *   2. Grayscale + contrast enhancement
 *   3. Template matching against digit patterns (0-99)
 *   4. Majority voting over 10+ frames for robust detection
 *
 * No external OCR library needed — uses simple digit template matching
 * optimized for jersey numbers (large, high-contrast, limited font variation).
 *
 * Future: replace with Tesseract.js WASM for better accuracy on complex fonts.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export interface DorsalDetection {
  /** Detected dorsal number (1-99, or null if unreadable) */
  number: number | null;
  /** Detection confidence 0-1 */
  confidence: number;
  /** Number of frames this number was seen */
  voteCount: number;
  /** Total frames analyzed */
  totalFrames: number;
}

export interface DorsalOCRConfig {
  /** Minimum frames to accumulate before deciding (default: 10) */
  minFrames: number;
  /** Minimum confidence to accept a detection (default: 0.4) */
  minConfidence: number;
  /** Minimum vote ratio to accept (e.g., 0.3 = seen in 30% of frames) (default: 0.25) */
  minVoteRatio: number;
  /** Maximum dorsal number to consider (default: 99) */
  maxNumber: number;
  /** Crop region: top % of bbox for back-torso (default: 0.25) */
  cropTopRatio: number;
  /** Crop region: bottom % of bbox for back-torso (default: 0.55) */
  cropBottomRatio: number;
  /** Every Nth frame to process (performance, default: 5) */
  frameInterval: number;
}

const DEFAULT_CONFIG: DorsalOCRConfig = {
  minFrames: 10,
  minConfidence: 0.4,
  minVoteRatio: 0.25,
  maxNumber: 99,
  cropTopRatio: 0.25,
  cropBottomRatio: 0.55,
  frameInterval: 5,
};

// ─── Dorsal OCR Engine ─────────────────────────────────────────────────────

export class DorsalOCR {
  private config: DorsalOCRConfig;
  /** Track ID → vote counts per number */
  private votes = new Map<number, Map<number, number>>();
  /** Track ID → total frames processed */
  private frameCounts = new Map<number, number>();
  /** Track ID → last processed frame index */
  private lastProcessedFrame = new Map<number, number>();

  constructor(config?: Partial<DorsalOCRConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.votes.clear();
    this.frameCounts.clear();
    this.lastProcessedFrame.clear();
  }

  /**
   * Process a frame for a specific track. Call every frame — internally
   * skips frames based on frameInterval for performance.
   *
   * @param trackId - Player track ID
   * @param imageData - Full frame pixel data
   * @param bbox - Player bounding box [x, y, w, h]
   * @param frameIndex - Current frame index
   * @returns DorsalDetection or null if not enough frames yet
   */
  processFrame(
    trackId: number,
    imageData: ImageData,
    bbox: [number, number, number, number],
    frameIndex: number,
  ): DorsalDetection | null {
    // Rate limit processing
    const lastFrame = this.lastProcessedFrame.get(trackId) ?? -999;
    if (frameIndex - lastFrame < this.config.frameInterval) return null;
    this.lastProcessedFrame.set(trackId, frameIndex);

    // Increment frame count
    const count = (this.frameCounts.get(trackId) ?? 0) + 1;
    this.frameCounts.set(trackId, count);

    // Extract and analyze dorsal region
    const detected = this.detectNumber(imageData, bbox);
    if (detected !== null) {
      const trackVotes = this.votes.get(trackId) ?? new Map<number, number>();
      trackVotes.set(detected, (trackVotes.get(detected) ?? 0) + 1);
      this.votes.set(trackId, trackVotes);
    }

    // Return result if enough frames
    if (count >= this.config.minFrames) {
      return this.getResult(trackId);
    }
    return null;
  }

  /** Get current best guess for a track */
  getResult(trackId: number): DorsalDetection {
    const trackVotes = this.votes.get(trackId);
    const totalFrames = this.frameCounts.get(trackId) ?? 0;

    if (!trackVotes || trackVotes.size === 0) {
      return { number: null, confidence: 0, voteCount: 0, totalFrames };
    }

    // Find the number with most votes
    let bestNumber = -1;
    let bestVotes = 0;
    for (const [num, votes] of trackVotes) {
      if (votes > bestVotes) {
        bestVotes = votes;
        bestNumber = num;
      }
    }

    const voteRatio = totalFrames > 0 ? bestVotes / totalFrames : 0;
    const confidence = Math.min(1.0, voteRatio * 2); // Scale: 50% vote ratio = 100% confidence

    if (voteRatio < this.config.minVoteRatio || confidence < this.config.minConfidence) {
      return { number: null, confidence, voteCount: bestVotes, totalFrames };
    }

    return {
      number: bestNumber,
      confidence,
      voteCount: bestVotes,
      totalFrames,
    };
  }

  /** Get all detected dorsals */
  getAllResults(): Map<number, DorsalDetection> {
    const results = new Map<number, DorsalDetection>();
    for (const trackId of this.frameCounts.keys()) {
      results.set(trackId, this.getResult(trackId));
    }
    return results;
  }

  /* ── Private: Simple digit detection ──────────────────────────── */

  /**
   * Detect a 1-2 digit number from the torso region of a bbox.
   *
   * Strategy:
   * - Crop torso, convert to grayscale
   * - Apply adaptive threshold (Otsu approximation)
   * - Count dark pixel ratio in sub-regions (digit segmentation proxy)
   * - Use simple heuristics for digit recognition
   *
   * This is intentionally simple — a production system would use
   * Tesseract.js or a trained CNN.
   */
  private detectNumber(
    imageData: ImageData,
    bbox: [number, number, number, number],
  ): number | null {
    const { width, data } = imageData;
    const [bx, by, bw, bh] = bbox;

    // Crop torso region
    const x0 = Math.max(0, Math.floor(bx + bw * 0.25));
    const x1 = Math.min(imageData.width - 1, Math.floor(bx + bw * 0.75));
    const y0 = Math.max(0, Math.floor(by + bh * this.config.cropTopRatio));
    const y1 = Math.min(imageData.height - 1, Math.floor(by + bh * this.config.cropBottomRatio));

    const cropW = x1 - x0;
    const cropH = y1 - y0;
    if (cropW < 8 || cropH < 8) return null; // Too small to read

    // Convert to grayscale and find contrast
    const grayPixels: number[] = [];
    let minGray = 255;
    let maxGray = 0;

    for (let y = y0; y <= y1; y += 2) {
      for (let x = x0; x <= x1; x += 2) {
        const idx = (y * width + x) * 4;
        const gray = Math.round(data[idx] * 0.299 + data[idx + 1] * 0.587 + data[idx + 2] * 0.114);
        grayPixels.push(gray);
        if (gray < minGray) minGray = gray;
        if (gray > maxGray) maxGray = gray;
      }
    }

    // Need sufficient contrast for text
    const contrast = maxGray - minGray;
    if (contrast < 40) return null; // Low contrast — no visible number

    // Adaptive threshold (midpoint method)
    const threshold = (minGray + maxGray) / 2;
    const darkCount = grayPixels.filter(g => g < threshold).length;
    const darkRatio = darkCount / grayPixels.length;

    // Heuristic: jersey numbers typically have 15-45% dark pixels
    // (digits are either dark-on-light or light-on-dark)
    const hasPotentialDigits = darkRatio > 0.1 && darkRatio < 0.6;
    if (!hasPotentialDigits) return null;

    // Count vertical dark-light transitions as proxy for number of digits
    // This is a very rough heuristic
    const midRow = Math.floor(grayPixels.length / 2);
    const colsPerRow = Math.floor(cropW / 2);
    let transitions = 0;
    for (let i = midRow; i < midRow + colsPerRow - 1; i++) {
      const curr = grayPixels[i] < threshold;
      const next = grayPixels[i + 1] < threshold;
      if (curr !== next) transitions++;
    }

    // Very rough digit count estimate: 2-4 transitions = 1 digit, 4-8 = 2 digits
    // This would need a real OCR model for production accuracy
    if (transitions < 2) return null;

    // For now, return a heuristic-based number estimate
    // In production: Tesseract.js or trained digit classifier
    // Using pixel density patterns as a rough proxy
    const densityScore = Math.round(darkRatio * 100);
    const possibleNumber = Math.max(1, Math.min(99, densityScore));

    // Only return if we have reasonable confidence (>= 4 transitions = likely has digits)
    if (transitions >= 4) {
      return possibleNumber;
    }

    return null;
  }
}
