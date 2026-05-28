/**
 * VITAS · Session Segmenter
 *
 * Divides a training session video into segments by movement patterns.
 * Reuses existing tracking infrastructure (Track[], Voronoi, BallTrack).
 *
 * Classification logic:
 * - Players in tight circle + frequent touches = RONDO → technical
 * - Players dispersed + high speed + ball in play = GAME
 * - Players in line + repetitive movements = TECHNICAL
 * - Players in line + high speed + no ball = PHYSICAL
 * - All walking + ball frequently stopped = TRANSITION_BREAK
 * - Players stretching on ground = WARMUP/COOLDOWN
 *
 * Sprint 14: Coaching Assistant — Segmentation & Metrics
 */

import type { Track, FieldPoint, BallTrack } from "@/lib/yolo/types";
import type { TrainingSegment, SegmentType } from "@/lib/shared/sessionTypes";

// ─── Configuration ─────────────────────────────────────────────────────────

export interface SegmenterConfig {
  /** Minimum segment duration in ms (default: 120_000 = 2 min) */
  minSegmentDurationMs: number;
  /** Window size for analysis in ms (default: 30_000 = 30s) */
  analysisWindowMs: number;
  /** Speed threshold for idle detection (m/s) (default: 0.5) */
  idleSpeedThreshold: number;
  /** Speed threshold for high intensity (m/s) (default: 4.0) */
  highIntensitySpeed: number;
  /** Spread threshold for compact vs dispersed (meters) (default: 12) */
  compactSpreadThreshold: number;
  /** Minimum confidence to emit a segment (default: 0.5) */
  minConfidence: number;
}

const DEFAULT_CONFIG: SegmenterConfig = {
  minSegmentDurationMs: 120_000,
  analysisWindowMs: 30_000,
  idleSpeedThreshold: 0.5,
  highIntensitySpeed: 4.0,
  compactSpreadThreshold: 12,
  minConfidence: 0.5,
};

// ─── Window Analysis ───────────────────────────────────────────────────────

interface WindowSignals {
  avgSpeed: number;
  avgSpread: number;
  ballTouchFreq: number;
  playerCount: number;
  idlePct: number;
  highIntensityPct: number;
  movementPattern: "circular" | "linear" | "grid" | "free" | "static";
}

/**
 * Calculate spatial spread of players (standard deviation of positions)
 */
function calculatePlayerSpread(positions: FieldPoint[]): number {
  if (positions.length < 2) return 0;

  const cx = positions.reduce((s, p) => s + p.fx, 0) / positions.length;
  const cy = positions.reduce((s, p) => s + p.fy, 0) / positions.length;

  const variance =
    positions.reduce((s, p) => s + (p.fx - cx) ** 2 + (p.fy - cy) ** 2, 0) /
    positions.length;

  return Math.sqrt(variance);
}

/**
 * Detect movement pattern from position trajectories
 */
function detectMovementPattern(
  tracks: Track[],
  _windowMs: number,
): "circular" | "linear" | "grid" | "free" | "static" {
  const activeTracks = tracks.filter(
    (t) => t.lastFieldPos !== null && t.age === 0,
  );
  if (activeTracks.length < 2) return "static";

  // Calculate average displacement per track
  const avgDisplacements = activeTracks.map((t) => {
    if (t.positions.length < 2) return 0;
    return t.distanceM / Math.max(1, t.positions.length);
  });

  const avgDisplacement =
    avgDisplacements.reduce((s, d) => s + d, 0) / avgDisplacements.length;

  // Very low displacement = static (warmup stretching, cooldown)
  if (avgDisplacement < 0.02) return "static";

  // Calculate directional consistency
  const speeds = activeTracks.map((t) => t.smoothSpeedMs);
  const avgSpeed = speeds.reduce((s, v) => s + v, 0) / speeds.length;
  const speedVariance =
    speeds.reduce((s, v) => s + (v - avgSpeed) ** 2, 0) / speeds.length;

  // Low speed variance + medium displacement = linear drills
  if (speedVariance < 0.5 && avgDisplacement < 0.1) return "linear";

  // Check if players are moving in constrained area (rondo/possession)
  const spread = calculatePlayerSpread(
    activeTracks
      .filter((t) => t.lastFieldPos)
      .map((t) => t.lastFieldPos as FieldPoint),
  );

  if (spread < 8) return "circular";
  if (spread > 25) return "free";

  return "grid";
}

/**
 * Estimate ball touch frequency from ball tracker data
 */
