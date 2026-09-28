/**
 * Contract tests for the Phase 1 match video job (src/lib/shared/matchJob/contract.ts).
 *
 * They pin what the three parallel teams (backend, Modal worker, UI) rely on:
 *   - the legal-transition table and stage mapping,
 *   - the zod schemas: valid samples parse; individual-level fields, MEDIDA,
 *     LLM self-confidence and overall_rating are rejected,
 *   - Gemini responseSchema ↔ zod parity,
 *   - the HMAC step signature: the two fixed STEP_HMAC_TEST_VECTORS (computed
 *     with node:crypto; re-checked here with the Vercel-side Web Crypto helper and
 *     with node:crypto in api/_lib/__tests__/matchStepHmac.test.ts).
 */
import { describe, expect, it } from "vitest";
import { z } from "zod";
import type { MetricResult } from "@/lib/metrics/MetricResult";
import { hmacSha256Hex, timingSafeEqual } from "../../../api/_lib/edgeCrypto";
import {
  DERIVED_PROVENANCES,
  EVIDENCE_ID_RE,
  GEMINI_DISPLAY_NAME_PREFIX,
  INDIVIDUAL_LEVEL_KEYS,
  LLM_PROVENANCES,
  MATCH_ATTESTATION_VERSION,
  MATCH_JOB_STATUSES,
  MATCH_JOB_TRANSITIONS,
  MATCH_METRIC_REGISTRY_PLAN,
  MATCH_STATUS_TO_STAGE,
  MATCH_TICK_PERIOD_MIN,
  MATCH_MAX_DISPATCH_ATTEMPTS,
  REDISPATCHABLE_MATCH_JOB_STATUSES,
  SEGMENT_GEMINI_RESPONSE_SCHEMA,
  STEP_HMAC_TEST_VECTORS,
  STEP_OPS,
  STEP_REPLY_SCHEMAS,
  STEP_SIGNATURE_HEADER,
  STEP_SIGNATURE_RE,
  STEP_SIGNATURE_WINDOW_SEC,
  STEP_TIMESTAMP_HEADER,
  STEP_TIMESTAMP_RE,
  TERMINAL_MATCH_JOB_STATUSES,
  evidenceId,
  geminiDisplayName,
  matchCoverageSchema,
  matchDispatchReplySchema,
  matchJobStatusResponseSchema,
  matchMetricSchema,
  matchObservationSchema,
  matchReportLlmOutputSchema,
  matchReportV2Schema,
  matchStartRequestSchema,
  mentionsIndividual,
  parseGeminiDisplayName,
  segmentObservationSchema,
  stepRequestSchema,
  stepSignatureBase,
  type MatchJobStatus,
} from "@/lib/shared/matchJob/contract";

// ─── fixtures ────────────────────────────────────────────────────────────────

const JOB = "8f6d2c1e-3b4a-4c5d-9e8f-0a1b2c3d4e5f";
const SRC = (idx: number, a: number, b: number) => `gemini-2.5-flash@segment.v1#s${idx}[${a}-${b}s]`;

const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v)) as T;

function llm<T>(value: T, source_ref = SRC(0, 0, 900)) {
  return { value, provenance: "ESTIMADA_LLM", confidence: 0.4, units: null as string | null, calibrated: false, gate_reason: null, source_ref };
}
function llmUnits<T>(value: T, units: string, source_ref = SRC(0, 0, 900)) {
  return { ...llm(value, source_ref), units };
}
function der<T>(value: T, units: string | null = null) {
  return { value, provenance: "DERIVADA", confidence: 1, units, calibrated: false, gate_reason: null, source_ref: "matchJob/aggregate" };
}
function gatedLlm(gate_code: string, gate_reason: string) {
  return { value: null, provenance: "ESTIMADA_LLM", confidence: 0, units: null, calibrated: false, gate_reason, gate_code, source_ref: SRC(1, 900, 1800) };
}

const rawTeam = {
  formation: "4-4-2",
  phases: { predominant: "organised_attack" },
  build_up: { style: "short" },
  pressing: { height: "high", intensity: "mid" },
  block: { height: "mid", compactness: "compact" },
  transitions: { attacking: "fast", defensive: "counter_press" },
  set_pieces: { threat: null },
  note: "Salida corta por los centrales y presión tras pérdida.",
};

const rawSegment = {
  team_identification: "clear",
  not_evaluable_intervals: [{ start: 0, end: 120, reason: "pre_kickoff" }],
  possession_estimate: { home_pct: 58, away_pct: 42, basis: "ball_control_observed" },
  dominance: "home",
  teams: { home: rawTeam, away: { ...rawTeam, formation: null, note: null } },
  evidence: [
    { t_start: 312, t_end: 330, team: "home", category: "pressing", text: "El local presiona alto tras la pérdida y recupera en campo rival." },
    { t_start: 610, t_end: 640, team: "away", category: "attacking_transition", text: "El visitante sale rápido por banda derecha tras robo." },
  ],
};

