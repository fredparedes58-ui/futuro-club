/**
 * VITAS · Translated message for a match-job API error (7 locales, namespace matchJob.errors).
 *
 * The server code decides the message; the raw server text is only used for the
 * generic fallback. `details.missing` (names of env vars) is NEVER shown to the coach.
 */

import type { TFunction } from "i18next";
import { MAX_MATCH_DURATION_MIN } from "@/lib/shared/videoLimits";
import type { MatchApiError } from "@/services/real/matchAnalysisService";

const KNOWN = new Set([
  "attestation_required",
  "invalid_input",
  "invalid_request",
  "unauthorized",
  "plan_required",
  "not_owner",
  "video_not_found",
  "video_too_long",
  "concurrency_limit",
  "budget_exceeded",
  "match_video_disabled",
  "real_inference_disabled",
  "not_found",
  "network",
  "invalid_response",
]);

export function matchErrorMessage(t: TFunction, err: Pick<MatchApiError, "code" | "message">): string {
  const code = err.code === "invalid_input" ? "invalid_request" : err.code;
  if (KNOWN.has(code)) return t(`matchJob.errors.${code}`, { max: MAX_MATCH_DURATION_MIN });
  return t("matchJob.errors.generic", { message: err.message });
}

/** Codes after which the notes-only report is the suggested way forward. */
export function isFeatureUnavailable(err: Pick<MatchApiError, "code"> | null | undefined): boolean {
  return !!err && (err.code === "match_video_disabled" || err.code === "real_inference_disabled" || err.code === "plan_required");
}
