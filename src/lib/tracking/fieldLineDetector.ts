/**
 * VITAS · Field Line Detector (Tracking → 5/10)
 *
 * Automatic field line detection using OpenCV.js (edge detection + Hough lines).
 * Replaces manual 4-corner calibration with auto-detected lines that feed
 * into the homography pipeline for real-world coordinate mapping.
 *
 * Pipeline:
 *   Frame → Grayscale → GaussianBlur → Canny → HoughLinesP → Filter → Merge
 *
 * The detected lines are classified as:
 *   - Sidelines (horizontal dominant)
 *   - Goal lines (vertical dominant at edges)
 *   - Center line / circle
 *   - Penalty area lines
 *
 * Falls back to manual calibration if detection confidence < threshold.
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface DetectedLine {
  /** Start point [x, y] */
  start: [number, number];
  /** End point [x, y] */
  end: [number, number];
  /** Angle in degrees (0° = horizontal, 90° = vertical) */
  angle: number;
  /** Length in pixels */
  length: number;
  /** Line classification */
  classification: LineClass;
  /** Detection confidence 0-1 */
  confidence: number;
}

export type LineClass =
  | "sideline"
  | "goal_line"
  | "center_line"
  | "penalty_area"
  | "goal_area"
  | "center_circle"
  | "unknown";

export interface FieldDetectionResult {
  /** All detected lines */
  lines: DetectedLine[];
  /** Auto-detected field corners (if 4+ found) */
  corners: [number, number][];
  /** Overall detection confidence 0-1 */
  confidence: number;
  /** Whether auto-calibration is reliable enough */
  autoCalibrationReady: boolean;
  /** Detected field orientation */
  orientation: "horizontal" | "vertical" | "unknown";
  /** Processing time in ms */
  processingTimeMs: number;
  /** Debug: intermediate images for visualization */
  debug?: {
    cannyEdges?: ImageData;
    houghLines?: ImageData;
  };
}

export interface FieldDetectorConfig {
  /** Canny edge detection lower threshold (default: 50) */
  cannyLow: number;
  /** Canny edge detection upper threshold (default: 150) */
  cannyHigh: number;
  /** Gaussian blur kernel size (must be odd, default: 5) */
  blurKernel: number;
  /** HoughLinesP: minimum line length in pixels (default: 50) */
  minLineLength: number;
  /** HoughLinesP: maximum gap between line segments (default: 10) */
  maxLineGap: number;
  /** HoughLinesP: accumulator threshold (default: 80) */
  houghThreshold: number;
  /** Minimum confidence to trust auto-calibration (default: 0.6) */
  minConfidence: number;
  /** Angle tolerance for line classification in degrees (default: 15) */
  angleTolerance: number;
  /** Enable debug image output (default: false) */
  debug: boolean;
}

const DEFAULT_CONFIG: FieldDetectorConfig = {
  cannyLow: 50,
  cannyHigh: 150,
  blurKernel: 5,
  minLineLength: 50,
  maxLineGap: 10,
  houghThreshold: 80,
  minConfidence: 0.6,
  angleTolerance: 15,
  debug: false,
};

/* ── OpenCV.js availability check ──────────────────────────────── */

let opencvReady = false;
let opencvLoadPromise: Promise<boolean> | null = null;

/**
 * Load OpenCV.js from CDN if not already loaded.
 * Returns true if OpenCV is available, false otherwise.
 */
export async function ensureOpenCV(): Promise<boolean> {
  if (opencvReady) return true;

  // Check if already loaded
  if (typeof window !== "undefined" && (window as unknown as Record<string, unknown>).cv) {
    opencvReady = true;
    return true;
  }

  // Load from CDN
  if (!opencvLoadPromise) {
    opencvLoadPromise = new Promise<boolean>((resolve) => {
      if (typeof document === "undefined") {
        resolve(false);
        return;
      }

      const script = document.createElement("script");
      script.src = "https://docs.opencv.org/4.9.0/opencv.js";
      script.async = true;

      script.onload = () => {
        // OpenCV.js uses a Module.onRuntimeInitialized callback
        const cv = (window as unknown as Record<string, unknown>).cv;
        if (cv && typeof cv === "object" && "onRuntimeInitialized" in cv) {
          (cv as Record<string, unknown>).onRuntimeInitialized = () => {
            opencvReady = true;
            resolve(true);
          };
        } else {
          // Already initialized
          opencvReady = true;
          resolve(true);
        }

        // Timeout fallback
        setTimeout(() => {
          if (!opencvReady) {
            console.warn("[FieldDetector] OpenCV.js load timeout");
            resolve(false);
          }
        }, 15000);
      };

      script.onerror = () => {
        console.error("[FieldDetector] Failed to load OpenCV.js");
        resolve(false);
      };

      document.head.appendChild(script);
    });
  }

  return opencvLoadPromise;
}