function teamMetrics(src: string) {
  return {
    formation: llm("4-4-2", src),
    phases: { predominant: llm("organised_attack", src) },
    build_up: { style: llm("short", src) },
    pressing: { height: llm("high", src), intensity: llm("mid", src) },
    block: { height: llm("mid", src), compactness: llm("compact", src) },
    transitions: { attacking: llm("fast", src), defensive: llm("counter_press", src) },
    set_pieces: { threat: { ...gatedLlm("not_evaluated_by_model", "La IA no evaluó el balón parado en este tramo."), source_ref: src } },
    note: null,
  };
}

const segment0 = {
  idx: 0,
  start_sec: 0,
  end_sec: 900,
  status: "done",
  team_identification: llm("clear", SRC(0, 0, 900)),
  dominance: llm("home", SRC(0, 0, 900)),
  possession: { home: llmUnits(58, "%", SRC(0, 0, 900)), away: llmUnits(42, "%", SRC(0, 0, 900)) },
  possession_basis: "ball_control_observed",
  teams: { home: teamMetrics(SRC(0, 0, 900)), away: teamMetrics(SRC(0, 0, 900)) },
  not_evaluable_intervals: [{ start: 0, end: 120, reason: "pre_kickoff" }],
  source_ref: SRC(0, 0, 900),
};

const segment1Failed = {
  idx: 1,
  start_sec: 900,
  end_sec: 1500,
  status: "failed",
  team_identification: gatedLlm("segment_failed", "Tramo 15:00–25:00 no analizado: MAX_TOKENS tras 2 intentos."),
  dominance: gatedLlm("segment_failed", "Tramo 15:00–25:00 no analizado: MAX_TOKENS tras 2 intentos."),
  possession: {
    home: gatedLlm("segment_failed", "Tramo no analizado."),
    away: gatedLlm("segment_failed", "Tramo no analizado."),
  },
  possession_basis: null,
  teams: {
    home: teamMetrics(SRC(1, 900, 1500)),
    away: teamMetrics(SRC(1, 900, 1500)),
  },
  not_evaluable_intervals: [],
  source_ref: SRC(1, 900, 1500),
};

const evidence = [
  {
    id: "s0-e1",
    segment_idx: 0,
    t_start: 312,
    t_end: 330,
    team: "home",
    category: "pressing",
    text: "El local presiona alto tras la pérdida y recupera en campo rival.",
    provenance: "ESTIMADA_LLM",
    source_ref: SRC(0, 0, 900),
  },
  {
    id: "s0-e2",
    segment_idx: 0,
    t_start: 610,
    t_end: 640,
    team: "away",
    category: "attacking_transition",
    text: "El visitante sale rápido por banda derecha tras robo.",
    provenance: "ESTIMADA_LLM",
    source_ref: SRC(0, 0, 900),
  },
];

const coverage = {
  time_base: "video",
  duration_sec: der(1500, "s"),
  analysed_sec: der(900, "s"),
  analysed_fraction: der(0.6),
  failed_segments: der(1),
  ambiguous_sec: llmUnits(0, "s", "gemini-2.5-flash@segment.v1#team_identification"),
  not_evaluable_sec: llmUnits(120, "s", "gemini-2.5-flash@segment.v1#not_evaluable_intervals"),
  segments: [
    { idx: 0, start_sec: 0, end_sec: 900, status: "done", gate_code: null, reason: null },
    { idx: 1, start_sec: 900, end_sec: 1500, status: "failed", gate_code: "segment_failed", reason: "MAX_TOKENS tras 2 intentos" },
  ],
  gaps: [
    { start_sec: 0, end_sec: 120, kind: "not_evaluable", provenance: "ESTIMADA_LLM", reason: "Antes del saque inicial (según IA)" },
    { start_sec: 900, end_sec: 1500, kind: "segment_not_analysed", provenance: "DERIVADA", reason: "MAX_TOKENS tras 2 intentos" },
  ],
};

const observation = {
  schema_version: "match-observation.v1",
  segments: [segment0, segment1Failed],
  evidence,
  possession: {
    home: llmUnits(58, "%", "gemini-2.5-flash@segment.v1#aggregate[weighted:analysed_sec]"),
    away: llmUnits(42, "%", "gemini-2.5-flash@segment.v1#aggregate[weighted:analysed_sec]"),
  },
  possession_detail: { weighting: "analysed_sec", segments_used: [0], segments_excluded: [{ idx: 1, gate_code: "segment_failed" }] },
  coverage,
  cited_events: {
    home: llm(1, "gemini-2.5-flash@segment.v1#evidence"),
    away: llm(1, "gemini-2.5-flash@segment.v1#evidence"),
    ambiguous: llm(0, "gemini-2.5-flash@segment.v1#evidence"),
  },
  identity_guard: { keys_stripped: 0, items_dropped: 0 },
};

const emptySection = {
  in_possession: [],
  out_of_possession: [],
  transitions: [],
  set_pieces: [],
  strengths: [],
  areas_to_improve: [],
  recommendations: [],
};

