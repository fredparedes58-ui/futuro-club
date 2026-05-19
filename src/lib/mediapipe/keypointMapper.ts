/**
 * VITAS · Keypoint Mapper
 *
 * Bidirectional mapping between:
 *   - 33 BlazePose keypoints (MediaPipe) → 17 COCO keypoints (YOLO/poseAnalyzer)
 *   - 33 BlazePose keypoints → Joint angle calculations
 *
 * This is the bridge that connects MediaPipe output to the existing
 * VITAS pipeline (poseAnalyzer.ts, tracker.ts, homography.ts).
 *
 * Joint angle calculation uses the 3D world landmarks from MediaPipe
 * for true anatomical angles (not camera-projected).
 */

import type { Keypoint } from "@/lib/yolo/types";
import type { BlazePoseKeypoint } from "./mediaPipeService";

/* ── Types ─────────────────────────────────────────────────────── */

export interface JointAngles {
  /** Left knee angle (0° = fully bent, 180° = straight) */
  leftKnee: number;
  /** Right knee angle */
  rightKnee: number;
  /** Left hip angle (trunk-thigh angle) */
  leftHip: number;
  /** Right hip angle */
  rightHip: number;
  /** Left elbow angle */
  leftElbow: number;
  /** Right elbow angle */
  rightElbow: number;
  /** Left shoulder angle (arm elevation) */
  leftShoulder: number;
  /** Right shoulder angle */
  rightShoulder: number;
  /** Left ankle angle (dorsiflexion) */
  leftAnkle: number;
  /** Right ankle angle */
  rightAnkle: number;
  /** Trunk lean angle (forward/backward from vertical) */
  trunkLean: number;
  /** Trunk lateral tilt (left/right from vertical) */
  trunkTilt: number;
  /** Hip asymmetry: |leftHip - rightHip| degrees */
  hipAsymmetry: number;
  /** Knee asymmetry: |leftKnee - rightKnee| degrees */
  kneeAsymmetry: number;
  /** Overall confidence (avg visibility of involved keypoints) */
  confidence: number;
}

export interface MappedPoseFrame {
  /** 17 COCO keypoints (compatible with poseAnalyzer.ts) */
  cocoKeypoints: Keypoint[];
  /** Full 33 BlazePose keypoints */
  blazeKeypoints: BlazePoseKeypoint[];
  /** 3D world landmarks for biomechanics */
  worldLandmarks: BlazePoseKeypoint[];
  /** Calculated joint angles from world landmarks */
  jointAngles: JointAngles;
  /** Foot position in image coordinates (for field coverage) */
  feetPosition: {
    left: { x: number; y: number; confidence: number };
    right: { x: number; y: number; confidence: number };
    /** Best foot position (highest confidence) */
    best: { x: number; y: number; confidence: number };
  };
  /** Hip center position (for general tracking) */
  hipCenter: { x: number; y: number; confidence: number };
  /** Overall pose confidence 0-1 */
  confidence: number;
}

/* ── BlazePose → COCO-17 Mapping ───────────────────────────────── */

/**
 * BlazePose index → COCO index mapping.
 *
 * COCO-17:  0=nose 1=leftEye 2=rightEye 3=leftEar 4=rightEar
 *           5=leftShoulder 6=rightShoulder 7=leftElbow 8=rightElbow
 *           9=leftWrist 10=rightWrist 11=leftHip 12=rightHip
 *           13=leftKnee 14=rightKnee 15=leftAnkle 16=rightAnkle
 *
 * BlazePose-33: 0=nose 2=leftEye 5=rightEye 7=leftEar 8=rightEar
 *               11=leftShoulder 12=rightShoulder 13=leftElbow 14=rightElbow
 *               15=leftWrist 16=rightWrist 23=leftHip 24=rightHip
 *               25=leftKnee 26=rightKnee 27=leftAnkle 28=rightAnkle
 */
const BLAZE_TO_COCO: [number, number][] = [
  [0, 0],    // nose → nose
  [2, 1],    // left_eye → leftEye
  [5, 2],    // right_eye → rightEye
  [7, 3],    // left_ear → leftEar
  [8, 4],    // right_ear → rightEar
  [11, 5],   // left_shoulder → leftShoulder
  [12, 6],   // right_shoulder → rightShoulder
  [13, 7],   // left_elbow → leftElbow
  [14, 8],   // right_elbow → rightElbow
  [15, 9],   // left_wrist → leftWrist
  [16, 10],  // right_wrist → rightWrist
  [23, 11],  // left_hip → leftHip
  [24, 12],  // right_hip → rightHip
  [25, 13],  // left_knee → leftKnee
  [26, 14],  // right_knee → rightKnee
  [27, 15],  // left_ankle → leftAnkle
  [28, 16],  // right_ankle → rightAnkle
];

