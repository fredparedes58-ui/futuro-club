/**
 * VITAS · xG Model (Sprint 6 — xG with PHV)
 *
 * Logistic regression xG model with freeze-frame features:
 *   - Distance to goal
 *   - Angle to goal (visible goal width)
 *   - Shot type (foot / header via MediaPipe keypoints)
 *   - Body orientation at shot moment
 *   - Defenders in goal cone
 *   - GK position
 *   - Previous action type
 *   - Ball speed at shot
 *
 * Coefficients calibrated against StatsBomb open data distributions.
 *
 * Replaces the simple estimateXG() in eventDetectionEngine.ts
 * and the zone-based shotXg() in zoneXg.ts with a richer model.
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShotContext {
  /** Shot position in field coordinates (meters) */
  position: { fx: number; fy: number };
  /** Shot type: foot or header (inferred from MediaPipe keypoints) */
  shotType: "foot" | "header";
  /** Body orientation angle at shot moment (degrees, 0 = facing goal) */
  bodyOrientation: number;
  /** Number of defenders in the goal cone */
  defendersInCone: number;
  /** GK position relative to goal center (0 = centered, 1 = at post) */
  gkOffCenter: number;
  /** Previous action type before the shot */
  previousAction: "open_play" | "set_piece" | "counter" | "rebound" | "penalty";
  /** Ball speed at shot moment (m/s), 0 if unknown */
  ballSpeedMs: number;
  /** Whether shot is first-time (no control/touch before) */
  firstTime: boolean;
}

export interface XgResult {
  /** Expected goals probability (0-1) */
  xg: number;
  /** Distance to goal center (meters) */
  distanceM: number;
  /** Visible goal angle (radians) */
  angleRad: number;
  /** Model confidence (based on available features) */
  confidence: number;
  /** Whether PHV adjustment was applied */
  phvAdjusted: boolean;
  /** Feature contributions (for explainability) */
  contributions: Record<string, number>;
}

// ─── Constants ──────────────────────────────────────────────────────────────

const FIELD_LENGTH = 105;
const FIELD_WIDTH = 68;
const GOAL_X = 105;
const GOAL_Y = 34; // center of goal
const GOAL_WIDTH = 7.32;

// ─── Logistic Regression Coefficients ───────────────────────────────────────
// Calibrated against StatsBomb open data shot distributions
// z = intercept + sum(coeff_i * feature_i)
// xG = sigmoid(z) = 1 / (1 + exp(-z))

const COEFF = {
  intercept: -2.80,
  /** Distance to goal (negative: further = less likely) */
  distance: -0.095,
  /** Visible goal angle (positive: wider angle = more likely) */
  angle: 1.65,
  /** Header penalty (headers are harder to score) */
  header: -0.42,
  /** Body orientation (facing goal = better, 0-1 scale) */
  bodyOrientation: 0.35,
  /** Defenders in cone (more = harder) */
  defenders: -0.18,
  /** GK off-center (more off = easier) */
  gkOffCenter: 0.55,
  /** Set piece (corners/free kicks have different dynamics) */
  setPiece: -0.15,
  /** Penalty (very high xG) */
  penalty: 3.20,
  /** Counter attack (slightly higher xG) */
  counter: 0.25,
  /** Rebound (high xG, chaotic play) */
  rebound: 0.40,
  /** Ball speed (faster shots harder to save) */
  ballSpeed: 0.03,
  /** First time shot (harder to execute but GK less prepared) */
  firstTime: -0.10,
};

// ─── Core xG Computation ────────────────────────────────────────────────────

/**
 * Compute xG from a full ShotContext with all features.
 *
 * @param ctx - Shot context with all available features
 * @returns XgResult with xG probability and feature breakdown
 */
export function computeXg(ctx: ShotContext): XgResult {
  const dist = distanceToGoal(ctx.position.fx, ctx.position.fy);
  const angle = goalAngle(ctx.position.fx, ctx.position.fy);

  // Normalize features
  const distNorm = Math.max(0, dist);
  const angleNorm = Math.max(0, angle);
  const orientNorm = Math.max(0, Math.min(1, 1 - Math.abs(ctx.bodyOrientation) / 90));
  const defNorm = Math.min(5, ctx.defendersInCone);
  const gkNorm = Math.max(0, Math.min(1, ctx.gkOffCenter));
  const speedNorm = Math.min(30, ctx.ballSpeedMs);

  // Build linear combination
  const contributions: Record<string, number> = {};

  contributions.intercept = COEFF.intercept;
  contributions.distance = COEFF.distance * distNorm;
  contributions.angle = COEFF.angle * angleNorm;
  contributions.header = ctx.shotType === "header" ? COEFF.header : 0;
  contributions.bodyOrientation = COEFF.bodyOrientation * orientNorm;
  contributions.defenders = COEFF.defenders * defNorm;
  contributions.gkOffCenter = COEFF.gkOffCenter * gkNorm;
  contributions.ballSpeed = COEFF.ballSpeed * speedNorm;
  contributions.firstTime = ctx.firstTime ? COEFF.firstTime : 0;

  // Previous action bonuses
  if (ctx.previousAction === "penalty") {
    contributions.penalty = COEFF.penalty;
  } else if (ctx.previousAction === "set_piece") {
    contributions.setPiece = COEFF.setPiece;
  } else if (ctx.previousAction === "counter") {
    contributions.counter = COEFF.counter;
  } else if (ctx.previousAction === "rebound") {
    contributions.rebound = COEFF.rebound;
  }

  // Sum z
  let z = 0;
  for (const v of Object.values(contributions)) z += v;

  // Sigmoid
  const xg = sigmoid(z);

  // Confidence based on how many features were populated
  let featureCount = 3; // distance + angle + shotType always available
  if (ctx.bodyOrientation !== 0) featureCount++;
  if (ctx.defendersInCone > 0) featureCount++;
  if (ctx.gkOffCenter > 0) featureCount++;
  if (ctx.ballSpeedMs > 0) featureCount++;
  const confidence = Math.min(1.0, 0.5 + featureCount * 0.07);

  return {
    xg: clamp(xg, 0.01, 0.99),
    distanceM: round3(dist),
    angleRad: round3(angle),
    confidence,
    phvAdjusted: false,
    contributions,
  };
}