const report = {
  schema_version: "match-report.v2",
  purpose: "match_ab",
  locale: "es",
  claims: [{ text: "El local dominó el primer cuarto de hora con presión alta.", evidence_ids: ["s0-e1"] }],
  teams: {
    home: { ...emptySection, out_of_possession: [{ text: "Presión alta tras pérdida.", evidence_ids: ["s0-e1"] }] },
    away: { ...emptySection, transitions: [{ text: "Transiciones rápidas por la derecha.", evidence_ids: ["s0-e2"] }] },
  },
  possession: observation.possession,
  segments: observation.segments,
  evidence,
  coverage,
  not_evaluated: ["Tramo 15:00–25:00 (tiempo de vídeo): no analizado."],
  dropped_claims: {
    total: der(1),
    by_reason: { missing_evidence: 1, unknown_evidence_id: 0, identity_guard: 0 },
  },
  coach_notes_provided: false,
  source: { kind: "llm", model: "claude-opus-5-5", prompt_version: "team-report.v2", generated_at: "2026-09-28T20:00:00Z" },
};

const startMatchAb = {
  videoId: "0a1b2c3d-1111-4222-8333-444455556666",
  purpose: "match_ab",
  home: { name: "CD Cantera", kit: { shirt: { hex: "#D32F2F", label: "rojo" }, shorts: { hex: "#FFFFFF" } } },
  away: { name: "Atlético Barrio", kit: { shirt: { hex: "#1565C0", label: "azul" } } },
  locale: "es",
  attestation: { accepted: true, version: MATCH_ATTESTATION_VERSION },
};

// ─── 1 · state machine table ─────────────────────────────────────────────────

describe("match job · status transitions", () => {
  it("declares every status, only known targets, and no exits from terminal states", () => {
    expect(Object.keys(MATCH_JOB_TRANSITIONS).sort()).toEqual([...MATCH_JOB_STATUSES].sort());
    for (const [from, targets] of Object.entries(MATCH_JOB_TRANSITIONS)) {
      for (const t of targets) expect(MATCH_JOB_STATUSES).toContain(t);
      expect(targets).not.toContain(from as MatchJobStatus); // epoch bumps are not status changes
      expect(targets).not.toContain("awaiting_encode");
    }
    for (const t of TERMINAL_MATCH_JOB_STATUSES) expect(MATCH_JOB_TRANSITIONS[t]).toEqual([]);
  });

  it("lets every active job fail or be cancelled, and reach completed", () => {
    const active = MATCH_JOB_STATUSES.filter((s) => !(TERMINAL_MATCH_JOB_STATUSES as readonly string[]).includes(s));
    for (const s of active) {
      expect(MATCH_JOB_TRANSITIONS[s]).toContain("failed");
      expect(MATCH_JOB_TRANSITIONS[s]).toContain("cancelled");
      // BFS: completed is reachable
      const seen = new Set<MatchJobStatus>([s]);
      const queue: MatchJobStatus[] = [s];
      while (queue.length) {
        for (const n of MATCH_JOB_TRANSITIONS[queue.shift()!]) {
          if (!seen.has(n)) {
            seen.add(n);
            queue.push(n);
          }
        }
      }
      expect(seen.has("completed")).toBe(true);
    }
  });

  it("maps every status to a UI stage and never re-dispatches awaiting/terminal jobs", () => {
    for (const s of MATCH_JOB_STATUSES) expect(MATCH_STATUS_TO_STAGE[s]).toBeTruthy();
    expect(REDISPATCHABLE_MATCH_JOB_STATUSES).not.toContain("awaiting_encode");
    for (const t of TERMINAL_MATCH_JOB_STATUSES) expect(REDISPATCHABLE_MATCH_JOB_STATUSES).not.toContain(t);
    expect(MATCH_MAX_DISPATCH_ATTEMPTS).toBe(3);
    expect(MATCH_TICK_PERIOD_MIN).toBe(5);
  });
});

// ─── 2 · start request ───────────────────────────────────────────────────────

describe("match job · start request", () => {
  it("accepts a complete match_ab request and keeps category absent (no youth default)", () => {
    const r = matchStartRequestSchema.parse(startMatchAb);
    expect(r.category).toBeUndefined();
    expect(r.purpose).toBe("match_ab");
  });

  it("accepts team_baseline with only the focus team kit", () => {
    const r = matchStartRequestSchema.safeParse({
      ...startMatchAb,
      purpose: "team_baseline",
      focusTeam: "home",
      away: {},
      category: "youth",
      locale: "en",
    });
    expect(r.success).toBe(true);
  });

  it.each([
    ["no attestation", (b: any) => delete b.attestation],
    ["attestation not accepted", (b: any) => (b.attestation.accepted = false)],
    ["outdated attestation version", (b: any) => (b.attestation.version = "2020-01-01.v0")],
    ["match_ab without the away kit", (b: any) => delete b.away.kit],
    ["match_ab without a team name", (b: any) => delete b.home.name],
    ["team_baseline without focusTeam", (b: any) => (b.purpose = "team_baseline")],
    ["an invented playerContext", (b: any) => (b.playerContext = { age: 13 })],
    ["a per-player field on a team", (b: any) => (b.home.players = ["#10"])],
    ["a non-hex kit colour", (b: any) => (b.home.kit.shirt.hex = "red")],
    ["an unsupported locale", (b: any) => (b.locale = "pt")],
    ["a default-looking category", (b: any) => (b.category = "unknown")],
    ["notes over the limit", (b: any) => (b.notes = "x".repeat(1001))],
  ])("rejects %s", (_label, mutate) => {
    const body = clone(startMatchAb);
    mutate(body);
    expect(matchStartRequestSchema.safeParse(body).success).toBe(false);
  });
});

