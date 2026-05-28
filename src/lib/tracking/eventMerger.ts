/**
 * VITAS · Event Merger (Sprint 3 — Expanded Event Detection)
 *
 * Merges events from two sources:
 *   1. EventDetectionEngine (player-only: 14 types)
 *   2. BallEventDetector (ball-aware: 21 types)
 *
 * Deduplication rules:
 *   - Events within 500ms of same type and same actor → keep higher confidence
 *   - Ball-aware events override player-only equivalents
 *   - Produces a unified, chronological event stream
 */

import type { TacticalEvent } from "./eventDetectionEngine";

// ─── Config ────────────────────────────────────────────────────────────────

export interface EventMergerConfig {
  /** Maximum time gap (ms) to consider events as duplicates (default: 500) */
  deduplicationWindowMs: number;
  /** Maximum spatial distance (m) to consider events as duplicates (default: 5.0) */
  deduplicationRadiusM: number;
  /** Types where ball-aware version should override player-only */
  ballOverrideTypes: Set<string>;
}

const DEFAULT_CONFIG: EventMergerConfig = {
  deduplicationWindowMs: 500,
  deduplicationRadiusM: 5.0,
  ballOverrideTypes: new Set([
    "pass",
    "shot",
    "recovery",
    "cross",
    "through_ball",
    "interception",
  ]),
};

// ─── Event Merger ──────────────────────────────────────────────────────────

export class EventMerger {
  private config: EventMergerConfig;

  constructor(config?: Partial<EventMergerConfig>) {
    this.config = { ...DEFAULT_CONFIG, ...config };
  }

  /**
   * Merge events from player-only engine and ball-aware detector.
   * Returns deduplicated, chronologically sorted events.
   */
  merge(
    playerEvents: TacticalEvent[],
    ballEvents: TacticalEvent[],
  ): TacticalEvent[] {
    // Combine all events
    const all = [...playerEvents, ...ballEvents];

    // Sort chronologically
    all.sort((a, b) => a.timestampMs - b.timestampMs);

    // Deduplicate
    return this.deduplicate(all);
  }

  /**
   * Merge frame-level events (called per frame during tracking).
   * More lightweight than full merge — just deduplicates within this batch.
   */
  mergeFrame(
    playerFrameEvents: TacticalEvent[],
    ballFrameEvents: TacticalEvent[],
  ): TacticalEvent[] {
    if (playerFrameEvents.length === 0) return ballFrameEvents;
    if (ballFrameEvents.length === 0) return playerFrameEvents;

    const merged: TacticalEvent[] = [...ballFrameEvents]; // Ball events take priority
    const ballSet = new Set(ballFrameEvents.map(e => `${e.actorTrackId}_${e.type}`));

    for (const pe of playerFrameEvents) {
      const key = `${pe.actorTrackId}_${pe.type}`;

      // Check if ball event already covers this
      if (this.config.ballOverrideTypes.has(pe.type) && ballSet.has(key)) {
        continue; // Skip — ball-aware version is better
      }

      // Check for duplicates by proximity
      const isDup = ballFrameEvents.some(be =>
        this.isDuplicate(pe, be),
      );

      if (!isDup) {
        merged.push(pe);
      }
    }

    return merged.sort((a, b) => a.timestampMs - b.timestampMs);
  }

  /* ── Private ──────────────────────────────────────────────────── */

  private deduplicate(events: TacticalEvent[]): TacticalEvent[] {
    const result: TacticalEvent[] = [];
    const used = new Set<string>();

    for (let i = 0; i < events.length; i++) {
      if (used.has(events[i].id)) continue;

      let bestEvent = events[i];

      // Look ahead for potential duplicates
      for (let j = i + 1; j < events.length; j++) {
        if (events[j].timestampMs - bestEvent.timestampMs > this.config.deduplicationWindowMs) {
          break; // Out of time window
        }

        if (this.isDuplicate(bestEvent, events[j])) {
          // Keep the one with higher confidence
          if (events[j].confidence > bestEvent.confidence) {
            used.add(bestEvent.id);
            bestEvent = events[j];
          } else {
            used.add(events[j].id);
          }
        }
      }

      if (!used.has(bestEvent.id)) {
        result.push(bestEvent);
        used.add(bestEvent.id);
      }
    }

    return result;
  }

  private isDuplicate(a: TacticalEvent, b: TacticalEvent): boolean {
    // Must be same type or related types
    if (!this.areRelatedTypes(a.type, b.type)) return false;

    // Must involve same actor
    if (a.actorTrackId !== b.actorTrackId) return false;

    // Must be within time window
    if (Math.abs(a.timestampMs - b.timestampMs) > this.config.deduplicationWindowMs) return false;

    // Must be within spatial radius
    const spatialDist = Math.sqrt(
      (a.startPosition.fx - b.startPosition.fx) ** 2 +
      (a.startPosition.fy - b.startPosition.fy) ** 2,
    );
    if (spatialDist > this.config.deduplicationRadiusM) return false;

    return true;
  }

  private areRelatedTypes(a: string, b: string): boolean {
    if (a === b) return true;

    // Related type pairs
    const related: Array<[string, string]> = [
      ["pass", "progressive_pass"],
      ["pass", "switch_play"],
      ["pass", "key_pass"],
      ["pass", "through_ball"],
      ["recovery", "ball_recovery"],
      ["carry", "dribble"],
      ["carry", "progressive_carry"],
      ["shot", "blocked_shot"],
      ["interception", "ball_recovery"],
    ];

    return related.some(([x, y]) =>
      (a === x && b === y) || (a === y && b === x),
    );
  }
}
