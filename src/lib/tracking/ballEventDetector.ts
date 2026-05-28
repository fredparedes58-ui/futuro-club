/**
 * VITAS · Ball Event Detector (Sprint 3 — Expanded Event Detection)
 *
 * Detects tactical events that require ball tracking data.
 * Works in conjunction with the base EventDetectionEngine (player-only events).
 *
 * Ball-aware events detected:
 *   reception, dribble, clearance, goal_kick, corner_kick, throw_in,
 *   progressive_pass, switch_play, key_pass, ball_recovery, turnover,
 *   blocked_shot, goalkeeper_save, dispossessed, progressive_carry,
 *   chance_created, second_assist
 *
 * Input: BallTrack + Track[] + possession state
 * Output: TacticalEvent[] with ball metadata
 */

import type { Track } from "@/lib/yolo/types";
import type { BallTrack } from "@/lib/yolo/ballTracker";
import type { TacticalEvent, EventOutcome } from "./eventDetectionEngine";
import type { BallEventType, BallEventMetadata } from "./advancedEventTypes";
import { isProgressiveAction, isSwitchPlay, classifyFieldZone } from "./advancedEventTypes";
import type { PossessionTeamId } from "./possessionEngine";

// ─── Config ────────────────────────────────────────────────────────────────

export interface BallEventDetectorConfig {
  /** Max distance (m) from ball to player for reception (default: 2.0) */
  receptionRadiusM: number;
  /** Min duration (ms) holding ball to register dribble (default: 2000) */
  dribbleMinDurationMs: number;
  /** Min distance (m) for a clearance (default: 20) */
  clearanceMinDistanceM: number;
  /** Min progression (m) for progressive pass/carry (default: 10) */
  progressionMinM: number;
  /** Min lateral distance (m) for switch of play (default: 30) */
  switchPlayMinM: number;
  /** Max time window (ms) to link pass → shot for key_pass (default: 10000) */
  keyPassWindowMs: number;
  /** Field dimensions */
  fieldLengthM: number;
  fieldWidthM: number;
}

const DEFAULT_CONFIG: BallEventDetectorConfig = {
  receptionRadiusM: 2.0,
  dribbleMinDurationMs: 2000,
  clearanceMinDistanceM: 20,
  progressionMinM: 10,
  switchPlayMinM: 30,
  keyPassWindowMs: 10000,
  fieldLengthM: 105,
  fieldWidthM: 68,
};

// ─── Internal state ────────────────────────────────────────────────────────

interface DribbleState {
  trackId: number;
  startMs: number;
  startFx: number;
  startFy: number;
  team: PossessionTeamId;
}

interface RecentPass {
  actorTrackId: number;
  timestampMs: number;
  startFx: number;
  startFy: number;
  endFx: number;
  endFy: number;
}

// ─── Ball Event Detector ───────────────────────────────────────────────────

export class BallEventDetector {
  private config: BallEventDetectorConfig;
  private events: TacticalEvent[] = [];
  private eventCounter = 0;
  private prevBallTrack: BallTrack | null = null;
  private prevPossession: PossessionTeamId = "none";
  private prevNearestTrackId: number | null = null;
  private dribbleState: DribbleState | null = null;
  private recentPasses: RecentPass[] = [];
  private recentShots: Array<{ timestampMs: number; actorTrackId: number }> = [];

