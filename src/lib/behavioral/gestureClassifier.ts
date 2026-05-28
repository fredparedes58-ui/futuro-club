/**
 * VITAS · Gesture Classifier (Sprint 17)
 *
 * Classifies communication gestures from COCO-17 keypoint angles.
 * Input: Keypoint[] (COCO-17) + timestampMs per frame.
 * Output: GestureEvent[] with type, duration, confidence.
 *
 * Gestures detected:
 *   - pointing: 1 arm extended >150°, >0.5s
 *   - organizing: 2 arms >120°, dead ball
 *   - clapping: wrists <15cm + rapid cycle
 *   - frustration: both hands to head
 *   - celebration: arms raised above shoulders
 *   - calling_ball: 1 arm raised, palm open
 *
 * Reuses same COCO-17 keypoints as PoseAnalyzer:
 *   5/6: shoulders, 7/8: elbows, 9/10: wrists, 11/12: hips
 */

import type { GestureEvent, GestureType } from "./types";

// ─── Input types ─────────────────────────────────────────────────────────

interface Keypoint {
  x: number;
  y: number;
  confidence: number;
}

export interface GestureFrame {
  trackId: number;
  timestampMs: number;
  /** COCO-17 keypoints (at least indices 0, 5-12 needed) */
  keypoints: Keypoint[];
}

export interface GestureClassifierConfig {
  /** Minimum gesture duration in ms (default: 300) */
  minDurationMs?: number;
  /** Minimum keypoint confidence to use (default: 0.3) */
  minKeypointConfidence?: number;
  /** Whether ball is in play (affects gesture classification) */
  ballInPlay?: boolean;
}

// ─── COCO-17 Keypoint Indices ────────────────────────────────────────────

const KP = {
  NOSE: 0,
  LEFT_EYE: 1,
  RIGHT_EYE: 2,
  LEFT_EAR: 3,
  RIGHT_EAR: 4,
  LEFT_SHOULDER: 5,
  RIGHT_SHOULDER: 6,
  LEFT_ELBOW: 7,
  RIGHT_ELBOW: 8,
  LEFT_WRIST: 9,
  RIGHT_WRIST: 10,
  LEFT_HIP: 11,
  RIGHT_HIP: 12,
};

// ─── Angle Calculation ───────────────────────────────────────────────────

/** Calculate angle at joint B given points A-B-C (in degrees) */
function jointAngle(a: Keypoint, b: Keypoint, c: Keypoint): number {
  const ba = { x: a.x - b.x, y: a.y - b.y };
  const bc = { x: c.x - b.x, y: c.y - b.y };
  const dot = ba.x * bc.x + ba.y * bc.y;
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2);
  if (magBA === 0 || magBC === 0) return 0;
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return (Math.acos(cosAngle) * 180) / Math.PI;
}

function dist2D(a: Keypoint, b: Keypoint): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

function kpValid(kp: Keypoint | undefined, minConf: number): boolean {
  return kp !== undefined && kp.confidence >= minConf;
}

// ─── Gesture Detection Rules ─────────────────────────────────────────────

interface GestureCandidate {
  type: GestureType;
  confidence: number;
  keypointsUsed: number[];
}

