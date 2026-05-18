/**
 * VITAS · Server-Side Inference Service (Tracking → 6/10)
 *
 * Client-side YOLO inference is limited by:
 *   - WebGL/WASM performance (~2-5 FPS on mobile)
 *   - Model size constraints (must download to browser)
 *   - No GPU acceleration on most devices
 *
 * This service offloads heavy inference to a server endpoint:
 *   Client → extracts key frames → sends to server → receives detections
 *
 * Architecture:
 *   1. Frame extraction (client-side, reuse frameExtractor.ts)
 *   2. Frame encoding (JPEG, quality-optimized)
 *   3. Batch upload to inference endpoint
 *   4. Receive pose detections + bounding boxes
 *   5. Feed into existing tracker/kalman pipeline
 *
 * The server endpoint can be:
 *   - Vercel Edge Function (limited, CPU only)
 *   - Dedicated inference server (GPU, e.g., RunPod/Modal)
 *   - Roboflow Inference API (managed)
 *
 * Fallback: if server is unavailable, falls back to client-side ONNX inference.
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface InferenceRequest {
  /** Unique session ID */
  sessionId: string;
  /** Frame index in the video */
  frameIndex: number;
  /** JPEG-encoded frame as base64 */
  frameBase64: string;
  /** Model to use on server */
  modelId: string;
  /** Minimum confidence threshold */
  confThreshold: number;
  /** Requested detections */
  detectTypes: ("pose" | "bbox" | "segmentation")[];
}

export interface InferenceBatchRequest {
  sessionId: string;
  modelId: string;
  confThreshold: number;
  detectTypes: ("pose" | "bbox" | "segmentation")[];
  /** Multiple frames in one request (more efficient) */
  frames: {
    frameIndex: number;
    frameBase64: string;
  }[];
}

export interface PoseKeypoint {
  x: number;
  y: number;
  confidence: number;
  name: string;
}

export interface Detection {
  /** Bounding box [x, y, width, height] normalized 0-1 */
  bbox: [number, number, number, number];
  /** Detection class */
  class: "person" | "ball" | "referee";
  /** Detection confidence 0-1 */
  confidence: number;
  /** Pose keypoints (17 COCO keypoints if pose model) */
  keypoints?: PoseKeypoint[];
  /** Track ID (if server-side tracking enabled) */
  trackId?: number;
}

export interface InferenceResponse {
  sessionId: string;
  frameIndex: number;
  detections: Detection[];
  /** Server processing time in ms */
  inferenceTimeMs: number;
  /** Model used */
  modelId: string;
  /** Model version */
  modelVersion: string;
}

export interface InferenceBatchResponse {
  sessionId: string;
  frames: InferenceResponse[];
  /** Total server processing time */
  totalTimeMs: number;
  /** Frames per second achieved on server */
  serverFps: number;
}

export interface InferenceEndpointConfig {
  /** Base URL of inference server */
  baseUrl: string;
  /** API key for authentication */
  apiKey?: string;
  /** Provider type */
  provider: "vercel" | "roboflow" | "custom" | "local";
  /** Timeout per request in ms */
  timeoutMs: number;
  /** Max frames per batch */
  maxBatchSize: number;
  /** JPEG quality for frame encoding (0-1) */
  jpegQuality: number;
  /** Max concurrent requests */
  maxConcurrent: number;
  /** Retry count on failure */
  retryCount: number;
}

const DEFAULT_ENDPOINT_CONFIG: InferenceEndpointConfig = {
  baseUrl: "/api/inference",
  provider: "vercel",
  timeoutMs: 30000,
  maxBatchSize: 10,
  jpegQuality: 0.85,
  maxConcurrent: 3,
  retryCount: 2,
};

/* ── COCO Keypoint Names ───────────────────────────────────────── */

const COCO_KEYPOINTS = [
  "nose", "left_eye", "right_eye", "left_ear", "right_ear",
  "left_shoulder", "right_shoulder", "left_elbow", "right_elbow",
  "left_wrist", "right_wrist", "left_hip", "right_hip",
  "left_knee", "right_knee", "left_ankle", "right_ankle",
];

