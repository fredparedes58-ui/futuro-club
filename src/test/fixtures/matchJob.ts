/**
 * Test fixtures for the match video job UI (PR-C). Every builder returns an object
 * that validates against the SHARED contract schemas (asserted in
 * src/test/lib/matchJobUiFixtures.test.ts), so UI tests exercise the same shapes
 * the backend will send. ESTIMADA_LLM for model output, DERIVADA for coverage.
 */

import {
  MATCH_ATTESTATION_VERSION,
  MATCH_OBSERVATION_SCHEMA_VERSION,
  MATCH_REPORT_SCHEMA_VERSION,
  MATCH_STATUS_TO_STAGE,
  TEAM_REPORT_PROMPT_VERSION,
  evidenceId,
  type EvidenceItem,
  type MatchCoverage,
  type MatchJobStatus,
  type MatchJobStatusResponse,
  type MatchObservation,
  type MatchPurpose,
  type MatchReportV2,
  type SegmentSummary,
} from "@/lib/shared/matchJob/contract";

export const JOB_ID = "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f";
export const JOB_ID_2 = "9a7e3d2f-4c5b-4d6e-8f90-1b2c3d4e5f60";
export const VIDEO_ID = "0a1b2c3d-1111-4222-8333-444455556666";
export const EMBED_URL = "https://player.mediadelivery.net/embed/12345/0a1b2c3d-1111-4222-8333-444455556666?token=abc&expires=1790000000";
export const SEG_SEC = 900;

const SRC = (idx: number, a: number, b: number) => `gemini-2.5-flash@segment.v1#s${idx}[${a}-${b}s]`;

export function llm<T>(value: T, units: string | null = null, source_ref = SRC(0, 0, SEG_SEC)) {
  return { value, provenance: "ESTIMADA_LLM" as const, confidence: 0.4, units, calibrated: false as const, gate_reason: null, source_ref };
}
export function der<T>(value: T, units: string | null = null) {
  return { value, provenance: "DERIVADA" as const, confidence: 1, units, calibrated: false as const, gate_reason: null, source_ref: "matchJob/aggregate" };
}
export function gatedLlm(gate_code: "segment_failed" | "teams_ambiguous" | "possession_missing" | "no_usable_segments" | "not_evaluated_by_model", gate_reason: string, source_ref = SRC(0, 0, SEG_SEC)) {
  return {
    value: null,
    provenance: "ESTIMADA_LLM" as const,
    confidence: 0,
    units: null,
    calibrated: false as const,
    gate_reason,
    gate_code,
    source_ref,
  };
}

function teamMetrics(src: string, failed: boolean) {
  const g = (r: string) => gatedLlm(failed ? "segment_failed" : "not_evaluated_by_model", r, src);
  if (failed) {
    const r = "Tramo no analizado.";
    return {
      formation: g(r),
      phases: { predominant: g(r) },
      build_up: { style: g(r) },
      pressing: { height: g(r), intensity: g(r) },
      block: { height: g(r), compactness: g(r) },
      transitions: { attacking: g(r), defensive: g(r) },
      set_pieces: { threat: g(r) },
      note: null,
    };
  }
  return {
    formation: llm("4-4-2", null, src),
    phases: { predominant: llm("organised_attack", null, src) },
    build_up: { style: llm("short", null, src) },
    pressing: { height: llm("high", null, src), intensity: llm("mid", null, src) },
    block: { height: llm("mid", null, src), compactness: llm("compact", null, src) },
    transitions: { attacking: llm("fast", null, src), defensive: llm("counter_press", null, src) },
    set_pieces: { threat: g("La IA no evaluó el balón parado en este tramo.") },
    note: null as string | null,
  };
}

export interface SegSpec {
  status: "done" | "failed" | "pending" | "running" | "skipped";
  /** home %; away = 100 − home. null ⇒ possession gated. */
  homePct?: number | null;
  dominance?: "home" | "balanced" | "away" | null;
  basis?: "ball_control_observed" | "territorial_proxy" | "mixed" | null;
  homeNote?: string | null;
}

export function buildSegment(idx: number, spec: SegSpec, durationSec: number): SegmentSummary {
  const start = idx * SEG_SEC;
  const end = Math.min(durationSec, start + SEG_SEC);
  const src = SRC(idx, start, end);
  const done = spec.status === "done";
  const failReason = `Tramo ${idx + 1} no analizado: MAX_TOKENS tras 2 intentos.`;
  const pct = spec.homePct === undefined ? 55 : spec.homePct;
  const dom = spec.dominance === undefined ? "home" : spec.dominance;
  const home = teamMetrics(src, !done);
  if (done && spec.homeNote !== undefined) home.note = spec.homeNote;
  return {
    idx,
    start_sec: start,
    end_sec: end,
    status: spec.status,
    team_identification: done ? llm("clear", null, src) : gatedLlm("segment_failed", failReason, src),
    dominance: done && dom !== null ? llm(dom, null, src) : gatedLlm(done ? "teams_ambiguous" : "segment_failed", done ? "Equipos no distinguibles." : failReason, src),
    possession:
      done && pct !== null
        ? { home: llm(pct, "%", src), away: llm(100 - pct, "%", src) }
        : {
            home: gatedLlm(done ? "possession_missing" : "segment_failed", done ? "La IA no estimó la posesión." : failReason, src),
            away: gatedLlm(done ? "possession_missing" : "segment_failed", done ? "La IA no estimó la posesión." : failReason, src),
          },
    possession_basis: done && pct !== null ? (spec.basis === undefined ? "mixed" : spec.basis) : null,
    teams: { home, away: teamMetrics(src, !done) },
    not_evaluable_intervals: [],
    source_ref: src,
  } as SegmentSummary;
}

