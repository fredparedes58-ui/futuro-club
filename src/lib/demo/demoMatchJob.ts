/**
 * VITAS · DEMO fixture of a completed full-match video job (A vs B).
 *
 * Used ONLY under IS_DEMO (no network, no Supabase): /equipo/partido shows what
 * the video report looks like. EVERY value is provenance MOCK ("Datos de
 * ejemplo") and the page renders the DemoDataBanner; nothing here is presented
 * as an AI estimate or a calculation. It validates against the SAME contract
 * schema as a real status response (src/test/lib/matchJobUi.test.ts), so the
 * demo cannot drift from what production renders.
 *
 * Team-level only: no player, no shirt number, no name besides the two team
 * names the visitor typed.
 */

import {
  MATCH_ATTESTATION_VERSION,
  MATCH_OBSERVATION_SCHEMA_VERSION,
  MATCH_REPORT_SCHEMA_VERSION,
  TEAM_REPORT_PROMPT_VERSION,
  evidenceId,
  type MatchJobStatusResponse,
  type TeamKit,
} from "@/lib/shared/matchJob/contract";
import { normalizeLocale, type ReportLocale } from "@/lib/shared/locale";
import i18n from "@/i18n";

/** Fixed demo job id (valid uuid; never sent anywhere). */
export const DEMO_MATCH_JOB_ID = "de300000-0000-4000-8000-000000000001";
const DEMO_SOURCE = "demo:example-fixture";
const SEGMENT_SEC = 900;
const DURATION_SEC = 6300; // 105:00 of video time (pre-kickoff + half-time included)
const FAILED_SEGMENT = 5;

type Mock<T> = {
  value: T | null;
  provenance: "MOCK";
  confidence: number;
  units: string | null;
  calibrated: false;
  gate_reason: string | null;
  source_ref: string;
  gate_code?: "segment_failed" | null;
};

function m<T>(value: T, units: string | null = null): Mock<T> {
  return { value, provenance: "MOCK", confidence: 0, units, calibrated: false, gate_reason: null, source_ref: DEMO_SOURCE };
}
function gatedMock<T>(reason: string): Mock<T> {
  return { value: null, provenance: "MOCK", confidence: 0, units: null, calibrated: false, gate_reason: reason, gate_code: "segment_failed", source_ref: DEMO_SOURCE };
}

interface DemoInput {
  homeName: string;
  awayName: string;
  homeKit?: TeamKit | null;
  awayKit?: TeamKit | null;
  locale?: ReportLocale;
}

