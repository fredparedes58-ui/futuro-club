/**
 * VITAS · useOneClickAnalysis Hook (Sprint 0 — UX 1-Click)
 *
 * Orchestrates the entire analysis pipeline from a single entry point:
 *   startAnalysis(videoFile | videoId, playerId) → complete report
 *
 * Steps automated:
 *   1. Video loading (local file or Bunny CDN)
 *   2. Auto-calibration (field line detection → homography)
 *   3. YOLO tracking (player detection + tracking)
 *   4. MediaPipe pose (biomechanics)
 *   5. Fatigue analysis (metabolic power + posture signals)
 *   6. Event detection (tactical events)
 *   7. IA analysis (Claude pipeline via usePlayerAnalysisV2)
 *
 * The user only needs to select a player and a video. Everything else
 * is automatic with smart defaults and fallbacks.
 */

import { useState, useCallback, useRef } from "react";
import { autoCalibrate, type AutoCalibrationResult } from "@/lib/tracking/autoCalibrationBridge";

// ─── Types ──────────────────────────────────────────────────────────────────

export type OneClickStep =
  | "idle"
  | "loading_video"
  | "auto_calibrating"
  | "starting_tracking"
  | "tracking"
  | "analyzing_biomechanics"
  | "generating_fatigue"
  | "running_ia_pipeline"
  | "complete"
  | "error";

export interface OneClickState {
  /** Current step in the pipeline */
  step: OneClickStep;
  /** Human-readable progress message (Spanish) */
  message: string;
  /** Progress percentage (0-100) across all steps */
  progress: number;
  /** Auto-calibration result (if completed) */
  calibration: AutoCalibrationResult | null;
  /** Error message (if step === "error") */
  error: string | null;
  /** Whether the full pipeline is running */
  isRunning: boolean;
  /** Whether the pipeline completed successfully */
  isComplete: boolean;
}

export interface OneClickCallbacks {
  /** Called when auto-calibration completes — provides corners for the canvas overlay */
  onCalibrationComplete?: (result: AutoCalibrationResult) => void;
  /** Called when tracking should start — parent must call tracking.startTracking */
  onStartTracking?: (videoEl: HTMLVideoElement) => void;
  /** Called when tracking should stop — parent must call tracking.stopTracking */
  onStopTracking?: () => void;
  /** Called when IA analysis should start */
  onStartIAAnalysis?: () => void;
  /** Called when the entire pipeline is complete */
  onComplete?: () => void;
  /** Called on error */
  onError?: (error: string) => void;
}

export interface UseOneClickAnalysisReturn {
  state: OneClickState;
  /** Start the 1-click analysis pipeline */
  startOneClick: (videoEl: HTMLVideoElement) => Promise<void>;
  /** Reset to idle state */
  reset: () => void;
  /** Advance to the next step (called by parent when async steps complete) */
  advanceStep: (step: OneClickStep, message?: string) => void;
  /** Mark complete */
  markComplete: () => void;
  /** Mark error */
  markError: (error: string) => void;
}

// ─── Step metadata ──────────────────────────────────────────────────────────

const STEP_PROGRESS: Record<OneClickStep, { progress: number; message: string }> = {
  idle:                    { progress: 0,   message: "" },
  loading_video:           { progress: 5,   message: "Cargando video..." },
  auto_calibrating:        { progress: 15,  message: "Auto-calibrando campo..." },
  starting_tracking:       { progress: 25,  message: "Iniciando detección YOLO..." },
  tracking:                { progress: 40,  message: "Tracking activo — detectando jugadores..." },
  analyzing_biomechanics:  { progress: 65,  message: "Analizando biomecánica (MediaPipe)..." },
  generating_fatigue:      { progress: 75,  message: "Generando análisis de fatiga..." },
  running_ia_pipeline:     { progress: 85,  message: "Ejecutando pipeline IA (Claude)..." },
  complete:                { progress: 100, message: "Análisis completo" },
  error:                   { progress: 0,   message: "Error en el análisis" },
};

// ─── Hook ───────────────────────────────────────────────────────────────────

export function useOneClickAnalysis(
  callbacks: OneClickCallbacks = {},
): UseOneClickAnalysisReturn {
  const callbacksRef = useRef(callbacks);
  callbacksRef.current = callbacks;

  const [state, setState] = useState<OneClickState>({
    step: "idle",
    message: "",
    progress: 0,
    calibration: null,
    error: null,
    isRunning: false,
    isComplete: false,
  });

  const setStep = useCallback((step: OneClickStep, message?: string) => {
    const meta = STEP_PROGRESS[step];
    setState((prev) => ({
      ...prev,
      step,
      message: message ?? meta.message,
      progress: meta.progress,
      isRunning: !["idle", "complete", "error"].includes(step),
      isComplete: step === "complete",
      error: step === "error" ? (message ?? "Error desconocido") : null,
    }));
  }, []);

  const startOneClick = useCallback(async (videoEl: HTMLVideoElement) => {
    try {
      // ── Step 1: Loading video ──
      setStep("loading_video");

      // Wait for video to be ready
      if (videoEl.readyState < 2) {
        await new Promise<void>((resolve, reject) => {
          const onReady = () => {
            videoEl.removeEventListener("canplay", onReady);
            resolve();
          };
          const onError = () => reject(new Error("Video no se pudo cargar"));
          videoEl.addEventListener("canplay", onReady);
          videoEl.addEventListener("error", onError);
          setTimeout(() => reject(new Error("Timeout cargando video")), 15000);
        });
      }

      // ── Step 2: Auto-calibration ──
      setStep("auto_calibrating");
      let calibResult: AutoCalibrationResult;
      try {
        calibResult = await autoCalibrate(videoEl);
      } catch (err) {
        console.warn("[oneClick] Auto-calibration failed, using defaults:", err);
        // Use a default calibration result
        const { identityHomography } = await import("@/lib/yolo/homography");
        calibResult = {
          H: identityHomography(),
          Hinv: identityHomography(),
          preset: "full_corners",
          confidence: 0.3,
          autoDetected: false,
          corners: [
            { x: 20, y: 45 },
            { x: 80, y: 45 },
            { x: 88, y: 85 },
            { x: 12, y: 85 },
          ],
          fieldDetection: null,
          processingTimeMs: 0,
        };
      }

      setState((prev) => ({ ...prev, calibration: calibResult }));
      callbacksRef.current.onCalibrationComplete?.(calibResult);

      // ── Step 3: Start tracking ──
      setStep("starting_tracking");
      callbacksRef.current.onStartTracking?.(videoEl);

      // The parent component handles tracking lifecycle.
      // It should call advanceStep("tracking") when tracking starts,
      // advanceStep("analyzing_biomechanics") when tracking completes,
      // etc.
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error iniciando análisis";
      setStep("error", msg);
      callbacksRef.current.onError?.(msg);
    }
  }, [setStep]);

  const advanceStep = useCallback((step: OneClickStep, message?: string) => {
    setStep(step, message);
  }, [setStep]);

  const markComplete = useCallback(() => {
    setStep("complete");
    callbacksRef.current.onComplete?.();
  }, [setStep]);

  const markError = useCallback((error: string) => {
    setStep("error", error);
    callbacksRef.current.onError?.(error);
  }, [setStep]);

  const reset = useCallback(() => {
    setState({
      step: "idle",
      message: "",
      progress: 0,
      calibration: null,
      error: null,
      isRunning: false,
      isComplete: false,
    });
  }, []);

  return {
    state,
    startOneClick,
    reset,
    advanceStep,
    markComplete,
    markError,
  };
}
