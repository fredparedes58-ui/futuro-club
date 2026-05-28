/**
 * VITAS · Ball Tracker (Sprint 1 — Ball Tracking)
 *
 * Dedicated Kalman-based tracker for the football.
 * Different from player tracking because:
 * - Ball moves much faster (up to 30+ m/s)
 * - Ball has more erratic trajectory (kicks, bounces, spins)
 * - Ball needs longer prediction during occlusion (maxAge=15 vs 8)
 * - Only ONE ball exists → simpler association logic
 *
 * Kalman state: [x, y, vx, vy] — position + velocity
 * Measurement: [x, y] — observed pixel center
 *
 * During occlusion (no detection), the tracker predicts using
 * velocity + deceleration model (ball slows down when rolling).
 */

import type { BallDetection } from "./ballDetector";
import type { FieldPoint } from "./types";
import { pixelToField } from "./homography";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface BallTrack {
  /** Current pixel position (observed or predicted) */
  center: { x: number; y: number };
  /** Current field position in meters (null if no homography) */
  fieldPos: FieldPoint | null;
  /** Ball speed in m/s (field coordinates) */
  speedMs: number;
  /** Whether the ball is currently visible (detected this frame) */
  visible: boolean;
  /** Frames since last detection (0 = detected this frame) */
  age: number;
  /** Total frames tracked */
  totalFrames: number;
  /** Detection confidence (0 if predicted) */
  confidence: number;
  /** Position history (last N field positions for trajectory) */
  trajectory: Array<{ fx: number; fy: number; timestampMs: number }>;
  /** Whether tracking is active (false if ball lost for too long) */
  active: boolean;
}

export interface BallTrackerConfig {
  /** Maximum frames without detection before marking inactive (default: 15) */
  maxAge: number;
  /** Maximum pixel distance for matching a detection to prediction (default: 100) */
  maxMatchDistance: number;
  /** Deceleration factor per frame during occlusion (default: 0.95) */
  decelerationFactor: number;
  /** Maximum trajectory history length (default: 300) */
  maxTrajectoryLength: number;
  /** Kalman process noise (higher = more responsive, noisier) */
  processNoise: number;
  /** Kalman measurement noise (higher = smoother, slower) */
  measurementNoise: number;
}

const DEFAULT_CONFIG: BallTrackerConfig = {
  maxAge: 15,
  maxMatchDistance: 100,
  decelerationFactor: 0.95,
  maxTrajectoryLength: 300,
  processNoise: 4.0,
  measurementNoise: 2.0,
};

// ─── Simple 2D Kalman for ball ──────────────────────────────────────────────

class BallKalman {
  // State: [x, y, vx, vy]
  private x: number[];
  // Covariance matrix (4x4 diagonal approximation)
  private P: number[];
  private Q: number; // process noise
  private R: number; // measurement noise

  constructor(x0: number, y0: number, processNoise: number, measurementNoise: number) {
    this.x = [x0, y0, 0, 0];
    this.P = [10, 10, 100, 100]; // initial covariance
    this.Q = processNoise;
    this.R = measurementNoise;
  }

  /** Predict next state (dt in seconds) */
  predict(dt: number): { x: number; y: number } {
    // State transition: x' = x + vx*dt, y' = y + vy*dt
    this.x[0] += this.x[2] * dt;
    this.x[1] += this.x[3] * dt;

    // Increase uncertainty
    this.P[0] += this.Q * dt * dt;
    this.P[1] += this.Q * dt * dt;
    this.P[2] += this.Q;
    this.P[3] += this.Q;

    return { x: this.x[0], y: this.x[1] };
  }

  /** Update with measurement */
  update(mx: number, my: number): void {
    // Kalman gain (simplified diagonal)
    const Kx = this.P[0] / (this.P[0] + this.R);
    const Ky = this.P[1] / (this.P[1] + this.R);

    // Innovation (measurement residual)
    const dx = mx - this.x[0];
    const dy = my - this.x[1];

    // Update state
    this.x[0] += Kx * dx;
    this.x[1] += Ky * dy;

    // Estimate velocity from innovation
    // This adapts to sudden direction changes (kicks)
    this.x[2] = this.x[2] * 0.7 + dx * 0.3 * 8; // EMA blend, scale by ~FPS
    this.x[3] = this.x[3] * 0.7 + dy * 0.3 * 8;

    // Update covariance
    this.P[0] *= (1 - Kx);
    this.P[1] *= (1 - Ky);
  }

  /** Apply deceleration to velocity (ball slowing down) */
  decelerate(factor: number): void {
    this.x[2] *= factor;
    this.x[3] *= factor;
  }

  get position(): { x: number; y: number } {
    return { x: this.x[0], y: this.x[1] };
  }