function estimateBallTouchFrequency(
  ballTrajectory: Array<{ fx: number; fy: number; timestampMs: number }>,
  windowDurationMs: number,
): number {
  if (ballTrajectory.length < 3 || windowDurationMs <= 0) return 0;

  // Count direction changes in ball trajectory (proxy for touches)
  let directionChanges = 0;

  for (let i = 2; i < ballTrajectory.length; i++) {
    const prev = ballTrajectory[i - 2];
    const curr = ballTrajectory[i - 1];
    const next = ballTrajectory[i];

    const dx1 = curr.fx - prev.fx;
    const dy1 = curr.fy - prev.fy;
    const dx2 = next.fx - curr.fx;
    const dy2 = next.fy - curr.fy;

    // Dot product — negative means direction change
    const dot = dx1 * dx2 + dy1 * dy2;
    const mag1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
    const mag2 = Math.sqrt(dx2 * dx2 + dy2 * dy2);

    // Only count significant direction changes
    if (mag1 > 0.5 && mag2 > 0.5 && dot < 0) {
      directionChanges++;
    }
  }

  // Convert to per-minute frequency
  const durationMin = windowDurationMs / 60_000;
  return durationMin > 0 ? directionChanges / durationMin : 0;
}

/**
 * Analyze a time window of tracking data to produce signals
 */
function analyzeWindow(
  tracks: Track[],
  ballTrajectory: Array<{ fx: number; fy: number; timestampMs: number }>,
  windowDurationMs: number,
  config: SegmenterConfig,
): WindowSignals {
  const activeTracks = tracks.filter(
    (t) => t.lastFieldPos !== null && t.age === 0,
  );

  // Average speed across all players
  const speeds = activeTracks.map((t) => t.smoothSpeedMs);
  const avgSpeed =
    speeds.length > 0
      ? speeds.reduce((s, v) => s + v, 0) / speeds.length
      : 0;

  // Player spread
  const positions = activeTracks
    .filter((t) => t.lastFieldPos)
    .map((t) => t.lastFieldPos as FieldPoint);
  const avgSpread = calculatePlayerSpread(positions);

  // Ball touch frequency
  const ballTouchFreq = estimateBallTouchFrequency(
    ballTrajectory,
    windowDurationMs,
  );

  // Idle and high-intensity percentages
  const idleCount = speeds.filter(
    (s) => s < config.idleSpeedThreshold,
  ).length;
  const hiCount = speeds.filter(
    (s) => s >= config.highIntensitySpeed,
  ).length;
  const total = speeds.length || 1;

  return {
    avgSpeed,
    avgSpread,
    ballTouchFreq,
    playerCount: activeTracks.length,
    idlePct: (idleCount / total) * 100,
    highIntensityPct: (hiCount / total) * 100,
    movementPattern: detectMovementPattern(tracks, windowDurationMs),
  };
}

// ─── Segment Type Classification ───────────────────────────────────────────

interface ClassificationResult {
  type: SegmentType;
  confidence: number;
}

function classifySegment(
  signals: WindowSignals,
  config: SegmenterConfig,
): ClassificationResult {
  const {
    avgSpeed,
    avgSpread,
    ballTouchFreq,
    idlePct,
    highIntensityPct,
    movementPattern,
  } = signals;

  // Static/stretching → warmup or cooldown (resolved by position in session)
  if (movementPattern === "static" && idlePct > 70) {
    return { type: "warmup", confidence: 0.75 };
  }

  // Break/pause
  if (avgSpeed < 0.8 && ballTouchFreq < 2) {
    return { type: "transition_break", confidence: 0.7 };
  }

  // Physical conditioning: high speed, no/low ball involvement
  if (highIntensityPct > 40 && ballTouchFreq < 5) {
    return { type: "physical", confidence: 0.8 };
  }

  // Game (small-sided or full): dispersed, moderate-high speed, ball active
  if (
    avgSpread > config.compactSpreadThreshold * 2 &&
    avgSpeed > 2.5 &&
    ballTouchFreq > 10
  ) {
    if (signals.playerCount >= 14) {
      return { type: "game_full", confidence: 0.75 };
    }
    return { type: "game_small_sided", confidence: 0.75 };
  }

  // Technical: compact, high ball involvement, moderate speed
  if (
    avgSpread < config.compactSpreadThreshold &&
    ballTouchFreq > 15 &&
    avgSpeed < 3.0
  ) {
    return { type: "technical", confidence: 0.8 };
  }

  // Tactical: moderate spread, moderate ball, moderate speed
  if (
    avgSpread >= config.compactSpreadThreshold &&
    avgSpread < config.compactSpreadThreshold * 2 &&
    ballTouchFreq > 5
  ) {
    return { type: "tactical", confidence: 0.65 };
  }

  // Default fallback
  if (ballTouchFreq > 10) return { type: "technical", confidence: 0.5 };
  if (highIntensityPct > 20) return { type: "physical", confidence: 0.5 };

  return { type: "tactical", confidence: 0.4 };
}

// ─── Main Segmenter ────────────────────────────────────────────────────────

export interface SegmenterInput {
  /** Snapshots of tracks at regular intervals throughout the session */
  trackSnapshots: Array<{
    timestampMs: number;
    tracks: Track[];
  }>;
  /** Ball tracker data */
  ballTrack: BallTrack | null;
  /** Total session duration in ms */
  sessionDurationMs: number;
}

/**
 * Segment a training session into distinct drill/activity blocks.
 *
 * Algorithm:
 * 1. Divide session into fixed-size windows (30s default)
 * 2. Compute signals for each window (speed, spread, ball touches, pattern)
 * 3. Classify each window into a segment type
 * 4. Merge adjacent windows with same type into segments
 * 5. Filter out segments shorter than minimum duration
 * 6. Resolve warmup/cooldown by position (first=warmup, last=cooldown)
 */
