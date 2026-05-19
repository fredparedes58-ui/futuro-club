/**
 * VITAS · Biomechanics Engine
 *
 * Converts joint angle data from MediaPipe into actionable biomechanics scores.
 * This replaces the heuristic DrillScore with a real biomechanical analysis.
 *
 * Scoring dimensions:
 *   1. Running efficiency (knee/hip angles during sprint vs walk)
 *   2. Posture quality (trunk lean, shoulder symmetry)
 *   3. Bilateral symmetry (left vs right asymmetry)
 *   4. Movement quality (consistency of joint angles across frames)
 *   5. Injury risk indicators (extreme angles, high asymmetry)
 *
 * All reference angles come from published youth football biomechanics research:
 *   - Knee flexion during running: ~140-160° (stride phase)
 *   - Hip extension at toe-off: ~170-185°
 *   - Trunk lean during sprint: ~15-25° forward
 *   - Bilateral asymmetry <10% = normal
 */

import type { JointAngles } from "./keypointMapper";

/* ── Types ─────────────────────────────────────────────────────── */

export interface BiomechanicsScore {
  /** Overall DrillScore 0-100 */
  drillScore: number;
  /** Running efficiency score 0-100 */
  runningEfficiency: number;
  /** Posture quality score 0-100 */
  postureQuality: number;
  /** Bilateral symmetry score 0-100 (100 = perfectly symmetric) */
  bilateralSymmetry: number;
  /** Movement consistency score 0-100 */
  movementConsistency: number;
  /** Injury risk score 0-100 (0 = low risk, 100 = high risk) */
  injuryRisk: number;
  /** Asymmetry percentage (0% = symmetric, higher = worse) */
  asymmetryPct: number;
  /** Per-joint detail */
  jointDetail: JointDetail[];
  /** Confidence of the biomechanics analysis */
  confidence: number;
  /** Frames analyzed */
  framesAnalyzed: number;
  /** Actionable recommendations */
  recommendations: string[];
}

export interface JointDetail {
  joint: string;
  /** Average angle across all frames */
  avgAngle: number;
  /** Angle range (max - min) across frames */
  range: number;
  /** Angle standard deviation */
  stdDev: number;
  /** How close to optimal (0-100) */
  optimalScore: number;
  /** Left-right asymmetry for bilateral joints */
  asymmetry?: number;
  /** Flag if angle is in risky range */
  riskFlag: boolean;
}

/* ── Reference angles for youth football ───────────────────────── */

interface AngleReference {
  /** Optimal angle during running */
  optimalRun: number;
  /** Acceptable range [min, max] */
  acceptableRange: [number, number];
  /** Risk zone: angle outside this range flags injury risk */
  riskRange: [number, number];
  /** Weight in overall score */
  weight: number;
}

const ANGLE_REFERENCES: Record<string, AngleReference> = {
  knee: {
    optimalRun: 150,       // Mid-stride knee flexion
    acceptableRange: [130, 175],
    riskRange: [90, 180],  // <90° hyperflexion, =180° full lock
    weight: 0.25,
  },
  hip: {
    optimalRun: 165,       // Hip extension at toe-off
    acceptableRange: [140, 180],
    riskRange: [100, 190],
    weight: 0.20,
  },
  elbow: {
    optimalRun: 90,        // Arms at ~90° during sprint
    acceptableRange: [70, 120],
    riskRange: [30, 180],
    weight: 0.10,
  },
  shoulder: {
    optimalRun: 45,        // Arm swing amplitude
    acceptableRange: [20, 80],
    riskRange: [0, 150],
    weight: 0.10,
  },
  ankle: {
    optimalRun: 100,       // Dorsiflexion during running
    acceptableRange: [85, 120],
    riskRange: [70, 140],
    weight: 0.10,
  },
  trunkLean: {
    optimalRun: 18,        // Forward lean during sprint
    acceptableRange: [10, 30],
    riskRange: [0, 45],
    weight: 0.15,
  },
  trunkTilt: {
    optimalRun: 0,         // Should be upright (no lateral tilt)
    acceptableRange: [-8, 8],
    riskRange: [-20, 20],
    weight: 0.10,
  },
};

/* ── DrillScore Weights ────────────────────────────────────────── */

const DRILL_WEIGHTS = {
  runningEfficiency: 0.30,
  postureQuality: 0.25,
  bilateralSymmetry: 0.20,
  movementConsistency: 0.15,
  injuryPenalty: 0.10, // Subtracted from score
} as const;

/* ── Biomechanics Analyzer ─────────────────────────────────────── */

export class BiomechanicsAnalyzer {
  private angleHistory: JointAngles[] = [];
  private readonly maxHistory = 300; // ~10 seconds at 30fps

