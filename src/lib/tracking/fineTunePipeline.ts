/**
 * VITAS · Fine-Tune Pipeline (Tracking → 7/10)
 *
 * Infrastructure for fine-tuning YOLO models on youth football data.
 * Connects to Roboflow (dataset management) + Ultralytics HUB (training).
 *
 * The pipeline:
 *   1. Collect annotated frames from VITAS evaluations
 *   2. Upload to Roboflow for augmentation + versioning
 *   3. Trigger training job on Ultralytics HUB (or custom GPU)
 *   4. Download trained model → register in modelConfig.ts
 *   5. A/B test new model vs current (accuracy comparison)
 *
 * Why fine-tune?
 *   - Generic COCO-trained YOLO misses small players, youth body proportions
 *   - Custom model learns: football-specific poses, pitch context, PHV body types
 *   - Target: 15-25% accuracy improvement over base YOLOv11m
 */

/* ── Types ─────────────────────────────────────────────────────── */

export interface AnnotatedFrame {
  /** Unique frame ID */
  id: string;
  /** Source video ID */
  videoId: string;
  /** Frame index in video */
  frameIndex: number;
  /** Image dimensions */
  width: number;
  height: number;
  /** YOLO-format annotations */
  annotations: YOLOAnnotation[];
  /** Source: auto-detected or human-corrected */
  source: "auto" | "human_corrected" | "manual";
  /** Quality score 0-1 (from videoQualityScore.ts) */
  quality: number;
  /** Metadata */
  metadata: {
    playerAge?: number;
    position?: string;
    phvCategory?: string;
    sessionType?: "training" | "match";
    cameraAngle?: "broadcast" | "tactical" | "close_up";
  };
}

export interface YOLOAnnotation {
  /** Class index (0=person, 1=ball, 2=referee, 3=goalpost) */
  classId: number;
  /** Bounding box [cx, cy, w, h] normalized 0-1 */
  bbox: [number, number, number, number];
  /** Pose keypoints (17 COCO keypoints) [x, y, visibility] */
  keypoints?: [number, number, number][];
  /** Segmentation polygon (normalized) */
  segmentation?: [number, number][];
  /** Confidence of auto-annotation */
  confidence?: number;
}

export interface DatasetConfig {
  /** Dataset name */
  name: string;
  /** Version tag */
  version: string;
  /** Train/val/test split ratios */
  split: { train: number; val: number; test: number };
  /** Minimum quality threshold for frames */
  minQuality: number;
  /** Augmentation settings */
  augmentation: AugmentationConfig;
  /** Class names */
  classes: string[];
}

export interface AugmentationConfig {
  /** Horizontal flip probability */
  flipHorizontal: number;
  /** Brightness adjustment range [-x, +x] */
  brightness: number;
  /** Contrast adjustment range */
  contrast: number;
  /** Rotation range in degrees */
  rotation: number;
  /** Mosaic augmentation */
  mosaic: boolean;
  /** Mixup augmentation */
  mixup: boolean;
  /** Scale range [min, max] */
  scale: [number, number];
  /** HSV hue adjustment */
  hsvHue: number;
  /** HSV saturation adjustment */
  hsvSat: number;
  /** HSV value adjustment */
  hsvVal: number;
}

export interface TrainingConfig {
  /** Base model to fine-tune from */
  baseModel: "yolov8n-pose" | "yolov8s-pose" | "yolov11m-pose" | "yolov11l-pose";
  /** Training epochs */
  epochs: number;
  /** Batch size */
  batchSize: number;
  /** Learning rate */
  learningRate: number;
  /** Image size for training */
  imageSize: number;
  /** Freeze first N layers (transfer learning) */
  freezeLayers: number;
  /** Training device */
  device: "gpu" | "cpu" | "auto";
  /** Patience for early stopping */
  patience: number;
  /** Save best model every N epochs */
  saveInterval: number;
  /** Optimizer */
  optimizer: "AdamW" | "SGD" | "auto";
  /** Weight decay */
  weightDecay: number;
  /** Warmup epochs */
  warmupEpochs: number;
}

export interface TrainingJob {
  /** Job ID */
  id: string;
  /** Status */
  status: "queued" | "preparing" | "training" | "evaluating" | "completed" | "failed";
  /** Progress 0-100 */
  progress: number;
  /** Current epoch */
  currentEpoch: number;
  /** Total epochs */
  totalEpochs: number;
  /** Metrics at current epoch */
  metrics?: TrainingMetrics;
  /** Best metrics across all epochs */
  bestMetrics?: TrainingMetrics;
  /** Start time */
  startedAt?: string;
  /** Estimated completion */
  estimatedCompletion?: string;
  /** Error message (if failed) */
  error?: string;
  /** Provider-specific job URL */
  dashboardUrl?: string;
}