/**
 * Convert 33 BlazePose keypoints to 17 COCO keypoints.
 * This makes MediaPipe output compatible with the existing poseAnalyzer.ts.
 *
 * @param blazeKps - 33 BlazePose keypoints (normalized 0-1)
 * @param imageWidth - Video width in pixels
 * @param imageHeight - Video height in pixels
 * @returns 17 COCO keypoints in pixel coordinates (as expected by poseAnalyzer)
 */
export function blazeToCoco(
  blazeKps: BlazePoseKeypoint[],
  imageWidth: number,
  imageHeight: number,
): Keypoint[] {
  const coco: Keypoint[] = new Array(17).fill(null).map(() => ({
    x: 0,
    y: 0,
    confidence: 0,
  }));

  for (const [blazeIdx, cocoIdx] of BLAZE_TO_COCO) {
    const bp = blazeKps[blazeIdx];
    if (bp) {
      coco[cocoIdx] = {
        x: bp.x * imageWidth,
        y: bp.y * imageHeight,
        confidence: bp.visibility,
      };
    }
  }

  return coco;
}

/* ── Joint Angle Calculation ───────────────────────────────────── */

/**
 * Calculate joint angles from 3D world landmarks.
 * Uses true 3D positions (meters) for anatomically accurate angles.
 */
export function calculateJointAngles(
  worldLandmarks: BlazePoseKeypoint[],
): JointAngles {
  if (worldLandmarks.length < 33) {
    return defaultJointAngles();
  }

  // Extract relevant landmarks
  const lShoulder = worldLandmarks[11];
  const rShoulder = worldLandmarks[12];
  const lElbow = worldLandmarks[13];
  const rElbow = worldLandmarks[14];
  const lWrist = worldLandmarks[15];
  const rWrist = worldLandmarks[16];
  const lHip = worldLandmarks[23];
  const rHip = worldLandmarks[24];
  const lKnee = worldLandmarks[25];
  const rKnee = worldLandmarks[26];
  const lAnkle = worldLandmarks[27];
  const rAnkle = worldLandmarks[28];
  const lHeel = worldLandmarks[29];
  const rHeel = worldLandmarks[30];
  const lToe = worldLandmarks[31];
  const rToe = worldLandmarks[32];

  // Calculate angles
  const leftKnee = angle3D(lHip, lKnee, lAnkle);
  const rightKnee = angle3D(rHip, rKnee, rAnkle);
  const leftHip = angle3D(lShoulder, lHip, lKnee);
  const rightHip = angle3D(rShoulder, rHip, rKnee);
  const leftElbow = angle3D(lShoulder, lElbow, lWrist);
  const rightElbow = angle3D(rShoulder, rElbow, rWrist);
  const leftShoulder = angle3D(lHip, lShoulder, lElbow);
  const rightShoulder = angle3D(rHip, rShoulder, rElbow);
  const leftAnkle = angle3D(lKnee, lAnkle, lToe.visibility > 0.3 ? lToe : lHeel);
  const rightAnkle = angle3D(rKnee, rAnkle, rToe.visibility > 0.3 ? rToe : rHeel);

  // Trunk lean: angle between vertical and trunk line (shoulders midpoint → hips midpoint)
  const shoulderMid = midpoint3D(lShoulder, rShoulder);
  const hipMid = midpoint3D(lHip, rHip);
  const trunkLean = trunkAngleFromVertical(shoulderMid, hipMid, "sagittal");
  const trunkTilt = trunkAngleFromVertical(shoulderMid, hipMid, "frontal");

  // Asymmetries
  const hipAsymmetry = Math.abs(leftHip - rightHip);
  const kneeAsymmetry = Math.abs(leftKnee - rightKnee);

  // Confidence: average visibility of all involved keypoints
  const involvedKps = [
    lShoulder, rShoulder, lElbow, rElbow, lWrist, rWrist,
    lHip, rHip, lKnee, rKnee, lAnkle, rAnkle,
  ];
  const confidence = involvedKps.reduce((s, k) => s + k.visibility, 0) / involvedKps.length;

  return {
    leftKnee: round1(leftKnee),
    rightKnee: round1(rightKnee),
    leftHip: round1(leftHip),
    rightHip: round1(rightHip),
    leftElbow: round1(leftElbow),
    rightElbow: round1(rightElbow),
    leftShoulder: round1(leftShoulder),
    rightShoulder: round1(rightShoulder),
    leftAnkle: round1(leftAnkle),
    rightAnkle: round1(rightAnkle),
    trunkLean: round1(trunkLean),
    trunkTilt: round1(trunkTilt),
    hipAsymmetry: round1(hipAsymmetry),
    kneeAsymmetry: round1(kneeAsymmetry),
    confidence: round2(confidence),
  };
}

/* ── Full Frame Mapping ────────────────────────────────────────── */

/**
 * Map a single MediaPipe detection to a MappedPoseFrame.
 * This is the main entry point — takes raw MediaPipe output and produces
 * everything needed by VITAS downstream systems.
 */