// ─── 3 · Gemini segment observation ──────────────────────────────────────────

describe("match job · segment observation (Gemini)", () => {
  it("parses a valid segment", () => {
    expect(segmentObservationSchema.safeParse(rawSegment).success).toBe(true);
  });

  it.each([
    ["dorsal on an evidence item", (s: any) => (s.evidence[0].dorsal = 10)],
    ["players list at top level", (s: any) => (s.players = [{ number: 7 }])],
    ["jugador inside a team", (s: any) => (s.teams.home.jugador = "Pepe")],
    ["player_name inside possession", (s: any) => (s.possession_estimate.player_name = "X")],
    ["a name on a not-evaluable interval", (s: any) => (s.not_evaluable_intervals[0].name = "X")],
    ["face data", (s: any) => (s.face = "embedding")],
  ])("rejects individual-level field: %s", (_label, mutate) => {
    const s = clone(rawSegment);
    mutate(s);
    expect(segmentObservationSchema.safeParse(s).success).toBe(false);
  });

  it.each([
    ["unknown dominance", (s: any) => (s.dominance = "home_clearly")],
    ["evidence ending before it starts", (s: any) => (s.evidence[0].t_end = 1)],
    ["fractional seconds", (s: any) => (s.evidence[0].t_start = 1.5)],
    ["more evidence than the bound", (s: any) => (s.evidence = Array.from({ length: 21 }, () => s.evidence[0]))],
    ["possession above 100", (s: any) => (s.possession_estimate.home_pct = 140)],
    ["an over-long formation", (s: any) => (s.teams.home.formation = "4-4-2 muy ofensiva y replegada")],
    ["a missing (not null) descriptor", (s: any) => delete s.teams.home.pressing.height],
  ])("rejects %s", (_label, mutate) => {
    const s = clone(rawSegment);
    mutate(s);
    expect(segmentObservationSchema.safeParse(s).success).toBe(false);
  });

  it("accepts a fully abstaining segment (null estimates, ambiguous teams)", () => {
    const s = clone(rawSegment) as any;
    s.team_identification = "ambiguous";
    s.possession_estimate = null;
    s.dominance = null;
    s.evidence = [];
    expect(segmentObservationSchema.safeParse(s).success).toBe(true);
  });

  it("keeps the Gemini responseSchema in lock-step with zod", () => {
    const diffs: string[] = [];
    compareGemini(segmentObservationSchema, SEGMENT_GEMINI_RESPONSE_SCHEMA as any, "$", diffs);
    expect(diffs).toEqual([]);
  });

  it("the parity walker catches drift (dropped key, nullable flip, enum change)", () => {
    const broken = clone(SEGMENT_GEMINI_RESPONSE_SCHEMA) as any;
    delete broken.properties.dominance;
    broken.properties.teams.properties.home.properties.pressing.properties.height.nullable = false;
    broken.properties.evidence.items.properties.category.enum = ["build_up"];
    const diffs: string[] = [];
    compareGemini(segmentObservationSchema, broken, "$", diffs);
    expect(diffs.some((d) => d.includes("keys"))).toBe(true);
    expect(diffs.some((d) => d.includes("pressing.height: nullable"))).toBe(true);
    expect(diffs.some((d) => d.includes("category: enum"))).toBe(true);
  });
});

/** Walks zod and the Gemini OpenAPI-subset schema together and records mismatches. */
function compareGemini(zs: z.ZodTypeAny, g: any, path: string, diffs: string[]): void {
  let s: any = zs;
  let nullable = false;
  for (;;) {
    if (s instanceof z.ZodEffects) {
      s = s._def.schema;
    } else if (s instanceof z.ZodNullable) {
      nullable = true;
      s = s.unwrap();
    } else if (s instanceof z.ZodOptional) {
      s = s.unwrap();
    } else {
      break;
    }
  }
  if (Boolean(g.nullable) !== nullable) diffs.push(`${path}: nullable zod=${nullable} gemini=${Boolean(g.nullable)}`);
  if (s instanceof z.ZodObject) {
    if (g.type !== "OBJECT") return void diffs.push(`${path}: expected OBJECT, got ${g.type}`);
    const zk = Object.keys(s.shape).sort();
    const gk = Object.keys(g.properties ?? {}).sort();
    if (JSON.stringify(zk) !== JSON.stringify(gk)) diffs.push(`${path}: keys zod=${zk} gemini=${gk}`);
    if (JSON.stringify([...(g.required ?? [])].sort()) !== JSON.stringify(zk)) diffs.push(`${path}: required must list every key`);
    for (const k of zk) if (g.properties?.[k]) compareGemini(s.shape[k], g.properties[k], `${path}.${k}`, diffs);
  } else if (s instanceof z.ZodArray) {
    if (g.type !== "ARRAY") return void diffs.push(`${path}: expected ARRAY, got ${g.type}`);
    const max = (s as any)._def.maxLength?.value;
    if (max !== g.maxItems) diffs.push(`${path}: maxItems zod=${max} gemini=${g.maxItems}`);
    compareGemini(s.element, g.items, `${path}[]`, diffs);
  } else if (s instanceof z.ZodEnum) {
    if (g.type !== "STRING") diffs.push(`${path}: enum must be STRING`);
    if (JSON.stringify([...s.options].sort()) !== JSON.stringify([...(g.enum ?? [])].sort())) diffs.push(`${path}: enum values differ`);
  } else if (s instanceof z.ZodNumber) {
    const want = s.isInt ? "INTEGER" : "NUMBER";
    if (g.type !== want) diffs.push(`${path}: expected ${want}, got ${g.type}`);
  } else if (s instanceof z.ZodString) {
    if (g.type !== "STRING") diffs.push(`${path}: expected STRING, got ${g.type}`);
  } else {
    diffs.push(`${path}: unhandled zod type ${s?.constructor?.name}`);
  }
}

