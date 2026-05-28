/**
 * VITAS · Leadership Detector (Sprint 18)
 *
 * Aggregates communication gestures + social centrality.
 * Input: GestureEvent[] + Track[] (for proximity analysis).
 * Output: LeadershipProfile with archetype classification.
 *
 * Archetypes:
 *   - commander: high organizing + high communication + vocal
 *   - motivator: high clapping/celebration + positive gestures
 *   - silent_leader: high social centrality but few gestures
 *   - follower: low gestures + low centrality
 */

import type { GestureEvent, GestureType } from "./types";

// ─── Input types ─────────────────────────────────────────────────────────

interface TrackFrame {
  trackId: number;
  timestampMs: number;
  x: number;  // field meters
  y: number;
}

export interface LeadershipDetectorInput {
  gestureEvents: GestureEvent[];
  trackFrames: TrackFrame[];
  trackId: number;
  /** All player track IDs on same team */
  teamTrackIds: number[];
  /** Total match/session duration in ms */
  durationMs: number;
}

// ─── Output ──────────────────────────────────────────────────────────────

export type LeadershipArchetype = "commander" | "motivator" | "silent_leader" | "follower";

export interface LeadershipProfile {
  trackId: number;
  /** Total communication gestures per 90 min equivalent */
  communicationFrequencyPer90: number;
  /** Positive gestures / total gestures */
  positiveToNegativeRatio: number;
  /** Organizing gestures per 90 min */
  organizingFrequencyPer90: number;
  /** Social centrality: avg teammates within 5m during pauses */
  socialCentrality: number;
  /** Gesture breakdown by type */
  gestureBreakdown: Record<GestureType, number>;
  /** Leadership archetype */
  archetype: LeadershipArchetype;
  /** Leadership score 0-100 */
  leadershipScore: number;
}

// ─── Constants ───────────────────────────────────────────────────────────

const NINETY_MIN_MS = 90 * 60 * 1000;
const CENTRALITY_RADIUS_M = 5;

const POSITIVE_GESTURES: GestureType[] = ["clapping", "celebration", "calling_ball", "organizing"];
const NEGATIVE_GESTURES: GestureType[] = ["frustration"];
const LEADERSHIP_GESTURES: GestureType[] = ["pointing", "organizing", "calling_ball"];

// ─── Helpers ─────────────────────────────────────────────────────────────

function euclidean(ax: number, ay: number, bx: number, by: number): number {
  return Math.sqrt((bx - ax) ** 2 + (by - ay) ** 2);
}

/**
 * Calculate social centrality: how many teammates cluster near this player.
 * Sampled at low-speed moments (pauses, breaks).
 */
function calculateSocialCentrality(
  trackId: number,
  teamTrackIds: number[],
  trackFrames: TrackFrame[],
  durationMs: number,
): number {
  // Sample every 5s
  const sampleInterval = 5000;
  const samples: number[] = [];

  for (let t = 0; t < durationMs; t += sampleInterval) {
    const framesNear = trackFrames.filter(
      f => Math.abs(f.timestampMs - t) < 500,
    );

    const targetFrame = framesNear.find(f => f.trackId === trackId);
    if (!targetFrame) continue;

    // Count teammates within centrality radius
    const nearbyTeammates = framesNear.filter(f =>
      f.trackId !== trackId &&
      teamTrackIds.includes(f.trackId) &&
      euclidean(f.x, f.y, targetFrame.x, targetFrame.y) <= CENTRALITY_RADIUS_M,
    ).length;

    samples.push(nearbyTeammates);
  }

  return samples.length > 0
    ? samples.reduce((s, v) => s + v, 0) / samples.length
    : 0;
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Detect leadership profile for a specific player.
 */
export function detectLeadership(input: LeadershipDetectorInput): LeadershipProfile {
  const { gestureEvents, trackFrames, trackId, teamTrackIds, durationMs } = input;

  const playerGestures = gestureEvents.filter(g => g.trackId === trackId);
  const per90Factor = durationMs > 0 ? NINETY_MIN_MS / durationMs : 1;

  // Gesture breakdown
  const breakdown: Record<GestureType, number> = {
    pointing: 0,
    organizing: 0,
    clapping: 0,
    frustration: 0,
    celebration: 0,
    calling_ball: 0,
    unknown: 0,
  };
  for (const g of playerGestures) {
    breakdown[g.gestureType]++;
  }

  // Communication frequency per 90
  const totalGestures = playerGestures.length;
  const communicationFrequencyPer90 = Math.round(totalGestures * per90Factor * 10) / 10;

  // Organizing frequency
  const organizingCount = breakdown.organizing + breakdown.pointing;
  const organizingFrequencyPer90 = Math.round(organizingCount * per90Factor * 10) / 10;

  // Positive/negative ratio
  const positiveCount = playerGestures.filter(g => POSITIVE_GESTURES.includes(g.gestureType)).length;
  const negativeCount = playerGestures.filter(g => NEGATIVE_GESTURES.includes(g.gestureType)).length;
  const positiveToNegativeRatio = negativeCount > 0
    ? Math.round((positiveCount / negativeCount) * 100) / 100
    : positiveCount > 0 ? 10.0 : 0;

  // Social centrality
  const socialCentrality = calculateSocialCentrality(
    trackId, teamTrackIds, trackFrames, durationMs,
  );

  // ── Leadership score (0-100) ──
  // Communication: 35%, organizing: 25%, positivity: 20%, centrality: 20%
  const commScore = Math.min(100, communicationFrequencyPer90 * 5); // ~20 gestures/90 = 100
  const orgScore = Math.min(100, organizingFrequencyPer90 * 10);     // ~10 organizing/90 = 100
  const posScore = Math.min(100, positiveToNegativeRatio * 20);       // 5:1 ratio = 100
  const centScore = Math.min(100, socialCentrality * 20);             // 5 avg teammates = 100

  const leadershipScore = Math.round(
    commScore * 0.35 +
    orgScore * 0.25 +
    posScore * 0.20 +
    centScore * 0.20,
  );

  // ── Archetype classification ──
  let archetype: LeadershipArchetype;
  const hasHighComm = communicationFrequencyPer90 > 8;
  const hasHighOrg = organizingFrequencyPer90 > 4;
  const hasHighCentrality = socialCentrality > 3;
  const hasHighPositivity = positiveToNegativeRatio > 3;

  if (hasHighComm && hasHighOrg) {
    archetype = "commander";
  } else if (hasHighComm && hasHighPositivity) {
    archetype = "motivator";
  } else if (!hasHighComm && hasHighCentrality) {
    archetype = "silent_leader";
  } else {
    archetype = "follower";
  }

  return {
    trackId,
    communicationFrequencyPer90,
    positiveToNegativeRatio,
    organizingFrequencyPer90,
    socialCentrality: Math.round(socialCentrality * 100) / 100,
    gestureBreakdown: breakdown,
    archetype,
    leadershipScore,
  };
}