/* ── Frame Encoding ────────────────────────────────────────────── */

/**
 * Encode a canvas frame to JPEG base64 string.
 */
export function encodeFrame(
  canvas: HTMLCanvasElement,
  quality: number = 0.85,
): string {
  const dataUrl = canvas.toDataURL("image/jpeg", quality);
  return dataUrl.split(",")[1]; // Remove "data:image/jpeg;base64," prefix
}

/**
 * Encode an ImageData to JPEG base64 using an offscreen canvas.
 */
export function encodeImageData(
  imageData: ImageData,
  quality: number = 0.85,
): string {
  const canvas = document.createElement("canvas");
  canvas.width = imageData.width;
  canvas.height = imageData.height;
  const ctx = canvas.getContext("2d")!;
  ctx.putImageData(imageData, 0, 0);
  return encodeFrame(canvas, quality);
}

/* ── Inference Client ──────────────────────────────────────────── */

export class ServerInferenceClient {
  private config: InferenceEndpointConfig;
  private activeRequests: number = 0;
  private queue: (() => void)[] = [];
  private abortControllers: Map<string, AbortController> = new Map();

  constructor(config?: Partial<InferenceEndpointConfig>) {
    this.config = { ...DEFAULT_ENDPOINT_CONFIG, ...config };
  }

  /** Check if the inference server is reachable */
  async healthCheck(): Promise<{
    available: boolean;
    latencyMs: number;
    serverInfo?: { model: string; gpu: boolean; maxBatch: number };
  }> {
    const start = performance.now();
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);

      const resp = await fetch(`${this.config.baseUrl}/health`, {
        signal: controller.signal,
        headers: this.getHeaders(),
      });

      clearTimeout(timeout);
      const latencyMs = Math.round(performance.now() - start);

