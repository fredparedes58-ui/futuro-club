/**
 * VITAS · Team analysis — visual-input gate (shared client + server).
 *
 * A team report is only generated when the model has SEEN the match: either a
 * Gemini observation of the full video, or at least one usable frame. With
 * neither, a report would be invented from the prompt alone (the old
 * "Analiza estos 0 fotogramas" path), so the analysis is blocked with a
 * gate reason instead (CLAUDE.md invariants 2-3: abstaining is a valid result).
 *
 * One definition for both sides (invariant 7): the hook gates before calling
 * the server, and api/agents/_team-intelligence.ts refuses on its own.
 */

/** Gate / SSE error code: the team report was refused for lack of visual input. */
export const NO_VISUAL_INPUT = "NO_VISUAL_INPUT" as const;

/**
 * A Gemini observation only counts if it is a non-empty object.
 * (Plain boolean, not a type guard: the server reads the payload as `any`.)
 */
export function hasGeminiObservations(obs: unknown): boolean {
  return typeof obs === "object" && obs !== null && !Array.isArray(obs) && Object.keys(obs).length > 0;
}

/** True when there is at least one visual source for the team report. */
export function hasVisualInput(geminiObservations: unknown, usableFrameCount: number): boolean {
  return hasGeminiObservations(geminiObservations) || usableFrameCount > 0;
}