export function buildDemoMatchJob(input: DemoInput): MatchJobStatusResponse {
  const locale = input.locale ?? normalizeLocale(i18n.language);
  const es = locale === "es" || locale === "es-419";
  const s = (esText: string, enText: string) => (es ? esText : enText);
  const homeName = input.homeName.trim() || s("Local", "Home");
  const awayName = input.awayName.trim() || s("Visitante", "Away");

  const failedReason = s("Tramo de ejemplo no analizado: MAX_TOKENS tras 2 intentos", "Example segment not analysed: MAX_TOKENS after 2 attempts");
  const homePct = [55, 60, 48, 50, 45, null, 52];
  const dominance = ["home", "home", "balanced", "balanced", "away", null, "balanced"] as const;
  const style = [
    { press: "high", block: "high", build: "short", phase: "organised_attack" },
    { press: "high", block: "mid", build: "short", phase: "organised_attack" },
    { press: "mid", block: "mid", build: "mixed", phase: "organised_defence" },
    { press: "mid", block: "mid", build: "mixed", phase: "organised_defence" },
    { press: "low", block: "low", build: "direct", phase: "defensive_transition" },
    null,
    { press: "mid", block: "mid", build: "short", phase: "organised_attack" },
  ] as const;

  const segCount = Math.ceil(DURATION_SEC / SEGMENT_SEC);
  const segments = Array.from({ length: segCount }, (_, idx) => {
    const start = idx * SEGMENT_SEC;
    const end = Math.min(DURATION_SEC, start + SEGMENT_SEC);
    const failed = idx === FAILED_SEGMENT;
    const st = style[idx];
    const team = (flip: boolean) =>
      failed || !st
        ? {
            formation: gatedMock<string>(failedReason),
            phases: { predominant: gatedMock<"organised_attack">(failedReason) },
            build_up: { style: gatedMock<"short">(failedReason) },
            pressing: { height: gatedMock<"high">(failedReason), intensity: gatedMock<"high">(failedReason) },
            block: { height: gatedMock<"high">(failedReason), compactness: gatedMock<"compact">(failedReason) },
            transitions: { attacking: gatedMock<"fast">(failedReason), defensive: gatedMock<"retreat">(failedReason) },
            set_pieces: { threat: gatedMock<"low">(failedReason) },
            note: null,
          }
        : {
            formation: m(flip ? "4-4-2" : "4-3-3"),
            phases: { predominant: m(flip ? "organised_defence" : st.phase) },
            build_up: { style: m(flip ? "direct" : st.build) },
            pressing: { height: m(flip ? "mid" : st.press), intensity: m(flip ? "mid" : st.press) },
            block: { height: m(flip ? "low" : st.block), compactness: m(flip ? "compact" : "medium") },
            transitions: { attacking: m(flip ? "fast" : "controlled"), defensive: m(flip ? "retreat" : "counter_press") },
            set_pieces: { threat: m(flip ? "mid" : "low") },
            note: null,
          };
    const pct = homePct[idx];
    return {
      idx,
      start_sec: start,
      end_sec: end,
      status: failed ? "failed" : "done",
      team_identification: failed ? gatedMock<"clear">(failedReason) : m(idx === 4 ? "partial" : "clear"),
      dominance: failed || dominance[idx] === null ? gatedMock<"home">(failedReason) : m(dominance[idx]),
      possession:
        failed || pct === null
          ? { home: gatedMock<number>(failedReason), away: gatedMock<number>(failedReason) }
          : { home: m(pct, "%"), away: m(100 - pct, "%") },
      possession_basis: failed ? null : "mixed",
      teams: { home: team(false), away: team(true) },
      not_evaluable_intervals:
        idx === 0
          ? [{ start: 0, end: 120, reason: "pre_kickoff" }]
          : idx === 3
            ? [{ start: 2820, end: 3600, reason: "half_time" }]
            : idx === 4
              ? [{ start: 3600, end: 3720, reason: "half_time" }]
              : [],
      source_ref: `${DEMO_SOURCE}#s${idx}`,
    };
  });

  const ev = (idx: number, n: number, t0: number, t1: number, team: "home" | "away" | "ambiguous", category: string, esText: string, enText: string) => ({
    id: evidenceId(idx, n),
    segment_idx: idx,
    t_start: t0,
    t_end: t1,
    team,
    category,
    text: s(esText, enText),
    provenance: "MOCK" as const,
    source_ref: `${DEMO_SOURCE}#s${idx}`,
  });
  const evidence = [
    ev(0, 1, 312, 330, "home", "pressing", "Ejemplo: el local presiona alto tras pérdida y recupera en campo rival.", "Example: the home side presses high after losing the ball and wins it back in the opponent's half."),
    ev(0, 2, 610, 640, "away", "attacking_transition", "Ejemplo: el visitante sale rápido por su banda derecha tras robo.", "Example: the away side breaks quickly down its right after winning the ball."),
    ev(1, 1, 1150, 1185, "home", "build_up", "Ejemplo: salida corta del local desde su portería con los centrales abiertos.", "Example: short build-up by the home side from goal with the centre-backs split."),
    ev(2, 1, 2010, 2040, "away", "defensive_block", "Ejemplo: el visitante defiende en bloque medio compacto.", "Example: the away side defends in a compact mid-block."),
    ev(3, 1, 2750, 2790, "home", "set_piece", "Ejemplo: córner del local al primer palo.", "Example: near-post corner by the home side."),
    ev(4, 1, 3900, 3930, "away", "chance", "Ejemplo: ocasión del visitante tras centro lateral.", "Example: chance for the away side after a cross."),
    ev(4, 2, 4100, 4120, "ambiguous", "other", "Ejemplo: jugada sin equipo identificable (camisetas parecidas a contraluz).", "Example: play with no identifiable team (similar shirts against the light)."),
    ev(6, 1, 5600, 5640, "home", "possession_spell", "Ejemplo: fase larga de posesión del local en campo rival.", "Example: long spell of home possession in the opponent's half."),
  ];

  const used = segments.filter((sg) => sg.status === "done").map((sg) => sg.idx);
  const aggHome = Math.round(used.reduce((acc, i) => acc + (homePct[i] ?? 0), 0) / used.length);
  const possession = { home: m(aggHome, "%"), away: m(100 - aggHome, "%") };
  const analysedSec = used.length * SEGMENT_SEC;

  const coverage = {
    time_base: "video" as const,
    duration_sec: m(DURATION_SEC, "s"),
    analysed_sec: m(analysedSec, "s"),
    analysed_fraction: m(analysedSec / DURATION_SEC),
    failed_segments: m(1),
    ambiguous_sec: m(240, "s"),
    not_evaluable_sec: m(120 + 900, "s"),
    segments: segments.map((sg) => ({
      idx: sg.idx,
      start_sec: sg.start_sec,
      end_sec: sg.end_sec,
      status: sg.status,
      gate_code: sg.status === "failed" ? ("segment_failed" as const) : null,
      reason: sg.status === "failed" ? failedReason : null,
    })),
    gaps: [
      { start_sec: 0, end_sec: 120, kind: "not_evaluable" as const, provenance: "MOCK" as const, reason: s("Antes del saque inicial (ejemplo)", "Before kick-off (example)") },
      { start_sec: 2820, end_sec: 3720, kind: "not_evaluable" as const, provenance: "MOCK" as const, reason: s("Descanso (ejemplo)", "Half-time (example)") },
      { start_sec: 4020, end_sec: 4260, kind: "teams_ambiguous" as const, provenance: "MOCK" as const, reason: s("Camisetas indistinguibles a contraluz (ejemplo)", "Shirts indistinguishable against the light (example)") },
      { start_sec: FAILED_SEGMENT * SEGMENT_SEC, end_sec: (FAILED_SEGMENT + 1) * SEGMENT_SEC, kind: "segment_not_analysed" as const, provenance: "MOCK" as const, reason: failedReason },
    ],
  };

  const count = (team: string) => m(evidence.filter((e) => e.team === team).length);
  const observation = {
    schema_version: MATCH_OBSERVATION_SCHEMA_VERSION,
    segments,
    evidence,
    possession,
    possession_detail: {
      weighting: "analysed_sec" as const,
      segments_used: used,
      segments_excluded: [{ idx: FAILED_SEGMENT, gate_code: "segment_failed" as const }],
    },
    coverage,
    cited_events: { home: count("home"), away: count("away"), ambiguous: count("ambiguous") },
    identity_guard: { keys_stripped: 0, items_dropped: 0 },
  };

  const c = (esText: string, enText: string, ids: string[]) => ({ text: s(esText, enText), evidence_ids: ids });
  const empty = { in_possession: [], out_of_possession: [], transitions: [], set_pieces: [], strengths: [], areas_to_improve: [], recommendations: [] };
  const report = {
    schema_version: MATCH_REPORT_SCHEMA_VERSION,
    purpose: "match_ab" as const,
    locale,
    claims: [
      c(`Ejemplo: ${homeName} dominó el primer tramo con presión alta tras pérdida.`, `Example: ${homeName} dominated the first segment with a high press after losing the ball.`, ["s0-e1"]),
      c(`Ejemplo: ${awayName} buscó la transición rápida por banda.`, `Example: ${awayName} looked for quick transitions down the flank.`, ["s0-e2", "s4-e1"]),
      c(`Ejemplo: en el último tramo analizado ${homeName} volvió a tener fases largas de posesión en campo rival.`, `Example: in the last analysed segment ${homeName} again had long spells of possession in the opponent's half.`, ["s6-e1"]),
    ],
    teams: {
      home: {
        ...empty,
        in_possession: [c("Ejemplo: salida corta desde portería.", "Example: short build-up from goal.", ["s1-e1"])],
        out_of_possession: [c("Ejemplo: presión alta tras pérdida.", "Example: high press after losing the ball.", ["s0-e1"])],
        set_pieces: [c("Ejemplo: córners al primer palo.", "Example: near-post corners.", ["s3-e1"])],
      },
      away: {
        ...empty,
        out_of_possession: [c("Ejemplo: bloque medio compacto.", "Example: compact mid-block.", ["s2-e1"])],
        transitions: [c("Ejemplo: salida rápida tras robo.", "Example: quick break after winning the ball.", ["s0-e2"])],
        areas_to_improve: [c("Ejemplo: defensa de centros laterales.", "Example: defending crosses.", ["s4-e1"])],
      },
    },
    possession,
    segments,
    evidence,
    coverage,
    not_evaluated: [s("Ejemplo: tramo 75:00–90:00 (tiempo de vídeo) no analizado.", "Example: segment 75:00–90:00 (video time) not analysed.")],
    dropped_claims: { total: m(0), by_reason: { missing_evidence: 0, unknown_evidence_id: 0, identity_guard: 0 } },
    coach_notes_provided: false,
    source: { kind: "mock" as const, model: null, prompt_version: TEAM_REPORT_PROMPT_VERSION, generated_at: "2026-09-28T12:00:00Z" },
  };

  return {
    job: {
      id: DEMO_MATCH_JOB_ID,
      videoId: "demo-video",
      purpose: "match_ab",
      status: "completed",
      stage: "done",
      locale,
      category: null,
      focusTeam: null,
      home: { name: homeName, kit: input.homeKit ?? null },
      away: { name: awayName, kit: input.awayKit ?? null },
      attestationVersion: MATCH_ATTESTATION_VERSION,
      createdAt: "2026-09-28T10:00:00Z",
      updatedAt: "2026-09-28T12:00:00Z",
      finishedAt: "2026-09-28T12:00:00Z",
    },
    progress: { segmentsDone: used.length, segmentsTotal: segCount, currentSegmentIdx: null, dispatchAttempts: 1 },
    encode: null,
    // No real video in the demo: evidence chips render as "video not available".
    playback: null,
    coverage,
    observation,
    report,
    reportGate: null,
    error: null,
    cost: { estimate: null, spend: null },
  } as MatchJobStatusResponse;
}