export function buildEvidence(idx: number, n: number, t: number, text: string, team: "home" | "away" | "ambiguous" = "home"): EvidenceItem {
  return {
    id: evidenceId(idx, n),
    segment_idx: idx,
    t_start: t,
    t_end: t + 15,
    team,
    category: "pressing",
    text,
    provenance: "ESTIMADA_LLM",
    source_ref: SRC(idx, idx * SEG_SEC, (idx + 1) * SEG_SEC),
  };
}

export function buildCoverage(segments: SegmentSummary[], durationSec: number, opts: { ambiguousSec?: number } = {}): MatchCoverage {
  const analysed = segments.filter((s) => s.status === "done").reduce((a, s) => a + (s.end_sec - s.start_sec), 0);
  const failed = segments.filter((s) => s.status === "failed");
  return {
    time_base: "video",
    duration_sec: der(durationSec, "s"),
    analysed_sec: der(analysed, "s"),
    analysed_fraction: der(analysed / durationSec),
    failed_segments: der(failed.length),
    ambiguous_sec: llm(opts.ambiguousSec ?? 0, "s", "gemini-2.5-flash@segment.v1#team_identification"),
    not_evaluable_sec: llm(120, "s", "gemini-2.5-flash@segment.v1#not_evaluable_intervals"),
    segments: segments.map((s) => ({
      idx: s.idx,
      start_sec: s.start_sec,
      end_sec: s.end_sec,
      status: s.status,
      gate_code: s.status === "failed" ? "segment_failed" : s.status === "done" ? null : "segment_pending",
      reason: s.status === "failed" ? "MAX_TOKENS tras 2 intentos" : s.status === "done" ? null : "Pendiente",
    })),
    gaps: [
      { start_sec: 0, end_sec: 120, kind: "not_evaluable", provenance: "ESTIMADA_LLM", reason: "Antes del saque inicial (según IA)" },
      ...failed.map((s) => ({
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        kind: "segment_not_analysed" as const,
        provenance: "DERIVADA" as const,
        reason: "MAX_TOKENS tras 2 intentos",
      })),
      ...(opts.ambiguousSec
        ? [{ start_sec: 300, end_sec: 300 + opts.ambiguousSec, kind: "teams_ambiguous" as const, provenance: "ESTIMADA_LLM" as const, reason: "Camisetas parecidas a contraluz" }]
        : []),
    ],
  } as MatchCoverage;
}

export function buildObservation(
  specs: SegSpec[],
  opts: { durationSec?: number; evidence?: EvidenceItem[]; ambiguousSec?: number } = {},
): MatchObservation {
  const durationSec = opts.durationSec ?? specs.length * SEG_SEC;
  const segments = specs.map((s, i) => buildSegment(i, s, durationSec));
  const coverage = buildCoverage(segments, durationSec, { ambiguousSec: opts.ambiguousSec });
  const used = segments.filter((s) => s.status === "done" && s.possession.home.value !== null);
  const w = used.reduce((a, s) => a + (s.end_sec - s.start_sec), 0);
  const aggSrc = "gemini-2.5-flash@segment.v1#aggregate[weighted:analysed_sec]";
  const possession =
    used.length > 0
      ? (() => {
          const home = Math.round(used.reduce((a, s) => a + (s.possession.home.value as number) * (s.end_sec - s.start_sec), 0) / w);
          return { home: llm(home, "%", aggSrc), away: llm(100 - home, "%", aggSrc) };
        })()
      : {
          home: gatedLlm("no_usable_segments", "Ningún tramo con posesión utilizable.", aggSrc),
          away: gatedLlm("no_usable_segments", "Ningún tramo con posesión utilizable.", aggSrc),
        };
  const evidence = opts.evidence ?? [
    buildEvidence(0, 1, 312, "El local presiona alto tras la pérdida y recupera en campo rival."),
    buildEvidence(0, 2, 610, "El visitante sale rápido por banda derecha tras robo.", "away"),
  ];
  const count = (team: string) => llm(evidence.filter((e) => e.team === team).length, null, "gemini-2.5-flash@segment.v1#evidence");
  return {
    schema_version: MATCH_OBSERVATION_SCHEMA_VERSION,
    segments,
    evidence,
    possession,
    possession_detail: {
      weighting: "analysed_sec",
      segments_used: used.map((s) => s.idx),
      segments_excluded: segments.filter((s) => !used.includes(s)).map((s) => ({ idx: s.idx, gate_code: "segment_failed" as const })),
    },
    coverage,
    cited_events: { home: count("home"), away: count("away"), ambiguous: count("ambiguous") },
    identity_guard: { keys_stripped: 0, items_dropped: 0 },
  } as MatchObservation;
}

