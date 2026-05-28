/**
 * VITAS · Resilience Detector (Sprint 18)
 *
 * Tracks behavior in 30s post-error windows.
 * Input: errors from LinkedEvent[] + Track[] + Keypoint[].
 * Measures: distance to ball, speed change, posture change, ball-seeking.
 *
 * Output: ResilienceProfile with avgScore, recoveryTimeSec, intensityRetention.
 */

import type { LinkedEvent } from "./types";
import { analyzePostErrorWindow, type PostErrorWindowResult } from "./postErrorWindowAnalyzer";

// ─── Input types ─────────────────────────────────────────────────────────

interface TrackFrame {
  trackId: number;
  timestampMs: number;
  x: number;
  y: number;
  speedMs: number;
}

interface BallFrame {
  fx: number;
  fy: number;
  timestampMs: number;
}

interface PostureFrame {
  trackId: number;
  timestampMs: number;
  trunkLean: number;
  shoulderAngle: number;
}

export interface ResilienceDetectorInput {
  linkedEvents: LinkedEvent[];
  trackFrames: TrackFrame[];
  ballFrames: BallFrame[];
  postureFrames?: PostureFrame[];
  trackId: number;
  /** Window duration in ms (default: 30000) */
  windowMs?: number;
}

// ─── Output ──────────────────────────────────────────────────────────────

export interface ResilienceProfile {
  trackId: number;
  /** Average recovery score 0-100 across all error windows */
  avgScore: number;
  /** Average time to resume normal intensity (seconds) */
  recoveryTimeSec: number;
  /** Percentage of errors where intensity was maintained */
  intensityRetention: number;
  /** Percentage of errors where player sought ball */
  ballSeekingRate: number;
  /** Number of errors analyzed */
  errorCount: number;
  /** Individual window results */
  windows: PostErrorWindowResult[];
  /** Classification */
  category: "resilient" | "moderate" | "fragile";
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Detect resilience for a specific player by analyzing post-error behavior.
 */
export function detectResilience(input: ResilienceDetectorInput): ResilienceProfile {
  const { linkedEvents, trackFrames, ballFrames, postureFrames, trackId, windowMs } = input;

  // Find error events for this player
  const errorEvents = linkedEvents.filter(
    e => e.trackId === trackId && e.outcome === "failed",
  );

  if (errorEvents.length === 0) {
    return {
      trackId,
      avgScore: 65, // default moderate if no errors detected
      recoveryTimeSec: 0,
      intensityRetention: 100,
      ballSeekingRate: 0,
      errorCount: 0,
      windows: [],
      category: "moderate",
    };
  }

  // Analyze each error window
  const windows: PostErrorWindowResult[] = [];

  for (const event of errorEvents) {
    const result = analyzePostErrorWindow({
      eventMs: event.executionMs, // analyze from the moment of the error
      trackId,
      trackFrames,
      ballFrames,
      postureFrames,
      windowMs,
    });
    windows.push(result);
  }

  // Aggregate
  const avgScore = windows.length > 0
    ? windows.reduce((s, w) => s + w.recoveryScore, 0) / windows.length
    : 50;

  const intensityRetention = windows.length > 0
    ? (windows.filter(w => w.intensityMaintained).length / windows.length) * 100
    : 50;

  const ballSeekingRate = windows.length > 0
    ? (windows.filter(w => w.seekingBall).length / windows.length) * 100
    : 0;

  // Estimate recovery time: how quickly speed returns to pre-error baseline
  // Use speedChangePct as proxy — if positive, recovery was fast
  const avgSpeedChange = windows.length > 0
    ? windows.reduce((s, w) => s + w.speedChangePct, 0) / windows.length
    : 0;
  // Rough estimate: if speed maintained, recovery ~5s; if dropped 20%, ~15s
  const recoveryTimeSec = avgSpeedChange > -5 ? 5 : avgSpeedChange > -15 ? 10 : 20;

  // Classify
  const category: "resilient" | "moderate" | "fragile" =
    avgScore >= 70 ? "resilient" :
    avgScore >= 40 ? "moderate" :
    "fragile";

  return {
    trackId,
    avgScore: Math.round(avgScore),
    recoveryTimeSec,
    intensityRetention: Math.round(intensityRetention),
    ballSeekingRate: Math.round(ballSeekingRate),
    errorCount: errorEvents.length,
    windows,
    category,
  };
}
