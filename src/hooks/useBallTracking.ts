/**
 * VITAS · useBallTracking Hook (Sprint 1 — Ball Tracking)
 *
 * React hook that manages the ball tracking Web Worker and exposes:
 * - Ball position (pixel + field coordinates)
 * - Ball visibility and tracking state
 * - Ball speed in m/s
 * - Possession: which team controls the ball
 *
 * Usage:
 *   const { ballState, startBallTracking, stopBallTracking } = useBallTracking();
 *   // In tracking loop: feedBallFrame(outputData, personBboxes, ...)
 */

import { useState, useRef, useCallback, useEffect } from "react";
import type { BallTrack } from "@/lib/yolo/ballTracker";
import type { BallDetection } from "@/lib/yolo/ballDetector";
import { getActiveBallConfig } from "@/lib/yolo/ballModelConfig";
import type { BallModelConfig } from "@/lib/yolo/ballModelConfig";
import type { Track, FieldPoint } from "@/lib/yolo/types";
import type {
  BallWorkerEvent,
  BallWorkerFrame,
} from "@/workers/ballTrackingWorker";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PossessionTeam = "home" | "away" | "contested" | "none";

export interface PossessionState {
  team: PossessionTeam;
  /** Track ID of the player with the ball (null if contested/none) */
  playerId: number | null;
  /** Distance from nearest player to ball in meters */
  distanceM: number;
  /** Timestamp when possession changed */
  sinceMs: number;
}

export interface BallTrackingState {
  /** Whether ball tracking worker is ready */
  ready: boolean;
  /** Current ball track from Kalman filter */
  ballTrack: BallTrack | null;
  /** Whether ball is visible (detected this frame) */
  ballVisible: boolean;
  /** Ball speed in m/s (field coordinates) */
  ballSpeedMs: number;
  /** Current possession state */
  possession: PossessionState;
  /** Last raw detection (null if predicted/lost) */
  lastDetection: BallDetection | null;
  /** Error message if any */
  error: string | null;
}

export interface UseBallTrackingOptions {
  /** Ball model config override (defaults to active config) */
  config?: Partial<BallModelConfig>;
  /** Maximum distance (meters) for possession assignment (default: 2.0) */
  possessionRadiusM?: number;
  /** Minimum frames to confirm possession change (hysteresis, default: 4) */
  possessionHysteresis?: number;
  /** Team assignment map: trackId → "home" | "away" */
  teamAssignments?: Map<number, "home" | "away">;
}

const DEFAULT_POSSESSION: PossessionState = {
  team: "none",
  playerId: null,
  distanceM: Infinity,
  sinceMs: 0,
};

const INITIAL_STATE: BallTrackingState = {
  ready: false,
  ballTrack: null,
  ballVisible: false,
  ballSpeedMs: 0,
  possession: DEFAULT_POSSESSION,
  lastDetection: null,
  error: null,
};

// ─── Hook ──────────────────────────────────────────────────────────────────