/* ── Pure JS Fallback (no OpenCV) ──────────────────────────────── */

/**
 * Simple edge-based line detection without OpenCV.
 * Uses a basic Sobel-like approach on canvas pixel data.
 * Much less accurate but works as a fallback.
 */
function fallbackDetectLines(
  imageData: ImageData,
  config: FieldDetectorConfig,
): DetectedLine[] {
  const { width, height, data } = imageData;
  const lines: DetectedLine[] = [];

  // Convert to grayscale
  const gray = new Uint8Array(width * height);
  for (let i = 0; i < gray.length; i++) {
    const offset = i * 4;
    gray[i] = Math.round(data[offset] * 0.299 + data[offset + 1] * 0.587 + data[offset + 2] * 0.114);
  }

  // Simple horizontal and vertical edge detection
  const edges = new Uint8Array(width * height);
  const threshold = config.cannyLow;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = y * width + x;
      // Sobel-like gradient
      const gx = Math.abs(
        -gray[(y - 1) * width + (x - 1)] + gray[(y - 1) * width + (x + 1)]
        - 2 * gray[y * width + (x - 1)] + 2 * gray[y * width + (x + 1)]
        - gray[(y + 1) * width + (x - 1)] + gray[(y + 1) * width + (x + 1)]
      );
      const gy = Math.abs(
        -gray[(y - 1) * width + (x - 1)] - 2 * gray[(y - 1) * width + x] - gray[(y - 1) * width + (x + 1)]
        + gray[(y + 1) * width + (x - 1)] + 2 * gray[(y + 1) * width + x] + gray[(y + 1) * width + (x + 1)]
      );
      const magnitude = Math.sqrt(gx * gx + gy * gy);
      edges[idx] = magnitude > threshold ? 255 : 0;
    }
  }

  // Simple line detection: scan for long horizontal and vertical runs
  // Horizontal scan
  for (let y = 0; y < height; y += 5) {
    let runStart = -1;
    for (let x = 0; x < width; x++) {
      if (edges[y * width + x] === 255) {
        if (runStart === -1) runStart = x;
      } else {
        if (runStart !== -1 && (x - runStart) >= config.minLineLength) {
          lines.push({
            start: [runStart, y],
            end: [x, y],
            angle: 0,
            length: x - runStart,
            classification: "unknown",
            confidence: 0.4,
          });
        }
        runStart = -1;
      }
    }
  }

  // Vertical scan
  for (let x = 0; x < width; x += 5) {
    let runStart = -1;
    for (let y = 0; y < height; y++) {
      if (edges[y * width + x] === 255) {
        if (runStart === -1) runStart = y;
      } else {
        if (runStart !== -1 && (y - runStart) >= config.minLineLength) {
          lines.push({
            start: [x, runStart],
            end: [x, y],
            angle: 90,
            length: y - runStart,
            classification: "unknown",
            confidence: 0.3,
          });
        }
        runStart = -1;
      }
    }
  }

  return lines;
}

/* ── Line Classification ───────────────────────────────────────── */

function classifyLine(
  line: DetectedLine,
  imageWidth: number,
  imageHeight: number,
  tolerance: number,
): DetectedLine {
  const midX = (line.start[0] + line.end[0]) / 2;
  const midY = (line.start[1] + line.end[1]) / 2;
  const relX = midX / imageWidth;
  const relY = midY / imageHeight;

  const isHorizontal = Math.abs(line.angle) < tolerance || Math.abs(line.angle - 180) < tolerance;
  const isVertical = Math.abs(line.angle - 90) < tolerance || Math.abs(line.angle - 270) < tolerance;

  let classification: LineClass = "unknown";

  if (isHorizontal) {
    if (relY < 0.15 || relY > 0.85) {
      classification = "sideline";
    } else if (Math.abs(relY - 0.5) < 0.1) {
      classification = "center_line";
    } else if (relY > 0.2 && relY < 0.4) {
      classification = "penalty_area";
    } else if (relY > 0.6 && relY < 0.8) {
      classification = "penalty_area";
    }
  } else if (isVertical) {
    if (relX < 0.1 || relX > 0.9) {
      classification = "goal_line";
    } else if (relX > 0.15 && relX < 0.35) {
      classification = "penalty_area";
    } else if (relX > 0.65 && relX < 0.85) {
      classification = "penalty_area";
    }
  }

  // Boost confidence for classified lines
  const confidenceBoost = classification !== "unknown" ? 0.15 : 0;

  return {
    ...line,
    classification,
    confidence: Math.min(1.0, line.confidence + confidenceBoost),
  };
}