// ─── 4 · identity guard (text) ───────────────────────────────────────────────

describe("match job · individual references in free text", () => {
  it.each([
    "El 10 del local recibe entre líneas",
    "the 9 of the away side drops deep",
    "El dorsal 7 visitante presiona",
    "Jugador 4 pierde el balón",
    "player 11 cuts inside",
    "número 5 del local",
    "#8 conduce por dentro",
    "el portero 1 saca en largo",
    "Die Rückennummer 6 schiebt hoch",
    "il giocatore 10 si abbassa",
    "the jersey number is not visible",
  ])("flags %j", (text) => {
    expect(mentionsIndividual(text)).toBe(true);
  });

  it.each([
    "El local presiona alto en bloque 4-4-2",
    "Presión alta en los primeros 10 minutos del tramo",
    "El visitante genera 2 ocasiones claras por banda",
    "the home team keeps a compact mid block",
    "Kit #1a2b3c claramente distinguible",
    "Salida corta por los centrales",
  ])("does not flag team-level text %j", (text) => {
    expect(mentionsIndividual(text)).toBe(false);
  });

  it("lists the obvious individual-level keys", () => {
    for (const k of ["dorsal", "player", "player_name", "jugador", "nombre", "face"]) {
      expect(INDIVIDUAL_LEVEL_KEYS).toContain(k);
    }
  });
});

// ─── 5 · MetricResult-shaped values + coverage ───────────────────────────────

describe("match job · metric values and coverage", () => {
  const llmPct = matchMetricSchema(z.number().min(0).max(100), LLM_PROVENANCES);
  const derivedSec = matchMetricSchema(z.number().nonnegative(), DERIVED_PROVENANCES);

  it("accepts an ESTIMADA_LLM value and a gated one, and they are MetricResults", () => {
    const ok = llmPct.parse(llmUnits(58, "%"));
    const asMetric: MetricResult<number> = ok; // compile-time: renderable by MetricValue
    expect(asMetric.provenance).toBe("ESTIMADA_LLM");
    expect(llmPct.safeParse(gatedLlm("teams_ambiguous", "Equipos no distinguibles en este tramo.")).success).toBe(true);
  });

  it.each([
    ["MEDIDA", { ...llmUnits(58, "%"), provenance: "MEDIDA", calibrated: true }],
    ["calibrated=true", { ...llmUnits(58, "%"), calibrated: true }],
    ["null without gate_reason", { ...llmUnits(null, "%"), gate_reason: null }],
    ["null with blank gate_reason", { ...llmUnits(null, "%"), gate_reason: "  " }],
    ["confidence > 1", { ...llmUnits(58, "%"), confidence: 1.2 }],
    ["ESTIMADA_LLM without source_ref", { ...llmUnits(58, "%"), source_ref: undefined }],
    ["CONSTANTE", { ...llmUnits(null, "%"), provenance: "CONSTANTE", gate_reason: "fijo" }],
    ["an LLM self-confidence key", { ...llmUnits(58, "%"), confidence_score: 90 }],
  ])("rejects an LLM value with %s", (_label, v) => {
    expect(llmPct.safeParse(v).success).toBe(false);
  });

  it("rejects ESTIMADA_LLM where DERIVADA is required", () => {
    expect(derivedSec.safeParse(llmUnits(900, "s")).success).toBe(false);
  });

  it("parses the coverage sample (analysed/failed DERIVADA, ambiguous ESTIMADA_LLM)", () => {
    expect(matchCoverageSchema.safeParse(coverage).success).toBe(true);
  });

  it("rejects ambiguous_sec labelled DERIVADA and analysed_sec labelled ESTIMADA_LLM", () => {
    const a = clone(coverage) as any;
    a.ambiguous_sec = der(60, "s");
    expect(matchCoverageSchema.safeParse(a).success).toBe(false);
    const b = clone(coverage) as any;
    b.analysed_sec = llmUnits(900, "s");
    expect(matchCoverageSchema.safeParse(b).success).toBe(false);
  });

  it("never reports 100% coverage while a segment failed, nor analysed > duration", () => {
    const a = clone(coverage) as any;
    a.analysed_fraction = der(1);
    expect(matchCoverageSchema.safeParse(a).success).toBe(false);
    const b = clone(coverage) as any;
    b.analysed_sec = der(2000, "s");
    expect(matchCoverageSchema.safeParse(b).success).toBe(false);
  });

  it("registry plan: concrete unique ids, never MEDIDA, coverage split as the critique requires", () => {
    const ids = MATCH_METRIC_REGISTRY_PLAN.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const m of MATCH_METRIC_REGISTRY_PLAN) {
      expect(m.id).toMatch(/^match_[a-z_]+$/);
      expect(m.provenance).not.toBe("MEDIDA");
    }
    const byPath = Object.fromEntries(MATCH_METRIC_REGISTRY_PLAN.map((m) => [m.path, m.provenance]));
    expect(byPath["coverage.analysed_sec"]).toBe("DERIVADA");
    expect(byPath["coverage.failed_segments"]).toBe("DERIVADA");
    expect(byPath["coverage.ambiguous_sec"]).toBe("ESTIMADA_LLM");
    expect(byPath["possession.{side}"]).toBe("ESTIMADA_LLM");
  });
});

