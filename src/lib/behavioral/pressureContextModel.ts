/**
 * VITAS · Pressure Context Model (Sprint 17)
 *
 * Calculates pressure level per frame for each player.
 * Input: Track[] + BallTrack + match context.
 * Output: PressureContext[] with rivals, options, combined pressure.
 *
 * Uses fieldDistance() from homography.ts for real-world distances.
 */

import type { PressureContext } from "./types";

// ─── Input types ─────────────────────────────────────────────────────────

interface TrackSnapshot {
  trackId: number;
  timestampMs: number;
  fx: number;  // field x meters
  fy: number;  // field y meters
  teamId: number; // 0 or 1
}

interface BallSnapshot {
  fx: number;
  fy: number;
  timestampMs: number;
}

export interface PressureModelInput {
  /** All player track snapshots (both teams) */
  trackSnapshots: TrackSnapshot[];
  /** Ball trajectory */
  ballTrajectory: BallSnapshot[];
  /** Timestamps to evaluate (e.g., decision moments) */
  evaluateAtMs: number[];
  /** Track IDs to evaluate pressure for */
  evaluateTrackIds: number[];
  /** Proximity threshold for pressure (meters) */
  pressureRadiusM?: number;
  /** Field length in meters (default 105) */
  fieldLengthM?: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const DEFAULT_PRESSURE_RADIUS_M = 3;
const FIELD_LENGTH_M = 105;
const THIRD_LENGTH_M = FIELD_LENGTH_M / 3;

// ─── Helpers ─────────────────────────────────────────────────────────────

function fieldDist(ax: number, ay: number, bx: number, by: number): number {
  const dx = bx - ax;
  const dy = by - ay;
  return Math.sqrt(dx * dx + dy * dy);
}

function classifyZone(fx: number, fieldLength: number): "defensive" | "middle" | "attacking" {
  const third = fieldLength / 3;
  if (fx < third) return "defensive";
  if (fx < third * 2) return "middle";
  return "attacking";
}

/** Get snapshots near a timestamp (within tolerance) */
function getSnapshotsAt(
  snapshots: TrackSnapshot[],
  timestampMs: number,
  toleranceMs: number = 150,
): TrackSnapshot[] {
  return snapshots.filter(s => Math.abs(s.timestampMs - timestampMs) <= toleranceMs);
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Calculate pressure context for specified players at specified timestamps.
 */
export function calculatePressureContext(input: PressureModelInput): PressureContext[] {
  const pressureRadius = input.pressureRadiusM ?? DEFAULT_PRESSURE_RADIUS_M;
  const fieldLength = input.fieldLengthM ?? FIELD_LENGTH_M;
  const results: PressureContext[] = [];

  // Track possession start per player (for duration calculation)
  const possessionStart = new Map<number, number>();

  for (const ts of input.evaluateAtMs) {
    const nearbySnapshots = getSnapshotsAt(input.trackSnapshots, ts);

    for (const targetId of input.evaluateTrackIds) {
      const targetSnap = nearbySnapshots.find(s => s.trackId === targetId);
      if (!targetSnap) continue;

      const targetTeam = targetSnap.teamId;

      // Count rivals within pressure radius
      const rivalsWithin3m = nearbySnapshots.filter(s =>
        s.teamId !== targetTeam &&
        fieldDist(s.fx, s.fy, targetSnap.fx, targetSnap.fy) <= pressureRadius,
      ).length;

      // Count passing options (teammates within reasonable distance, not behind defenders)
      const teammates = nearbySnapshots.filter(s =>
        s.trackId !== targetId &&
        s.teamId === targetTeam,
      );
      const availableOptions = teammates.filter(tm => {
        const dist = fieldDist(tm.fx, tm.fy, targetSnap.fx, targetSnap.fy);
        if (dist > 25 || dist < 2) return false; // too far or too close

        // Check if a defender is between target and teammate
        const hasBlocker = nearbySnapshots.some(def => {
          if (def.teamId === targetTeam) return false;
          const dTarget = fieldDist(def.fx, def.fy, targetSnap.fx, targetSnap.fy);
          const dTeammate = fieldDist(def.fx, def.fy, tm.fx, tm.fy);
          return dTarget < dist && dTeammate < dist; // roughly in between
        });

        return !hasBlocker;
      }).length;

      // Possession duration
      if (!possessionStart.has(targetId)) {
        possessionStart.set(targetId, ts);
      }
      const possessionDurationMs = ts - (possessionStart.get(targetId) ?? ts);

      // Combined pressure level (0-100)
      // Formula: rivals contribute 40%, lack of options 30%, zone 15%, time 15%
      const rivalPressure = Math.min(100, rivalsWithin3m * 30); // 0, 30, 60, 90+
      const optionPressure = availableOptions === 0 ? 100
        : availableOptions === 1 ? 60
        : availableOptions <= 3 ? 30
        : 0;
      const zone = classifyZone(targetSnap.fx, fieldLength);
      const zonePressure = zone === "defensive" ? 80
        : zone === "middle" ? 40
        : 20;
      const timePressure = Math.min(100, (possessionDurationMs / 3000) * 100);

      const combinedPressureLevel = Math.round(
        rivalPressure * 0.40 +
        optionPressure * 0.30 +
        zonePressure * 0.15 +
        timePressure * 0.15,
      );

      results.push({
        timestampMs: ts,
        trackId: targetId,
        rivalsWithin3m,
        availableOptions,
        possessionDurationMs,
        combinedPressureLevel: Math.min(100, combinedPressureLevel),
        fieldZone: zone,
      });
    }
  }

  return results;
}

/**
 * Convenience: calculate pressure for a list of LinkedEvents.
 */
export function pressureForEvents(
  events: Array<{ trackId: number; decisionMs: number }>,
  trackSnapshots: TrackSnapshot[],
  ballTrajectory: BallSnapshot[],
): PressureContext[] {
  return calculatePressureContext({
    trackSnapshots,
    ballTrajectory,
    evaluateAtMs: events.map(e => e.decisionMs),
    evaluateTrackIds: [...new Set(events.map(e => e.trackId))],
  });
}
