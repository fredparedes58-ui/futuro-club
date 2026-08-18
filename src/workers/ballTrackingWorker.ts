/**
 * VITAS · Ball Tracking Worker (Sprint 1 — Ball Tracking)
 *
 * Separate Web Worker for ball detection so it doesn't block
 * the player tracking pipeline. Runs in parallel.
 *
 * Modes:
 * 1. "combined" — receives raw YOLO output from main tracking worker,
 *    extracts ball class detections (shared model, no extra inference)
 * 2. "standalone" — loads its own ONNX model for dedicated ball detection
 *
 * Messages IN:
 *   INIT          → configure mode + model
 *   BALL_FRAME    → raw YOLO output or ImageData for ball detection
 *   RESET         → clear tracker state
 *
 * Messages OUT:
 *   BALL_READY    → worker initialized
 *   BALL_RESULT   → BallTrack for this frame
 *   BALL_ERROR    → error message
 */

import * as ort from "onnxruntime-web";
import { detectBallFromModelOutput, detectBallHeuristic } from "../lib/yolo/ballDetector";
import type { BallDetection } from "../lib/yolo/ballDetector";
import { BallTracker } from "../lib/yolo/ballTracker";
import type { BallTrack } from "../lib/yolo/ballTracker";
import type { BallModelConfig } from "../lib/yolo/ballModelConfig";
import { computeTileRects, cropImage } from "../lib/yolo/tiling";
import type { ImageLike, TilingConfig } from "../lib/yolo/tiling";

// Mismo setup WASM que trackingWorker (sin SharedArrayBuffer, SIMD on)
ort.env.wasm.wasmPaths  = "/";
ort.env.wasm.numThreads = 1;
ort.env.wasm.simd       = true;
ort.env.wasm.proxy      = false;

// ─── Worker Message Types ──────────────────────────────────────────────────

export interface BallWorkerInit {
  type: "INIT";
  config?: Partial<BallModelConfig>;
  /**
   * Tiling (SAHI) opt-in — mismo ajuste `vitas_tiling` que el pose worker
   * (resuelto en main thread; los workers no tienen localStorage). Solo aplica
   * al modo standalone (Strategy 0). Benchmark real (docs/benchmark-balon-17.md):
   * cobertura de balón 27% plano → 64% con 2×2.
   */
  tiling?: TilingConfig | null;
}

export interface BallWorkerFrame {
  type: "BALL_FRAME";
  /** Frame crudo para inferencia standalone (FASE 2, modo yolo11s-detect) */
  imageData?: ImageData;
  /** Raw YOLO detection model output (Float32Array) — for model-based detection */
  outputData?: Float32Array;
  /** Number of classes in the model */
  numClasses?: number;
  /** Image dimensions for coordinate conversion */
  imgW: number;
  imgH: number;
  /** Model input size (default 640) */
  modelSize?: number;
  /**
   * Aspecto del vídeo ORIGINAL (videoW/videoH). El frame se dibuja en un canvas
   * cuadrado (imageData 640×640), aplastando el 16:9 → corrige el filtro de
   * aspecto del detector para no descartar balones redondos. Default 1.
   */
  srcAspect?: number;
  /** Person bounding boxes from pose model — for heuristic detection */
  personBboxes?: Array<{ bbox: [number, number, number, number]; confidence: number }>;
  /** Homography matrix (9 values) for pixel→field conversion */
  homography: number[];
  /** Frame timestamp in ms */
  timestampMs: number;
  /** Frame index */
  frameIndex: number;
}

export interface BallWorkerReset {
  type: "RESET";
}

export type BallWorkerCommand = BallWorkerInit | BallWorkerFrame | BallWorkerReset;

export interface BallWorkerReady {
  type: "BALL_READY";
}

export interface BallWorkerResult {
  type: "BALL_RESULT";
  frameIndex: number;
  timestampMs: number;
  ballTrack: BallTrack;
  detection: BallDetection | null;
}

export interface BallWorkerError {
  type: "BALL_ERROR";
  message: string;
}

export type BallWorkerEvent = BallWorkerReady | BallWorkerResult | BallWorkerError;

// ─── Worker State ──────────────────────────────────────────────────────────

let ballConfig: BallModelConfig | null = null;
const ballTracker = new BallTracker();
// Sesión ONNX propia (solo modo standalone; null = modos combined/heuristic)
let ballSession: ort.InferenceSession | null = null;
// Tiling opt-in (null = pasada única, sin regresión de latencia)
let tilingConfig: TilingConfig | null = null;

