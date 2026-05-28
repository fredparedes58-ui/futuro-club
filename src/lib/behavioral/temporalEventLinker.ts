/**
 * VITAS · Temporal Event Linker (Sprint 17)
 *
 * Correlates ball tracking + pose + player tracking into a unified timeline.
 * Input: Track[] + BallTrack + ScanEvent[] (from poseAnalyzer).
 * Output: LinkedEvent[] with reception→decision→execution correlated.
 *
 * Does NOT reprocess video — works on pre-extracted data.
 */

import type { LinkedEvent, ActionType, ActionOutcome, PressureContext } from "./types";

// ─── Input types (from existing modules) ─────────────────────────────────

interface TrackFrame {
  trackId: number;
  timestampMs: number;
  x: number;       // field x in meters
  y: number;       // field y in meters
  speedMs: number;
  teamId?: number;
}

interface BallFrame {
  fx: number;
  fy: number;
  timestampMs: number;
  speedMs: number;
  visible: boolean;
}

export interface EventLinkerInput {
  /** Player tracking frames sorted by timestampMs */
  trackFrames: TrackFrame[];
  /** Ball position frames sorted by timestampMs */
  ballFrames: BallFrame[];
  /** Ball possession proximity threshold in meters */
  possessionRadiusM?: number;
  /** Minimum time between events for same player (ms) */
  minEventGapMs?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_POSSESSION_RADIUS_M = 1.5;
const DEFAULT_MIN_EVENT_GAP_MS = 500;
const DECISION_WINDOW_MS = 3000;   // max time between reception and execution
const SPEED_CHANGE_THRESHOLD = 0.5; // m/s change to detect decision moment

// ─── Helpers ─────────────────────────────────────────────────────────────

function euclidean(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Find nearest player to ball at a given timestamp */
function findNearestPlayer(
  ballFrame: BallFrame,
  trackFrames: TrackFrame[],
  toleranceMs: number,
): TrackFrame | null {
  let best: TrackFrame | null = null;
  let bestDist = Infinity;

  for (const tf of trackFrames) {
    if (Math.abs(tf.timestampMs - ballFrame.timestampMs) > toleranceMs) continue;
    const d = euclidean(tf.x, tf.y, ballFrame.fx, ballFrame.fy);
    if (d < bestDist) {
      bestDist = d;
      best = tf;
    }
  }
  return best;
}

/** Detect when ball changes possession (leaves player vicinity) */
function detectPossessionWindows(
  trackFrames: TrackFrame[],
  ballFrames: BallFrame[],
  possessionRadiusM: number,
): Array<{
  trackId: number;
  startMs: number;
  endMs: number;
  startPos: { fx: number; fy: number };
  endBallSpeed: number;
}> {
  const windows: Array<{
    trackId: number;
    startMs: number;
    endMs: number;
    startPos: { fx: number; fy: number };
    endBallSpeed: number;
  }> = [];

  let currentHolder: number | null = null;
  let windowStart = 0;
  let startPos = { fx: 0, fy: 0 };

  for (const bf of ballFrames) {
    if (!bf.visible) continue;

    const nearest = findNearestPlayer(bf, trackFrames, 100);
    if (!nearest) continue;

    const dist = euclidean(nearest.x, nearest.y, bf.fx, bf.fy);

    if (dist <= possessionRadiusM) {
      if (currentHolder !== nearest.trackId) {
        // New possession
        if (currentHolder !== null) {
          windows.push({
            trackId: currentHolder,
            startMs: windowStart,
            endMs: bf.timestampMs,
            startPos,
            endBallSpeed: bf.speedMs,
          });
        }
        currentHolder = nearest.trackId;
        windowStart = bf.timestampMs;
        startPos = { fx: bf.fx, fy: bf.fy };
      }
    } else if (currentHolder !== null) {
      // Lost possession
      windows.push({
        trackId: currentHolder,
        startMs: windowStart,
        endMs: bf.timestampMs,
        startPos,
        endBallSpeed: bf.speedMs,
      });
      currentHolder = null;
    }
  }

  // Close last window
  if (currentHolder !== null && ballFrames.length > 0) {
    const last = ballFrames[ballFrames.length - 1];
    windows.push({
      trackId: currentHolder,
      startMs: windowStart,
      endMs: last.timestampMs,
      startPos,
      endBallSpeed: last.speedMs,
    });
  }

  return windows;
}

/** Classify action type based on ball speed and possession duration */
function classifyAction(
  durationMs: number,
  endBallSpeed: number,
  distanceFromGoal: number | null,
): ActionType {
  if (endBallSpeed > 15) return "shot";
  if (endBallSpeed > 8 && (distanceFromGoal ?? 50) < 30) return "cross";
  if (durationMs < 800 && endBallSpeed > 5) return "pass_short";
  if (endBallSpeed > 10) return "pass_long";
  if (durationMs > 2000) return "dribble";
  if (durationMs < 400) return "clearance";
  return "pass_short";
}

/** Estimate decision moment from player speed changes */
function estimateDecisionMs(
  trackId: number,
  startMs: number,
  endMs: number,
  trackFrames: TrackFrame[],
): number {
  const playerFrames = trackFrames.filter(
    tf => tf.trackId === trackId &&
      tf.timestampMs >= startMs &&
      tf.timestampMs <= Math.min(endMs, startMs + DECISION_WINDOW_MS),
  );

  if (playerFrames.length < 3) {
    // Fallback: midpoint between reception and execution
    return startMs + (endMs - startMs) * 0.4;
  }

  // Find significant speed/direction change → that's the decision point
  for (let i = 1; i < playerFrames.length; i++) {
    const speedDelta = Math.abs(playerFrames[i].speedMs - playerFrames[i - 1].speedMs);
    if (speedDelta > SPEED_CHANGE_THRESHOLD) {
      return playerFrames[i].timestampMs;
    }
  }

  // Fallback: 40% into the possession window
  return startMs + (endMs - startMs) * 0.4;
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Link ball tracking + player tracking into LinkedEvent[] timeline.
 * Each event represents one possession→action sequence.
 */
export function linkTemporalEvents(input: EventLinkerInput): LinkedEvent[] {
  const possessionRadiusM = input.possessionRadiusM ?? DEFAULT_POSSESSION_RADIUS_M;
  const minEventGapMs = input.minEventGapMs ?? DEFAULT_MIN_EVENT_GAP_MS;

  // Step 1: Detect possession windows
  const windows = detectPossessionWindows(
    input.trackFrames,
    input.ballFrames,
    possessionRadiusM,
  );

  // Step 2: Convert windows to LinkedEvents
  const events: LinkedEvent[] = [];
  const lastEventByTrack = new Map<number, number>();

  for (const w of windows) {
    const duration = w.endMs - w.startMs;
    if (duration < 200) continue; // too short, noise

    // Dedup: min gap between events for same player
    const lastMs = lastEventByTrack.get(w.trackId) ?? 0;
    if (w.startMs - lastMs < minEventGapMs) continue;

    // Estimate decision moment
    const decisionMs = estimateDecisionMs(
      w.trackId,
      w.startMs,
      w.endMs,
      input.trackFrames,
    );

    // Classify action
    const actionType = classifyAction(duration, w.endBallSpeed, null);

    // Simple outcome heuristic: if next possession is by same team → successful
    // For now use neutral as default (enriched later with team context)
    const outcome: ActionOutcome = w.endBallSpeed > 3 ? "successful" : "neutral";

    const decisionTimeMs = Math.max(0, decisionMs - w.startMs);
    const executionTimeMs = Math.max(0, w.endMs - decisionMs);

    // Confidence based on data quality
    const confidence = Math.min(1,
      (duration > 300 ? 0.3 : 0.1) +
      (decisionTimeMs > 100 ? 0.3 : 0.1) +
      (w.endBallSpeed > 0 ? 0.2 : 0.0) +
      0.2,
    );

    events.push({
      trackId: w.trackId,
      receptionMs: w.startMs,
      decisionMs,
      executionMs: w.endMs,
      actionType,
      outcome,
      pressureLevel: 0, // enriched by PressureContextModel
      fieldPosition: w.startPos,
      decisionTimeMs,
      executionTimeMs,
      confidence,
    });

    lastEventByTrack.set(w.trackId, w.endMs);
  }

  return events;
}

/**
 * Enrich LinkedEvents with pressure context from PressureContextModel.
 */
export function enrichWithPressure(
  events: LinkedEvent[],
  pressureContexts: PressureContext[],
): LinkedEvent[] {
  return events.map(event => {
    // Find nearest pressure context for this event's decision moment
    const matchingCtx = pressureContexts
      .filter(pc => pc.trackId === event.trackId)
      .reduce<PressureContext | null>((best, ctx) => {
        const dist = Math.abs(ctx.timestampMs - event.decisionMs);
        if (!best || dist < Math.abs(best.timestampMs - event.decisionMs)) return ctx;
        return best;
      }, null);

    return {
      ...event,
      pressureLevel: matchingCtx?.combinedPressureLevel ?? event.pressureLevel,
    };
  });
}