// ─── 6 · observation + report v2 ─────────────────────────────────────────────

describe("match job · aggregated observation and report v2", () => {
  it("parses the aggregated observation", () => {
    const r = matchObservationSchema.safeParse(observation);
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2));
  });

  it("rejects a stored formation outside FORMATION_RE (the aggregator must gate it instead)", () => {
    const o = clone(observation) as any;
    o.segments[0].teams.home.formation.value = "ofensiva";
    expect(matchObservationSchema.safeParse(o).success).toBe(false);
    o.segments[0].teams.home.formation = gatedLlm("invalid_model_value", "Formación no reconocible (según IA).");
    expect(matchObservationSchema.safeParse(o).success).toBe(true);
  });

  it("rejects an evidence id that does not match its segment", () => {
    const o = clone(observation) as any;
    o.evidence[0].id = "s3-e1";
    expect(matchObservationSchema.safeParse(o).success).toBe(false);
  });

  it("parses the stored report", () => {
    const r = matchReportV2Schema.safeParse(report);
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2));
  });

  it.each([
    ["overall_rating", (r: any) => (r.overall_rating = { home: 7.5, away: 6.8 })],
    ["confidence_score", (r: any) => (r.confidence_score = 80)],
    ["data_completeness", (r: any) => (r.data_completeness = 70)],
    ["a claim without evidence", (r: any) => (r.claims[0].evidence_ids = [])],
    ["a claim citing an unknown evidence id", (r: any) => (r.teams.home.out_of_possession[0].evidence_ids = ["s9-e9"])],
    ["an llm report without the producing model", (r: any) => (r.source.model = null)],
    ["possession labelled MEDIDA", (r: any) => (r.possession.home = { ...r.possession.home, provenance: "MEDIDA", calibrated: true })],
    ["a per-player section", (r: any) => (r.teams.home.players = [])],
    ["a report for team_baseline", (r: any) => (r.purpose = "team_baseline")],
  ])("rejects a stored report with %s", (_label, mutate) => {
    const r = clone(report);
    mutate(r);
    expect(matchReportV2Schema.safeParse(r).success).toBe(false);
  });

  const llmOutput = {
    claims: [{ text: "El local dominó el primer tramo.", evidence_ids: ["s0-e1"] }],
    teams: { home: emptySection, away: emptySection },
    not_evaluated: [],
  };

  it("parses Claude's output and rejects rating / self-reported confidence", () => {
    expect(matchReportLlmOutputSchema.safeParse(llmOutput).success).toBe(true);
    for (const k of ["overall_rating", "confidence_score", "data_completeness"]) {
      expect(matchReportLlmOutputSchema.safeParse({ ...llmOutput, [k]: 7 }).success).toBe(false);
    }
  });

  it("parses a full status response (completed job)", () => {
    const status = {
      job: {
        id: JOB,
        videoId: startMatchAb.videoId,
        purpose: "match_ab",
        status: "completed",
        stage: "done",
        locale: "es",
        category: null,
        focusTeam: null,
        home: { name: "CD Cantera", kit: startMatchAb.home.kit },
        away: { name: "Atlético Barrio", kit: startMatchAb.away.kit },
        attestationVersion: MATCH_ATTESTATION_VERSION,
        createdAt: "2026-09-28T18:00:00Z",
        updatedAt: "2026-09-28T20:00:00Z",
        finishedAt: "2026-09-28T20:00:00Z",
      },
      progress: { segmentsDone: 1, segmentsTotal: 2, currentSegmentIdx: null, dispatchAttempts: 1 },
      encode: null,
      playback: { embedUrl: "https://player.mediadelivery.net/embed/12345/0a1b2c3d-1111-4222-8333-444455556666", tokenExpiresAt: null },
      coverage,
      observation,
      report,
      reportGate: null,
      error: null,
      cost: {
        estimate: { usd: 0.65, kind: "estimate", basis: "bunny_length", pricing_ref: "config/aiPricing.json@2026-09-28" },
        spend: { usd: 0.41, kind: "ledger", basis: "usage_tokens", pricing_ref: "config/aiPricing.json@2026-09-28" },
      },
    };
    const r = matchJobStatusResponseSchema.safeParse(status);
    if (!r.success) throw new Error(JSON.stringify(r.error.issues, null, 2));
  });
});