/* ── Corner Extraction ─────────────────────────────────────────── */

function extractCorners(lines: DetectedLine[]): [number, number][] {
  const corners: [number, number][] = [];
  const horizontals = lines.filter(l => Math.abs(l.angle) < 20 || Math.abs(l.angle - 180) < 20);
  const verticals = lines.filter(l => Math.abs(l.angle - 90) < 20 || Math.abs(l.angle - 270) < 20);

  // Find intersections of horizontal and vertical lines
  for (const h of horizontals) {
    for (const v of verticals) {
      const intersection = lineIntersection(h, v);
      if (intersection) {
        // Check if this corner is not too close to an existing one
        const tooClose = corners.some(
          c => Math.sqrt((c[0] - intersection[0]) ** 2 + (c[1] - intersection[1]) ** 2) < 30
        );
        if (!tooClose) {
          corners.push(intersection);
        }
      }
    }
  }

  // Sort corners: top-left, top-right, bottom-right, bottom-left
  if (corners.length >= 4) {
    corners.sort((a, b) => a[1] - b[1]); // sort by Y
    const topTwo = corners.slice(0, 2).sort((a, b) => a[0] - b[0]);
    const bottomTwo = corners.slice(2, 4).sort((a, b) => b[0] - a[0]);
    return [...topTwo, ...bottomTwo].slice(0, 4);
  }

  return corners;
}

function lineIntersection(
  l1: DetectedLine,
  l2: DetectedLine,
): [number, number] | null {
  const x1 = l1.start[0], y1 = l1.start[1];
  const x2 = l1.end[0], y2 = l1.end[1];
  const x3 = l2.start[0], y3 = l2.start[1];
  const x4 = l2.end[0], y4 = l2.end[1];

  const denom = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
  if (Math.abs(denom) < 1e-10) return null;

  const t = ((x1 - x3) * (y3 - y4) - (y1 - y3) * (x3 - x4)) / denom;

  const ix = x1 + t * (x2 - x1);
  const iy = y1 + t * (y2 - y1);

  // Check intersection is near both line segments (with tolerance)
  const tolerance = 50; // pixels
  if (
    ix < Math.min(x1, x2) - tolerance || ix > Math.max(x1, x2) + tolerance ||
    iy < Math.min(y1, y2) - tolerance || iy > Math.max(y1, y2) + tolerance
  ) {
    return null;
  }

  return [Math.round(ix), Math.round(iy)];
}

/* ── Orientation Detection ─────────────────────────────────────── */

function detectOrientation(lines: DetectedLine[]): "horizontal" | "vertical" | "unknown" {
  const horizontals = lines.filter(l => Math.abs(l.angle) < 30 || Math.abs(l.angle - 180) < 30);
  const verticals = lines.filter(l => Math.abs(l.angle - 90) < 30 || Math.abs(l.angle - 270) < 30);

  const hLength = horizontals.reduce((s, l) => s + l.length, 0);
  const vLength = verticals.reduce((s, l) => s + l.length, 0);

  if (hLength > vLength * 1.5) return "horizontal";
  if (vLength > hLength * 1.5) return "vertical";
  return "unknown";
}

/* ── Main Detection Pipeline ───────────────────────────────────── */

/**
 * Detect field lines from a video frame.
 * Uses OpenCV.js if available, falls back to pure JS.
 *
 * @param imageData - Raw pixel data from canvas getImageData()
 * @param config - Detection parameters (optional, uses defaults)
 */
