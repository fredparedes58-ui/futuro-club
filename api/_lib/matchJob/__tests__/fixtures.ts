/**
 * Fixtures SINTÉTICAS para tests unitarios del job de partido (no son ground truth:
 * el ground truth humano vive en fixtures/partido/ y nunca se genera).
 */
import type { SegmentObservation } from "../../../../src/lib/shared/matchJob/contract";
import type { SegmentState } from "../aggregate";
import type { NormalizedSegment, VisualBasis } from "../segmentResult";

export type TeamObs = SegmentObservation["teams"]["home"];

export function teamObs(overrides: Partial<TeamObs> = {}): TeamObs {
  return {
    formation: "4-4-2",
    phases: { predominant: "organised_attack" },
    build_up: { style: "short" },
    pressing: { height: "high", intensity: "mid" },
    block: { height: "mid", compactness: "compact" },
    transitions: { attacking: "fast", defensive: "counter_press" },
    set_pieces: { threat: "low" },
    note: "Bloque compacto y salida corta",
    ...overrides,
  };
}

export function segObs(overrides: Partial<SegmentObservation> = {}): SegmentObservation {
  return {
    team_identification: "clear",
    not_evaluable_intervals: [],
    possession_estimate: { home_pct: 60, away_pct: 40, basis: "ball_control_observed" },
    dominance: "home",
    teams: { home: teamObs(), away: teamObs({ formation: "3-5-2" }) },
    evidence: [{ t_start: 10, t_end: 20, team: "home", category: "build_up", text: "Salida corta desde la defensa" }],
    ...overrides,
  };
}

export function normalized(observation: SegmentObservation, visual: VisualBasis = "confirmed"): NormalizedSegment {
  return {
    observation,
    visual_basis: visual,
    time_base_applied: "absolute",
    guard: { keys_stripped: 0, items_dropped: 0 },
    malformed_dropped: 0,
    out_of_range_dropped: 0,
  };
}

/** Tramo done con evidencias desplazadas dentro de [start, end]. */
export function doneSegment(
  idx: number,
  start: number,
  end: number,
  obs: Partial<SegmentObservation> = {},
  visual: VisualBasis = "confirmed",
): SegmentState {
  const base = segObs(obs);
  const evidence = obs.evidence ?? base.evidence.map((e) => ({ ...e, t_start: start + 10, t_end: start + 20 }));
  return { idx, start_sec: start, end_sec: end, status: "done", result: normalized({ ...base, evidence }, visual), failure: null };
}

export function failedSegment(idx: number, start: number, end: number): SegmentState {
  return { idx, start_sec: start, end_sec: end, status: "failed", result: null, failure: { kind: "max_tokens", attempts: 2 } };
}

export const CONF = { llm: 0.35, partialFactor: 0.5, possession: 0.2, possessionLow: 0.05 } as const;

/** Usage de Gemini con tokens de vídeo confirmados. */
export const VIDEO_USAGE = {
  promptTokenCount: 60000,
  candidatesTokenCount: 2000,
  thoughtsTokenCount: 1000,
  promptTokensDetails: [
    { modality: "TEXT", tokenCount: 3000 },
    { modality: "VIDEO", tokenCount: 57000 },
  ],
};