function detectGestureInFrame(
  kps: Keypoint[],
  minConf: number,
  ballInPlay: boolean,
): GestureCandidate | null {
  const lShoulder = kps[KP.LEFT_SHOULDER];
  const rShoulder = kps[KP.RIGHT_SHOULDER];
  const lElbow = kps[KP.LEFT_ELBOW];
  const rElbow = kps[KP.RIGHT_ELBOW];
  const lWrist = kps[KP.LEFT_WRIST];
  const rWrist = kps[KP.RIGHT_WRIST];
  const lHip = kps[KP.LEFT_HIP];
  const rHip = kps[KP.RIGHT_HIP];
  const nose = kps[KP.NOSE];

  const hasLeft = kpValid(lShoulder, minConf) && kpValid(lElbow, minConf) && kpValid(lWrist, minConf);
  const hasRight = kpValid(rShoulder, minConf) && kpValid(rElbow, minConf) && kpValid(rWrist, minConf);
  const hasHips = kpValid(lHip, minConf) && kpValid(rHip, minConf);
  const hasNose = kpValid(nose, minConf);

  if (!hasLeft && !hasRight) return null;

  // Calculate arm angles
  const leftArmAngle = hasLeft && hasHips
    ? jointAngle(lHip, lShoulder, lElbow)
    : 0;
  const rightArmAngle = hasRight && hasHips
    ? jointAngle(rHip, rShoulder, rElbow)
    : 0;
  const leftElbowAngle = hasLeft
    ? jointAngle(lShoulder, lElbow, lWrist)
    : 0;
  const rightElbowAngle = hasRight
    ? jointAngle(rShoulder, rElbow, rWrist)
    : 0;

  // ── Frustration: both hands near head ──
  if (hasLeft && hasRight && hasNose) {
    const lWristToNose = dist2D(lWrist, nose);
    const rWristToNose = dist2D(rWrist, nose);
    const headSize = hasNose && kpValid(kps[KP.LEFT_EAR], minConf)
      ? dist2D(nose, kps[KP.LEFT_EAR]) * 3
      : 0.15; // ~15cm normalized

    if (lWristToNose < headSize && rWristToNose < headSize) {
      return {
        type: "frustration",
        confidence: Math.min(lWrist.confidence, rWrist.confidence, nose.confidence),
        keypointsUsed: [KP.NOSE, KP.LEFT_WRIST, KP.RIGHT_WRIST],
      };
    }
  }

  // ── Celebration: both arms raised above shoulders ──
  if (hasLeft && hasRight) {
    const leftRaised = lWrist.y < lShoulder.y && leftArmAngle > 120;
    const rightRaised = rWrist.y < rShoulder.y && rightArmAngle > 120;
    if (leftRaised && rightRaised) {
      return {
        type: "celebration",
        confidence: Math.min(lWrist.confidence, rWrist.confidence) * 0.9,
        keypointsUsed: [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER, KP.LEFT_WRIST, KP.RIGHT_WRIST],
      };
    }
  }

  // ── Clapping: wrists close together + both arms in front ──
  if (hasLeft && hasRight) {
    const wristDist = dist2D(lWrist, rWrist);
    const shoulderWidth = dist2D(lShoulder, rShoulder);
    if (wristDist < shoulderWidth * 0.3 && leftElbowAngle < 120 && rightElbowAngle < 120) {
      return {
        type: "clapping",
        confidence: Math.min(lWrist.confidence, rWrist.confidence) * 0.85,
        keypointsUsed: [KP.LEFT_WRIST, KP.RIGHT_WRIST, KP.LEFT_ELBOW, KP.RIGHT_ELBOW],
      };
    }
  }

  // ── Organizing: both arms spread >120° (during dead ball) ──
  if (!ballInPlay && hasLeft && hasRight) {
    if (leftArmAngle > 120 && rightArmAngle > 120 && leftElbowAngle > 140 && rightElbowAngle > 140) {
      return {
        type: "organizing",
        confidence: Math.min(lShoulder.confidence, rShoulder.confidence) * 0.8,
        keypointsUsed: [KP.LEFT_SHOULDER, KP.RIGHT_SHOULDER, KP.LEFT_ELBOW, KP.RIGHT_ELBOW, KP.LEFT_WRIST, KP.RIGHT_WRIST],
      };
    }
  }

  // ── Pointing: 1 arm extended >150° (elbow nearly straight) ──
  if (hasLeft && leftElbowAngle > 150 && leftArmAngle > 60) {
    return {
      type: "pointing",
      confidence: lWrist.confidence * 0.85,
      keypointsUsed: [KP.LEFT_SHOULDER, KP.LEFT_ELBOW, KP.LEFT_WRIST],
    };
  }
  if (hasRight && rightElbowAngle > 150 && rightArmAngle > 60) {
    return {
      type: "pointing",
      confidence: rWrist.confidence * 0.85,
      keypointsUsed: [KP.RIGHT_SHOULDER, KP.RIGHT_ELBOW, KP.RIGHT_WRIST],
    };
  }

  // ── Calling ball: 1 arm raised above shoulder, other not ──
  if (hasLeft && !hasRight && lWrist.y < lShoulder.y && leftArmAngle > 90) {
    return {
      type: "calling_ball",
      confidence: lWrist.confidence * 0.75,
      keypointsUsed: [KP.LEFT_SHOULDER, KP.LEFT_WRIST],
    };
  }
  if (hasRight && !hasLeft && rWrist.y < rShoulder.y && rightArmAngle > 90) {
    return {
      type: "calling_ball",
      confidence: rWrist.confidence * 0.75,
      keypointsUsed: [KP.RIGHT_SHOULDER, KP.RIGHT_WRIST],
    };
  }

  return null;
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Classify gestures across all frames for a specific player.
 * Merges consecutive frames with same gesture into single events.
 */
export function classifyGestures(
  frames: GestureFrame[],
  trackId: number,
  config: GestureClassifierConfig = {},
): GestureEvent[] {
  const minDurationMs = config.minDurationMs ?? 300;
  const minConf = config.minKeypointConfidence ?? 0.3;
  const ballInPlay = config.ballInPlay ?? true;

  // Filter for target player, sort by time
  const playerFrames = frames
    .filter(f => f.trackId === trackId)
    .sort((a, b) => a.timestampMs - b.timestampMs);

  if (playerFrames.length === 0) return [];

  // Detect gesture in each frame
  const frameCandidates: Array<{
    timestampMs: number;
    candidate: GestureCandidate;
  }> = [];

  for (const frame of playerFrames) {
    if (frame.keypoints.length < 13) continue; // need at least indices 0-12
    const candidate = detectGestureInFrame(frame.keypoints, minConf, ballInPlay);
    if (candidate) {
      frameCandidates.push({ timestampMs: frame.timestampMs, candidate });
    }
  }

  // Merge consecutive same-type gestures into events
  const events: GestureEvent[] = [];
  let currentType: GestureType | null = null;
  let startMs = 0;
  let maxConfidence = 0;
  let keypointsUsed: number[] = [];

  for (let i = 0; i < frameCandidates.length; i++) {
    const { timestampMs, candidate } = frameCandidates[i];
    const gap = i > 0 ? timestampMs - frameCandidates[i - 1].timestampMs : 0;

    if (candidate.type === currentType && gap < 500) {
      // Continue existing gesture
      maxConfidence = Math.max(maxConfidence, candidate.confidence);
      keypointsUsed = [...new Set([...keypointsUsed, ...candidate.keypointsUsed])];
    } else {
      // Close previous gesture if it meets duration threshold
      if (currentType !== null) {
        const endMs = frameCandidates[i - 1].timestampMs;
        const duration = endMs - startMs;
        if (duration >= minDurationMs) {
          events.push({
            trackId,
            gestureType: currentType,
            startMs,
            endMs,
            durationMs: duration,
            confidence: maxConfidence,
            keypointsUsed,
          });
        }
      }

      // Start new gesture
      currentType = candidate.type;
      startMs = timestampMs;
      maxConfidence = candidate.confidence;
      keypointsUsed = [...candidate.keypointsUsed];
    }
  }

  // Close last gesture
  if (currentType !== null && frameCandidates.length > 0) {
    const endMs = frameCandidates[frameCandidates.length - 1].timestampMs;
    const duration = endMs - startMs;
    if (duration >= minDurationMs) {
      events.push({
        trackId,
        gestureType: currentType,
        startMs,
        endMs,
        durationMs: duration,
        confidence: maxConfidence,
        keypointsUsed,
      });
    }
  }

  return events;
}

/**
 * Classify gestures for all players in frames.
 */
export function classifyAllGestures(
  frames: GestureFrame[],
  config: GestureClassifierConfig = {},
): GestureEvent[] {
  const trackIds = [...new Set(frames.map(f => f.trackId))];
  return trackIds.flatMap(id => classifyGestures(frames, id, config));
}