export interface TrainingMetrics {
  /** mean Average Precision at IoU 0.5 */
  mAP50: number;
  /** mean Average Precision at IoU 0.5:0.95 */
  mAP5095: number;
  /** Precision */
  precision: number;
  /** Recall */
  recall: number;
  /** Box loss */
  boxLoss: number;
  /** Pose loss */
  poseLoss: number;
  /** Classification loss */
  clsLoss: number;
  /** Total loss */
  totalLoss: number;
}

export interface ABTestResult {
  /** Comparison ID */
  id: string;
  /** Model A (current) */
  modelA: { id: string; name: string };
  /** Model B (new fine-tuned) */
  modelB: { id: string; name: string };
  /** Test dataset size */
  testFrames: number;
  /** Model A metrics */
  metricsA: { mAP50: number; fps: number; poseAccuracy: number };
  /** Model B metrics */
  metricsB: { mAP50: number; fps: number; poseAccuracy: number };
  /** Winner: A, B, or tie */
  winner: "A" | "B" | "tie";
  /** Improvement percentage */
  improvement: { mAP50: number; fps: number; poseAccuracy: number };
  /** Recommendation */
  recommendation: "deploy" | "retrain" | "keep_current";
}

/* ── Default Configs ───────────────────────────────────────────── */

const DEFAULT_DATASET_CONFIG: DatasetConfig = {
  name: "vitas-youth-football",
  version: "1.0",
  split: { train: 0.7, val: 0.2, test: 0.1 },
  minQuality: 0.4,
  augmentation: {
    flipHorizontal: 0.5,
    brightness: 0.15,
    contrast: 0.15,
    rotation: 5,
    mosaic: true,
    mixup: false,
    scale: [0.5, 1.5],
    hsvHue: 0.015,
    hsvSat: 0.7,
    hsvVal: 0.4,
  },
  classes: ["person", "ball", "referee", "goalpost"],
};

const DEFAULT_TRAINING_CONFIG: TrainingConfig = {
  baseModel: "yolov11m-pose",
  epochs: 100,
  batchSize: 16,
  learningRate: 0.001,
  imageSize: 640,
  freezeLayers: 10, // Freeze backbone, train head
  device: "auto",
  patience: 15,
  saveInterval: 10,
  optimizer: "AdamW",
  weightDecay: 0.0005,
  warmupEpochs: 3,
};

/* ── Annotation Collector ──────────────────────────────────────── */

/**
 * Collects and stores annotated frames from VITAS evaluations.
 * These frames are the training data for fine-tuning.
 */
export class AnnotationCollector {
  private frames: AnnotatedFrame[] = [];
  private readonly storageKey = "vitas_training_annotations";

  constructor() {
    this.loadFromStorage();
  }

  /** Add a frame from auto-detection (YOLO inference result) */
  addAutoAnnotated(
    videoId: string,
    frameIndex: number,
    width: number,
    height: number,
    detections: { bbox: [number, number, number, number]; classId: number; confidence: number; keypoints?: [number, number, number][] }[],
    metadata?: AnnotatedFrame["metadata"],
  ): void {
    const frame: AnnotatedFrame = {
      id: `${videoId}_f${frameIndex}`,
      videoId,
      frameIndex,
      width,
      height,
      annotations: detections
        .filter(d => d.confidence >= 0.5) // Only confident detections
        .map(d => ({
          classId: d.classId,
          bbox: d.bbox,
          keypoints: d.keypoints,
          confidence: d.confidence,
        })),
      source: "auto",
      quality: 0.7, // Auto-annotated default quality
      metadata: metadata ?? {},
    };

    this.frames.push(frame);
    this.saveToStorage();
  }

  /** Add a human-corrected frame (higher quality training data) */
  addHumanCorrected(frame: AnnotatedFrame): void {
    frame.source = "human_corrected";
    frame.quality = Math.max(frame.quality, 0.9); // Human-corrected = high quality

    // Replace existing if same ID
    const existingIdx = this.frames.findIndex(f => f.id === frame.id);
    if (existingIdx >= 0) {
      this.frames[existingIdx] = frame;
    } else {
      this.frames.push(frame);
    }

    this.saveToStorage();
  }

