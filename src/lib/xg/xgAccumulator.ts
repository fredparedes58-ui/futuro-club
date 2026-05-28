/**
 * VITAS · xG Accumulator (Sprint 6 — xG with PHV)
 *
 * Accumulates xG data across a session/match:
 *   - Total xG (sum of all shots)
 *   - Per-shot xG with timeline
 *   - Overperformance (actual goals - xG)
 *   - xG/90 (normalized to 90 minutes)
 *   - Shot map data for visualization
 */

// ─── Types ──────────────────────────────────────────────────────────────────

export interface ShotRecord {
  /** Shot timestamp (ms) */
  timestampMs: number;
  /** Field position */
  position: { fx: number; fy: number };
  /** xG value for this shot */
  xg: number;
  /** Whether it was a goal */
  isGoal: boolean;
  /** Shot type */
  shotType: "foot" | "header";
  /** PHV-adjusted xG (null if no PHV data) */
  xgPhvAdjusted: number | null;
  /** Player track ID */
  trackId: number;
  /** Distance to goal (meters) */
  distanceM: number;
}

export interface XgSummary {
  /** Total xG accumulated */
  totalXg: number;
  /** Total PHV-adjusted xG (null if no PHV data) */
  totalXgPhvAdjusted: number | null;
  /** Number of shots */
  shotCount: number;
  /** Number of goals scored */
  goals: number;
  /** Overperformance: goals - xG (positive = finishing above expected) */
  overperformance: number;
  /** xG per 90 minutes */
  xgPer90: number;
  /** Shots per 90 minutes */
  shotsPer90: number;
  /** Average xG per shot */
  avgXgPerShot: number;
  /** All shot records for timeline/map */
  shots: ShotRecord[];
  /** Cumulative xG timeline (for chart) */
  timeline: Array<{ timestampMs: number; cumulativeXg: number; cumulativeGoals: number }>;
  /** Session duration in minutes */
  sessionMinutes: number;
}

// ─── Accumulator ────────────────────────────────────────────────────────────

export class XgAccumulator {
  private shots: ShotRecord[] = [];
  private sessionStartMs: number = 0;

  constructor(sessionStartMs: number = 0) {
    this.sessionStartMs = sessionStartMs;
  }

  /**
   * Record a shot event.
   */
  addShot(shot: ShotRecord): void {
    this.shots.push(shot);
  }

  /**
   * Record a shot from basic data (convenience method).
   */
  addShotSimple(
    timestampMs: number,
    position: { fx: number; fy: number },
    xg: number,
    isGoal: boolean,
    trackId: number,
    options?: {
      shotType?: "foot" | "header";
      xgPhvAdjusted?: number;
      distanceM?: number;
    },
  ): void {
    this.shots.push({
      timestampMs,
      position,
      xg,
      isGoal,
      shotType: options?.shotType ?? "foot",
      xgPhvAdjusted: options?.xgPhvAdjusted ?? null,
      trackId,
      distanceM: options?.distanceM ?? Math.sqrt(
        (105 - position.fx) ** 2 + (34 - position.fy) ** 2,
      ),
    });
  }

  /**
   * Generate summary of accumulated xG data.
   *
   * @param sessionDurationMs - Total session duration in ms (for per-90 calculations)
   */
  summarize(sessionDurationMs?: number): XgSummary {
    const totalXg = this.shots.reduce((s, shot) => s + shot.xg, 0);
    const goals = this.shots.filter((s) => s.isGoal).length;

    const hasPhvData = this.shots.some((s) => s.xgPhvAdjusted !== null);
    const totalXgPhv = hasPhvData
      ? this.shots.reduce((s, shot) => s + (shot.xgPhvAdjusted ?? shot.xg), 0)
      : null;

    // Duration calculation
    const durationMs = sessionDurationMs
      ?? (this.shots.length > 0
        ? Math.max(...this.shots.map((s) => s.timestampMs)) - this.sessionStartMs
        : 0);
    const sessionMinutes = durationMs / 60000;
    const per90Factor = sessionMinutes > 0 ? 90 / sessionMinutes : 0;

    // Build cumulative timeline
    const sortedShots = [...this.shots].sort((a, b) => a.timestampMs - b.timestampMs);
    let cumXg = 0;
    let cumGoals = 0;
    const timeline = sortedShots.map((shot) => {
      cumXg += shot.xg;
      if (shot.isGoal) cumGoals++;
      return {
        timestampMs: shot.timestampMs,
        cumulativeXg: Math.round(cumXg * 1000) / 1000,
        cumulativeGoals: cumGoals,
      };
    });

    return {
      totalXg: Math.round(totalXg * 1000) / 1000,
      totalXgPhvAdjusted: totalXgPhv !== null ? Math.round(totalXgPhv * 1000) / 1000 : null,
      shotCount: this.shots.length,
      goals,
      overperformance: Math.round((goals - totalXg) * 1000) / 1000,
      xgPer90: Math.round(totalXg * per90Factor * 1000) / 1000,
      shotsPer90: Math.round(this.shots.length * per90Factor * 10) / 10,
      avgXgPerShot: this.shots.length > 0
        ? Math.round((totalXg / this.shots.length) * 1000) / 1000
        : 0,
      shots: sortedShots,
      timeline,
      sessionMinutes: Math.round(sessionMinutes * 10) / 10,
    };
  }

  /** Reset accumulator */
  reset(sessionStartMs: number = 0): void {
    this.shots = [];
    this.sessionStartMs = sessionStartMs;
  }

  /** Get raw shot count */
  get shotCount(): number {
    return this.shots.length;
  }
}