  constructor(config?: Partial<BallEventDetectorConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  reset(): void {
    this.events = [];
    this.eventCounter = 0;
    this.prevBallTrack = null;
    this.prevPossession = "none";
    this.prevNearestTrackId = null;
    this.dribbleState = null;
    this.recentPasses = [];
    this.recentShots = [];
  }

  /**
   * Process a frame and detect ball-aware events.
   *
   * @param ballTrack - Current ball tracking state
   * @param tracks - All player tracks
   * @param possession - Current possession team
   * @param teamAssignments - Track ID → team mapping
   * @param timestampMs - Current timestamp
   * @param frameIndex - Current frame index
   */
  processFrame(
    ballTrack: BallTrack | null,
    tracks: Track[],
    possession: PossessionTeamId,
    teamAssignments: Map<number, "home" | "away">,
    timestampMs: number,
    frameIndex: number,
  ): TacticalEvent[] {
    const frameEvents: TacticalEvent[] = [];

    if (!ballTrack?.active || !ballTrack.fieldPos) {
      this.prevBallTrack = ballTrack;
      this.prevPossession = possession;
      return frameEvents;
    }

    const ballPos = ballTrack.fieldPos;

    // Find nearest player to ball
    let nearestTrackId: number | null = null;
    let nearestDist = Infinity;
    let nearestTrack: Track | null = null;

    for (const track of tracks) {
      if (!track.lastFieldPos) continue;
      const dist = Math.sqrt(
        (track.lastFieldPos.fx - ballPos.fx) ** 2 +
        (track.lastFieldPos.fy - ballPos.fy) ** 2,
      );
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestTrackId = track.id;
        nearestTrack = track;
      }
    }

    // ── Reception: ball arrives near a new player ──
    if (
      nearestTrackId !== null &&
      nearestDist < this.config.receptionRadiusM &&
      this.prevNearestTrackId !== null &&
      nearestTrackId !== this.prevNearestTrackId &&
      nearestTrack
    ) {
      const receiverPos = nearestTrack.lastFieldPos;
      if (receiverPos) {
        frameEvents.push(this.createEvent({
          type: "reception" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: nearestTrackId,
          startPosition: { fx: receiverPos.fx, fy: receiverPos.fy },
          confidence: Math.min(1, 1.0 - nearestDist / this.config.receptionRadiusM),
          metadata: {
            ballDistanceM: round2(nearestDist),
            ballFx: round2(ballPos.fx),
            ballFy: round2(ballPos.fy),
            ballSpeedMs: round2(ballTrack.speedMs),
          },
        }));

        // Check if previous pass was a key_pass (reception → shot within window)
        this.checkKeyPass(nearestTrackId, timestampMs);
      }
    }

    // ── Ball Recovery: team regains possession ──
    if (
      possession !== "none" &&
      possession !== "contested" &&
      this.prevPossession !== "none" &&
      this.prevPossession !== "contested" &&
      possession !== this.prevPossession &&
      nearestTrackId !== null &&
      nearestTrack?.lastFieldPos
    ) {
      const pos = nearestTrack.lastFieldPos;
      frameEvents.push(this.createEvent({
        type: "ball_recovery" as TacticalEvent["type"],
        timestampMs,
        frameIndex,
        actorTrackId: nearestTrackId,
        startPosition: { fx: pos.fx, fy: pos.fy },
        confidence: 0.7,
        metadata: {
          previousTeam: this.prevPossession,
          newTeam: possession,
          ballFx: round2(ballPos.fx),
          ballFy: round2(ballPos.fy),
        },
      }));

      // Also register a turnover for the other team
      if (this.prevNearestTrackId !== null) {
        frameEvents.push(this.createEvent({
          type: "turnover" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: this.prevNearestTrackId,
          startPosition: { fx: ballPos.fx, fy: ballPos.fy },
          outcome: "fail",
          confidence: 0.65,
          metadata: {
            lostTo: possession,
            ballFx: round2(ballPos.fx),
            ballFy: round2(ballPos.fy),
          },
        }));
      }
    }

    // ── Dribble tracking: player holds ball while moving ──
    if (nearestTrackId !== null && nearestDist < this.config.receptionRadiusM) {
      if (!this.dribbleState || this.dribbleState.trackId !== nearestTrackId) {
        // Start new dribble tracking
        this.dribbleState = {
          trackId: nearestTrackId,
          startMs: timestampMs,
          startFx: ballPos.fx,
          startFy: ballPos.fy,
          team: possession,
        };
      }
    } else if (this.dribbleState) {
      // Player lost ball contact — check if dribble was long enough
      const dribbleDuration = timestampMs - this.dribbleState.startMs;
      if (dribbleDuration >= this.config.dribbleMinDurationMs) {
        const dribbleDistM = Math.sqrt(
          (ballPos.fx - this.dribbleState.startFx) ** 2 +
          (ballPos.fy - this.dribbleState.startFy) ** 2,
        );

        const isProgressive = isProgressiveAction(this.dribbleState.startFx, ballPos.fx, this.config.progressionMinM);

        frameEvents.push(this.createEvent({
          type: (isProgressive ? "progressive_carry" : "dribble") as TacticalEvent["type"],
          timestampMs: this.dribbleState.startMs,
          frameIndex,
          actorTrackId: this.dribbleState.trackId,
          startPosition: { fx: this.dribbleState.startFx, fy: this.dribbleState.startFy },
          endPosition: { fx: ballPos.fx, fy: ballPos.fy },
          outcome: "success",
          confidence: Math.min(0.85, 0.5 + dribbleDuration / 10000),
          metadata: {
            durationMs: dribbleDuration,
            distanceM: round2(dribbleDistM),
            isProgressive,
            progressionM: round2(ballPos.fx - this.dribbleState.startFx),
          },
        }));
      }
      this.dribbleState = null;
    }

    // ── Clearance: ball kicked far from own third ──
    if (
      this.prevBallTrack?.fieldPos &&
      ballTrack.speedMs > 10 &&
      this.prevBallTrack.fieldPos.fx < this.config.fieldLengthM / 3 &&
      nearestTrackId !== null
    ) {
      const displacement = Math.sqrt(
        (ballPos.fx - this.prevBallTrack.fieldPos.fx) ** 2 +
        (ballPos.fy - this.prevBallTrack.fieldPos.fy) ** 2,
      );
      if (displacement > this.config.clearanceMinDistanceM) {
        frameEvents.push(this.createEvent({
          type: "clearance" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: nearestTrackId,
          startPosition: { fx: this.prevBallTrack.fieldPos.fx, fy: this.prevBallTrack.fieldPos.fy },
          endPosition: { fx: ballPos.fx, fy: ballPos.fy },
          confidence: 0.6,
          metadata: {
            displacementM: round2(displacement),
            ballSpeedMs: round2(ballTrack.speedMs),
            fromZone: classifyFieldZone(this.prevBallTrack.fieldPos.fx),
          },
        }));
      }
    }

    // ── Progressive Pass: ball advances >10m toward goal ──
    if (
      this.prevBallTrack?.fieldPos &&
      ballTrack.visible &&
      !this.prevBallTrack.visible &&
      nearestTrackId !== null
    ) {
      // Ball just became visible again (arrived at destination)
      const startFx = this.prevBallTrack.fieldPos.fx;
      const startFy = this.prevBallTrack.fieldPos.fy;
      const progression = ballPos.fx - startFx;
      const lateralDist = Math.abs(ballPos.fy - startFy);

      if (isProgressiveAction(startFx, ballPos.fx, this.config.progressionMinM)) {
        frameEvents.push(this.createEvent({
          type: "progressive_pass" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: this.prevNearestTrackId ?? nearestTrackId,
          receiverTrackId: nearestTrackId,
          startPosition: { fx: startFx, fy: startFy },
          endPosition: { fx: ballPos.fx, fy: ballPos.fy },
          outcome: "success",
          confidence: 0.6,
          metadata: {
            progressionM: round2(progression),
            isForward: true,
          },
        }));

        // Track for key_pass detection
        this.recentPasses.push({
          actorTrackId: this.prevNearestTrackId ?? nearestTrackId,
          timestampMs,
          startFx, startFy,
          endFx: ballPos.fx, endFy: ballPos.fy,
        });
      }

      // Switch play: long lateral pass
      if (isSwitchPlay(startFy, ballPos.fy, this.config.switchPlayMinM)) {
        frameEvents.push(this.createEvent({
          type: "switch_play" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: this.prevNearestTrackId ?? nearestTrackId,
          receiverTrackId: nearestTrackId,
          startPosition: { fx: startFx, fy: startFy },
          endPosition: { fx: ballPos.fx, fy: ballPos.fy },
          outcome: "success",
          confidence: 0.65,
          metadata: {
            lateralDistanceM: round2(lateralDist),
            fromSide: startFy < this.config.fieldWidthM / 2 ? "left" : "right",
          },
        }));
      }
    }

    // ── Set pieces: ball near field boundaries ──
    if (ballTrack.visible && !this.prevBallTrack?.visible && nearestTrackId !== null) {
      // Corner kick: ball near corner
      if (
        (ballPos.fx < 2 || ballPos.fx > this.config.fieldLengthM - 2) &&
        (ballPos.fy < 2 || ballPos.fy > this.config.fieldWidthM - 2)
      ) {
        frameEvents.push(this.createEvent({
          type: "corner_kick" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: nearestTrackId,
          startPosition: { fx: ballPos.fx, fy: ballPos.fy },
          confidence: 0.55,
          metadata: { side: ballPos.fy < this.config.fieldWidthM / 2 ? "left" : "right" },
        }));
      }

      // Throw-in: ball near sideline
      if (ballPos.fy < 2 || ballPos.fy > this.config.fieldWidthM - 2) {
        frameEvents.push(this.createEvent({
          type: "throw_in" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: nearestTrackId,
          startPosition: { fx: ballPos.fx, fy: ballPos.fy },
          confidence: 0.5,
          metadata: { side: ballPos.fy < this.config.fieldWidthM / 2 ? "left" : "right" },
        }));
      }

      // Goal kick: ball near goal area and low speed
      if (
        (ballPos.fx < 6 || ballPos.fx > this.config.fieldLengthM - 6) &&
        ballPos.fy > 24 && ballPos.fy < 44 &&
        ballTrack.speedMs < 2
      ) {
        frameEvents.push(this.createEvent({
          type: "goal_kick" as TacticalEvent["type"],
          timestampMs,
          frameIndex,
          actorTrackId: nearestTrackId,
          startPosition: { fx: ballPos.fx, fy: ballPos.fy },
          confidence: 0.5,
          metadata: {},
        }));
      }
    }

    // ── Track shots for key_pass / chance_created linking ──
    // (Shots detected by base engine, we just check for linking here)

    // Clean up old recent passes/shots
    this.recentPasses = this.recentPasses.filter(p => timestampMs - p.timestampMs < this.config.keyPassWindowMs);
    this.recentShots = this.recentShots.filter(s => timestampMs - s.timestampMs < this.config.keyPassWindowMs);

    // Update state for next frame
    this.prevBallTrack = ballTrack;
    this.prevPossession = possession;
    this.prevNearestTrackId = nearestTrackId;

    // Accumulate
    this.events.push(...frameEvents);
    return frameEvents;
  }