export function useBallTracking(options: UseBallTrackingOptions = {}) {
  const {
    config,
    possessionRadiusM = 2.0,
    possessionHysteresis = 4,
    teamAssignments,
  } = options;

  const [state, setState] = useState<BallTrackingState>(INITIAL_STATE);
  const workerRef = useRef<Worker | null>(null);
  const teamAssignmentsRef = useRef(teamAssignments);
  teamAssignmentsRef.current = teamAssignments;
  // FASE 2: true si el config activo corre inferencia standalone (detect dedicado)
  const standaloneModeRef = useRef(false);

  // Possession tracking refs (avoid re-renders on intermediate state)
  const possessionRef = useRef<PossessionState>(DEFAULT_POSSESSION);
  const possessionCandidateRef = useRef<{ team: PossessionTeam; playerId: number | null; frames: number }>({
    team: "none",
    playerId: null,
    frames: 0,
  });

  // ── Initialize Worker ──────────────────────────────────────────────────────

  const startBallTracking = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(
      new URL("../workers/ballTrackingWorker.ts", import.meta.url),
      { type: "module" },
    );

    worker.onmessage = (e: MessageEvent<BallWorkerEvent>) => {
      const event = e.data;

      switch (event.type) {
        case "BALL_READY":
          setState(s => ({ ...s, ready: true, error: null }));
          break;

        case "BALL_RESULT": {
          const { ballTrack, detection } = event;
          setState(s => ({
            ...s,
            ballTrack,
            ballVisible: ballTrack.visible,
            ballSpeedMs: ballTrack.speedMs,
            lastDetection: detection,
          }));
          break;
        }

        case "BALL_ERROR":
          setState(s => ({ ...s, error: event.message }));
          break;
      }
    };

    worker.onerror = (err) => {
      setState(s => ({ ...s, error: err.message }));
    };

    workerRef.current = worker;

    // Resolver config activo en el main thread (los workers no tienen
    // localStorage) y pasarlo completo en INIT. El override explícito gana.
    const resolved: BallModelConfig = { ...getActiveBallConfig(), ...(config ?? {}) };
    standaloneModeRef.current = !!resolved.modelUrl;

    worker.postMessage({
      type: "INIT",
      config: resolved,
    });
  }, [config]);

  // ── Feed Frame to Worker ───────────────────────────────────────────────────

  const feedBallFrame = useCallback((frame: Omit<BallWorkerFrame, "type">) => {
    if (!workerRef.current) return;
    workerRef.current.postMessage({
      type: "BALL_FRAME",
      ...frame,
    } as BallWorkerFrame);
  }, []);

  // ── Compute Possession ─────────────────────────────────────────────────────

  const computePossession = useCallback((
    ballFieldPos: FieldPoint | null,
    playerTracks: Track[],
    timestampMs: number,
  ): PossessionState => {
    if (!ballFieldPos) {
      return possessionRef.current; // Keep last known possession
    }

    // Find nearest player to ball
    let nearestDist = Infinity;
    let nearestTrackId: number | null = null;

    for (const track of playerTracks) {
      if (!track.lastFieldPos) continue;
      const dx = track.lastFieldPos.fx - ballFieldPos.fx;
      const dy = track.lastFieldPos.fy - ballFieldPos.fy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTrackId = track.id;
      }
    }

    // Determine team of nearest player
    let candidateTeam: PossessionTeam = "none";
    if (nearestDist < possessionRadiusM && nearestTrackId !== null) {
      const assignments = teamAssignmentsRef.current;
      if (assignments && assignments.has(nearestTrackId)) {
        candidateTeam = assignments.get(nearestTrackId)!;
      } else {
        // No team assignment — mark as contested
        candidateTeam = "contested";
      }
    }

    // Hysteresis: only change possession after N consecutive frames
    const candidate = possessionCandidateRef.current;
    if (candidateTeam === candidate.team && nearestTrackId === candidate.playerId) {
      candidate.frames++;
    } else {
      possessionCandidateRef.current = {
        team: candidateTeam,
        playerId: nearestTrackId,
        frames: 1,
      };
    }

    if (possessionCandidateRef.current.frames >= possessionHysteresis) {
      const newPossession: PossessionState = {
        team: candidateTeam,
        playerId: nearestTrackId,
        distanceM: nearestDist,
        sinceMs: timestampMs,
      };
      possessionRef.current = newPossession;
      setState(s => ({ ...s, possession: newPossession }));
      return newPossession;
    }

    return possessionRef.current;
  }, [possessionRadiusM, possessionHysteresis]);

  // ── Stop & Cleanup ─────────────────────────────────────────────────────────

  const stopBallTracking = useCallback(() => {
    workerRef.current?.terminate();
    workerRef.current = null;
    possessionRef.current = DEFAULT_POSSESSION;
    possessionCandidateRef.current = { team: "none", playerId: null, frames: 0 };
    setState(INITIAL_STATE);
  }, []);

  const resetBallTracker = useCallback(() => {
    workerRef.current?.postMessage({ type: "RESET" });
    possessionRef.current = DEFAULT_POSSESSION;
    possessionCandidateRef.current = { team: "none", playerId: null, frames: 0 };
    setState(s => ({
      ...s,
      ballTrack: null,
      ballVisible: false,
      ballSpeedMs: 0,
      possession: DEFAULT_POSSESSION,
      lastDetection: null,
    }));
  }, []);

  // ── Cleanup on unmount ─────────────────────────────────────────────────────

  useEffect(() => {
    return () => {
      workerRef.current?.terminate();
    };
  }, []);

  return {
    ballState: state,
    startBallTracking,
    stopBallTracking,
    feedBallFrame,
    computePossession,
    resetBallTracker,
    /** FASE 2: ref estable — true si el worker corre el detect dedicado */
    ballStandaloneModeRef: standaloneModeRef,
  };
}