// ─── 7 · step protocol ───────────────────────────────────────────────────────

describe("match job · step protocol shapes", () => {
  const sha = "a".repeat(64);
  const requests: Record<string, unknown> = {
    begin: { op: "begin", jobId: JOB, epoch: 1 },
    heartbeat: { op: "heartbeat", jobId: JOB, epoch: 1, phase: "transcoding", processedSec: 1200 },
    upload_session: { op: "upload_session", jobId: JOB, epoch: 1, bytes: 73400320, mime: "video/mp4", sha256: sha, durationSec: 6601.4 },
    proxy_ready: {
      op: "proxy_ready",
      jobId: JOB,
      epoch: 1,
      file: { name: "files/abc123xyz", uri: "https://generativelanguage.googleapis.com/v1beta/files/abc123xyz" },
      bytes: 73400320,
      sha256: sha,
      durationSec: 6601.4,
    },
    advance: { op: "advance", jobId: JOB, epoch: 1 },
    fail: { op: "fail", jobId: JOB, epoch: 2, code: "transcode_failed", reason: "ffmpeg salió con código 1" },
    tick: { op: "tick", jobId: null, epoch: null, scheduledAt: "2026-09-28T20:05:00Z" },
  };

  it("parses one valid request per op", () => {
    expect(Object.keys(requests).sort()).toEqual([...STEP_OPS].sort());
    for (const [op, body] of Object.entries(requests)) {
      const r = stepRequestSchema.safeParse(body);
      expect(r.success, op).toBe(true);
    }
  });

  it.each([
    ["a per-job op without epoch", { op: "advance", jobId: JOB }],
    ["epoch 0", { op: "advance", jobId: JOB, epoch: 0 }],
    ["a non-uuid jobId", { op: "begin", jobId: "123", epoch: 1 }],
    ["a tick that names a job", { op: "tick", jobId: JOB, epoch: 1, scheduledAt: "2026-09-28T20:05:00Z" }],
    ["an upload_session without bytes", { op: "upload_session", jobId: JOB, epoch: 1, mime: "video/mp4", sha256: sha, durationSec: 10 }],
    ["an uppercase sha256", { ...(requests.upload_session as object), sha256: "A".repeat(64) }],
    ["a proxy file on another host", { ...(requests.proxy_ready as object), file: { name: "files/x", uri: "https://evil.example.com/files/x" } }],
    ["a source URL sent by the worker", { op: "begin", jobId: JOB, epoch: 1, sourceUrl: "https://x" }],
    ["an unknown op", { op: "deploy", jobId: JOB, epoch: 1 }],
  ])("rejects %s", (_label, body) => {
    expect(stepRequestSchema.safeParse(body).success).toBe(false);
  });

  it("accepts the documented replies and `superseded` on every per-job op", () => {
    const proxy = { container: "mp4", videoCodec: "h264", audio: false, fps: 1, maxHeight: 360, crf: 30, durationToleranceSec: 2 };
    expect(
      STEP_REPLY_SCHEMAS.begin.safeParse({
        action: "transcode",
        epoch: 1,
        sourceUrl: "https://vz-abc.b-cdn.net/0a1b2c3d/360p/video.m3u8",
        sourceUrlExpiresAt: null,
        targetVariant: "360p",
        expectedDurationSec: 6600,
        proxy,
      }).success,
    ).toBe(true);
    expect(STEP_REPLY_SCHEMAS.begin.safeParse({ action: "advance", epoch: 2 }).success).toBe(true);
    expect(STEP_REPLY_SCHEMAS.begin.safeParse({ action: "stop", epoch: 2, state: "cancelled" }).success).toBe(true);
    expect(
      STEP_REPLY_SCHEMAS.upload_session.safeParse({
        uploadUrl: "https://generativelanguage.googleapis.com/upload/v1beta/files?upload_id=xyz",
        displayName: geminiDisplayName(JOB, 1),
        chunkGranularityBytes: 8388608,
      }).success,
    ).toBe(true);
    expect(STEP_REPLY_SCHEMAS.advance.safeParse({ state: "observing", retryAfterSec: 15 }).success).toBe(true);
    expect(STEP_REPLY_SCHEMAS.heartbeat.safeParse({ action: "stop", state: "cancelled" }).success).toBe(true);
    expect(STEP_REPLY_SCHEMAS.fail.safeParse({ state: "failed" }).success).toBe(true);
    expect(
      STEP_REPLY_SCHEMAS.tick.safeParse({ dispatched: 1, redispatched: 0, failedJobs: 0, geminiFilesDeleted: 2, geminiDeleteErrors: 0, more: false })
        .success,
    ).toBe(true);
    for (const op of STEP_OPS) {
      if (op === "tick") continue;
      expect(STEP_REPLY_SCHEMAS[op].safeParse({ superseded: true }).success, op).toBe(true);
    }
    expect(STEP_REPLY_SCHEMAS.tick.safeParse({ superseded: true }).success).toBe(false);
  });

  it("rejects a transcode that keeps audio and an upload URL outside Gemini", () => {
    const base = {
      action: "transcode",
      epoch: 1,
      sourceUrl: "https://vz-abc.b-cdn.net/x/360p/video.m3u8",
      sourceUrlExpiresAt: null,
      targetVariant: "360p",
      expectedDurationSec: 6600,
      proxy: { container: "mp4", videoCodec: "h264", audio: true, fps: 1, maxHeight: 360, crf: 30, durationToleranceSec: 2 },
    };
    expect(STEP_REPLY_SCHEMAS.begin.safeParse(base).success).toBe(false);
    expect(
      STEP_REPLY_SCHEMAS.upload_session.safeParse({
        uploadUrl: "https://storage.example.com/upload",
        displayName: geminiDisplayName(JOB, 1),
        chunkGranularityBytes: null,
      }).success,
    ).toBe(false);
  });

  it("treats a Modal reply without call_id (or status:error) as a non-spawn", () => {
    expect(matchDispatchReplySchema.safeParse({ status: "spawned", call_id: "fc-01ABC", extra: 1 }).success).toBe(true);
    expect(matchDispatchReplySchema.safeParse({ status: "spawned" }).success).toBe(false);
    expect(matchDispatchReplySchema.safeParse({ status: "ok", call_id: "fc-1" }).success).toBe(false);
    const err = matchDispatchReplySchema.parse({ status: "error", reason: "spend limit" });
    expect(err.status).toBe("error");
  });
});

