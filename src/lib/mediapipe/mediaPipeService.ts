/**
 * VITAS · MediaPipe Pose Service
 *
 * Client-side pose estimation using Google MediaPipe Pose Landmarker.
 * Runs entirely in the browser — zero API costs, RGPD compliant (no data leaves device).
 *
 * Returns 33 BlazePose keypoints per person (vs 17 COCO from YOLO):
 *   - Full body: head, torso, arms, legs
 *   - Hands: wrists + basic hand landmarks
 *   - Feet: ankles + heel + toe tips
 *   - 3D world landmarks (x, y, z in meters) for true joint angles
 *
 * Usage:
 *   const service = getMediaPipeService();
 *   await service.initialize();
 *   const result = await service.detectPose(videoFrame);
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface BlazePoseKeypoint {
  /** X position normalized 0-1 (image space) */
  x: number;
  /** Y position normalized 0-1 (image space) */
  y: number;
  /** Z position (depth, in meters from camera) */
  z: number;
  /** Detection confidence 0-1 */
  visibility: number;
  /** Keypoint name */
  name: string;
}

export interface PoseDetectionResult {
  /** 33 BlazePose keypoints in image coordinates (normalized 0-1) */
  landmarks: BlazePoseKeypoint[];
  /** 33 BlazePose keypoints in world coordinates (meters, origin at hip center) */
  worldLandmarks: BlazePoseKeypoint[];
  /** Segmentation mask (if enabled) */
  segmentationMask?: ImageData;
  /** Detection confidence 0-1 */
  confidence: number;
  /** Processing time in ms */
  inferenceTimeMs: number;
}

export interface MultiPoseResult {
  /** All detected persons */
  persons: PoseDetectionResult[];
  /** Total processing time */
  totalTimeMs: number;
  /** Frame timestamp */
  timestampMs: number;
}

export interface MediaPipeConfig {
  /** Model complexity: 0=lite, 1=full, 2=heavy (default: 1) */
  modelComplexity: 0 | 1 | 2;
  /** Enable segmentation mask output (default: false) */
  enableSegmentation: boolean;
  /** Minimum detection confidence (default: 0.5) */
  minDetectionConfidence: number;
  /** Minimum tracking confidence (default: 0.5) */
  minTrackingConfidence: number;
  /** Maximum number of poses to detect (default: 4) */
  maxNumPoses: number;
  /** Use GPU delegate if available (default: true) */
  useGpu: boolean;
}

/* ── BlazePose 33 Keypoint Names ───────────────────────────────── */

export const BLAZEPOSE_KEYPOINTS = [
  "nose",                    // 0
  "left_eye_inner",          // 1
  "left_eye",                // 2
  "left_eye_outer",          // 3
  "right_eye_inner",         // 4
  "right_eye",               // 5
  "right_eye_outer",         // 6
  "left_ear",                // 7
  "right_ear",               // 8
  "mouth_left",              // 9
  "mouth_right",             // 10
  "left_shoulder",           // 11
  "right_shoulder",          // 12
  "left_elbow",              // 13
  "right_elbow",             // 14
  "left_wrist",              // 15
  "right_wrist",             // 16
  "left_pinky",              // 17
  "right_pinky",             // 18
  "left_index",              // 19
  "right_index",             // 20
  "left_thumb",              // 21
  "right_thumb",             // 22
  "left_hip",                // 23
  "right_hip",               // 24
  "left_knee",               // 25
  "right_knee",              // 26
  "left_ankle",              // 27
  "right_ankle",             // 28
  "left_heel",               // 29
  "right_heel",              // 30
  "left_foot_index",         // 31
  "right_foot_index",        // 32
] as const;

export type BlazePoseKeypointName = typeof BLAZEPOSE_KEYPOINTS[number];

/* ── Default Config ────────────────────────────────────────────── */

const DEFAULT_CONFIG: MediaPipeConfig = {
  modelComplexity: 1,
  enableSegmentation: false,
  minDetectionConfidence: 0.5,
  minTrackingConfidence: 0.5,
  maxNumPoses: 4,
  useGpu: true,
};