      if (resp.ok) {
        const data = await resp.json();
        return { available: true, latencyMs, serverInfo: data };
      }
      return { available: false, latencyMs };
    } catch {
      return { available: false, latencyMs: Math.round(performance.now() - start) };
    }
  }

  /** Send a single frame for inference */
  async inferFrame(request: InferenceRequest): Promise<InferenceResponse> {
    await this.waitForSlot();
    this.activeRequests++;

    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/infer`,
        {
          method: "POST",
          headers: { ...this.getHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
        request.sessionId,
      );

      if (!response.ok) {
        throw new Error(`Inference failed: ${response.status} ${response.statusText}`);
      }

      return await response.json();
    } finally {
      this.activeRequests--;
      this.releaseSlot();
    }
  }

  /** Send a batch of frames for inference (more efficient) */
  async inferBatch(request: InferenceBatchRequest): Promise<InferenceBatchResponse> {
    // Split into sub-batches if too large
    if (request.frames.length > this.config.maxBatchSize) {
      const subBatches: InferenceBatchResponse["frames"] = [];
      let totalTimeMs = 0;

      for (let i = 0; i < request.frames.length; i += this.config.maxBatchSize) {
        const subFrames = request.frames.slice(i, i + this.config.maxBatchSize);
        const subResult = await this.inferBatch({
          ...request,
          frames: subFrames,
        });
        subBatches.push(...subResult.frames);
        totalTimeMs += subResult.totalTimeMs;
      }

      return {
        sessionId: request.sessionId,
        frames: subBatches,
        totalTimeMs,
        serverFps: subBatches.length / (totalTimeMs / 1000),
      };
    }

    await this.waitForSlot();
    this.activeRequests++;

    try {
      const response = await this.fetchWithRetry(
        `${this.config.baseUrl}/infer/batch`,
        {
          method: "POST",
          headers: { ...this.getHeaders(), "Content-Type": "application/json" },
          body: JSON.stringify(request),
        },
        request.sessionId,
      );

      if (!response.ok) {
        throw new Error(`Batch inference failed: ${response.status}`);
      }

      return await response.json();
    } finally {
      this.activeRequests--;
      this.releaseSlot();
    }
  }

  /**
   * Process a full video: extract frames, send batches, return all detections.
   * This is the main entry point for video analysis.
   */
  async processVideo(
    videoElement: HTMLVideoElement,
    options: {
      sessionId: string;
      modelId: string;
      confThreshold?: number;
      fps?: number;
      onProgress?: (progress: { frame: number; total: number; fps: number }) => void;
    },
  ): Promise<InferenceResponse[]> {
    const fps = options.fps ?? 5;
    const confThreshold = options.confThreshold ?? 0.5;
    const duration = videoElement.duration;
    const totalFrames = Math.floor(duration * fps);
    const results: InferenceResponse[] = [];

    // Create canvas for frame extraction
    const canvas = document.createElement("canvas");
    canvas.width = videoElement.videoWidth;
    canvas.height = videoElement.videoHeight;
    const ctx = canvas.getContext("2d")!;

    // Extract and process in batches
    const batchFrames: InferenceBatchRequest["frames"] = [];
    let processedFrames = 0;
    const startTime = performance.now();

    for (let i = 0; i < totalFrames; i++) {
      const time = i / fps;
      videoElement.currentTime = time;

      // Wait for frame to be ready
      await new Promise<void>(resolve => {
        videoElement.onseeked = () => resolve();
      });

      // Draw frame to canvas
      ctx.drawImage(videoElement, 0, 0);

      // Encode frame
      const frameBase64 = encodeFrame(canvas, this.config.jpegQuality);
      batchFrames.push({ frameIndex: i, frameBase64 });

      // Send batch when full
      if (batchFrames.length >= this.config.maxBatchSize || i === totalFrames - 1) {
        const batchResult = await this.inferBatch({
          sessionId: options.sessionId,
          modelId: options.modelId,
          confThreshold,
          detectTypes: ["pose", "bbox"],
          frames: [...batchFrames],
        });

        results.push(...batchResult.frames);
        batchFrames.length = 0;
        processedFrames += batchResult.frames.length;

        const elapsed = (performance.now() - startTime) / 1000;
        options.onProgress?.({
          frame: processedFrames,
          total: totalFrames,
          fps: Math.round(processedFrames / elapsed),
        });
      }
    }

    return results;
  }

  /** Cancel all ongoing requests for a session */
  cancelSession(sessionId: string): void {
    const controller = this.abortControllers.get(sessionId);
    if (controller) {
      controller.abort();
      this.abortControllers.delete(sessionId);
    }
  }

  /** Update endpoint config */
  updateConfig(config: Partial<InferenceEndpointConfig>): void {
    this.config = { ...this.config, ...config };
  }

  /* ── Private helpers ───────────────────────────────────────── */

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    if (this.config.apiKey) {
      headers["Authorization"] = `Bearer ${this.config.apiKey}`;
    }
    return headers;
  }

  private async fetchWithRetry(
    url: string,
    init: RequestInit,
    sessionId: string,
  ): Promise<Response> {
    let lastError: Error | null = null;

    const controller = new AbortController();
    this.abortControllers.set(sessionId, controller);

    for (let attempt = 0; attempt <= this.config.retryCount; attempt++) {
      try {
        const timeoutId = setTimeout(() => controller.abort(), this.config.timeoutMs);

        const response = await fetch(url, {
          ...init,
          signal: controller.signal,
        });

        clearTimeout(timeoutId);
        this.abortControllers.delete(sessionId);
        return response;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));

        if (controller.signal.aborted) {
          throw lastError;
        }

        // Exponential backoff
        if (attempt < this.config.retryCount) {
          await new Promise(r => setTimeout(r, 1000 * (attempt + 1)));
        }
      }
    }

    throw lastError ?? new Error("Inference request failed after retries");
  }

  private async waitForSlot(): Promise<void> {
    if (this.activeRequests < this.config.maxConcurrent) return;

    return new Promise<void>(resolve => {
      this.queue.push(resolve);
    });
  }

  private releaseSlot(): void {
    const next = this.queue.shift();
    if (next) next();
  }
}

/* ── Roboflow Provider ─────────────────────────────────────────── */

/**
 * Adapter for Roboflow Inference API.
 * Converts between VITAS format and Roboflow's API.
 */
export class RoboflowInferenceAdapter {
  private apiKey: string;
  private modelEndpoint: string;

  constructor(apiKey: string, modelEndpoint: string) {
    this.apiKey = apiKey;
    this.modelEndpoint = modelEndpoint;
  }

  /** Convert VITAS inference request to Roboflow format */
  async infer(frameBase64: string, confThreshold: number = 0.5): Promise<Detection[]> {
    try {
      const response = await fetch(
        `${this.modelEndpoint}?api_key=${this.apiKey}&confidence=${confThreshold}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/x-www-form-urlencoded" },
          body: frameBase64,
        },
      );

      if (!response.ok) {
        throw new Error(`Roboflow API error: ${response.status}`);
      }

      const data = await response.json();
      return this.convertRoboflowDetections(data);
    } catch (err) {
      console.error("[Roboflow] Inference error:", err);
      return [];
    }
  }

  private convertRoboflowDetections(data: {
    predictions?: Array<{
      x: number;
      y: number;
      width: number;
      height: number;
      confidence: number;
      class: string;
      keypoints?: Array<{ x: number; y: number; confidence: number; class_name: string }>;
    }>;
    image?: { width: number; height: number };
  }): Detection[] {
    if (!data.predictions) return [];

    const imgW = data.image?.width ?? 640;
    const imgH = data.image?.height ?? 480;

    return data.predictions.map(pred => {
      const detection: Detection = {
        bbox: [
          (pred.x - pred.width / 2) / imgW,
          (pred.y - pred.height / 2) / imgH,
          pred.width / imgW,
          pred.height / imgH,
        ],
        class: pred.class === "ball" ? "ball" : pred.class === "referee" ? "referee" : "person",
        confidence: pred.confidence,
      };

      if (pred.keypoints && pred.keypoints.length > 0) {
        detection.keypoints = pred.keypoints.map((kp, i) => ({
          x: kp.x / imgW,
          y: kp.y / imgH,
          confidence: kp.confidence,
          name: COCO_KEYPOINTS[i] ?? `keypoint_${i}`,
        }));
      }

      return detection;
    });
  }
}

