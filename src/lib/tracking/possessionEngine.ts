/**
 * VITAS · Possession Engine (Sprint 3 — Expanded Event Detection)
 *
 * State machine for tracking team possession of the ball.
 * Uses ball position + nearest player + team assignment to determine
 * which team controls the ball.
 *
 * Features:
 * - Hysteresis (0.5s default) to avoid flickering on contested balls
 * - Outputs PossessionSegment[] with team, start/end times, duration
 * - Possession percentages per team
 * - Possession chains (sequences of actions by same team)
 */

import type { Track, FieldPoint } from "@/lib/yolo/types";
import type { BallTrack } from "@/lib/yolo/ballTracker";

// ─── Types ─────────────────────────────────────────────────────────────────

export type PossessionTeamId = "home" | "away" | "contested" | "none";

export interface PossessionSegment {
  team: PossessionTeamId;
  startMs: number;
  endMs: number;
  durationMs: number;
  /** Number of passes in this possession segment */
  passCount: number;
  /** Field zone where possession started */
  startZoneFx: number;
}

export interface PossessionSummary {
  /** Possession percentage per team */
  homePct: number;
  awayPct: number;
  contestedPct: number;
  /** Total segments */
  totalSegments: number;
  /** Average possession duration per team (ms) */
  homeAvgDurationMs: number;
  awayAvgDurationMs: number;
  /** Longest possession per team (ms) */
  homeLongestMs: number;
  awayLongestMs: number;
  /** All segments */
  segments: PossessionSegment[];
}

export interface PossessionEngineConfig {
  /** Minimum time (ms) before confirming a possession change (default: 500) */
  hysteresisMs: number;
  /** Maximum distance (m) from ball to nearest player to assign possession (default: 3.0) */
  possessionRadiusM: number;
  /** Distance considered "contested" — both teams within this range (default: 2.0) */
  contestedRadiusM: number;
  /** Minimum segment duration to record (default: 200ms) */
  minSegmentMs: number;
}

const DEFAULT_CONFIG: PossessionEngineConfig = {
  hysteresisMs: 500,
  possessionRadiusM: 3.0,
  contestedRadiusM: 2.0,
  minSegmentMs: 200,
};

// ─── Possession Engine ─────────────────────────────────────────────────────

export class PossessionEngine {
  private config: PossessionEngineConfig;
  private segments: PossessionSegment[] = [];
  private currentTeam: PossessionTeamId = "none";
  private currentSegmentStart = 0;
  private currentPassCount = 0;
  private currentStartZoneFx = 0;

  // Hysteresis state
  private candidateTeam: PossessionTeamId = "none";
  private candidateSinceMs = 0;