/**
 * Simple xG from position only (backward compatible with estimateXG).
 * Used when no ShotContext is available.
 */
export function computeXgSimple(fx: number, fy: number): number {
  const dist = distanceToGoal(fx, fy);
  const angle = goalAngle(fx, fy);

  const z = COEFF.intercept + COEFF.distance * dist + COEFF.angle * angle;
  return clamp(sigmoid(z), 0.01, 0.95);
}

// ─── Feature Helpers ────────────────────────────────────────────────────────

function distanceToGoal(fx: number, fy: number): number {
  return Math.sqrt((GOAL_X - fx) ** 2 + (GOAL_Y - fy) ** 2);
}

/**
 * Visible goal angle from position (radians).
 * The angle subtended by the goal posts as seen from (fx, fy).
 */
function goalAngle(fx: number, fy: number): number {
  const dx = GOAL_X - fx;
  if (dx <= 0) return 0;
  const goalLeft = GOAL_Y - GOAL_WIDTH / 2;
  const goalRight = GOAL_Y + GOAL_WIDTH / 2;
  const a1 = Math.atan2(goalLeft - fy, dx);
  const a2 = Math.atan2(goalRight - fy, dx);
  return Math.abs(a2 - a1);
}

/**
 * Infer shot type from MediaPipe keypoints.
 * Header if: nose Y < mean(hip Y) (head higher than normal relative to body).
 * This is a rough heuristic — uses trunk lean as proxy.
 */
export function inferShotType(
  keypoints?: Array<{ x: number; y: number; confidence: number }>,
): "foot" | "header" {
  if (!keypoints || keypoints.length < 17) return "foot";

  // COCO-17: nose=0, left_hip=11, right_hip=12
  const nose = keypoints[0];
  const lHip = keypoints[11];
  const rHip = keypoints[12];

  if (nose.confidence < 0.3 || lHip.confidence < 0.3 || rHip.confidence < 0.3) {
    return "foot";
  }

  const hipY = (lHip.y + rHip.y) / 2;
  const bodyHeight = Math.abs(hipY - nose.y);

  // If body is very compact (crouching for header) and head is elevated
  // relative to hip, classify as header
  if (bodyHeight < 30 && nose.y < hipY) {
    return "header";
  }

  return "foot";
}

/**
 * Count defenders in the goal cone between shot position and goal posts.
 * Uses a triangular region from shot position to both goal posts.
 */
export function countDefendersInCone(
  shotPos: { fx: number; fy: number },
  defenders: Array<{ fx: number; fy: number }>,
): number {
  const goalLeft = { x: GOAL_X, y: GOAL_Y - GOAL_WIDTH / 2 };
  const goalRight = { x: GOAL_X, y: GOAL_Y + GOAL_WIDTH / 2 };

  let count = 0;
  for (const def of defenders) {
    if (isPointInTriangle(
      def.fx, def.fy,
      shotPos.fx, shotPos.fy,
      goalLeft.x, goalLeft.y,
      goalRight.x, goalRight.y,
    )) {
      count++;
    }
  }
  return count;
}

// ─── Geometry Helpers ───────────────────────────────────────────────────────

function isPointInTriangle(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
  x3: number, y3: number,
): boolean {
  const d1 = sign(px, py, x1, y1, x2, y2);
  const d2 = sign(px, py, x2, y2, x3, y3);
  const d3 = sign(px, py, x3, y3, x1, y1);

  const hasNeg = (d1 < 0) || (d2 < 0) || (d3 < 0);
  const hasPos = (d1 > 0) || (d2 > 0) || (d3 > 0);

  return !(hasNeg && hasPos);
}

function sign(
  px: number, py: number,
  x1: number, y1: number,
  x2: number, y2: number,
): number {
  return (px - x2) * (y1 - y2) - (x1 - x2) * (py - y2);
}

function sigmoid(z: number): number {
  return 1 / (1 + Math.exp(-z));
}

function clamp(v: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, v));
}

function round3(n: number): number {
  return Math.round(n * 1000) / 1000;
}