  /** Get dataset statistics */
  getStats(): {
    totalFrames: number;
    autoAnnotated: number;
    humanCorrected: number;
    totalAnnotations: number;
    byClass: Record<string, number>;
    avgQuality: number;
    readyForTraining: boolean;
  } {
    const classNames = DEFAULT_DATASET_CONFIG.classes;
    const byClass: Record<string, number> = {};
    classNames.forEach(c => (byClass[c] = 0));

    let totalAnnotations = 0;
    let qualitySum = 0;

    for (const frame of this.frames) {
      qualitySum += frame.quality;
      for (const ann of frame.annotations) {
        totalAnnotations++;
        const className = classNames[ann.classId] ?? "unknown";
        byClass[className] = (byClass[className] ?? 0) + 1;
      }
    }

    return {
      totalFrames: this.frames.length,
      autoAnnotated: this.frames.filter(f => f.source === "auto").length,
      humanCorrected: this.frames.filter(f => f.source === "human_corrected").length,
      totalAnnotations,
      byClass,
      avgQuality: this.frames.length > 0 ? Math.round((qualitySum / this.frames.length) * 100) / 100 : 0,
      readyForTraining: this.frames.length >= 200 && totalAnnotations >= 500,
    };
  }

  /** Export in YOLO format (ready for Roboflow upload) */
  exportYOLOFormat(
    config?: Partial<DatasetConfig>,
  ): {
    train: AnnotatedFrame[];
    val: AnnotatedFrame[];
    test: AnnotatedFrame[];
    yamlConfig: string;
  } {
    const cfg = { ...DEFAULT_DATASET_CONFIG, ...config };

    // Filter by quality
    const qualified = this.frames.filter(f => f.quality >= cfg.minQuality);

    // Shuffle deterministically (using frame ID hash)
    const shuffled = [...qualified].sort((a, b) => simpleHash(a.id) - simpleHash(b.id));

    // Split
    const trainCount = Math.floor(shuffled.length * cfg.split.train);
    const valCount = Math.floor(shuffled.length * cfg.split.val);

    const train = shuffled.slice(0, trainCount);
    const val = shuffled.slice(trainCount, trainCount + valCount);
    const test = shuffled.slice(trainCount + valCount);

    // Generate YOLO dataset YAML
    const yamlConfig = [
      `# VITAS Fine-Tune Dataset ${cfg.version}`,
      `# Generated: ${new Date().toISOString()}`,
      `# Frames: ${qualified.length} (train: ${train.length}, val: ${val.length}, test: ${test.length})`,
      "",
      "path: ./dataset",
      "train: images/train",
      "val: images/val",
      "test: images/test",
      "",
      `nc: ${cfg.classes.length}`,
      `names: [${cfg.classes.map(c => `"${c}"`).join(", ")}]`,
      "",
      "# Keypoints (COCO 17-point format)",
      "kpt_shape: [17, 3]",
    ].join("\n");

    return { train, val, test, yamlConfig };
  }

  /** Get all frames */
  getFrames(): AnnotatedFrame[] {
    return [...this.frames];
  }

  /** Clear all collected frames */
  clear(): void {
    this.frames = [];
    this.saveToStorage();
  }

  private loadFromStorage(): void {
    try {
      const stored = localStorage.getItem(this.storageKey);
      if (stored) {
        this.frames = JSON.parse(stored);
      }
    } catch {
      this.frames = [];
    }
  }

  private saveToStorage(): void {
    try {
      // Only keep the last 2000 frames in localStorage
      const toStore = this.frames.slice(-2000);
      localStorage.setItem(this.storageKey, JSON.stringify(toStore));
    } catch {
      // Storage full — trim more aggressively
      this.frames = this.frames.slice(-500);
      try {
        localStorage.setItem(this.storageKey, JSON.stringify(this.frames));
      } catch { /* ignore */ }
    }
  }
}

/* ── Training Job Manager ──────────────────────────────────────── */

/**
 * Manages training jobs on external providers (Roboflow/Ultralytics/RunPod).
 */
export class TrainingJobManager {
  private apiBaseUrl: string;
  private apiKey: string;

  constructor(apiBaseUrl: string, apiKey: string) {
    this.apiBaseUrl = apiBaseUrl;
    this.apiKey = apiKey;
  }