  /** Add a frame's joint angles to the history */
  addFrame(angles: JointAngles): void {
    if (angles.confidence < 0.3) return; // Skip low-confidence frames

    this.angleHistory.push(angles);

    // Keep bounded
    if (this.angleHistory.length > this.maxHistory) {
      this.angleHistory.shift();
    }
  }

  /** Calculate the full biomechanics score from accumulated frames */
  calculate(): BiomechanicsScore {
    if (this.angleHistory.length < 5) {
      return defaultBiomechanicsScore(this.angleHistory.length);
    }

    const jointDetails = this.calculateJointDetails();
    const runningEfficiency = this.calculateRunningEfficiency(jointDetails);
    const postureQuality = this.calculatePostureQuality(jointDetails);
    const bilateralSymmetry = this.calculateBilateralSymmetry();
    const movementConsistency = this.calculateMovementConsistency(jointDetails);
    const injuryRisk = this.calculateInjuryRisk(jointDetails);

    // Composite DrillScore
    const rawDrill =
      runningEfficiency * DRILL_WEIGHTS.runningEfficiency +
      postureQuality * DRILL_WEIGHTS.postureQuality +
      bilateralSymmetry * DRILL_WEIGHTS.bilateralSymmetry +
      movementConsistency * DRILL_WEIGHTS.movementConsistency;

    // Injury penalty: high injury risk reduces DrillScore
    const injuryPenalty = (injuryRisk / 100) * DRILL_WEIGHTS.injuryPenalty * 100;
    const drillScore = Math.max(0, Math.min(100, Math.round(rawDrill - injuryPenalty)));

    // Asymmetry
    const avgAsymmetry = this.calculateAvgAsymmetry();

    // Confidence
    const avgConfidence = this.angleHistory.reduce((s, a) => s + a.confidence, 0) / this.angleHistory.length;

    // Recommendations
    const recommendations = this.generateRecommendations(jointDetails, injuryRisk, avgAsymmetry);

    return {
      drillScore,
      runningEfficiency: Math.round(runningEfficiency),
      postureQuality: Math.round(postureQuality),
      bilateralSymmetry: Math.round(bilateralSymmetry),
      movementConsistency: Math.round(movementConsistency),
      injuryRisk: Math.round(injuryRisk),
      asymmetryPct: Math.round(avgAsymmetry * 10) / 10,
      jointDetail: jointDetails,
      confidence: Math.round(avgConfidence * 100) / 100,
      framesAnalyzed: this.angleHistory.length,
      recommendations,
    };
  }

  /** Reset the analyzer for a new session */
  reset(): void {
    this.angleHistory = [];
  }

  /** Get current frame count */
  get frameCount(): number {
    return this.angleHistory.length;
  }

  /* ── Private calculations ────────────────────────────────── */

  private calculateJointDetails(): JointDetail[] {
    const details: JointDetail[] = [];
    const h = this.angleHistory;

    // Bilateral joints
    const bilateralJoints: [string, (a: JointAngles) => number, (a: JointAngles) => number][] = [
      ["knee", a => a.leftKnee, a => a.rightKnee],
      ["hip", a => a.leftHip, a => a.rightHip],
      ["elbow", a => a.leftElbow, a => a.rightElbow],
      ["shoulder", a => a.leftShoulder, a => a.rightShoulder],
      ["ankle", a => a.leftAnkle, a => a.rightAnkle],
    ];

    for (const [name, leftFn, rightFn] of bilateralJoints) {
      const leftAngles = h.map(leftFn);
      const rightAngles = h.map(rightFn);
      const allAngles = [...leftAngles, ...rightAngles];
      const ref = ANGLE_REFERENCES[name];

      const avg = mean(allAngles);
      const range = Math.max(...allAngles) - Math.min(...allAngles);
      const sd = stdDev(allAngles);

      // How close to optimal
      const optimalScore = ref
        ? scoreAgainstOptimal(avg, ref.optimalRun, ref.acceptableRange)
        : 50;

      // Asymmetry
      const asymmetry = mean(h.map(a => Math.abs(leftFn(a) - rightFn(a))));

      // Risk flag
      const riskFlag = ref
        ? allAngles.some(a => a < ref.riskRange[0] || a > ref.riskRange[1])
        : false;

      details.push({
        joint: name,
        avgAngle: Math.round(avg * 10) / 10,
        range: Math.round(range * 10) / 10,
        stdDev: Math.round(sd * 10) / 10,
        optimalScore: Math.round(optimalScore),
        asymmetry: Math.round(asymmetry * 10) / 10,
        riskFlag,
      });
    }

    // Trunk (unilateral)
    const trunkJoints: [string, (a: JointAngles) => number][] = [
      ["trunkLean", a => a.trunkLean],
      ["trunkTilt", a => a.trunkTilt],
    ];

    for (const [name, fn] of trunkJoints) {
      const angles = h.map(fn);
      const ref = ANGLE_REFERENCES[name];
      const avg = mean(angles);
      const range = Math.max(...angles) - Math.min(...angles);
      const sd = stdDev(angles);

      const optimalScore = ref
        ? scoreAgainstOptimal(Math.abs(avg), Math.abs(ref.optimalRun), ref.acceptableRange.map(Math.abs) as [number, number])
        : 50;

      const riskFlag = ref
        ? angles.some(a => a < ref.riskRange[0] || a > ref.riskRange[1])
        : false;

      details.push({
        joint: name,
        avgAngle: Math.round(avg * 10) / 10,
        range: Math.round(range * 10) / 10,
        stdDev: Math.round(sd * 10) / 10,
        optimalScore: Math.round(optimalScore),
        riskFlag,
      });
    }

    return details;
  }