// ─── Message Handler ───────────────────────────────────────────────────────

self.onmessage = (e: MessageEvent<BallWorkerCommand>) => {
  const cmd = e.data;

  switch (cmd.type) {
    case "INIT":
      initBallTracking(cmd);
      break;
    case "BALL_FRAME":
      processBallFrame(cmd);
      break;
    case "RESET":
      ballTracker.reset();
      ballConfig = null;
      break;
  }
};

function send(event: BallWorkerEvent): void {
  (self as unknown as Worker).postMessage(event);
}

// ─── Initialize ────────────────────────────────────────────────────────────

async function initBallTracking(cmd: BallWorkerInit): Promise<void> {
  try {
    // Use provided config or defaults (localStorage no existe en workers;
    // el main thread resuelve getActiveBallConfig y lo pasa en INIT)
    const defaultConfig: BallModelConfig = {
      modelId: "heuristic",
      ballClassId: -1,
      personClassId: 0,
      confThreshold: 0.25,
      maxBboxSize: 50,
      minBboxSize: 5,
      useHeuristicFallback: true,
    };

    ballConfig = cmd.config
      ? { ...defaultConfig, ...cmd.config }
      : defaultConfig;
    tilingConfig = cmd.tiling ?? null;

    ballTracker.reset();

    // FASE 2 · modo standalone: carga su propia sesión ONNX (detect dedicado).
    // Si falla (offline, 404…), NO rompe: queda la heurística y se avisa.
    ballSession = null;
    if (ballConfig.modelUrl) {
      try {
        const res = await fetch(ballConfig.modelUrl);
        if (!res.ok) throw new Error(`HTTP ${res.status} descargando modelo de balón`);
        const buf = await res.arrayBuffer();
        ballSession = await ort.InferenceSession.create(buf, {
          executionProviders: ["wasm"],
          graphOptimizationLevel: "all",
        });
      } catch (err) {
        console.warn("[ballWorker] Modelo standalone no disponible, fallback a heurística:", err);
      }
    }

    send({ type: "BALL_READY" });
  } catch (err) {
    send({ type: "BALL_ERROR", message: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Preprocess ImageLike → tensor [1,3,size,size] (letterbox, igual que trackingWorker) ───
// ImageLike (estructural) en vez de ImageData: los crops de `cropImage` (tiling)
// no son instancias de ImageData pero tienen la misma forma.

function preprocessBall(imageData: ImageLike, size: number): ort.Tensor {
  const { width, height, data } = imageData;
  const tensor = new Float32Array(3 * size * size);

  const scale = Math.min(size / width, size / height);
  const newW  = Math.round(width * scale);
  const newH  = Math.round(height * scale);
  const padX  = Math.floor((size - newW) / 2);
  const padY  = Math.floor((size - newH) / 2);

  for (let py = 0; py < newH; py++) {
    for (let px = 0; px < newW; px++) {
      const srcX = Math.min(Math.round(px / scale), width - 1);
      const srcY = Math.min(Math.round(py / scale), height - 1);
      const srcIdx = (srcY * width + srcX) * 4;
      const dstX = px + padX;
      const dstY = py + padY;
      tensor[0 * size * size + dstY * size + dstX] = data[srcIdx]     / 255;
      tensor[1 * size * size + dstY * size + dstX] = data[srcIdx + 1] / 255;
      tensor[2 * size * size + dstY * size + dstX] = data[srcIdx + 2] / 255;
    }
  }

  return new ort.Tensor("float32", tensor, [1, 3, size, size]);
}

// ─── Inferencia standalone (Strategy 0) ──────────────────────────────────────

/** Una pasada del detect dedicado sobre `img`. Coordenadas en espacio de `img`. */
async function inferBallStandalone(
  img: ImageLike,
  srcAspect: number,
): Promise<BallDetection | null> {
  if (!ballSession || !ballConfig) return null;
  const size = ballConfig.inputSize ?? 640;
  const inputTensor = preprocessBall(img, size);
  const feeds: Record<string, ort.Tensor> = {};
  feeds[ballSession.inputNames[0]] = inputTensor;
  const output = await ballSession.run(feeds);
  const outputData = output[ballSession.outputNames[0]].data as Float32Array;
  return detectBallFromModelOutput(
    outputData,
    ballConfig.numClasses ?? 80,
    ballConfig.ballClassId,
    img.width,
    img.height,
    size,
    {
      confThreshold: ballConfig.confThreshold,
      maxBboxSize: ballConfig.maxBboxSize,
      minBboxSize: ballConfig.minBboxSize,
      // El frame llega aplastado desde el vídeo original → corrige el filtro de
      // aspecto para no descartar el balón (redondo → elipse). El aplastado es
      // un escalado uniforme de TODO el canvas, así que la misma corrección vale
      // para cualquier tile recortado de él.
      aspectCorrection: srcAspect,
    },
  );
}

/**
 * Tiling (SAHI) para el balón: recorta la malla G×G (con solape), infiere cada
 * tile y devuelve el candidato de MAYOR confianza mapeado a coordenadas del
 * frame completo. A diferencia de los jugadores (globalNms sobre N cajas), el
 * balón es único por construcción → argmax, no NMS.
 */
async function inferBallTiled(
  img: ImageLike,
  cfg: TilingConfig,
  srcAspect: number,
): Promise<BallDetection | null> {
  const rects = computeTileRects(img.width, img.height, cfg.grid, cfg.overlap);
  let best: BallDetection | null = null;
  for (const rect of rects) {
    if (rect.sw <= 0 || rect.sh <= 0) continue;
    const tile = cropImage(img, rect);
    const det = await inferBallStandalone(tile, srcAspect);
    if (!det) continue;
    if (!best || det.confidence > best.confidence) {
      // Mapear del espacio del tile al del frame completo
      best = {
        ...det,
        bbox: [det.bbox[0] + rect.sx, det.bbox[1] + rect.sy, det.bbox[2], det.bbox[3]],
        center: { x: det.center.x + rect.sx, y: det.center.y + rect.sy },
      };
    }
  }
  return best;
}

// ─── Process Frame ─────────────────────────────────────────────────────────

async function processBallFrame(cmd: BallWorkerFrame): Promise<void> {
  if (!ballConfig) {
    send({ type: "BALL_ERROR", message: "Ball tracker not initialized" });
    return;
  }

  try {
    let detection: BallDetection | null = null;

    // Strategy 0 (FASE 2): inferencia standalone con el detect dedicado.
    // Coordenadas en espacio de frame (imageData) — el mismo que usa la
    // homografía del pose pipeline. Con tiling opt-in: G² pasadas, se queda
    // el mejor candidato (el balón es único: argmax, no NMS).
    if (ballSession && cmd.imageData && ballConfig.ballClassId >= 0) {
      detection =
        tilingConfig && tilingConfig.grid > 1
          ? await inferBallTiled(cmd.imageData, tilingConfig, cmd.srcAspect ?? 1)
          : await inferBallStandalone(cmd.imageData, cmd.srcAspect ?? 1);
    }

    // Strategy 1: Model-based detection (dedicated ball class in YOLO output)
    if (!detection && cmd.outputData && cmd.numClasses && ballConfig.ballClassId >= 0) {
      detection = detectBallFromModelOutput(
        cmd.outputData,
        cmd.numClasses,
        ballConfig.ballClassId,
        cmd.imgW,
        cmd.imgH,
        cmd.modelSize ?? 640,
        {
          confThreshold: ballConfig.confThreshold,
          maxBboxSize: ballConfig.maxBboxSize,
          minBboxSize: ballConfig.minBboxSize,
        },
      );
    }

    // Strategy 2: Heuristic detection from person-pose bboxes (fallback)
    if (!detection && ballConfig.useHeuristicFallback && cmd.personBboxes) {
      detection = detectBallHeuristic(cmd.personBboxes, {
        confThreshold: ballConfig.confThreshold,
        maxBboxSize: ballConfig.maxBboxSize,
        minBboxSize: ballConfig.minBboxSize,
      });
    }

    // Update Kalman tracker
    const H = new Float64Array(cmd.homography);
    const ballTrack = ballTracker.update(detection, H, cmd.timestampMs);

    send({
      type: "BALL_RESULT",
      frameIndex: cmd.frameIndex,
      timestampMs: cmd.timestampMs,
      ballTrack,
      detection,
    });
  } catch (err) {
    send({ type: "BALL_ERROR", message: err instanceof Error ? err.message : String(err) });
  }
}
