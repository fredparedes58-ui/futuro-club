/**
 * VITAS · Unpredictability Detector (Sprint 19)
 *
 * Shannon entropy of decisions by context.
 * Input: LinkedEvent[] grouped by context (field position + pressure).
 * Output: UnpredictabilityProfile with archetype.
 *
 * effectiveCreativity = H × successRate × 100 / log2(numTypes)
 *
 * Archetypes:
 *   - creator: high entropy, high success
 *   - pragmatist: low entropy, high success
 *   - chaotic: high entropy, low success
 *   - one_dimensional: low entropy, low success
 */

import type { LinkedEvent, ActionType } from "./types";

// ─── Output ──────────────────────────────────────────────────────────────

export type CreativityArchetype = "creator" | "pragmatist" | "chaotic" | "one_dimensional";

export interface UnpredictabilityProfile {
  trackId: number;
  /** Raw Shannon entropy of action distribution */
  shannonEntropy: number;
  /** Normalized entropy (0-1, 1 = maximally diverse) */
  normalizedEntropy: number;
  /** Success rate of actions (0-1) */
  successRate: number;
  /** Effective creativity score 0-100 */
  effectiveCreativity: number;
  /** Action distribution */
  actionDistribution: Record<ActionType, number>;
  /** Creativity archetype */
  archetype: CreativityArchetype;
  /** Total events analyzed */
  eventCount: number;
  /** Context-specific entropy (by field zone) */
  entropyByZone: {
    defensive: number;
    middle: number;
    attacking: number;
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────

function shannonEntropy(counts: number[]): number {
  const total = counts.reduce((s, v) => s + v, 0);
  if (total === 0) return 0;
  let H = 0;
  for (const c of counts) {
    if (c === 0) continue;
    const p = c / total;
    H -= p * Math.log2(p);
  }
  return H;
}

function classifyZone(pos: { fx: number; fy: number } | null): "defensive" | "middle" | "attacking" {
  if (!pos) return "middle";
  if (pos.fx < 35) return "defensive";
  if (pos.fx < 70) return "middle";
  return "attacking";
}

// ─── Main Function ───────────────────────────────────────────────────────

/**
 * Detect unpredictability/creativity for a specific player.
 */
export function detectUnpredictability(
  events: LinkedEvent[],
  trackId: number,
): UnpredictabilityProfile {
  const playerEvents = events.filter(e => e.trackId === trackId && e.confidence >= 0.4);

  const allActionTypes: ActionType[] = [
    "pass_short", "pass_long", "dribble", "shot", "cross",
    "clearance", "interception", "reception", "turn", "unknown",
  ];

  if (playerEvents.length < 3) {
    return {
      trackId,
      shannonEntropy: 0,
      normalizedEntropy: 0,
      successRate: 0,
      effectiveCreativity: 50,
      actionDistribution: Object.fromEntries(allActionTypes.map(t => [t, 0])) as Record<ActionType, number>,
      archetype: "one_dimensional",
      eventCount: 0,
      entropyByZone: { defensive: 0, middle: 0, attacking: 0 },
    };
  }

  // Count actions by type
  const actionCounts = new Map<ActionType, number>();
  for (const e of playerEvents) {
    actionCounts.set(e.actionType, (actionCounts.get(e.actionType) ?? 0) + 1);
  }

  const counts = allActionTypes.map(t => actionCounts.get(t) ?? 0);
  const nonZeroCounts = counts.filter(c => c > 0);
  const numTypes = nonZeroCounts.length;

  // Shannon entropy
  const H = shannonEntropy(nonZeroCounts);
  const maxEntropy = numTypes > 1 ? Math.log2(numTypes) : 1;
  const normalizedEntropy = maxEntropy > 0 ? H / maxEntropy : 0;

  // Success rate
  const successRate = playerEvents.filter(e => e.outcome === "successful").length / playerEvents.length;

  // Effective creativity
  const effectiveCreativity = Math.round(
    normalizedEntropy * successRate * 100,
  );

  // Action distribution
  const actionDistribution = Object.fromEntries(
    allActionTypes.map(t => [t, actionCounts.get(t) ?? 0]),
  ) as Record<ActionType, number>;

  // Entropy by zone
  const zones = ["defensive", "middle", "attacking"] as const;
  const entropyByZone: Record<string, number> = {};
  for (const zone of zones) {
    const zoneEvents = playerEvents.filter(e => classifyZone(e.fieldPosition) === zone);
    if (zoneEvents.length < 2) {
      entropyByZone[zone] = 0;
      continue;
    }
    const zoneCounts = new Map<ActionType, number>();
    for (const e of zoneEvents) {
      zoneCounts.set(e.actionType, (zoneCounts.get(e.actionType) ?? 0) + 1);
    }
    const zoneArr = allActionTypes.map(t => zoneCounts.get(t) ?? 0).filter(c => c > 0);
    const zoneH = shannonEntropy(zoneArr);
    const zoneMax = zoneArr.length > 1 ? Math.log2(zoneArr.length) : 1;
    entropyByZone[zone] = Math.round((zoneH / zoneMax) * 100) / 100;
  }

  // Archetype
  const highEntropy = normalizedEntropy > 0.6;
  const highSuccess = successRate > 0.55;

  const archetype: CreativityArchetype =
    highEntropy && highSuccess ? "creator" :
    !highEntropy && highSuccess ? "pragmatist" :
    highEntropy && !highSuccess ? "chaotic" :
    "one_dimensional";

  return {
    trackId,
    shannonEntropy: Math.round(H * 1000) / 1000,
    normalizedEntropy: Math.round(normalizedEntropy * 1000) / 1000,
    successRate: Math.round(successRate * 1000) / 1000,
    effectiveCreativity,
    actionDistribution,
    archetype,
    eventCount: playerEvents.length,
    entropyByZone: entropyByZone as { defensive: number; middle: number; attacking: number },
  };
}
