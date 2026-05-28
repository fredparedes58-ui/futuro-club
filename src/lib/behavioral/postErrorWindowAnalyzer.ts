/**
 * VITAS · Post-Error Window Analyzer (Sprint 18)
 *
 * Shared module that analyzes 30s windows after errors/events.
 * Used by ResilienceDetector and potentially Burnout module.
 *
 * Input: eventTimestampMs + Track[] + BallTrack.
 * Output: distance-to-ball trend, speed change%, posture change.
 */

// ─── Input types ─────────────────────────────────────────────────────────

interface TrackFrame {
  trackId: number;
  timestampMs: number;
  x: number;       // field meters
  y: number;       // field meters
  speedMs: number;
}

interface BallFrame {
  fx: number;
  fy: number;
  timestampMs: number;
}

/** Optional posture data from JointAngles */
interface PostureFrame {
  trackId: number;
  timestampMs: number;
  trunkLean: number;       // degrees from vertical
  shoulderAngle: number;   // average of left+right shoulder angles
}

export interface PostErrorWindowInput {
  /** Timestamp of the error/event */
  eventMs: number;
  /** Player track ID */
  trackId: number;
  /** Player tracking frames */
  trackFrames: TrackFrame[];
  /** Ball position frames */
  ballFrames: BallFrame[];
  /** Optional posture frames for posture change analysis */
  postureFrames?: PostureFrame[];
  /** Window duration in ms (default: 30000 = 30s) */
  windowMs?: number;
}

// ─── Output ──────────────────────────────────────────────────────────────

export interface PostErrorWindowResult {
  trackId: number;
  eventMs: number;
  windowMs: number;

  /** Distance to ball: first 5s avg vs last 5s avg. Negative = getting closer */
  ballDistanceDelta: number;
  /** Average distance to ball in window (meters) */
  avgDistanceToBallM: number;

  /** Speed change: avg speed post-error vs avg speed pre-error (5s before) */
  speedChangePct: number;
  /** Average speed in post-error window */
  avgSpeedPostMs: number;

  /** Posture change: trunk lean change (degrees). Null if no posture data */
  trunkLeanChange: number | null;
  /** Shoulder drop (negative = dropped shoulders = dejection) */
  shoulderAngleChange: number | null;

  /** Whether player moved TOWARD ball (seeking ball = resilient behavior) */
  seekingBall: boolean;
  /** Whether speed was maintained or increased */
  intensityMaintained: boolean;

  /** Composite recovery score 0-100 */
  recoveryScore: number;
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

function avgArr(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Analyze a 30s window after an error/event for a specific player.
 */
export function analyzePostErrorWindow(input: PostErrorWindowInput): PostErrorWindowResult {
  const windowMs = input.windowMs ?? 30_000;
  const { eventMs, trackId, trackFrames, ballFrames, postureFrames } = input;

  const windowEnd = eventMs + windowMs;

  // Pre-error: 5s before event
  const preStart = eventMs - 5000;
  const preFrames = trackFrames.filter(
    f => f.trackId === trackId && f.timestampMs >= preStart && f.timestampMs < eventMs,
  );

  // Post-error: full window after event
  const postFrames = trackFrames.filter(
    f => f.trackId === trackId && f.timestampMs >= eventMs && f.timestampMs <= windowEnd,
  );

  // Ball frames in post-error window
  const postBallFrames = ballFrames.filter(
    f => f.timestampMs >= eventMs && f.timestampMs <= windowEnd,
  );

  // ── Distance to ball analysis ──
  const distancesToBall: number[] = [];
  for (const pf of postFrames) {
    const nearestBall = postBallFrames.reduce<BallFrame | null>((best, bf) => {
      if (!best || Math.abs(bf.timestampMs - pf.timestampMs) < Math.abs(best.timestampMs - pf.timestampMs)) return bf;
      return best;
    }, null);
    if (nearestBall) {
      distancesToBall.push(euclidean(pf.x, pf.y, nearestBall.fx, nearestBall.fy));
    }
  }

  const firstThird = distancesToBall.slice(0, Math.ceil(distancesToBall.length / 3));
  const lastThird = distancesToBall.slice(-Math.ceil(distancesToBall.length / 3));
  const ballDistanceDelta = avgArr(lastThird) - avgArr(firstThird);
  const avgDistanceToBallM = avgArr(distancesToBall);
  const seekingBall = ballDistanceDelta < -0.5; // getting >0.5m closer

  // ── Speed analysis ──
  const preSpeed = avgArr(preFrames.map(f => f.speedMs));
  const postSpeed = avgArr(postFrames.map(f => f.speedMs));
  const speedChangePct = preSpeed > 0 ? ((postSpeed - preSpeed) / preSpeed) * 100 : 0;
  const intensityMaintained = speedChangePct > -10; // didn't drop more than 10%

  // ── Posture analysis ──
  let trunkLeanChange: number | null = null;
  let shoulderAngleChange: number | null = null;

  if (postureFrames && postureFrames.length > 0) {
    const prePosture = postureFrames.filter(
      f => f.trackId === trackId && f.timestampMs >= preStart && f.timestampMs < eventMs,
    );
    const postPosture = postureFrames.filter(
      f => f.trackId === trackId && f.timestampMs >= eventMs && f.timestampMs <= windowEnd,
    );

    if (prePosture.length > 0 && postPosture.length > 0) {
      trunkLeanChange = avgArr(postPosture.map(f => f.trunkLean)) - avgArr(prePosture.map(f => f.trunkLean));
      shoulderAngleChange = avgArr(postPosture.map(f => f.shoulderAngle)) - avgArr(prePosture.map(f => f.shoulderAngle));
    }
  }

  // ── Composite recovery score ──
  // Seeking ball: +30, intensity maintained: +30, speed increase: +20, posture: +20
  let recoveryScore = 0;
  if (seekingBall) recoveryScore += 30;
  if (intensityMaintained) recoveryScore += 30;
  if (speedChangePct > 5) recoveryScore += 20;
  else if (speedChangePct > -5) recoveryScore += 10;
  // Posture bonus
  if (trunkLeanChange !== null && trunkLeanChange < 3) recoveryScore += 10;
  if (shoulderAngleChange !== null && shoulderAngleChange > -5) recoveryScore += 10;
  // If no posture data, redistribute to other factors
  if (trunkLeanChange === null) recoveryScore = Math.min(100, Math.round(recoveryScore * 1.25));

  return {
    trackId,
    eventMs,
    windowMs,
    ballDistanceDelta: Math.round(ballDistanceDelta * 100) / 100,
    avgDistanceToBallM: Math.round(avgDistanceToBallM * 100) / 100,
    speedChangePct: Math.round(speedChangePct * 10) / 10,
    avgSpeedPostMs: Math.round(postSpeed * 100) / 100,
    trunkLeanChange: trunkLeanChange !== null ? Math.round(trunkLeanChange * 10) / 10 : null,
    shoulderAngleChange: shoulderAngleChange !== null ? Math.round(shoulderAngleChange * 10) / 10 : null,
    seekingBall,
    intensityMaintained,
    recoveryScore: Math.min(100, Math.max(0, recoveryScore)),
  };
}
