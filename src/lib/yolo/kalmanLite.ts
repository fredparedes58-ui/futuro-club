/**
 * VITAS · Kalman-Lite Predictor
 *
 * Minimal 1D Kalman filter for position + velocity (2-state).
 * Used to predict where a player SHOULD be when IoU matching fails
 * (e.g., players crossing, brief occlusions).
 *
 * NOT a full 6-state Kalman — just 2 states per axis (x, y independently).
 * This keeps computation light enough for real-time tracking at 8 FPS.
 */

/**
 * 1D Kalman filter tracking position and velocity.
 *
 * State vector: [position, velocity]
 * Covariance matrix P is stored flat as [P00, P01, P10, P11].
 */
export class KalmanLite1D {
  /** Current position estimate */
  x: number;
  /** Current velocity estimate (units per second) */
  v: number;
  /** 2x2 covariance matrix stored flat: [P00, P01, P10, P11] */
  P: [number, number, number, number];
  /** Process noise scalar — higher = trust measurements more */
  Q: number;
  /** Measurement noise scalar — higher = trust predictions more */
  R: number;

  /**
   * @param initialPos       Starting position estimate
   * @param processNoise     Process noise (default 0.5)
   * @param measurementNoise Measurement noise (default 2.0)
   */
  constructor(initialPos = 0, processNoise = 0.5, measurementNoise = 2.0) {
    this.x = initialPos;
    this.v = 0;
    // Initial covariance: high uncertainty in velocity, moderate in position
    this.P = [1, 0, 0, 10];
    this.Q = processNoise;
    this.R = measurementNoise;
  }

  /**
   * Predict the next state forward by dt seconds.
   *
   * State transition:
   *   x' = x + v * dt
   *   v' = v
   *
   * Covariance propagation:
   *   P' = F * P * F^T + Q * I
   *   where F = [[1, dt], [0, 1]]
   *
   * @param dt Time step in seconds (e.g., 0.125 for 8 FPS)
   * @returns  Predicted position
   */
  predict(dt: number): number {
    // State prediction
    this.x = this.x + this.v * dt;
    // velocity stays the same (constant velocity model)

    // Covariance prediction: P' = F P F^T + Q*I
    const [p00, p01, p10, p11] = this.P;
    this.P = [
      p00 + dt * (p10 + p01) + dt * dt * p11 + this.Q,  // P00'
      p01 + dt * p11,                                      // P01'
      p10 + dt * p11,                                      // P10'
      p11 + this.Q,                                        // P11'
    ];

    return this.x;
  }

  /**
   * Update the state with a new measurement.
   *
   * Observation model: z = H * state, where H = [1, 0] (we only measure position).
   *
   * @param measurement Observed position
   * @returns           Corrected position estimate
   */
  update(measurement: number): number {
    const [p00, p01, p10, p11] = this.P;

    // Innovation (residual)
    const y = measurement - this.x;

    // Innovation covariance: S = H P H^T + R = P00 + R
    const S = p00 + this.R;

    // Kalman gain: K = P H^T / S = [P00/S, P10/S]
    const k0 = p00 / S;
    const k1 = p10 / S;

    // State update
    this.x = this.x + k0 * y;
    this.v = this.v + k1 * y;

    // Covariance update: P' = (I - K H) P
    this.P = [
      p00 - k0 * p00,
      p01 - k0 * p01,
      p10 - k1 * p00,
      p11 - k1 * p01,
    ];

    return this.x;
  }
}

/**
 * 2D Kalman filter for field coordinates.
 * Runs two independent 1D filters — one per axis.
 */
export class KalmanLite2D {
  /** Kalman filter for the X axis (field length, 0-105m) */
  kx: KalmanLite1D;
  /** Kalman filter for the Y axis (field width, 0-68m) */
  ky: KalmanLite1D;

  /**
   * @param initialFx        Initial field X position
   * @param initialFy        Initial field Y position
   * @param processNoise     Process noise (default 0.5)
   * @param measurementNoise Measurement noise (default 2.0)
   */
  constructor(
    initialFx = 0,
    initialFy = 0,
    processNoise = 0.5,
    measurementNoise = 2.0,
  ) {
    this.kx = new KalmanLite1D(initialFx, processNoise, measurementNoise);
    this.ky = new KalmanLite1D(initialFy, processNoise, measurementNoise);
  }

  /**
   * Predict both axes forward by dt seconds.
   * @param dt Time step in seconds
   * @returns  Predicted field position
   */
  predict(dt: number): { fx: number; fy: number } {
    return {
      fx: this.kx.predict(dt),
      fy: this.ky.predict(dt),
    };
  }

  /**
   * Update both axes with observed field coordinates.
   * @param fx Observed field X
   * @param fy Observed field Y
   * @returns  Corrected field position
   */
  update(fx: number, fy: number): { fx: number; fy: number } {
    return {
      fx: this.kx.update(fx),
      fy: this.ky.update(fy),
    };
  }
}