  constructor(config?: Partial<PossessionEngineConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /** Reset for a new session */
  reset(): void {
    this.segments = [];
    this.currentTeam = "none";
    this.currentSegmentStart = 0;
    this.currentPassCount = 0;
    this.currentStartZoneFx = 0;
    this.candidateTeam = "none";
    this.candidateSinceMs = 0;
  }

  /**
   * Update possession state with new frame data.
   *
   * @param ballTrack - Current ball tracking state
   * @param tracks - All player tracks this frame
   * @param teamAssignments - Map of trackId → team
   * @param timestampMs - Current frame timestamp
   * @returns Current possession team
   */
  update(
    ballTrack: BallTrack | null,
    tracks: Track[],
    teamAssignments: Map<number, "home" | "away">,
    timestampMs: number,
  ): PossessionTeamId {
    if (!ballTrack?.active || !ballTrack.fieldPos) {
      return this.currentTeam; // Keep last known
    }

    const ballPos = ballTrack.fieldPos;

    // Find nearest player from each team
    let nearestHome = Infinity;
    let nearestAway = Infinity;

    for (const track of tracks) {
      if (!track.lastFieldPos) continue;
      const dist = Math.sqrt(
        (track.lastFieldPos.fx - ballPos.fx) ** 2 +
        (track.lastFieldPos.fy - ballPos.fy) ** 2,
      );

      const team = teamAssignments.get(track.id);
      if (team === "home" && dist < nearestHome) nearestHome = dist;
      if (team === "away" && dist < nearestAway) nearestAway = dist;
    }

    // Determine candidate possession
    let newTeam: PossessionTeamId;
    const bothClose = nearestHome < this.config.contestedRadiusM && nearestAway < this.config.contestedRadiusM;

    if (bothClose) {
      newTeam = "contested";
    } else if (nearestHome < this.config.possessionRadiusM) {
      newTeam = "home";
    } else if (nearestAway < this.config.possessionRadiusM) {
      newTeam = "away";
    } else {
      newTeam = "none";
    }

    // Apply hysteresis
    if (newTeam !== this.candidateTeam) {
      this.candidateTeam = newTeam;
      this.candidateSinceMs = timestampMs;
    }

    const elapsed = timestampMs - this.candidateSinceMs;
    if (this.candidateTeam !== this.currentTeam && elapsed >= this.config.hysteresisMs) {
      // Confirm possession change — close current segment
      this.closeSegment(timestampMs);

      // Start new segment
      this.currentTeam = this.candidateTeam;
      this.currentSegmentStart = timestampMs;
      this.currentPassCount = 0;
      this.currentStartZoneFx = ballPos.fx;
    }

    return this.currentTeam;
  }

  /** Notify that a pass occurred (increments pass count in current segment) */
  notifyPass(): void {
    this.currentPassCount++;
  }

  /** Close the current segment and finalize */
  finalize(timestampMs: number): PossessionSegment[] {
    this.closeSegment(timestampMs);
    return this.segments;
  }

  /** Get current segments */
  getSegments(): PossessionSegment[] {
    return this.segments;
  }

  /** Compute possession summary */
  summarize(totalDurationMs?: number): PossessionSummary {
    const total = totalDurationMs ?? this.segments.reduce((s, seg) => s + seg.durationMs, 0);
    if (total === 0) {
      return {
        homePct: 0, awayPct: 0, contestedPct: 0,
        totalSegments: 0,
        homeAvgDurationMs: 0, awayAvgDurationMs: 0,
        homeLongestMs: 0, awayLongestMs: 0,
        segments: [],
      };
    }

    const homeSegs = this.segments.filter(s => s.team === "home");
    const awaySegs = this.segments.filter(s => s.team === "away");
    const contestedSegs = this.segments.filter(s => s.team === "contested");

    const homeMs = homeSegs.reduce((s, seg) => s + seg.durationMs, 0);
    const awayMs = awaySegs.reduce((s, seg) => s + seg.durationMs, 0);
    const contestedMs = contestedSegs.reduce((s, seg) => s + seg.durationMs, 0);

    return {
      homePct: Math.round((homeMs / total) * 100),
      awayPct: Math.round((awayMs / total) * 100),
      contestedPct: Math.round((contestedMs / total) * 100),
      totalSegments: this.segments.length,
      homeAvgDurationMs: homeSegs.length > 0 ? Math.round(homeMs / homeSegs.length) : 0,
      awayAvgDurationMs: awaySegs.length > 0 ? Math.round(awayMs / awaySegs.length) : 0,
      homeLongestMs: homeSegs.length > 0 ? Math.max(...homeSegs.map(s => s.durationMs)) : 0,
      awayLongestMs: awaySegs.length > 0 ? Math.max(...awaySegs.map(s => s.durationMs)) : 0,
      segments: this.segments,
    };
  }

  /* ── Private ──────────────────────────────────────────────────── */

  private closeSegment(endMs: number): void {
    if (this.currentTeam === "none") return;
    const duration = endMs - this.currentSegmentStart;
    if (duration < this.config.minSegmentMs) return;

    this.segments.push({
      team: this.currentTeam,
      startMs: this.currentSegmentStart,
      endMs,
      durationMs: duration,
      passCount: this.currentPassCount,
      startZoneFx: this.currentStartZoneFx,
    });
  }
}