// ─── 8 · HMAC scheme + test vectors ──────────────────────────────────────────

const HMAC_SECRET = STEP_HMAC_TEST_VECTORS.secret;

describe("match job · step HMAC", () => {
  it("fixes header names, formats and the 300 s window", () => {
    expect(STEP_SIGNATURE_HEADER).toBe("X-Vitas-Signature");
    expect(STEP_TIMESTAMP_HEADER).toBe("X-Vitas-Timestamp");
    expect(STEP_SIGNATURE_WINDOW_SEC).toBe(300);
    expect(STEP_TIMESTAMP_RE.test("1790000000")).toBe(true);
    expect(STEP_TIMESTAMP_RE.test("1790000000.5")).toBe(false);
    expect(stepSignatureBase("1790000000", "{}")).toBe("1790000000.{}");
  });

  it("vectors are well-formed step bodies (they parse with stepRequestSchema)", () => {
    expect(STEP_HMAC_TEST_VECTORS.vectors).toHaveLength(2);
    for (const v of STEP_HMAC_TEST_VECTORS.vectors) {
      expect(STEP_TIMESTAMP_RE.test(v.ts)).toBe(true);
      expect(STEP_SIGNATURE_RE.test(v.signature)).toBe(true);
      expect(new TextEncoder().encode(v.body).length).toBe(v.bodyBytes);
      expect(stepRequestSchema.safeParse(JSON.parse(v.body)).success).toBe(true);
    }
    // Vector 2 pins UTF-8: more bytes than UTF-16 code units.
    const v2 = STEP_HMAC_TEST_VECTORS.vectors[1];
    expect(v2.bodyBytes).toBeGreaterThan(v2.body.length);
  });

  it.each(STEP_HMAC_TEST_VECTORS.vectors)("vector ts=$ts matches the Vercel-side Web Crypto helper", async (v) => {
    const base = stepSignatureBase(v.ts, v.body);
    const sig = await hmacSha256Hex(HMAC_SECRET, base);
    expect(sig).toBe(v.signature);
    expect(timingSafeEqual(sig, v.signature)).toBe(true);
    // The body, the timestamp and the secret are all covered.
    expect(await hmacSha256Hex(HMAC_SECRET, stepSignatureBase(v.ts, v.body.replace('"epoch":', '"epoch": ')))).not.toBe(v.signature);
    expect(await hmacSha256Hex(HMAC_SECRET, stepSignatureBase(String(Number(v.ts) + 1), v.body))).not.toBe(v.signature);
    expect(await hmacSha256Hex(`${HMAC_SECRET}x`, base)).not.toBe(v.signature);
    // A body-only HMAC (the modal-tracking scheme) is NOT valid here.
    expect(await hmacSha256Hex(HMAC_SECRET, v.body)).not.toBe(v.signature);
  });
});

// ─── 9 · formatters ──────────────────────────────────────────────────────────

describe("match job · canonical formatters", () => {
  it("builds and parses the Gemini displayName", () => {
    const name = geminiDisplayName(JOB, 2);
    expect(name).toBe(`${GEMINI_DISPLAY_NAME_PREFIX}${JOB}-2`);
    expect(parseGeminiDisplayName(name)).toEqual({ jobId: JOB, epoch: 2 });
    expect(parseGeminiDisplayName("vitas-match-not-a-uuid-1")).toBeNull();
    expect(parseGeminiDisplayName(`${GEMINI_DISPLAY_NAME_PREFIX}${JOB}-0`)).toBeNull();
    expect(parseGeminiDisplayName("someone-else-file")).toBeNull();
  });

  it("builds evidence ids that the id regex accepts", () => {
    expect(evidenceId(3, 2)).toBe("s3-e2");
    expect(EVIDENCE_ID_RE.test(evidenceId(0, 1))).toBe(true);
    expect(EVIDENCE_ID_RE.test("s0-e0")).toBe(false);
  });
});