export async function detectFieldLines(
  imageData: ImageData,
  config?: Partial<FieldDetectorConfig>,
): Promise<FieldDetectionResult> {
  const cfg = { ...DEFAULT_CONFIG, ...config };
  const startTime = performance.now();

  const hasOpenCV = await ensureOpenCV();
  let rawLines: DetectedLine[];

  if (hasOpenCV) {
    rawLines = opencvDetectLines(imageData, cfg);
  } else {
    console.warn("[FieldDetector] OpenCV not available, using fallback");
    rawLines = fallbackDetectLines(imageData, cfg);
  }

  // Classify each line
  const classifiedLines = rawLines.map(l =>
    classifyLine(l, imageData.width, imageData.height, cfg.angleTolerance)
  );

  // Extract field corners from line intersections
  const corners = extractCorners(classifiedLines);

  // Calculate overall confidence
  const avgConfidence = classifiedLines.length > 0
    ? classifiedLines.reduce((s, l) => s + l.confidence, 0) / classifiedLines.length
    : 0;

  const classifiedCount = classifiedLines.filter(l => l.classification !== "unknown").length;
  const classificationRate = classifiedLines.length > 0
    ? classifiedCount / classifiedLines.length
    : 0;

  const overallConfidence = avgConfidence * 0.5 + classificationRate * 0.3 + (corners.length >= 4 ? 0.2 : corners.length * 0.05);

  const orientation = detectOrientation(classifiedLines);
  const processingTimeMs = performance.now() - startTime;

  return {
    lines: classifiedLines,
    corners,
    confidence: Math.round(overallConfidence * 100) / 100,
    autoCalibrationReady: overallConfidence >= cfg.minConfidence && corners.length >= 4,
    orientation,
    processingTimeMs: Math.round(processingTimeMs),
  };
}

/* ── OpenCV.js Detection ───────────────────────────────────────── */

function opencvDetectLines(
  imageData: ImageData,
  config: FieldDetectorConfig,
): DetectedLine[] {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const cv = (window as any).cv;
  if (!cv) return [];

  const lines: DetectedLine[] = [];

  try {
    // Create Mat from ImageData
    const src = cv.matFromImageData(imageData);
    const gray = new cv.Mat();
    const blurred = new cv.Mat();
    const edges = new cv.Mat();
    const linesMat = new cv.Mat();

    // Grayscale
    cv.cvtColor(src, gray, cv.COLOR_RGBA2GRAY);

    // Gaussian blur
    const ksize = new cv.Size(config.blurKernel, config.blurKernel);
    cv.GaussianBlur(gray, blurred, ksize, 0);

    // Canny edge detection
    cv.Canny(blurred, edges, config.cannyLow, config.cannyHigh);

    // Probabilistic Hough Line Transform
    cv.HoughLinesP(
      edges,
      linesMat,
      1,                    // rho resolution
      Math.PI / 180,        // theta resolution
      config.houghThreshold,
      config.minLineLength,
      config.maxLineGap,
    );

    // Extract lines from Mat
    for (let i = 0; i < linesMat.rows; i++) {
      const x1 = linesMat.data32S[i * 4];
      const y1 = linesMat.data32S[i * 4 + 1];
      const x2 = linesMat.data32S[i * 4 + 2];
      const y2 = linesMat.data32S[i * 4 + 3];

      const dx = x2 - x1;
      const dy = y2 - y1;
      const angle = Math.atan2(dy, dx) * (180 / Math.PI);
      const length = Math.sqrt(dx * dx + dy * dy);

      lines.push({
        start: [x1, y1],
        end: [x2, y2],
        angle: ((angle % 360) + 360) % 360,
        length: Math.round(length),
        classification: "unknown",
        confidence: 0.7, // OpenCV lines get higher base confidence
      });
    }

    // Cleanup OpenCV Mats
    src.delete();
    gray.delete();
    blurred.delete();
    edges.delete();
    linesMat.delete();
  } catch (err) {
    console.error("[FieldDetector] OpenCV detection error:", err);
  }

  return lines;
}

/* ── Merge nearby lines ────────────────────────────────────────── */

/**
 * Merge lines that are very close and nearly parallel.
 * Reduces noise from duplicate detections.
 */
