/**
 * Informe A-vs-B (team-report.v2): validador determinista de citas, bloque
 * dropped_claims (DERIVADA), y generación con Claude simulado — source.model sale del
 * campo `model` de la RESPUESTA, las afirmaciones sin evidencia válida se descartan, la
 * posesión se COPIA de la observación y sin key hay abstención honesta.
 */
import { afterEach, describe, expect, it, vi } from "vitest";
import { matchReportV2Schema, type MatchReportLlmOutput } from "../../../../src/lib/shared/matchJob/contract";
import { droppedClaimsBlock, validateReportCitations } from "../citations";
import { EMPTY_NAME_GUARD, buildNameGuard } from "../identityGuard";
import { aggregateMatch } from "../aggregate";
import { buildMatchReportV2UserMessage, generateMatchReportV2, generateTeamReport } from "../../../agents/_teamReportCore";
import { CONF, doneSegment, failedSegment } from "./fixtures";

const emptySection = () => ({
  in_possession: [],
  out_of_possession: [],
  transitions: [],
  set_pieces: [],
  strengths: [],
  areas_to_improve: [],
  recommendations: [],
});

function llmOutput(over: Partial<MatchReportLlmOutput> = {}): MatchReportLlmOutput {
  return {
    claims: [{ text: "El local domina la salida corta en el primer tramo", evidence_ids: ["s0-e1"] }],
    teams: { home: emptySection(), away: emptySection() },
    not_evaluated: [],
    ...over,
  };
}

describe("validateReportCitations", () => {
  const ids = new Set(["s0-e1", "s0-e2", "s1-e1"]);
  it("keeps claims with ≥1 existing id (dropping the unknown ids) and counts every drop by reason", () => {
    const out = llmOutput({
      claims: [
        { text: "Salida corta del local", evidence_ids: ["s0-e1", "s9-e9"] },
        { text: "Afirmación sin evidencia", evidence_ids: [] },
        { text: "Cita inventada", evidence_ids: ["s7-e1"] },
        { text: "El #10 del local lo organiza todo", evidence_ids: ["s0-e2"] },
      ],
      teams: {
        home: { ...emptySection(), strengths: [{ text: "Presión tras pérdida", evidence_ids: ["s1-e1", "s1-e1"] }] },
        away: { ...emptySection(), recommendations: [{ text: "El portero debería jugar corto", evidence_ids: ["s0-e1"] }] },
      },
      not_evaluated: ["Balón parado del visitante", "Hugo no se evaluó"],
    });
    const v = validateReportCitations(out, ids, buildNameGuard({ notes: "Mira a Hugo." }));
    expect(v.claims).toEqual([{ text: "Salida corta del local", evidence_ids: ["s0-e1"] }]);
    expect(v.teams.home.strengths).toEqual([{ text: "Presión tras pérdida", evidence_ids: ["s1-e1"] }]);
    expect(v.teams.away.recommendations).toEqual([]);
    expect(v.not_evaluated).toEqual(["Balón parado del visitante"]);
    expect(v.dropped).toEqual({ missing_evidence: 1, unknown_evidence_id: 1, identity_guard: 3 });
  });
  it("dropped_claims.total is DERIVADA with the internal breakdown", () => {
    const b = droppedClaimsBlock({ missing_evidence: 1, unknown_evidence_id: 2, identity_guard: 0 });
    expect(b.total).toMatchObject({ value: 3, provenance: "DERIVADA", calibrated: false, gate_reason: null });
    expect(b.by_reason).toEqual({ missing_evidence: 1, unknown_evidence_id: 2, identity_guard: 0 });
  });
});