const EMPTY_SECTIONS = {
  in_possession: [],
  out_of_possession: [],
  transitions: [],
  set_pieces: [],
  strengths: [],
  areas_to_improve: [],
  recommendations: [],
};

export function buildReport(
  obs: MatchObservation,
  claims: { text: string; evidence_ids: string[] }[] = [{ text: "El local dominó el primer tramo con presión alta.", evidence_ids: ["s0-e1"] }],
  opts: { notEvaluated?: string[]; homeStrengths?: { text: string; evidence_ids: string[] }[] } = {},
): MatchReportV2 {
  return {
    schema_version: MATCH_REPORT_SCHEMA_VERSION,
    purpose: "match_ab",
    locale: "es",
    claims,
    teams: {
      home: { ...EMPTY_SECTIONS, strengths: opts.homeStrengths ?? [] },
      away: { ...EMPTY_SECTIONS, transitions: [{ text: "Transiciones rápidas por la derecha.", evidence_ids: ["s0-e2"] }] },
    },
    possession: obs.possession,
    segments: obs.segments,
    evidence: obs.evidence,
    coverage: obs.coverage,
    not_evaluated: opts.notEvaluated ?? [],
    dropped_claims: { total: der(0), by_reason: { missing_evidence: 0, unknown_evidence_id: 0, identity_guard: 0 } },
    coach_notes_provided: false,
    source: { kind: "llm", model: "claude-opus-5-5", prompt_version: TEAM_REPORT_PROMPT_VERSION, generated_at: "2026-09-28T20:00:00Z" },
  } as MatchReportV2;
}

export function buildStatus(o: {
  jobId?: string;
  status: MatchJobStatus;
  purpose?: MatchPurpose;
  segmentsDone?: number;
  segmentsTotal?: number | null;
  currentSegmentIdx?: number | null;
  observation?: MatchObservation | null;
  report?: MatchReportV2 | null;
  reportGate?: MatchJobStatusResponse["reportGate"];
  error?: MatchJobStatusResponse["error"];
  playback?: boolean;
  encodePct?: number | null;
  focusTeam?: "home" | "away" | null;
}): MatchJobStatusResponse {
  const terminal = o.status === "completed" || o.status === "failed" || o.status === "cancelled";
  return {
    job: {
      id: o.jobId ?? JOB_ID,
      videoId: VIDEO_ID,
      purpose: o.purpose ?? "match_ab",
      status: o.status,
      stage: MATCH_STATUS_TO_STAGE[o.status],
      locale: "es",
      category: null,
      focusTeam: o.focusTeam ?? null,
      home: { name: "CD Cantera", kit: { shirt: { hex: "#D32F2F" } } },
      away: { name: "Atlético Barrio", kit: { shirt: { hex: "#1565C0" } } },
      attestationVersion: MATCH_ATTESTATION_VERSION,
      createdAt: "2026-09-28T10:00:00Z",
      updatedAt: "2026-09-28T10:05:00Z",
      finishedAt: terminal ? "2026-09-28T12:00:00Z" : null,
    },
    progress: {
      segmentsDone: o.segmentsDone ?? 0,
      segmentsTotal: o.segmentsTotal === undefined ? null : o.segmentsTotal,
      currentSegmentIdx: o.currentSegmentIdx === undefined ? null : o.currentSegmentIdx,
      dispatchAttempts: 1,
    },
    encode: o.status === "awaiting_encode" ? { bunnyStatus: 2, encodeProgressPct: o.encodePct ?? null } : null,
    playback: o.playback === false ? null : { embedUrl: EMBED_URL, tokenExpiresAt: null },
    coverage: o.observation?.coverage ?? null,
    observation: o.observation ?? null,
    report: o.report ?? null,
    reportGate: o.reportGate ?? null,
    error: o.error ?? null,
    cost: { estimate: null, spend: null },
  } as MatchJobStatusResponse;
}

/** `{ ok: true, data }` JSON Response (the standard envelope). */
export function okJson(data: unknown, status = 200): Response {
  return new Response(JSON.stringify({ ok: true, data }), { status, headers: { "Content-Type": "application/json" } });
}

/** `{ ok: false, error: { code, message } }` JSON Response. */
export function errJson(code: string, message: string, status: number): Response {
  return new Response(JSON.stringify({ ok: false, error: { code, message } }), { status, headers: { "Content-Type": "application/json" } });
}