  get velocity(): { vx: number; vy: number } {
    return { vx: this.x[2], vy: this.x[3] };
  }
}

// ─── Ball Tracker ───────────────────────────────────────────────────────────

export class BallTracker {
  private kalman: BallKalman | null = null;
  private config: BallTrackerConfig;
  private age = 0;
  private totalFrames = 0;
  private lastConfidence = 0;
  private lastTimestampMs = 0;
  private trajectory: Array<{ fx: number; fy: number; timestampMs: number }> = [];
  private lastFieldPos: FieldPoint | null = null;
  private lastSpeedMs = 0;
  private active = false;

  constructor(config: Partial<BallTrackerConfig> = {}) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Update the ball tracker with a new detection (or null if not detected).
   *
   * @param detection - Ball detection for this frame (null if not detected)
   * @param H - Homography matrix for pixel→field conversion
   * @param timestampMs - Current frame timestamp
   * @returns BallTrack state
   */
  update(
    detection: BallDetection | null,
    H: Float64Array,
    timestampMs: number,
  ): BallTrack {
    const dt = this.lastTimestampMs > 0
      ? Math.min((timestampMs - this.lastTimestampMs) / 1000, 1.0)
      : 0.125; // default 8 FPS

    this.lastTimestampMs = timestampMs;
    this.totalFrames++;

    if (detection) {
      // ── Detection available ──
      if (!this.kalman) {
        // First detection: initialize Kalman
        this.kalman = new BallKalman(
          detection.center.x,
          detection.center.y,
          this.config.processNoise,
          this.config.measurementNoise,
        );
        this.active = true;
      } else {
        // Check if detection is close enough to prediction
        const predicted = this.kalman.position;
        const dist = Math.sqrt(
          (detection.center.x - predicted.x) ** 2 +
          (detection.center.y - predicted.y) ** 2,
        );

        if (dist < this.config.maxMatchDistance) {
          // Good match — update Kalman
          this.kalman.predict(dt);
          this.kalman.update(detection.center.x, detection.center.y);
        } else {
          // Detection too far — re-initialize (ball was kicked/passed)
          this.kalman = new BallKalman(
            detection.center.x,
            detection.center.y,
            this.config.processNoise,
            this.config.measurementNoise,
          );
        }
      }

      this.age = 0;
      this.lastConfidence = detection.confidence;
      this.active = true;
    } else {
      // ── No detection — predict ──
      this.age++;
      this.lastConfidence = 0;

      if (this.kalman) {
        this.kalman.predict(dt);
        this.kalman.decelerate(this.config.decelerationFactor);
      }

      if (this.age > this.config.maxAge) {
        this.active = false;
      }
    }

    // Compute field position
    let fieldPos: FieldPoint | null = null;
    if (this.kalman) {
      const pos = this.kalman.position;
      try {
        const fp = pixelToField(pos.x, pos.y, H);
        // Sanity check: ball should be within field bounds
        if (fp.fx >= -5 && fp.fx <= 110 && fp.fy >= -5 && fp.fy <= 73) {
          fieldPos = fp;
        }
      } catch {
        // Invalid homography
      }
    }

    // Compute speed
    if (fieldPos && this.lastFieldPos) {
      const distM = Math.sqrt(
        (fieldPos.fx - this.lastFieldPos.fx) ** 2 +
        (fieldPos.fy - this.lastFieldPos.fy) ** 2,
      );
      const speedMs = dt > 0 ? distM / dt : 0;
      // Clamp to realistic ball speed (max ~40 m/s for a powerful shot)
      this.lastSpeedMs = Math.min(speedMs, 45);
    }

    if (fieldPos) {
      this.lastFieldPos = fieldPos;
      this.trajectory.push({
        fx: fieldPos.fx,
        fy: fieldPos.fy,
        timestampMs,
      });
      if (this.trajectory.length > this.config.maxTrajectoryLength) {
        this.trajectory.shift();
      }
    }

    return {
      center: this.kalman?.position ?? { x: 0, y: 0 },
      fieldPos,
      speedMs: this.lastSpeedMs,
      visible: this.age === 0,
      age: this.age,
      totalFrames: this.totalFrames,
      confidence: this.lastConfidence,
      trajectory: this.trajectory,
      active: this.active,
    };
  }

  /** Reset the tracker */
  reset(): void {
    this.kalman = null;
    this.age = 0;
    this.totalFrames = 0;
    this.lastConfidence = 0;
    this.lastTimestampMs = 0;
    this.trajectory = [];
    this.lastFieldPos = null;
    this.lastSpeedMs = 0;
    this.active = false;
  }

  /** Whether the tracker has been initialized */
  get isInitialized(): boolean {
    return this.kalman !== null;
  }
}