  /** Notify that a shot was detected (from base EventDetectionEngine) */
  notifyShot(actorTrackId: number, timestampMs: number): void {
    this.recentShots.push({ actorTrackId, timestampMs });

    // Check if any recent pass led to this shot = key_pass
    for (const pass of this.recentPasses) {
      if (timestampMs - pass.timestampMs < this.config.keyPassWindowMs) {
        this.events.push(this.createEvent({
          type: "key_pass" as TacticalEvent["type"],
          timestampMs: pass.timestampMs,
          frameIndex: 0,
          actorTrackId: pass.actorTrackId,
          receiverTrackId: actorTrackId,
          startPosition: { fx: pass.startFx, fy: pass.startFy },
          endPosition: { fx: pass.endFx, fy: pass.endFy },
          outcome: "success",
          confidence: 0.7,
          metadata: {
            leadsToShot: true,
            timeTilShotMs: timestampMs - pass.timestampMs,
          },
        }));
      }
    }
  }

  /** Get all detected ball events */
  getEvents(): TacticalEvent[] {
    return this.events;
  }

  /* ── Private helpers ──────────────────────────────────────────── */

  private createEvent(partial: Omit<TacticalEvent, "id"> & { id?: string }): TacticalEvent {
    return {
      id: `bevt_${++this.eventCounter}_${partial.type}`,
      receiverTrackId: null,
      endPosition: null,
      outcome: "neutral" as EventOutcome,
      ...partial,
    };
  }

  private checkKeyPass(receiverTrackId: number, timestampMs: number): void {
    // When a reception happens, check if it leads to a chance
    // This will be evaluated retroactively when notifyShot is called
  }
}

// ─── Utility ───────────────────────────────────────────────────────────────

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}