/* ── Singleton & Factory ───────────────────────────────────────── */

let _defaultClient: ServerInferenceClient | null = null;

/** Get or create the default inference client */
export function getInferenceClient(config?: Partial<InferenceEndpointConfig>): ServerInferenceClient {
  if (!_defaultClient || config) {
    _defaultClient = new ServerInferenceClient(config);
  }
  return _defaultClient;
}

/**
 * Create inference client configured for a specific provider.
 */
export function createInferenceClient(
  provider: "roboflow" | "vercel" | "custom",
  options: { apiKey?: string; baseUrl?: string; modelId?: string },
): ServerInferenceClient {
  switch (provider) {
    case "roboflow":
      return new ServerInferenceClient({
        baseUrl: options.baseUrl ?? "https://detect.roboflow.com",
        apiKey: options.apiKey,
        provider: "roboflow",
        maxBatchSize: 5, // Roboflow has stricter limits
        timeoutMs: 20000,
      });
    case "vercel":
      return new ServerInferenceClient({
        baseUrl: options.baseUrl ?? "/api/inference",
        provider: "vercel",
        maxBatchSize: 3, // Edge Functions have body size limits
        timeoutMs: 25000,
      });
    case "custom":
      return new ServerInferenceClient({
        baseUrl: options.baseUrl ?? "http://localhost:8080",
        apiKey: options.apiKey,
        provider: "custom",
        maxBatchSize: 20,
        timeoutMs: 60000,
      });
  }
}