  /** Start a new training job */
  async startTraining(
    datasetId: string,
    config?: Partial<TrainingConfig>,
  ): Promise<TrainingJob> {
    const cfg = { ...DEFAULT_TRAINING_CONFIG, ...config };

    try {
      const response = await fetch(`${this.apiBaseUrl}/train`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          dataset_id: datasetId,
          base_model: cfg.baseModel,
          epochs: cfg.epochs,
          batch_size: cfg.batchSize,
          learning_rate: cfg.learningRate,
          image_size: cfg.imageSize,
          freeze_layers: cfg.freezeLayers,
          device: cfg.device,
          patience: cfg.patience,
          optimizer: cfg.optimizer,
          weight_decay: cfg.weightDecay,
          warmup_epochs: cfg.warmupEpochs,
        }),
      });

      if (!response.ok) {
        throw new Error(`Training start failed: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      return {
        id: `local_${Date.now()}`,
        status: "failed",
        progress: 0,
        currentEpoch: 0,
        totalEpochs: cfg.epochs,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Check training job status */
  async getJobStatus(jobId: string): Promise<TrainingJob> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/train/${jobId}`, {
        headers: { "Authorization": `Bearer ${this.apiKey}` },
      });

      if (!response.ok) {
        throw new Error(`Status check failed: ${response.status}`);
      }

      return await response.json();
    } catch (err) {
      return {
        id: jobId,
        status: "failed",
        progress: 0,
        currentEpoch: 0,
        totalEpochs: 0,
        error: err instanceof Error ? err.message : String(err),
      };
    }
  }

  /** Download trained model weights */
  async downloadModel(jobId: string): Promise<{
    modelUrl: string;
    modelSize: number;
    metrics: TrainingMetrics;
  } | null> {
    try {
      const response = await fetch(`${this.apiBaseUrl}/train/${jobId}/model`, {
        headers: { "Authorization": `Bearer ${this.apiKey}` },
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }
}

/* ── A/B Test Runner ───────────────────────────────────────────── */

/**
 * Compare two models side by side on the same test dataset.
 * Determines if the new fine-tuned model is better than current.
 */
export class ABTestRunner {
  /**
   * Run A/B test comparing two models.
   * Uses the test split from exportYOLOFormat().
   */
  compareModels(
    modelAResults: { frameId: string; mAP50: number; fps: number; poseAccuracy: number }[],
    modelBResults: { frameId: string; mAP50: number; fps: number; poseAccuracy: number }[],
    modelAInfo: { id: string; name: string },
    modelBInfo: { id: string; name: string },
  ): ABTestResult {
    // Calculate averages
    const avgA = {
      mAP50: avg(modelAResults.map(r => r.mAP50)),
      fps: avg(modelAResults.map(r => r.fps)),
      poseAccuracy: avg(modelAResults.map(r => r.poseAccuracy)),
    };
    const avgB = {
      mAP50: avg(modelBResults.map(r => r.mAP50)),
      fps: avg(modelBResults.map(r => r.fps)),
      poseAccuracy: avg(modelBResults.map(r => r.poseAccuracy)),
    };

    // Calculate improvement
    const improvement = {
      mAP50: avgA.mAP50 > 0 ? ((avgB.mAP50 - avgA.mAP50) / avgA.mAP50) * 100 : 0,
      fps: avgA.fps > 0 ? ((avgB.fps - avgA.fps) / avgA.fps) * 100 : 0,
      poseAccuracy: avgA.poseAccuracy > 0
        ? ((avgB.poseAccuracy - avgA.poseAccuracy) / avgA.poseAccuracy) * 100
        : 0,
    };

    // Determine winner (weighted: mAP50 50%, poseAccuracy 35%, fps 15%)
    const scoreA = avgA.mAP50 * 0.5 + avgA.poseAccuracy * 0.35 + Math.min(avgA.fps / 30, 1) * 0.15;
    const scoreB = avgB.mAP50 * 0.5 + avgB.poseAccuracy * 0.35 + Math.min(avgB.fps / 30, 1) * 0.15;

    const diff = scoreB - scoreA;
    const winner: "A" | "B" | "tie" = diff > 0.02 ? "B" : diff < -0.02 ? "A" : "tie";

    // Recommendation
    let recommendation: "deploy" | "retrain" | "keep_current";
    if (winner === "B" && improvement.mAP50 > 5) {
      recommendation = "deploy";
    } else if (winner === "A" || improvement.mAP50 < -5) {
      recommendation = "keep_current";
    } else {
      recommendation = "retrain";
    }

    return {
      id: `ab_${Date.now()}`,
      modelA: modelAInfo,
      modelB: modelBInfo,
      testFrames: Math.min(modelAResults.length, modelBResults.length),
      metricsA: avgA,
      metricsB: avgB,
      winner,
      improvement,
      recommendation,
    };
  }
}

/* ── Helpers ───────────────────────────────────────────────────── */

function simpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash |= 0;
  }
  return Math.abs(hash);
}

function avg(arr: number[]): number {
  if (arr.length === 0) return 0;
  return Math.round((arr.reduce((s, v) => s + v, 0) / arr.length) * 1000) / 1000;
}

/* ── Singletons ────────────────────────────────────────────────── */

let _collector: AnnotationCollector | null = null;

export function getAnnotationCollector(): AnnotationCollector {
  if (!_collector) {
    _collector = new AnnotationCollector();
  }
  return _collector;
}

export { DEFAULT_DATASET_CONFIG, DEFAULT_TRAINING_CONFIG };