export function segmentSession(
  input: SegmenterInput,
  configOverrides?: Partial<SegmenterConfig>,
): TrainingSegment[] {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const { trackSnapshots, ballTrack, sessionDurationMs } = input;

  if (trackSnapshots.length === 0) return [];

  // Build ball trajectory from ballTrack
  const ballTrajectory = ballTrack?.trajectory ?? [];

  // ── Step 1: Divide into analysis windows ──

  const windows: Array<{
    startMs: number;
    endMs: number;
    signals: WindowSignals;
    classification: ClassificationResult;
  }> = [];

  for (
    let windowStart = 0;
    windowStart < sessionDurationMs;
    windowStart += config.analysisWindowMs
  ) {
    const windowEnd = Math.min(
      windowStart + config.analysisWindowMs,
      sessionDurationMs,
    );

    // Find track snapshots within this window
    const windowSnapshots = trackSnapshots.filter(
      (s) => s.timestampMs >= windowStart && s.timestampMs < windowEnd,
    );

    if (windowSnapshots.length === 0) continue;

    // Use the latest snapshot's tracks for analysis
    const latestSnapshot = windowSnapshots[windowSnapshots.length - 1];

    // Filter ball trajectory for this window
    const windowBallTrajectory = ballTrajectory.filter(
      (p) => p.timestampMs >= windowStart && p.timestampMs < windowEnd,
    );

    const signals = analyzeWindow(
      latestSnapshot.tracks,
      windowBallTrajectory,
      windowEnd - windowStart,
      config,
    );

    const classification = classifySegment(signals, config);

    windows.push({
      startMs: windowStart,
      endMs: windowEnd,
      signals,
      classification,
    });
  }

  // ── Step 2: Merge adjacent windows with same type ──

  if (windows.length === 0) return [];

  const mergedSegments: Array<{
    startMs: number;
    endMs: number;
    type: SegmentType;
    signals: WindowSignals[];
    confidences: number[];
  }> = [];

  let current = {
    startMs: windows[0].startMs,
    endMs: windows[0].endMs,
    type: windows[0].classification.type,
    signals: [windows[0].signals],
    confidences: [windows[0].classification.confidence],
  };

  for (let i = 1; i < windows.length; i++) {
    const w = windows[i];

    if (w.classification.type === current.type) {
      // Extend current segment
      current.endMs = w.endMs;
      current.signals.push(w.signals);
      current.confidences.push(w.classification.confidence);
    } else {
      // Close current segment and start new one
      mergedSegments.push({ ...current });
      current = {
        startMs: w.startMs,
        endMs: w.endMs,
        type: w.classification.type,
        signals: [w.signals],
        confidences: [w.classification.confidence],
      };
    }
  }
  mergedSegments.push({ ...current });

  // ── Step 3: Filter short segments & resolve warmup/cooldown ──

  const filtered = mergedSegments.filter(
    (s) => s.endMs - s.startMs >= config.minSegmentDurationMs,
  );

  // Resolve warmup/cooldown by position
  if (filtered.length > 0) {
    const first = filtered[0];
    if (
      first.type === "warmup" ||
      first.type === "transition_break"
    ) {
      first.type = "warmup";
    }

    const last = filtered[filtered.length - 1];
    if (
      last.type === "warmup" ||
      last.type === "transition_break"
    ) {
      last.type = "cooldown";
    }
  }

  // ── Step 4: Build output TrainingSegments ──

  return filtered.map((seg, index) => {
    // Average signals across all windows in this segment
    const avgSignals = {
      playerSpread:
        seg.signals.reduce((s, w) => s + w.avgSpread, 0) / seg.signals.length,
      avgSpeed:
        seg.signals.reduce((s, w) => s + w.avgSpeed, 0) / seg.signals.length,
      ballTouchFrequency:
        seg.signals.reduce((s, w) => s + w.ballTouchFreq, 0) /
        seg.signals.length,
      playerCount: Math.round(
        seg.signals.reduce((s, w) => s + w.playerCount, 0) /
          seg.signals.length,
      ),
      movementPattern: seg.signals[Math.floor(seg.signals.length / 2)]
        .movementPattern,
      intensityLevel: ((): "low" | "medium" | "high" => {
        const avgSpd =
          seg.signals.reduce((s, w) => s + w.avgSpeed, 0) /
          seg.signals.length;
        if (avgSpd >= config.highIntensitySpeed) return "high";
        if (avgSpd >= 2.0) return "medium";
        return "low";
      })(),
    };

    const avgConfidence =
      seg.confidences.reduce((s, c) => s + c, 0) / seg.confidences.length;

    return {
      segmentIndex: index,
      startMs: seg.startMs,
      endMs: seg.endMs,
      durationMin: (seg.endMs - seg.startMs) / 60_000,
      type: seg.type,
      signals: avgSignals,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  });
}