export function mergeNearbyLines(
  lines: DetectedLine[],
  distanceThreshold: number = 20,
  angleThreshold: number = 10,
): DetectedLine[] {
  const merged: DetectedLine[] = [];
  const used = new Set<number>();

  for (let i = 0; i < lines.length; i++) {
    if (used.has(i)) continue;

    const group: DetectedLine[] = [lines[i]];
    used.add(i);

    for (let j = i + 1; j < lines.length; j++) {
      if (used.has(j)) continue;

      const angleDiff = Math.abs(lines[i].angle - lines[j].angle);
      if (angleDiff > angleThreshold && angleDiff < (360 - angleThreshold)) continue;

      // Check midpoint distance
      const mid1x = (lines[i].start[0] + lines[i].end[0]) / 2;
      const mid1y = (lines[i].start[1] + lines[i].end[1]) / 2;
      const mid2x = (lines[j].start[0] + lines[j].end[0]) / 2;
      const mid2y = (lines[j].start[1] + lines[j].end[1]) / 2;

      const dist = Math.sqrt((mid1x - mid2x) ** 2 + (mid1y - mid2y) ** 2);
      if (dist < distanceThreshold) {
        group.push(lines[j]);
        used.add(j);
      }
    }

    // Average the group into one line
    if (group.length === 1) {
      merged.push(group[0]);
    } else {
      const avgStart: [number, number] = [
        Math.round(group.reduce((s, l) => s + l.start[0], 0) / group.length),
        Math.round(group.reduce((s, l) => s + l.start[1], 0) / group.length),
      ];
      const avgEnd: [number, number] = [
        Math.round(group.reduce((s, l) => s + l.end[0], 0) / group.length),
        Math.round(group.reduce((s, l) => s + l.end[1], 0) / group.length),
      ];
      const dx = avgEnd[0] - avgStart[0];
      const dy = avgEnd[1] - avgStart[1];

      merged.push({
        start: avgStart,
        end: avgEnd,
        angle: ((Math.atan2(dy, dx) * (180 / Math.PI)) % 360 + 360) % 360,
        length: Math.round(Math.sqrt(dx * dx + dy * dy)),
        classification: group[0].classification,
        confidence: Math.min(1.0, Math.max(...group.map(l => l.confidence)) + 0.05 * (group.length - 1)),
      });
    }
  }

  return merged;
}

/**
 * Draw detected lines on a canvas for visualization/debug.
 */
export function drawDetectedLines(
  ctx: CanvasRenderingContext2D,
  lines: DetectedLine[],
  showLabels: boolean = true,
): void {
  const colors: Record<LineClass, string> = {
    sideline: "#00ff00",
    goal_line: "#ff0000",
    center_line: "#ffff00",
    penalty_area: "#00ffff",
    goal_area: "#ff00ff",
    center_circle: "#ffa500",
    unknown: "#888888",
  };

  for (const line of lines) {
    ctx.beginPath();
    ctx.strokeStyle = colors[line.classification];
    ctx.lineWidth = 2;
    ctx.moveTo(line.start[0], line.start[1]);
    ctx.lineTo(line.end[0], line.end[1]);
    ctx.stroke();

    if (showLabels && line.classification !== "unknown") {
      const midX = (line.start[0] + line.end[0]) / 2;
      const midY = (line.start[1] + line.end[1]) / 2;
      ctx.fillStyle = colors[line.classification];
      ctx.font = "10px monospace";
      ctx.fillText(
        `${line.classification} (${(line.confidence * 100).toFixed(0)}%)`,
        midX,
        midY - 5,
      );
    }
  }
}

/* ── Video-specific convenience functions (Sprint 0 — UX 1-Click) ── */

/**
 * Detect field lines from a video element by capturing a frame at 20% playback.
 * Convenience wrapper for the 1-Click analysis pipeline.
 *
 * @param video - HTMLVideoElement (must have readyState >= 2)
 * @param config - Optional detector config overrides
 * @returns FieldDetectionResult or null if capture fails
 */
export async function detectFieldLinesFromVideo(
  video: HTMLVideoElement,
  config?: Partial<FieldDetectorConfig>,
): Promise<FieldDetectionResult | null> {
  if (!video || video.readyState < 2) return null;

  try {
    // Seek to 20% of video duration for a representative frame
    const targetTime = (video.duration || 0) * 0.2;
    if (targetTime > 0 && Math.abs(video.currentTime - targetTime) > 0.5) {
      video.currentTime = targetTime;
      await new Promise<void>((resolve) => {
        const onSeeked = () => { video.removeEventListener("seeked", onSeeked); resolve(); };
        video.addEventListener("seeked", onSeeked);
        setTimeout(resolve, 2000);
      });
    }

    // Capture frame
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

    return await detectFieldLines(imageData, config);
  } catch (err) {
    console.warn("[fieldLineDetector] detectFieldLinesFromVideo failed:", err);
    return null;
  }
}
