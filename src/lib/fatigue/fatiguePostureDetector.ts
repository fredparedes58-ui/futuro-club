/**
 * VITAS · Fatigue Posture Detector
 *
 * Detects visual signs of exhaustion from MediaPipe 33-keypoint pose data.
 * These are signals that coaches recognize on the field:
 * - Hands on knees (recovery posture)
 * - Increasing forward lean (trunk deterioration)
 * - Shorter strides (gait degradation)
 * - Longer recovery time after sprints
 * - Reduced arm swing (movement efficiency loss)
 * - Head drop (exhaustion posture)
 *
 * Each signal is computed from JointAngles (via keypointMapper.ts)
 * and MappedPoseFrame data across time windows.
 *
 * References:
 * - Diss et al. 2018 (gait changes during fatigue in football)
 * - Kellis et al. 2015 (kinematic changes with fatigue)
 * - Rampinini et al. 2011 (match-related fatigue indicators)
 */

import type { JointAngles, MappedPoseFrame } from "@/lib/mediapipe/keypointMapper";
import type { PostureSignal, PostureSignalType, PostureFatigueResult } from "./types";

// ─── Configuration ──────────────────────────────────────────────────────────

interface PostureDetectorConfig {
  /** Minimum trunk angle (degrees) for hands-on-knees detection */
  handsOnKneesTrunkAngle: number;
  /** Wrist-to-knee proximity threshold as fraction of estimated body height (0-1) */
  handsOnKneesProximityPct: number;
  /** Minimum occurrences of hands-on-knees in a 5-min window to flag */
  handsOnKneesMinOccurrences: number;
  /** Trunk lean increase threshold (degrees) over baseline to flag */
  trunkLeanIncreaseDeg: number;
  /** Stride shortening threshold (%) vs baseline to flag */
  strideShorteningPct: number;
  /** Arm swing decay threshold (%) vs baseline to flag */
  armSwingDecayPct: number;
  /** Head drop threshold (degrees) nose-to-shoulder angle change */
  headDropDeg: number;
  /** Recovery time increase threshold (%) vs baseline */
  recoveryTimeIncreasePct: number;
  /** Number of initial frames to establish baseline (first N frames) */
  baselineFrameCount: number;
  /** Minimum confidence per frame to include in analysis */
  minFrameConfidence: number;
}

const DEFAULT_CONFIG: PostureDetectorConfig = {
  handsOnKneesTrunkAngle: 45,
  handsOnKneesProximityPct: 0.15,
  handsOnKneesMinOccurrences: 3,
  trunkLeanIncreaseDeg: 5,
  strideShorteningPct: 15,
  armSwingDecayPct: 20,
  headDropDeg: 10,
  recoveryTimeIncreasePct: 40,
  baselineFrameCount: 100,
  minFrameConfidence: 0.4,
};

// ─── Posture Frame (internal) ───────────────────────────────────────────────

interface PostureFrame {
  timestampMs: number;
  jointAngles: JointAngles;
  /** Wrist Y positions (image coords, 0-1 normalized) */
  leftWristY: number;
  rightWristY: number;
  /** Knee Y positions (image coords, 0-1 normalized) */
  leftKneeY: number;
  rightKneeY: number;
  /** Ankle positions for stride measurement */
  leftAnkleX: number;
  rightAnkleX: number;
  leftAnkleY: number;
  rightAnkleY: number;
  /** Nose Y position */
  noseY: number;
  /** Shoulder midpoint Y */
  shoulderMidY: number;
  /** Estimated body height in image pixels (shoulder to ankle) */
  bodyHeightPx: number;
  /** Overall confidence */
  confidence: number;
}

// ─── Detector Class ─────────────────────────────────────────────────────────

export class FatiguePostureDetector {
  private config: PostureDetectorConfig;
  private frames: PostureFrame[] = [];

