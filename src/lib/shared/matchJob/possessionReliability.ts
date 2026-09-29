/**
 * VITAS · Match video job — reliability gate of the AI possession estimate.
 *
 * Why it exists (owner decision, 29-sep): on the owner's real match (Veo
 * follow-cam, U10 fútbol 8, one 15-min segment) Gemini at 1 fps answered
 * possession 50/50 with "balanced" dominance although it had cited events that
 * did not exist at the cited second. That flat answer is what the model emits
 * when it has no visual basis for the estimate, so it must NEVER read as a
 * confident figure.
 *
 * This is the ONE implementation of that rule (invariant #7), in src/lib/shared
 * so api/ (the aggregator can lower the confidence with it) and the UI (it labels
 * the estimate "baja confianza") use the same predicate.
 *
 * It only FLAGS. It never changes, rounds, fills or hides a value and it adds no
 * tunable threshold: 50 is the literal even split, not a calibration.
 *   - uniform_balanced: every segment with an estimate says exactly 50/50 and no
 *     segment reports a dominance other than "balanced";
 *   - no_stated_basis: a segment has a possession value but the model did not say
 *     what it was based on (possession_basis null).
 */

import type { SegmentSummary } from "./contract";

export const POSSESSION_RELIABILITY_FLAGS = ["uniform_balanced", "no_stated_basis"] as const;
export type PossessionReliabilityFlag = (typeof POSSESSION_RELIABILITY_FLAGS)[number];

/** The degenerate "even split" answer (literal half of 100 %, not a threshold). */
const EVEN_SPLIT_PCT = 50;

export interface PossessionReliability {
  /** true ⇒ render as low confidence, never as a confident figure. */
  lowConfidence: boolean;
  flags: PossessionReliabilityFlag[];
  /** Segment idx with a possession value (both sides non-null). */
  segmentsWithEstimate: number[];
  /** Segment idx whose value has no stated basis. */
  segmentsWithoutBasis: number[];
}

type SegmentLike = Pick<SegmentSummary, "idx" | "possession" | "possession_basis" | "dominance">;

export function assessPossessionReliability(segments: readonly SegmentLike[]): PossessionReliability {
  const withEstimate = segments.filter((s) => s.possession.home.value !== null && s.possession.away.value !== null);
  const segmentsWithoutBasis = withEstimate.filter((s) => s.possession_basis === null).map((s) => s.idx);

  const allEven =
    withEstimate.length > 0 &&
    withEstimate.every((s) => s.possession.home.value === EVEN_SPLIT_PCT && s.possession.away.value === EVEN_SPLIT_PCT);
  // A gated (null) dominance does not contradict the flat pattern; any "home"/"away" does.
  const noDominanceSignal = segments.every((s) => s.dominance.value === null || s.dominance.value === "balanced");

  const flags: PossessionReliabilityFlag[] = [];
  if (allEven && noDominanceSignal) flags.push("uniform_balanced");
  if (segmentsWithoutBasis.length > 0) flags.push("no_stated_basis");

  return {
    lowConfidence: flags.length > 0,
    flags,
    segmentsWithEstimate: withEstimate.map((s) => s.idx),
    segmentsWithoutBasis,
  };
}

/** Per-segment view: is THIS segment's estimate low confidence? */
export function isSegmentPossessionLowConfidence(r: PossessionReliability, segmentIdx: number): boolean {
  if (!r.segmentsWithEstimate.includes(segmentIdx)) return false;
  return r.flags.includes("uniform_balanced") || r.segmentsWithoutBasis.includes(segmentIdx);
}
