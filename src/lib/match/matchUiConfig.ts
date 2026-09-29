/**
 * VITAS · Typed loader for config/matchVideoUi.json (UI tunables of the match job).
 *
 * The JSON keeps each value next to its `_source` ("pendiente de validar" when
 * there is no source). This module only unwraps `value` and fails loudly at
 * import time if the file is malformed, so a typo can never silently become a
 * default threshold.
 */

import raw from "../../../config/matchVideoUi.json";

interface Entry {
  value: number;
  units: string | null;
  _source: string;
}

function read(key: string): number {
  const e = (raw as unknown as Record<string, Entry | undefined>)[key];
  if (!e || typeof e.value !== "number" || !Number.isFinite(e.value) || typeof e._source !== "string" || !e._source.trim()) {
    throw new Error(`config/matchVideoUi.json: "${key}" needs a finite value and a non-empty _source`);
  }
  return e.value;
}

export const MATCH_UI_CONFIG = {
  /** CIEDE2000 below which the kit picker warns (advisory, "pendiente de validar"). */
  kitDeltaEWarn: read("kitDeltaEWarn"),
  /** First status poll interval after any progress (s). */
  statusPollInitialSec: read("statusPollInitialSec"),
  /** Poll interval cap (s). */
  statusPollMaxSec: read("statusPollMaxSec"),
  /** Growth factor of the poll interval while nothing changes. */
  statusPollBackoffFactor: read("statusPollBackoffFactor"),
  /** Fixed confidence for the notes-only numeric rating (never the LLM self-report; "pendiente de validar"). */
  notesOnlyReportConfidence: read("notesOnlyReportConfidence"),
} as const;

/** Provenance text of each value (for tooltips / audits). */
export function matchUiConfigSource(key: keyof typeof MATCH_UI_CONFIG): string {
  return (raw as unknown as Record<string, Entry>)[key]._source;
}