  private calculateRunningEfficiency(details: JointDetail[]): number {
    // Weighted average of how close each joint is to its optimal running angle
    let weighted = 0;
    let totalWeight = 0;

    for (const detail of details) {
      const ref = ANGLE_REFERENCES[detail.joint];
      if (ref) {
        weighted += detail.optimalScore * ref.weight;
        totalWeight += ref.weight;
      }
    }

    return totalWeight > 0 ? weighted / totalWeight : 50;
  }

  private calculatePostureQuality(details: JointDetail[]): number {
    const trunk = details.find(d => d.joint === "trunkLean");
    const tilt = details.find(d => d.joint === "trunkTilt");
    const shoulders = details.find(d => d.joint === "shoulder");

    let score = 50;

    // Trunk lean: should be moderate (15-25° for sprint, ~5° for jog)
    if (trunk) {
      score = trunk.optimalScore * 0.4;
    }

    // Trunk tilt: should be near 0° (upright)
    if (tilt) {
      score += tilt.optimalScore * 0.3;
    }

    // Shoulder symmetry
    if (shoulders) {
      const symScore = shoulders.asymmetry !== undefined
        ? Math.max(0, 100 - shoulders.asymmetry * 5)
        : 50;
      score += symScore * 0.3;
    }

    return Math.min(100, Math.max(0, score));
  }

  private calculateBilateralSymmetry(): number {
    const h = this.angleHistory;

    // Average asymmetry across all bilateral joints
    const kneeAsym = mean(h.map(a => a.kneeAsymmetry));
    const hipAsym = mean(h.map(a => a.hipAsymmetry));
    const elbowAsym = mean(h.map(a => Math.abs(a.leftElbow - a.rightElbow)));
    const shoulderAsym = mean(h.map(a => Math.abs(a.leftShoulder - a.rightShoulder)));
    const ankleAsym = mean(h.map(a => Math.abs(a.leftAnkle - a.rightAnkle)));

    // Weight: lower body asymmetry is more concerning for football
    const weightedAsym =
      kneeAsym * 0.30 +
      hipAsym * 0.25 +
      ankleAsym * 0.20 +
      shoulderAsym * 0.15 +
      elbowAsym * 0.10;

    // Convert: 0° asymmetry = 100, >20° asymmetry = 0
    return Math.max(0, Math.min(100, 100 - weightedAsym * 5));
  }

  private calculateMovementConsistency(details: JointDetail[]): number {
    // Lower standard deviation = more consistent movement
    let weighted = 0;
    let totalWeight = 0;

    for (const detail of details) {
      const ref = ANGLE_REFERENCES[detail.joint];
      if (ref) {
        // Normalize: stdDev of 0 = 100, stdDev of 30 = 0
        const consistencyScore = Math.max(0, 100 - detail.stdDev * 3.33);
        weighted += consistencyScore * ref.weight;
        totalWeight += ref.weight;
      }
    }

    return totalWeight > 0 ? weighted / totalWeight : 50;
  }

  private calculateInjuryRisk(details: JointDetail[]): number {
    let riskScore = 0;

    // Count risk flags
    const riskCount = details.filter(d => d.riskFlag).length;
    riskScore += riskCount * 10;

    // High knee asymmetry (>15°) indicates injury risk
    const kneeDetail = details.find(d => d.joint === "knee");
    if (kneeDetail?.asymmetry && kneeDetail.asymmetry > 15) {
      riskScore += 20;
    } else if (kneeDetail?.asymmetry && kneeDetail.asymmetry > 10) {
      riskScore += 10;
    }

    // High hip asymmetry
    const hipDetail = details.find(d => d.joint === "hip");
    if (hipDetail?.asymmetry && hipDetail.asymmetry > 15) {
      riskScore += 15;
    }

    // Excessive trunk tilt
    const trunkTilt = details.find(d => d.joint === "trunkTilt");
    if (trunkTilt && Math.abs(trunkTilt.avgAngle) > 12) {
      riskScore += 15;
    }

    // Very high range of motion (instability)
    for (const detail of details) {
      if (detail.range > 60 && detail.joint !== "shoulder") {
        riskScore += 5;
      }
    }

    return Math.min(100, riskScore);
  }