  constructor(config?: Partial<PostureDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Feed a single pose frame into the detector.
   * Call this on each MediaPipe callback.
   */
  addFrame(pose: MappedPoseFrame, timestampMs: number): void {
    if (pose.confidence < this.config.minFrameConfidence) return;

    const kps = pose.blazeKeypoints;
    if (kps.length < 33) return;

    // Extract keypoint positions (BlazePose indices)
    // 11=left shoulder, 12=right shoulder, 13=left elbow, 14=right elbow
    // 15=left wrist, 16=right wrist, 23=left hip, 24=right hip
    // 25=left knee, 26=right knee, 27=left ankle, 28=right ankle
    // 0=nose

    const lShoulder = kps[11];
    const rShoulder = kps[12];
    const lWrist = kps[15];
    const rWrist = kps[16];
    const lKnee = kps[25];
    const rKnee = kps[26];
    const lAnkle = kps[27];
    const rAnkle = kps[28];
    const nose = kps[0];

    const shoulderMidY = (lShoulder.y + rShoulder.y) / 2;
    const ankleMidY = (lAnkle.y + rAnkle.y) / 2;
    const bodyHeightPx = Math.abs(ankleMidY - shoulderMidY);

    this.frames.push({
      timestampMs,
      jointAngles: pose.jointAngles,
      leftWristY: lWrist.y,
      rightWristY: rWrist.y,
      leftKneeY: lKnee.y,
      rightKneeY: rKnee.y,
      leftAnkleX: lAnkle.x,
      rightAnkleX: rAnkle.x,
      leftAnkleY: lAnkle.y,
      rightAnkleY: rAnkle.y,
      noseY: nose.y,
      shoulderMidY,
      bodyHeightPx: bodyHeightPx > 0 ? bodyHeightPx : 1,
      confidence: pose.confidence,
    });
  }

  /**
   * Analyze all accumulated frames and return fatigue signals.
   */
  analyze(): PostureFatigueResult {
    const validFrames = this.frames.filter(f => f.confidence >= this.config.minFrameConfidence);

    if (validFrames.length < 10) {
      return {
        signals: [],
        postureScore: 0,
        framesAnalyzed: validFrames.length,
        confidence: 0,
      };
    }

    const baseline = validFrames.slice(0, this.config.baselineFrameCount);
    const signals: PostureSignal[] = [];
    const now = validFrames[validFrames.length - 1]?.timestampMs ?? 0;

    // ── 1. Hands on Knees ──
    signals.push(this.detectHandsOnKnees(validFrames, now));

    // ── 2. Trunk Lean Increase ──
    signals.push(this.detectTrunkLeanIncrease(validFrames, baseline, now));

    // ── 3. Stride Shortening ──
    signals.push(this.detectStrideShortening(validFrames, baseline, now));

    // ── 4. Arm Swing Decay ──
    signals.push(this.detectArmSwingDecay(validFrames, baseline, now));

    // ── 5. Head Drop ──
    signals.push(this.detectHeadDrop(validFrames, baseline, now));

    // ── 6. Recovery Time Increase ──
    // Note: This requires sprint data integration — we approximate from
    // speed proxy (large ankle displacement changes)
    signals.push(this.detectRecoveryTimeIncrease(validFrames, baseline, now));

    const activeSignals = signals.filter(s => s.active);
    const postureScore = activeSignals.length > 0
      ? Math.min(100, activeSignals.reduce((sum, s) => sum + s.severity * 20, 0))
      : 0;

    const avgConfidence = validFrames.reduce((s, f) => s + f.confidence, 0) / validFrames.length;

    return {
      signals,
      postureScore: Math.round(postureScore),
      framesAnalyzed: validFrames.length,
      confidence: Math.round(avgConfidence * 100) / 100,
    };
  }

  /**
   * Reset the detector (for new session).
   */
  reset(): void {
    this.frames = [];
  }

  // ─── Signal Detectors ──────────────────────────────────────────────────────

  private detectHandsOnKnees(frames: PostureFrame[], now: number): PostureSignal {
    let occurrences = 0;
    let firstDetected = 0;

    for (const f of frames) {
      const trunkAngle = f.jointAngles.trunkLean;
      if (trunkAngle < this.config.handsOnKneesTrunkAngle) continue;

      // Check wrist-knee proximity (both hands near knees)
      const lProximity = Math.abs(f.leftWristY - f.leftKneeY) / f.bodyHeightPx;
      const rProximity = Math.abs(f.rightWristY - f.rightKneeY) / f.bodyHeightPx;

      if (lProximity < this.config.handsOnKneesProximityPct ||
          rProximity < this.config.handsOnKneesProximityPct) {
        occurrences++;
        if (firstDetected === 0) firstDetected = f.timestampMs;
      }
    }

    const active = occurrences >= this.config.handsOnKneesMinOccurrences;
    const severity = active ? Math.min(1, occurrences / 10) : 0;

    return {
      type: "hands_on_knees",
      severity,
      active,
      firstDetectedMs: firstDetected || now,
      occurrences,
      description: active
        ? `Detectadas ${occurrences} posturas de recuperación (manos en rodillas)`
        : "No se detectaron posturas de recuperación",
    };
  }

  private detectTrunkLeanIncrease(
    frames: PostureFrame[],
    baseline: PostureFrame[],
    now: number,
  ): PostureSignal {
    const baselineLean = avg(baseline.map(f => f.jointAngles.trunkLean));
    const lastQuarter = frames.slice(Math.floor(frames.length * 0.75));
    const currentLean = avg(lastQuarter.map(f => f.jointAngles.trunkLean));

    const increase = currentLean - baselineLean;
    const active = increase >= this.config.trunkLeanIncreaseDeg;
    const severity = active ? Math.min(1, increase / 15) : 0;

    return {
      type: "trunk_lean_increase",
      severity,
      active,
      firstDetectedMs: active ? lastQuarter[0]?.timestampMs ?? now : now,
      occurrences: active ? 1 : 0,
      description: active
        ? `Inclinación del tronco aumentó ${increase.toFixed(1)}° vs inicio (${baselineLean.toFixed(1)}° → ${currentLean.toFixed(1)}°)`
        : `Inclinación del tronco estable (${currentLean.toFixed(1)}°)`,
    };
  }

  private detectStrideShortening(
    frames: PostureFrame[],
    baseline: PostureFrame[],
    now: number,
  ): PostureSignal {
    // Stride length approximation: max ankle-to-ankle distance in X per stride cycle
    const strideLength = (frameSet: PostureFrame[]) => {
      const distances = frameSet.map(f =>
        Math.sqrt(
          Math.pow(f.leftAnkleX - f.rightAnkleX, 2) +
          Math.pow(f.leftAnkleY - f.rightAnkleY, 2),
        ),
      );
      // Use 90th percentile as "stride length" proxy (peak extension moments)
      distances.sort((a, b) => a - b);
      const p90idx = Math.floor(distances.length * 0.9);
      return distances[p90idx] ?? 0;
    };

    const baselineStride = strideLength(baseline);
    const lastQuarter = frames.slice(Math.floor(frames.length * 0.75));
    const currentStride = strideLength(lastQuarter);

    if (baselineStride === 0) {
      return inactiveSignal("stride_shortening", now, "Datos insuficientes para análisis de zancada");
    }

    const decayPct = ((baselineStride - currentStride) / baselineStride) * 100;
    const active = decayPct >= this.config.strideShorteningPct;
    const severity = active ? Math.min(1, decayPct / 30) : 0;

    return {
      type: "stride_shortening",
      severity,
      active,
      firstDetectedMs: active ? lastQuarter[0]?.timestampMs ?? now : now,
      occurrences: active ? 1 : 0,
      description: active
        ? `Longitud de zancada reducida ${decayPct.toFixed(1)}% vs inicio`
        : `Longitud de zancada estable (${decayPct.toFixed(1)}% variación)`,
    };
  }

  private detectArmSwingDecay(
    frames: PostureFrame[],
    baseline: PostureFrame[],
    now: number,
  ): PostureSignal {
    // Arm swing = range of shoulder angle over time windows
    const armSwingRange = (frameSet: PostureFrame[]) => {
      const leftRange = rangeOf(frameSet.map(f => f.jointAngles.leftShoulder));
      const rightRange = rangeOf(frameSet.map(f => f.jointAngles.rightShoulder));
      return (leftRange + rightRange) / 2;
    };

    const baselineSwing = armSwingRange(baseline);
    const lastQuarter = frames.slice(Math.floor(frames.length * 0.75));
    const currentSwing = armSwingRange(lastQuarter);

    if (baselineSwing === 0) {
      return inactiveSignal("arm_swing_decay", now, "Datos insuficientes para análisis de brazos");
    }

    const decayPct = ((baselineSwing - currentSwing) / baselineSwing) * 100;
    const active = decayPct >= this.config.armSwingDecayPct;
    const severity = active ? Math.min(1, decayPct / 40) : 0;

    return {
      type: "arm_swing_decay",
      severity,
      active,
      firstDetectedMs: active ? lastQuarter[0]?.timestampMs ?? now : now,
      occurrences: active ? 1 : 0,
      description: active
        ? `Balanceo de brazos reducido ${decayPct.toFixed(1)}% vs inicio`
        : `Balanceo de brazos estable`,
    };
  }

  private detectHeadDrop(
    frames: PostureFrame[],
    baseline: PostureFrame[],
    now: number,
  ): PostureSignal {
    // Head drop = nose Y getting closer to shoulder midpoint Y
    // (In image coords, Y increases downward — so nose Y moving toward shoulder Y
    //  means the gap shrinks when head drops forward)
    const headToShoulderGap = (frameSet: PostureFrame[]) =>
      avg(frameSet.map(f => Math.abs(f.shoulderMidY - f.noseY) / f.bodyHeightPx));

    const baselineGap = headToShoulderGap(baseline);
    const lastQuarter = frames.slice(Math.floor(frames.length * 0.75));
    const currentGap = headToShoulderGap(lastQuarter);

    if (baselineGap === 0) {
      return inactiveSignal("head_drop", now, "Datos insuficientes para análisis de cabeza");
    }

    // Gap shrinking = head dropped
    const dropPct = ((baselineGap - currentGap) / baselineGap) * 100;
    const active = dropPct >= 10; // 10% reduction in head-shoulder gap
    const severity = active ? Math.min(1, dropPct / 25) : 0;

    return {
      type: "head_drop",
      severity,
      active,
      firstDetectedMs: active ? lastQuarter[0]?.timestampMs ?? now : now,
      occurrences: active ? 1 : 0,
      description: active
        ? `Cabeza caída: distancia nariz-hombros reducida ${dropPct.toFixed(1)}%`
        : "Posición de cabeza estable",
    };
  }

  private detectRecoveryTimeIncrease(
    frames: PostureFrame[],
    baseline: PostureFrame[],
    now: number,
  ): PostureSignal {
    // Proxy: count frames where trunk lean is >30° (recovery posture)
    // Compare frequency in baseline vs last quarter
    const recoveryRatio = (frameSet: PostureFrame[]) => {
      if (frameSet.length === 0) return 0;
      const recovering = frameSet.filter(f => f.jointAngles.trunkLean > 30).length;
      return recovering / frameSet.length;
    };

    const baselineRatio = recoveryRatio(baseline);
    const lastQuarter = frames.slice(Math.floor(frames.length * 0.75));
    const currentRatio = recoveryRatio(lastQuarter);

    // If baseline already has high recovery ratio, can't detect increase
    if (baselineRatio > 0.3) {
      return inactiveSignal("recovery_time_increase", now, "Baseline con postura de recuperación frecuente");
    }

    const increasePct = baselineRatio > 0
      ? ((currentRatio - baselineRatio) / baselineRatio) * 100
      : currentRatio > 0.1 ? 100 : 0;

    const active = increasePct >= this.config.recoveryTimeIncreasePct;
    const severity = active ? Math.min(1, increasePct / 100) : 0;

    return {
      type: "recovery_time_increase",
      severity,
      active,
      firstDetectedMs: active ? lastQuarter[0]?.timestampMs ?? now : now,
      occurrences: active ? 1 : 0,
      description: active
        ? `Tiempo de recuperación aumentó ${increasePct.toFixed(0)}% (más frames en postura de recuperación)`
        : "Tiempo de recuperación estable",
    };
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function avg(values: number[]): number {
  if (values.length === 0) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

function rangeOf(values: number[]): number {
  if (values.length < 2) return 0;
  let min = Infinity;
  let max = -Infinity;
  for (const v of values) {
    if (v < min) min = v;
    if (v > max) max = v;
  }
  return max - min;
}

function inactiveSignal(type: PostureSignalType, now: number, desc: string): PostureSignal {
  return {
    type,
    severity: 0,
    active: false,
    firstDetectedMs: now,
    occurrences: 0,
    description: desc,
  };
}
