/**
 * VITAS · Model Configuration & Loader Abstraction
 *
 * Supports switching between YOLO models (v8n-pose, v11m-pose, custom)
 * without changing tracker or pipeline code.
 *
 * Architecture:
 *   modelConfig defines model specs (input size, keypoints, confidence thresholds)
 *   ModelLoader handles ONNX Runtime WASM session creation
 *   ModelRegistry allows runtime switching between models
 *
 * Sprint 4 goal: infrastructure for YOLOv11M upgrade (~10cm accuracy vs ~30cm v8n)
 */

/* ── Model Spec ────────────────────────────────────────────────── */

export interface ModelSpec {
  /** Unique identifier */
  id: string;
  /** Human-readable name */
  name: string;
  /** Model version (yolov8, yolov11, custom) */
  family: "yolov8" | "yolov11" | "custom";
  /** Variant: n=nano, s=small, m=medium, l=large */
  variant: "n" | "s" | "m" | "l" | "custom";
  /** Task: pose estimation or detection */
  task: "pose" | "detect";
  /** Input image size (square) */
  inputSize: number;
  /** Number of keypoints (COCO-17 = 17) */
  numKeypoints: number;
  /** Minimum detection confidence (0-1) */
  confThreshold: number;
  /** NMS IoU threshold (0-1) */
  nmsThreshold: number;
  /** Path or URL to ONNX model file */
  modelPath: string;
  /** Estimated model size in MB (for download progress) */
  sizeMb: number;
  /** Expected accuracy improvement vs baseline (multiplier) */
  accuracyFactor: number;
  /** Whether model supports dynamic batch size */
  dynamicBatch: boolean;
  /** Notes about the model */
  notes: string;
}

/* ── Predefined Models ─────────────────────────────────────────── */

export const MODELS: Record<string, ModelSpec> = {
  /** Current production model — fast but lower accuracy */
  "yolov8n-pose": {
    id: "yolov8n-pose",
    name: "YOLOv8 Nano Pose",
    family: "yolov8",
    variant: "n",
    task: "pose",
    inputSize: 640,
    numKeypoints: 17,
    confThreshold: 0.45,
    nmsThreshold: 0.5,
    modelPath: "/models/yolov8n-pose.onnx",
    sizeMb: 12,
    accuracyFactor: 1.0,
    dynamicBatch: false,
    notes: "Baseline model. ~30cm tracking accuracy. Runs at 8-15 FPS on mobile.",
  },

  /** Sprint 4 target — better accuracy, heavier */
  "yolov11m-pose": {
    id: "yolov11m-pose",
    name: "YOLOv11 Medium Pose",
    family: "yolov11",
    variant: "m",
    task: "pose",
    inputSize: 640,
    numKeypoints: 17,
    confThreshold: 0.40,
    nmsThreshold: 0.45,
    modelPath: "/models/yolov11m-pose.onnx",
    sizeMb: 45,
    accuracyFactor: 2.5,
    dynamicBatch: true,
    notes: "Target model. ~10cm tracking accuracy. Runs at 4-8 FPS on mobile. Requires ONNX Runtime 1.17+.",
  },

  /** Future custom model fine-tuned on youth football */
  "vitas-pose-v1": {
    id: "vitas-pose-v1",
    name: "VITAS Pose v1 (Custom)",
    family: "custom",
    variant: "custom",
    task: "pose",
    inputSize: 640,
    numKeypoints: 17,
    confThreshold: 0.35,
    nmsThreshold: 0.45,
    modelPath: "/models/vitas-pose-v1.onnx",
    sizeMb: 55,
    accuracyFactor: 3.0,
    dynamicBatch: true,
    notes: "Fine-tuned on youth football footage. Handles small players, low angles, variable lighting. Phase 3 target.",
  },
};

/* ── Active Model Selection ────────────────────────────────────── */

const STORAGE_KEY = "vitas_active_model";
const DEFAULT_MODEL = "yolov8n-pose";