  private calculateAvgAsymmetry(): number {
    const h = this.angleHistory;
    if (h.length === 0) return 0;

    return mean(h.map(a =>
      (a.kneeAsymmetry + a.hipAsymmetry +
        Math.abs(a.leftElbow - a.rightElbow) +
        Math.abs(a.leftShoulder - a.rightShoulder) +
        Math.abs(a.leftAnkle - a.rightAnkle)
      ) / 5
    ));
  }

  private generateRecommendations(
    details: JointDetail[],
    injuryRisk: number,
    avgAsymmetry: number,
  ): string[] {
    const recs: string[] = [];

    // High asymmetry
    if (avgAsymmetry > 12) {
      const mostAsym = details
        .filter(d => d.asymmetry !== undefined)
        .sort((a, b) => (b.asymmetry ?? 0) - (a.asymmetry ?? 0))[0];
      if (mostAsym) {
        recs.push(`Asimetría bilateral alta en ${mostAsym.joint} (${mostAsym.asymmetry}°). Trabajar equilibrio muscular izq/der.`);
      }
    }

    // Poor posture
    const trunk = details.find(d => d.joint === "trunkLean");
    if (trunk && Math.abs(trunk.avgAngle) > 30) {
      recs.push(`Inclinación del tronco excesiva (${trunk.avgAngle}°). Fortalecer core y trabajo postural.`);
    }

    // Injury risk
    if (injuryRisk > 40) {
      const riskJoints = details.filter(d => d.riskFlag).map(d => d.joint);
      recs.push(`Riesgo de lesión elevado (${injuryRisk}%). Articulaciones en zona de riesgo: ${riskJoints.join(", ")}.`);
    }

    // Low knee flexion (running form)
    const knee = details.find(d => d.joint === "knee");
    if (knee && knee.optimalScore < 50) {
      recs.push(`Flexión de rodilla subóptima (${knee.avgAngle}° promedio). Trabajar técnica de carrera.`);
    }

    // Poor arm mechanics
    const elbow = details.find(d => d.joint === "elbow");
    if (elbow && elbow.optimalScore < 40) {
      recs.push(`Mecánica de brazos mejorable (codo ${elbow.avgAngle}° vs óptimo 90°). Coordinación brazos-piernas.`);
    }

    // If everything is good
    if (recs.length === 0) {
      recs.push("Biomecánica dentro de rangos normales. Mantener programa actual de entrenamiento.");
    }

    return recs;
  }
}

/* ── Helper functions ──────────────────────────────────────────── */

function mean(arr: number[]): number {
  if (arr.length === 0) return 0;
  return arr.reduce((s, v) => s + v, 0) / arr.length;
}

function stdDev(arr: number[]): number {
  if (arr.length < 2) return 0;
  const avg = mean(arr);
  const variance = arr.reduce((s, v) => s + (v - avg) ** 2, 0) / (arr.length - 1);
  return Math.sqrt(variance);
}

function scoreAgainstOptimal(
  value: number,
  optimal: number,
  acceptableRange: [number, number],
): number {
  // Perfect match = 100
  const deviation = Math.abs(value - optimal);
  const rangeWidth = (acceptableRange[1] - acceptableRange[0]) / 2;

  if (deviation === 0) return 100;
  if (deviation <= rangeWidth * 0.3) return 90;
  if (deviation <= rangeWidth * 0.6) return 70;
  if (deviation <= rangeWidth) return 50;
  if (deviation <= rangeWidth * 1.5) return 30;
  return 10;
}

function defaultBiomechanicsScore(framesAnalyzed: number): BiomechanicsScore {
  return {
    drillScore: 0,
    runningEfficiency: 0,
    postureQuality: 0,
    bilateralSymmetry: 0,
    movementConsistency: 0,
    injuryRisk: 0,
    asymmetryPct: 0,
    jointDetail: [],
    confidence: 0,
    framesAnalyzed,
    recommendations: ["Datos insuficientes. Se necesitan al menos 5 frames con pose detectada."],
  };
}

/* ── Singleton ─────────────────────────────────────────────────── */

let _analyzer: BiomechanicsAnalyzer | null = null;

export function getBiomechanicsAnalyzer(): BiomechanicsAnalyzer {
  if (!_analyzer) {
    _analyzer = new BiomechanicsAnalyzer();
  }
  return _analyzer;
}