/* ── CDN Model URLs (pinned versions — NEVER use @latest) ────── */

/** Pinned to 0.10.14 — last verified stable release for PoseLandmarker */
const MEDIAPIPE_VISION_VERSION = "0.10.14";
const VISION_WASM_CDN = `https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@${MEDIAPIPE_VISION_VERSION}/wasm`;
const POSE_MODEL_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_full/float16/1/pose_landmarker_full.task";
const POSE_MODEL_LITE_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task";
const POSE_MODEL_HEAVY_URL = "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_heavy/float16/1/pose_landmarker_heavy.task";

/* ── Service ───────────────────────────────────────────────────── */

export class MediaPipeService {
  private config: MediaPipeConfig;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private poseLandmarker: any = null;
  private initialized = false;
  private initializing = false;

  constructor(config?: Partial<MediaPipeConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Check if the service is ready to process frames */
  get isReady(): boolean {
    return this.initialized && this.poseLandmarker !== null;
  }

  /** Initialize MediaPipe Pose Landmarker — downloads model on first call */
  async initialize(): Promise<boolean> {
    if (this.initialized) return true;
    if (this.initializing) {
      // Wait for existing initialization
      while (this.initializing) {
        await new Promise(r => setTimeout(r, 100));
      }
      return this.initialized;
    }

    this.initializing = true;

    try {
      // Dynamic import of @mediapipe/tasks-vision
      const vision = await import("@mediapipe/tasks-vision");
      const { PoseLandmarker, FilesetResolver } = vision;

      // Load WASM files
      const filesetResolver = await FilesetResolver.forVisionTasks(VISION_WASM_CDN);

      // Select model based on complexity
      const modelUrl = this.config.modelComplexity === 0
        ? POSE_MODEL_LITE_URL
        : this.config.modelComplexity === 2
          ? POSE_MODEL_HEAVY_URL
          : POSE_MODEL_URL;

      // Create pose landmarker
      this.poseLandmarker = await PoseLandmarker.createFromOptions(filesetResolver, {
        baseOptions: {
          modelAssetPath: modelUrl,
          delegate: this.config.useGpu ? "GPU" : "CPU",
        },
        runningMode: "VIDEO",
        numPoses: this.config.maxNumPoses,
        minPoseDetectionConfidence: this.config.minDetectionConfidence,
        minTrackingConfidence: this.config.minTrackingConfidence,
        outputSegmentationMasks: this.config.enableSegmentation,
      });

      this.initialized = true;
      console.log(`[MediaPipe] Initialized (model: ${this.config.modelComplexity === 0 ? "lite" : this.config.modelComplexity === 2 ? "heavy" : "full"}, GPU: ${this.config.useGpu})`);
      return true;
    } catch (err) {
      console.error("[MediaPipe] Initialization failed:", err);
      this.initialized = false;
      return false;
    } finally {
      this.initializing = false;
    }
  }

  /**
   * Detect poses in a video frame.
   * The video element must be currently displaying the frame to analyze.
   */
  detectFromVideo(
    videoElement: HTMLVideoElement,
    timestampMs: number,
  ): MultiPoseResult {
    if (!this.poseLandmarker) {
      return { persons: [], totalTimeMs: 0, timestampMs };
    }

    const start = performance.now();

    try {
      const mpResult = this.poseLandmarker.detectForVideo(videoElement, timestampMs);
      const totalTimeMs = performance.now() - start;

      const persons: PoseDetectionResult[] = [];

      if (mpResult.landmarks) {
        for (let i = 0; i < mpResult.landmarks.length; i++) {
          const landmarks = mpResult.landmarks[i];
          const worldLandmarks = mpResult.worldLandmarks?.[i] ?? [];

          // Convert to our format
          const kps: BlazePoseKeypoint[] = landmarks.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (lm: any, idx: number) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z ?? 0,
              visibility: lm.visibility ?? 0,
              name: BLAZEPOSE_KEYPOINTS[idx] ?? `kp_${idx}`,
            }),
          );

          const worldKps: BlazePoseKeypoint[] = worldLandmarks.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (lm: any, idx: number) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z ?? 0,
              visibility: lm.visibility ?? 0,
              name: BLAZEPOSE_KEYPOINTS[idx] ?? `kp_${idx}`,
            }),
          );

          // Average visibility as confidence
          const avgVis = kps.reduce((s, k) => s + k.visibility, 0) / Math.max(1, kps.length);

          persons.push({
            landmarks: kps,
            worldLandmarks: worldKps,
            confidence: avgVis,
            inferenceTimeMs: totalTimeMs / Math.max(1, mpResult.landmarks.length),
          });
        }
      }

      return { persons, totalTimeMs, timestampMs };
    } catch (err) {
      console.error("[MediaPipe] Detection error:", err);
      return { persons: [], totalTimeMs: performance.now() - start, timestampMs };
    }
  }

  /**
   * Detect poses in a single image (not video sequence).
   * Use for individual frame analysis.
   */
  detectFromImage(
    imageSource: HTMLImageElement | HTMLCanvasElement | ImageBitmap,
  ): MultiPoseResult {
    if (!this.poseLandmarker) {
      return { persons: [], totalTimeMs: 0, timestampMs: 0 };
    }

    const start = performance.now();

    try {
      // Switch to IMAGE mode temporarily
      this.poseLandmarker.setOptions({ runningMode: "IMAGE" });
      const mpResult = this.poseLandmarker.detect(imageSource);
      // Switch back to VIDEO mode
      this.poseLandmarker.setOptions({ runningMode: "VIDEO" });

      const totalTimeMs = performance.now() - start;
      const persons: PoseDetectionResult[] = [];

      if (mpResult.landmarks) {
        for (let i = 0; i < mpResult.landmarks.length; i++) {
          const landmarks = mpResult.landmarks[i];
          const worldLandmarks = mpResult.worldLandmarks?.[i] ?? [];

          const kps: BlazePoseKeypoint[] = landmarks.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (lm: any, idx: number) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z ?? 0,
              visibility: lm.visibility ?? 0,
              name: BLAZEPOSE_KEYPOINTS[idx] ?? `kp_${idx}`,
            }),
          );

          const worldKps: BlazePoseKeypoint[] = worldLandmarks.map(
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            (lm: any, idx: number) => ({
              x: lm.x,
              y: lm.y,
              z: lm.z ?? 0,
              visibility: lm.visibility ?? 0,
              name: BLAZEPOSE_KEYPOINTS[idx] ?? `kp_${idx}`,
            }),
          );

          const avgVis = kps.reduce((s, k) => s + k.visibility, 0) / Math.max(1, kps.length);

          persons.push({
            landmarks: kps,
            worldLandmarks: worldKps,
            confidence: avgVis,
            inferenceTimeMs: totalTimeMs / Math.max(1, mpResult.landmarks.length),
          });
        }
      }

      return { persons, totalTimeMs, timestampMs: 0 };
    } catch (err) {
      console.error("[MediaPipe] Image detection error:", err);
      return { persons: [], totalTimeMs: performance.now() - start, timestampMs: 0 };
    }
  }

  /** Get current FPS capability based on last inference times */
  estimateFps(recentTimesMs: number[]): number {
    if (recentTimesMs.length === 0) return 0;
    const avgMs = recentTimesMs.reduce((s, t) => s + t, 0) / recentTimesMs.length;
    return avgMs > 0 ? Math.round(1000 / avgMs) : 0;
  }

  /** Release resources */
  dispose(): void {
    if (this.poseLandmarker) {
      this.poseLandmarker.close();
      this.poseLandmarker = null;
    }
    this.initialized = false;
    console.log("[MediaPipe] Disposed");
  }
}

/* ── Singleton ─────────────────────────────────────────────────── */

let _instance: MediaPipeService | null = null;

export function getMediaPipeService(config?: Partial<MediaPipeConfig>): MediaPipeService {
  if (!_instance || config) {
    _instance?.dispose();
    _instance = new MediaPipeService(config);
  }
  return _instance;
}
