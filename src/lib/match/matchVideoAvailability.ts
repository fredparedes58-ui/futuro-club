/**
 * VITAS · Is the full-match video analysis OFFERED in this build?
 *
 * Owner decision (29-sep): the Phase 1 infrastructure is built but the analysis
 * stays OFF until it passes a validation against human-annotated events
 * (scripts/validate-match-observation.mjs, backend PR). Both switches are
 * fail-closed — only the exact string "true" turns them on:
 *
 *   - server `MATCH_VIDEO_ENABLED` — the AUTHORITY. /api/match/start answers
 *     503 `match_video_disabled` ("análisis de partido completo en validación")
 *     whenever it is not "true".
 *   - client `VITE_MATCH_VIDEO_ENABLED` (build time) — only decides whether the UI
 *     OFFERS the video path. The server exposes the flag only as a start error, so
 *     the UI needs a positive signal to show the path at all; without it the path
 *     reads "En validación" (disabled, with the reason) and the notes-only report
 *     is the working path.
 *
 * A server refusal (`match_video_disabled`) also switches the UI to "En
 * validación", so a client flag set ahead of the server never leaves a broken
 * path. IS_DEMO has no backend at all: the path is "En validación" there too
 * (with an explicit MOCK example preview). Not a secret, not a metric.
 */

export type MatchVideoAvailability = "available" | "in_validation";

/** Only the exact string "true" enables (same rule as the server flag). */
export function isMatchVideoFlagOn(raw: unknown): boolean {
  return raw === "true";
}

/** Read at call time (not at import) so tests can stub the env. */
export function isMatchVideoClientFlagOn(): boolean {
  return isMatchVideoFlagOn(import.meta.env.VITE_MATCH_VIDEO_ENABLED);
}

export function resolveMatchVideoAvailability(o: {
  clientFlag: boolean;
  isDemo: boolean;
  /** The server answered match_video_disabled in this session. */
  serverDisabled: boolean;
}): MatchVideoAvailability {
  return o.clientFlag && !o.isDemo && !o.serverDisabled ? "available" : "in_validation";
}
