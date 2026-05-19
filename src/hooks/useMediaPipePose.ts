/**
 * VITAS · useMediaPipePose Hook
 *
 * React hook that wraps the MediaPipe Pose Service for video analysis.
 * Processes video frames in real-time and produces:
 *   - COCO-17 keypoints (for poseAnalyzer.ts)
 *   - Joint angles (for biomechanics DrillScore)
 *   - Foot positions (for field coverage via homography)
 *   - Biomechanics score (accumulated over session)
 *
 * Usage:
 *   const { start, stop, status, biomechanics, currentPose } = useMediaPipePose();
 *   await start(videoRef.current);
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { getMediaPipeService } from "@/lib/mediapipe/mediaPipeService";
import { mapPoseFrame } from "@/lib/mediapipe/keypointMapper";
import { BiomechanicsAnalyzer } from "@/lib/mediapipe/biomechanicsEngine";
import type { MappedPoseFrame } from "@/lib/mediapipe/keypointMapper";
import type { BiomechanicsScore } from "@/lib/mediapipe/biomechanicsEngine";
import type { MultiPoseResult, PoseDetectionResult } from "@/lib/mediapipe/mediaPipeService";
import type { MediaPipeService } from "@/lib/mediapipe/mediaPipeService";
import type { Keypoint } from "@/lib/yolo/types";

/* ── Types ─────────────────────────────────────────────────────── */

export type MediaPipeStatus =
  | "idle"
  | "loading"
  | "ready"
  | "processing"
  | "paused"
  | "complete"
  | "error";

export interface MediaPipeState {
  status: MediaPipeStatus;
  /** Current FPS */
  fps: number;
  /** Frames processed so far */
  framesProcessed: number;
  /** Total frames in video (if known) */
  totalFrames: number;
  /** Progress 0-100 */
  progress: number;
  /** Error message */
  error: string | null;
  /** Loading message */
  message: string;
}

export interface MediaPipePoseResult {
  /** All persons detected in current frame */
  poses: MappedPoseFrame[];
  /** COCO keypoints for all persons (for poseAnalyzer.ts) */
  cocoKeypoints: Keypoint[][];
  /** Accumulated biomechanics score (primary player) */
  biomechanics: BiomechanicsScore | null;
  /** Raw MediaPipe result for current frame */
  rawResult: MultiPoseResult | null;
}

export interface UseMediaPipePoseOptions {
  /** Target FPS for processing (default: 10) */
  targetFps?: number;
  /** Model complexity: 0=lite, 1=full, 2=heavy (default: 1) */
  modelComplexity?: 0 | 1 | 2;
  /** Primary player index to track for biomechanics (default: 0) */
  primaryPlayerIndex?: number;
  /** Auto-start when video is ready (default: false) */
  autoStart?: boolean;
  /** Process full video offline (seek through all frames) vs real-time (default: false) */
  offlineMode?: boolean;
  /** Callback on each frame processed */
  onFrame?: (poses: MappedPoseFrame[], frameIndex: number) => void;
  /** Callback when processing completes */
  onComplete?: (biomechanics: BiomechanicsScore) => void;
}

/* ── Hook ──────────────────────────────────────────────────────── */