describe("generateMatchReportV2 (Claude mocked)", () => {
  const observation = aggregateMatch({
    durationSec: 1800,
    segments: [doneSegment(0, 0, 900), failedSegment(1, 900, 1800)],
    locale: "es",
    geminiModel: "gemini-2.5-flash",
    confidence: CONF,
  });
  const input = {
    locale: "es" as const,
    category: null,
    home: { name: "Local FC", kit: { shirt: { hex: "#ffffff", label: "blanco" } } },
    away: { name: "Visitante CF", kit: { shirt: { hex: "#7b1e2b", label: "granate" } } },
    attackingDir1h: null,
    notes: "Ojo con Hugo en las transiciones.",
    observation,
    names: buildNameGuard({ notes: "Ojo con Hugo en las transiciones." }),
    replyTokens: 4000,
    timeoutMs: 5000,
    now: new Date("2026-09-29T10:00:00Z"),
  };

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
  });

  const stubClaude = (reply: Record<string, unknown>, status = 200) => {
    process.env.ANTHROPIC_API_KEY = "test-key";
    const f = vi.fn(async (_url: string, _init?: RequestInit) => new Response(JSON.stringify(reply), { status }));
    vi.stubGlobal("fetch", f);
    return f;
  };

  it("the user message carries the coverage statement, AI-estimated possession and notes marked as not observed", () => {
    const msg = buildMatchReportV2UserMessage(input);
    expect(msg).toMatch(/COVERAGE STATEMENT/);
    expect(msg).toMatch(/Analysed 1 of 2 segments/);
    expect(msg).toMatch(/ESTIMATED BY AI/);
    expect(msg).toMatch(/provided by the coach, not observed/);
    expect(msg).toMatch(/s0-e1/);
  });

  it("stores source.model from the response `model` field (fallback model), copies possession and drops uncited claims", async () => {
    const out = llmOutput({
      claims: [
        { text: "Solo se analizó el primer tramo de vídeo (0:00–15:00)", evidence_ids: ["s0-e1"] },
        { text: "Afirmación sin cita", evidence_ids: [] },
      ],
    });
    const f = stubClaude({
      model: "claude-opus-4-8",
      stop_reason: "end_turn",
      usage: { input_tokens: 20000, output_tokens: 1500 },
      content: [{ type: "thinking", thinking: "" }, { type: "text", text: JSON.stringify(out) }],
    });
    const r = await generateMatchReportV2(input);
    expect(r.kind).toBe("report");
    if (r.kind !== "report") return;
    expect(matchReportV2Schema.safeParse(r.report).success).toBe(true);
    expect(r.report.source).toMatchObject({ kind: "llm", model: "claude-opus-4-8", prompt_version: "team-report.v2" });
    expect(r.model).toBe("claude-opus-4-8");
    expect(r.report.claims).toHaveLength(1);
    expect(r.report.dropped_claims.total.value).toBe(1);
    expect(r.report.possession).toEqual(observation.possession);
    expect(r.report.coverage).toEqual(observation.coverage);
    expect(r.report.coach_notes_provided).toBe(true);
    expect(r.usage).toEqual({ input_tokens: 20000, output_tokens: 1500 });
    // max tokens via modelParams; model requested = reasoning tier
    const body = JSON.parse((f.mock.calls[0][1]?.body as string) ?? "{}");
    expect(body.max_tokens).toBeGreaterThanOrEqual(4000);
    expect(typeof body.model).toBe("string");
  });

  it("an output with overall_rating / confidence_score fails the strict schema → report_engine_error gate (never stored)", async () => {
    stubClaude({
      model: "claude-opus-5-5",
      stop_reason: "end_turn",
      content: [{ type: "text", text: JSON.stringify({ ...llmOutput(), overall_rating: { home: 7 } }) }],
    });
    const r = await generateMatchReportV2(input);
    expect(r.kind).toBe("gate");
    if (r.kind === "gate") expect(r.gate.code).toBe("report_engine_error");
  });

  it("HTTP error and refusal → report_engine_error gate; no key → report_engine_unavailable", async () => {
    stubClaude({ error: "x" }, 500);
    const a = await generateMatchReportV2(input);
    expect(a.kind === "gate" && a.gate.code).toBe("report_engine_error");
    stubClaude({ model: "claude-opus-4-8", stop_reason: "refusal", content: [] });
    const b = await generateMatchReportV2(input);
    expect(b.kind === "gate" && b.gate.code).toBe("report_engine_error");
    delete process.env.ANTHROPIC_API_KEY;
    const c = await generateMatchReportV2(input);
    expect(c.kind === "gate" && c.gate.code).toBe("report_engine_unavailable");
  });
});

describe("generateTeamReport (notes-only HTTP agent, shared core)", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.ANTHROPIC_API_KEY;
  });
  it("without a key abstains honestly (no invented ratings)", async () => {
    const r = await generateTeamReport({});
    expect(r.source).toBe("mock_fallback");
    expect((r.report as { overall_rating: unknown }).overall_rating).toEqual({});
  });
  it("labels the source with the model that actually answered", async () => {
    process.env.ANTHROPIC_API_KEY = "k";
    const report = {
      executive_summary: "Resumen breve",
      tactical_overview: { home: { style: "x", strengths: [], weaknesses: [] }, away: { style: "y", strengths: [], weaknesses: [] } },
      key_battles: [],
      momentum_shifts: [],
      recommendations: { home: [], away: [] },
      overall_rating: {},
      confidence_score: 20,
      data_completeness: 10,
      not_evaluated: [],
    };
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ model: "claude-opus-5-5", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(report) }] }))),
    );
    const r = await generateTeamReport({ homeFormation: "4-4-2" });
    expect(r).toMatchObject({ source: "llm", model: "claude-opus-5-5", promptVersion: "v1.1.0" });
  });
});

describe("citations with an empty name guard", () => {
  it("still applies the contract patterns", () => {
    const v = validateReportCitations(llmOutput({ claims: [{ text: "El 9 del visitante remata", evidence_ids: ["s0-e1"] }] }), new Set(["s0-e1"]), EMPTY_NAME_GUARD);
    expect(v.claims).toEqual([]);
    expect(v.dropped.identity_guard).toBe(1);
  });
});