export function mapPoseFrame(
  landmarks: BlazePoseKeypoint[],
  worldLandmarks: BlazePoseKeypoint[],
  imageWidth: number,
  imageHeight: number,
): MappedPoseFrame {
  // 1. COCO keypoints for poseAnalyzer
  const cocoKeypoints = blazeToCoco(landmarks, imageWidth, imageHeight);

  // 2. Joint angles from world landmarks
  const jointAngles = calculateJointAngles(worldLandmarks);

  // 3. Feet positions (for field coverage via homography)
  const lAnkle = landmarks[27];
  const rAnkle = landmarks[28];
  const lFoot = landmarks[31]; // left_foot_index (toe)
  const rFoot = landmarks[32]; // right_foot_index

  // Use toe if available, otherwise ankle
  const leftFoot = lFoot && lFoot.visibility > 0.3
    ? { x: lFoot.x * imageWidth, y: lFoot.y * imageHeight, confidence: lFoot.visibility }
    : { x: lAnkle.x * imageWidth, y: lAnkle.y * imageHeight, confidence: lAnkle.visibility };

  const rightFoot = rFoot && rFoot.visibility > 0.3
    ? { x: rFoot.x * imageWidth, y: rFoot.y * imageHeight, confidence: rFoot.visibility }
    : { x: rAnkle.x * imageWidth, y: rAnkle.y * imageHeight, confidence: rAnkle.visibility };

  const bestFoot = leftFoot.confidence >= rightFoot.confidence ? leftFoot : rightFoot;

  // 4. Hip center (for general position tracking)
  const lHip = landmarks[23];
  const rHip = landmarks[24];
  const hipCenter = {
    x: ((lHip.x + rHip.x) / 2) * imageWidth,
    y: ((lHip.y + rHip.y) / 2) * imageHeight,
    confidence: (lHip.visibility + rHip.visibility) / 2,
  };

  // 5. Overall confidence
  const confidence = landmarks.reduce((s, k) => s + k.visibility, 0) / landmarks.length;

  return {
    cocoKeypoints,
    blazeKeypoints: landmarks,
    worldLandmarks,
    jointAngles,
    feetPosition: {
      left: leftFoot,
      right: rightFoot,
      best: bestFoot,
    },
    hipCenter,
    confidence: round2(confidence),
  };
}

/* ── Helpers ───────────────────────────────────────────────────── */

/** Calculate angle at point B given three 3D points A-B-C */
function angle3D(
  a: BlazePoseKeypoint,
  b: BlazePoseKeypoint,
  c: BlazePoseKeypoint,
): number {
  // Vectors BA and BC
  const ba = { x: a.x - b.x, y: a.y - b.y, z: a.z - b.z };
  const bc = { x: c.x - b.x, y: c.y - b.y, z: c.z - b.z };

  // Dot product
  const dot = ba.x * bc.x + ba.y * bc.y + ba.z * bc.z;

  // Magnitudes
  const magBA = Math.sqrt(ba.x ** 2 + ba.y ** 2 + ba.z ** 2);
  const magBC = Math.sqrt(bc.x ** 2 + bc.y ** 2 + bc.z ** 2);

  if (magBA < 1e-10 || magBC < 1e-10) return 0;

  // Clamp to avoid NaN from acos
  const cosAngle = Math.max(-1, Math.min(1, dot / (magBA * magBC)));
  return Math.acos(cosAngle) * (180 / Math.PI);
}

/** Midpoint of two 3D points */
function midpoint3D(
  a: BlazePoseKeypoint,
  b: BlazePoseKeypoint,
): BlazePoseKeypoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: (a.visibility + b.visibility) / 2,
    name: "midpoint",
  };
}

/** Trunk angle from vertical (0° = perfectly upright) */
function trunkAngleFromVertical(
  shoulderMid: BlazePoseKeypoint,
  hipMid: BlazePoseKeypoint,
  plane: "sagittal" | "frontal",
): number {
  if (plane === "sagittal") {
    // Forward/backward lean (using Y and Z)
    const dy = shoulderMid.y - hipMid.y;
    const dz = shoulderMid.z - hipMid.z;
    return Math.atan2(dz, -dy) * (180 / Math.PI);
  } else {
    // Left/right tilt (using X and Y)
    const dx = shoulderMid.x - hipMid.x;
    const dy = shoulderMid.y - hipMid.y;
    return Math.atan2(dx, -dy) * (180 / Math.PI);
  }
}

function defaultJointAngles(): JointAngles {
  return {
    leftKnee: 0, rightKnee: 0,
    leftHip: 0, rightHip: 0,
    leftElbow: 0, rightElbow: 0,
    leftShoulder: 0, rightShoulder: 0,
    leftAnkle: 0, rightAnkle: 0,
    trunkLean: 0, trunkTilt: 0,
    hipAsymmetry: 0, kneeAsymmetry: 0,
    confidence: 0,
  };
}

function round1(n: number): number { return Math.round(n * 10) / 10; }
function round2(n: number): number { return Math.round(n * 100) / 100; }
