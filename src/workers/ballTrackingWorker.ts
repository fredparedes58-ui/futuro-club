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

import { detectBallFromModelOutput, detectBallHeuristic } from "../lib/yolo/ballDetector";
import type { BallDetection } from "../lib/yolo/ballDetector";
import { BallTracker } from "../lib/yolo/ballTracker";
import type { BallTrack } from "../lib/yolo/ballTracker";
import { getActiveBallConfig } from "../lib/yolo/ballModelConfig";
import type { BallModelConfig } from "../lib/yolo/ballModelConfig";

// ─── Worker Message Types ──────────────────────────────────────────────────

export interface BallWorkerInit {
  type: "INIT";
  config?: Partial<BallModelConfig>;
}

export interface BallWorkerFrame {
  type: "BALL_FRAME";
  /** Raw YOLO detection model output (Float32Array) — for model-based detection */
  outputData?: Float32Array;
  /** Number of classes in the model */
  numClasses?: number;
  /** Image dimensions for coordinate conversion */
  imgW: number;
  imgH: number;
  /** Model input size (default 640) */
  modelSize?: number;
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

function initBallTracking(cmd: BallWorkerInit): void {
  try {
    // Use provided config or active config from localStorage
    // Note: localStorage may not be available in worker, use defaults
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

    ballTracker.reset();
    send({ type: "BALL_READY" });
  } catch (err) {
    send({ type: "BALL_ERROR", message: err instanceof Error ? err.message : String(err) });
  }
}

// ─── Process Frame ─────────────────────────────────────────────────────────

function processBallFrame(cmd: BallWorkerFrame): void {
  if (!ballConfig) {
    send({ type: "BALL_ERROR", message: "Ball tracker not initialized" });
    return;
  }

  try {
    let detection: BallDetection | null = null;

    // Strategy 1: Model-based detection (dedicated ball class in YOLO output)
    if (cmd.outputData && cmd.numClasses && ballConfig.ballClassId >= 0) {
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