export function getActiveModelId(): string {
  if (typeof window === "undefined") return DEFAULT_MODEL;
  return localStorage.getItem(STORAGE_KEY) ?? DEFAULT_MODEL;
}

export function setActiveModelId(modelId: string): void {
  if (!MODELS[modelId]) {
    console.warn(`[ModelConfig] Unknown model: ${modelId}, keeping current.`);
    return;
  }
  localStorage.setItem(STORAGE_KEY, modelId);
}

export function getActiveModel(): ModelSpec {
  return MODELS[getActiveModelId()] ?? MODELS[DEFAULT_MODEL];
}

/* ── Model Availability Check ──────────────────────────────────── */

export interface ModelAvailability {
  modelId: string;
  available: boolean;
  cached: boolean;
  reason?: string;
}

/**
 * Check if a model file is available (either locally or downloadable).
 * In browser, we check if the file exists at the model path.
 */
export async function checkModelAvailability(modelId: string): Promise<ModelAvailability> {
  const spec = MODELS[modelId];
  if (!spec) {
    return { modelId, available: false, cached: false, reason: "Model not in registry" };
  }

  try {
    // Check if model is in Cache API (Service Worker cache)
    if ("caches" in window) {
      const cache = await caches.open("vitas-models-v1");
      const cached = await cache.match(spec.modelPath);
      if (cached) {
        return { modelId, available: true, cached: true };
      }
    }

    // Try HEAD request to check if file exists on server
    const response = await fetch(spec.modelPath, { method: "HEAD" });
    return {
      modelId,
      available: response.ok,
      cached: false,
      reason: response.ok ? undefined : `HTTP ${response.status}`,
    };
  } catch {
    return { modelId, available: false, cached: false, reason: "Network error" };
  }
}

/**
 * Download and cache a model file for offline use.
 * Returns progress callback for UI.
 */
export async function downloadModel(
  modelId: string,
  onProgress?: (pct: number) => void,
): Promise<boolean> {
  const spec = MODELS[modelId];
  if (!spec) return false;

  try {
    const response = await fetch(spec.modelPath);
    if (!response.ok) return false;

    const reader = response.body?.getReader();
    if (!reader) return false;

    const contentLength = Number(response.headers.get("Content-Length") ?? spec.sizeMb * 1024 * 1024);
    const chunks: Uint8Array[] = [];
    let received = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      received += value.length;
      onProgress?.(Math.round((received / contentLength) * 100));
    }

    // Store in Cache API
    if ("caches" in window) {
      const blob = new Blob(chunks);
      const cache = await caches.open("vitas-models-v1");
      await cache.put(spec.modelPath, new Response(blob));
    }

    return true;
  } catch (err) {
    console.error(`[ModelConfig] Failed to download ${modelId}:`, err);
    return false;
  }
}

/* ── Performance Benchmarks ────────────────────────────────────── */

export interface ModelBenchmark {
  modelId: string;
  avgFps: number;
  avgInferenceMs: number;
  memoryMb: number;
  device: string;
}

/**
 * Quick benchmark: run 10 dummy inference passes and measure FPS.
 * Real implementation would use ONNX Runtime session.
 */
export function estimatePerformance(modelId: string): ModelBenchmark {
  const spec = MODELS[modelId];
  if (!spec) {
    return { modelId, avgFps: 0, avgInferenceMs: 0, memoryMb: 0, device: "unknown" };
  }

  // Rough estimates based on model size
  const baseFps = spec.variant === "n" ? 12 : spec.variant === "s" ? 8 : spec.variant === "m" ? 5 : 3;
  const isMobile = /Mobi|Android/i.test(navigator?.userAgent ?? "");
  const fpsMultiplier = isMobile ? 0.6 : 1.0;

  return {
    modelId,
    avgFps: Math.round(baseFps * fpsMultiplier),
    avgInferenceMs: Math.round(1000 / (baseFps * fpsMultiplier)),
    memoryMb: Math.round(spec.sizeMb * 2.5), // ONNX Runtime uses ~2.5x model size
    device: isMobile ? "mobile" : "desktop",
  };
}