export function useMediaPipePose(options: UseMediaPipePoseOptions = {}) {
  const {
    targetFps = 10,
    modelComplexity = 1,
    primaryPlayerIndex = 0,
    offlineMode = false,
    onFrame,
    onComplete,
  } = options;

  const [state, setState] = useState<MediaPipeState>({
    status: "idle",
    fps: 0,
    framesProcessed: 0,
    totalFrames: 0,
    progress: 0,
    error: null,
    message: "",
  });

  const [result, setResult] = useState<MediaPipePoseResult>({
    poses: [],
    cocoKeypoints: [],
    biomechanics: null,
    rawResult: null,
  });

  const analyzerRef = useRef<BiomechanicsAnalyzer>(new BiomechanicsAnalyzer());
  const animFrameRef = useRef<number>(0);
  const processingRef = useRef(false);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const fpsTimesRef = useRef<number[]>([]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      processingRef.current = false;
      if (animFrameRef.current) {
        cancelAnimationFrame(animFrameRef.current);
      }
    };
  }, []);

  /**
   * Offline mode: seek through the entire video and process all frames.
   * Better for analysis (processes every frame at target FPS).
   */
  const processOffline = useCallback(async (
    video: HTMLVideoElement,
    service: MediaPipeService,
  ) => {
    const duration = video.duration;
    const frameInterval = 1 / targetFps;
    const totalFrames = Math.floor(duration * targetFps);
    let framesProcessed = 0;

    setState(s => ({ ...s, totalFrames }));

    for (let time = 0; time < duration && processingRef.current; time += frameInterval) {
      video.currentTime = time;

      // Wait for seek to complete
      await new Promise<void>(resolve => {
        const handler = () => {
          video.removeEventListener("seeked", handler);
          resolve();
        };
        video.addEventListener("seeked", handler);
      });

      // Process frame
      const frameStart = performance.now();
      const mpResult = service.detectFromVideo(video, time * 1000);
      const frameTime = performance.now() - frameStart;

      // Map results
      const poses = mpResult.persons.map((p: PoseDetectionResult) =>
        mapPoseFrame(
          p.landmarks,
          p.worldLandmarks,
          video.videoWidth,
          video.videoHeight,
        ),
      );

      // Feed primary player to biomechanics analyzer
      if (poses.length > primaryPlayerIndex) {
        analyzerRef.current.addFrame(poses[primaryPlayerIndex].jointAngles);
      }

      framesProcessed++;

      // Track FPS
      fpsTimesRef.current.push(frameTime);
      if (fpsTimesRef.current.length > 30) fpsTimesRef.current.shift();
      const avgMs = fpsTimesRef.current.reduce((s, t) => s + t, 0) / fpsTimesRef.current.length;
      const currentFps = avgMs > 0 ? Math.round(1000 / avgMs) : 0;

      // Update state periodically (every 5 frames to avoid React overhead)
      if (framesProcessed % 5 === 0 || framesProcessed === totalFrames) {
        const biomechanics = analyzerRef.current.calculate();
        const cocoKeypoints = poses.map((p: MappedPoseFrame) => p.cocoKeypoints);

        setResult({
          poses,
          cocoKeypoints,
          biomechanics,
          rawResult: mpResult,
        });

        setState(s => ({
          ...s,
          fps: currentFps,
          framesProcessed,
          progress: Math.round((framesProcessed / totalFrames) * 100),
          message: `Procesando... ${framesProcessed}/${totalFrames} frames (${currentFps} FPS)`,
        }));
      }

      onFrame?.(poses, framesProcessed);
    }

    // Final result
    const finalBiomechanics = analyzerRef.current.calculate();
    setResult(r => ({ ...r, biomechanics: finalBiomechanics }));
    setState(s => ({
      ...s,
      status: "complete",
      progress: 100,
      message: `Completado: ${framesProcessed} frames analizados`,
    }));

    processingRef.current = false;
    onComplete?.(finalBiomechanics);
  }, [targetFps, primaryPlayerIndex, onFrame, onComplete]);

  /**
   * Real-time mode: process frames as the video plays.
   */
  const processRealtime = useCallback((
    video: HTMLVideoElement,
    service: MediaPipeService,
  ) => {
    const frameInterval = 1000 / targetFps;
    let lastProcessTime = 0;
    let framesProcessed = 0;

    const processFrame = (timestamp: number) => {
      if (!processingRef.current) return;

      // Throttle to target FPS
      if (timestamp - lastProcessTime >= frameInterval) {
        lastProcessTime = timestamp;

        if (!video.paused && !video.ended && video.readyState >= 2) {
          const frameStart = performance.now();
          const mpResult = service.detectFromVideo(video, video.currentTime * 1000);
          const frameTime = performance.now() - frameStart;

          const poses = mpResult.persons.map((p: PoseDetectionResult) =>
            mapPoseFrame(
              p.landmarks,
              p.worldLandmarks,
              video.videoWidth,
              video.videoHeight,
            ),
          );

          // Feed primary player to biomechanics analyzer
          if (poses.length > primaryPlayerIndex) {
            analyzerRef.current.addFrame(poses[primaryPlayerIndex].jointAngles);
          }

          framesProcessed++;

          // Track FPS
          fpsTimesRef.current.push(frameTime);
          if (fpsTimesRef.current.length > 30) fpsTimesRef.current.shift();
          const avgMs = fpsTimesRef.current.reduce((s, t) => s + t, 0) / fpsTimesRef.current.length;
          const currentFps = avgMs > 0 ? Math.round(1000 / avgMs) : 0;

          const biomechanics = framesProcessed % 10 === 0
            ? analyzerRef.current.calculate()
            : null;

          const cocoKeypoints = poses.map((p: MappedPoseFrame) => p.cocoKeypoints);

          setResult(r => ({
            poses,
            cocoKeypoints,
            biomechanics: biomechanics ?? r.biomechanics,
            rawResult: mpResult,
          }));

          if (framesProcessed % 5 === 0) {
            const progress = video.duration > 0
              ? Math.round((video.currentTime / video.duration) * 100)
              : 0;

            setState(s => ({
              ...s,
              fps: currentFps,
              framesProcessed,
              progress,
              message: `Analizando en vivo... ${currentFps} FPS`,
            }));
          }

          onFrame?.(poses, framesProcessed);
        }

        // Check if video ended
        if (video.ended) {
          const finalBiomechanics = analyzerRef.current.calculate();
          setResult(r => ({ ...r, biomechanics: finalBiomechanics }));
          setState(s => ({
            ...s,
            status: "complete",
            progress: 100,
            message: `Completado: ${framesProcessed} frames analizados`,
          }));
          processingRef.current = false;
          onComplete?.(finalBiomechanics);
          return;
        }
      }

      animFrameRef.current = requestAnimationFrame(processFrame);
    };

    animFrameRef.current = requestAnimationFrame(processFrame);
  }, [targetFps, primaryPlayerIndex, onFrame, onComplete]);

  /**
   * Initialize MediaPipe and start processing video frames.
   */
  const start = useCallback(async (videoElement: HTMLVideoElement) => {
    videoRef.current = videoElement;
    processingRef.current = true;
    analyzerRef.current = new BiomechanicsAnalyzer();

    setState(s => ({
      ...s,
      status: "loading",
      message: "Cargando modelo MediaPipe Pose...",
      error: null,
      framesProcessed: 0,
    }));

    // Initialize MediaPipe
    const service = getMediaPipeService({ modelComplexity, maxNumPoses: 4 });
    const ready = await service.initialize();

    if (!ready) {
      setState(s => ({
        ...s,
        status: "error",
        error: "No se pudo cargar MediaPipe. Verifica tu conexión a internet.",
        message: "",
      }));
      return;
    }

    setState(s => ({ ...s, status: "processing", message: "Analizando video..." }));

    if (offlineMode) {
      await processOffline(videoElement, service);
    } else {
      processRealtime(videoElement, service);
    }
  }, [modelComplexity, offlineMode, processOffline, processRealtime]);

  /** Pause processing */
  const pause = useCallback(() => {
    processingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    setState(s => ({ ...s, status: "paused", message: "Análisis pausado" }));
  }, []);

  /** Resume processing */
  const resume = useCallback(() => {
    if (!videoRef.current) return;
    processingRef.current = true;
    const service = getMediaPipeService();
    if (service.isReady) {
      setState(s => ({ ...s, status: "processing", message: "Reanudando análisis..." }));
      processRealtime(videoRef.current, service);
    }
  }, [processRealtime]);

  /** Stop processing and get final results */
  const stop = useCallback((): BiomechanicsScore => {
    processingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }

    const finalBiomechanics = analyzerRef.current.calculate();
    setResult(r => ({ ...r, biomechanics: finalBiomechanics }));
    setState(s => ({ ...s, status: "complete", message: "Análisis detenido" }));

    return finalBiomechanics;
  }, []);

  /** Reset everything for a new session */
  const reset = useCallback(() => {
    processingRef.current = false;
    if (animFrameRef.current) {
      cancelAnimationFrame(animFrameRef.current);
    }
    analyzerRef.current = new BiomechanicsAnalyzer();
    fpsTimesRef.current = [];

    setState({
      status: "idle",
      fps: 0,
      framesProcessed: 0,
      totalFrames: 0,
      progress: 0,
      error: null,
      message: "",
    });

    setResult({
      poses: [],
      cocoKeypoints: [],
      biomechanics: null,
      rawResult: null,
    });
  }, []);

  return {
    // State
    state,
    status: state.status,
    fps: state.fps,
    progress: state.progress,
    framesProcessed: state.framesProcessed,
    error: state.error,
    message: state.message,

    // Results
    poses: result.poses,
    cocoKeypoints: result.cocoKeypoints,
    biomechanics: result.biomechanics,
    rawResult: result.rawResult,

    // Actions
    start,
    stop,
    pause,
    resume,
    reset,
  };
}
