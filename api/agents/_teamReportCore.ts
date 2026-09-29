/**
 * VITAS · Informe táctico de equipo — núcleo COMPARTIDO (inv #7)
 *
 * Una sola implementación de la llamada a Claude y de los prompts del informe de
 * equipo, usada por:
 *   - el agente HTTP /api/agents/team-report (ruta "Informe sin vídeo (solo notas)"):
 *     `generateTeamReport` · prompt v1.1.0 (sin cambios de comportamiento, salvo que
 *     la etiqueta de fuente sale del `model` REAL de la respuesta, no de "claude_haiku");
 *   - el job de partido (api/_lib/matchJob/advance.ts): `generateMatchReportV2` ·
 *     prompt team-report.v2, que SOLO redacta desde evidencias con marca de tiempo.
 *
 * Reglas v2 (contrato matchReportLlmOutputSchema / matchReportV2Schema):
 *   - cada afirmación cita ≥1 evidence_id existente (el validador de citas descarta el
 *     resto y lo cuenta); sin overall_rating, sin confidence_score/data_completeness;
 *   - la cobertura (DERIVADA) se inyecta en el prompt y el texto la declara;
 *   - posesión solo como "estimada por IA", copiada de la observación, nunca inventada;
 *   - nunca dorsales, números ni nombres (ni siquiera de las notas del entrenador);
 *   - las notas son "aportado por el entrenador, no observado": nunca evidencia.
 *   - `source.model` = campo `model` de la respuesta de Anthropic (fetchMessages puede
 *     caer a claude-opus-4-8), nunca MODELS.reasoning.
 * Sin ANTHROPIC_API_KEY → abstención honesta (report_engine_unavailable / mock_fallback).
 * Edge-safe (solo fetch) → vale en edge y en nodejs.
 */
import { MODELS, modelParams } from "../_lib/models";
import { fetchMessages, responseText } from "../_lib/anthropic";
import { teamReportOutputSchema, validateLLMReport } from "./_outputSchemas";
import { languageDirective, normalizeLocale, type ReportLocale } from "../../src/lib/shared/locale";
import { categoryDirective, resolveCategory, type PlayerCategory } from "../../src/lib/shared/category";
import {
  MATCH_REPORT_SCHEMA_VERSION,
  REPORT_BOUNDS,
  TEAM_REPORT_PROMPT_VERSION,
  matchReportLlmOutputSchema,
  matchReportV2Schema,
  type MatchGate,
  type MatchObservation,
  type MatchReportV2,
  type TeamKit,
} from "../../src/lib/shared/matchJob/contract";
import { stripIndividualKeys, type NameGuard } from "../_lib/matchJob/identityGuard";
import { droppedClaimsBlock, validateReportCitations } from "../_lib/matchJob/citations";
import { formatRange, formatVideoTime, gateReason } from "../_lib/matchJob/messages";
import type { AnthropicUsage } from "../_lib/matchJob/costing";

// ── Llamada al modelo (compartida) ───────────────────────────────────────────

export type ReportModelCall =
  | { ok: true; text: string; model: string; usage: AnthropicUsage | null; stopReason: string | null }
  | { ok: false; kind: "no_key" | "http" | "timeout" | "refusal" | "max_tokens"; status: number | null; model: string | null; usage: AnthropicUsage | null };

export async function callReportModel(opts: {
  system: string;
  user: string;
  replyTokens: number;
  timeoutMs?: number;
}): Promise<ReportModelCall> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return { ok: false, kind: "no_key", status: null, model: null, usage: null };
  const ctrl = new AbortController();
  const timer = opts.timeoutMs ? setTimeout(() => ctrl.abort(), opts.timeoutMs) : null;
  try {
    const res = await fetchMessages({
      method: "POST",
      headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
      body: JSON.stringify({
        ...modelParams(MODELS.reasoning, opts.replyTokens),
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
      }),
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, kind: "http", status: res.status, model: null, usage: null };
    const data = (await res.json()) as { model?: string; usage?: AnthropicUsage; stop_reason?: string };
    const model = typeof data.model === "string" && data.model ? data.model : null;
    const usage = data.usage ?? null;
    if (data.stop_reason === "refusal") return { ok: false, kind: "refusal", status: res.status, model, usage };
    if (data.stop_reason === "max_tokens") return { ok: false, kind: "max_tokens", status: res.status, model, usage };
    if (!model) return { ok: false, kind: "http", status: res.status, model: null, usage };
    return { ok: true, text: responseText(data), model, usage, stopReason: data.stop_reason ?? null };
  } catch {
    return { ok: false, kind: ctrl.signal.aborted ? "timeout" : "http", status: null, model: null, usage: null };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function parseJsonText(text: string): unknown {
  const cleaned = text.replace(/^\s*```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  return JSON.parse(cleaned);
}

// ── v1 · ruta HTTP "solo notas / métricas" (comportamiento conservado) ──────────

export const TEAM_REPORT_V1_PROMPT_VERSION = "v1.1.0"; // v1.1 = gate de hueco + observado/inferido + fallback honesto (docx #14 P4)

function buildSystemPromptV1(locale: ReportLocale, category: PlayerCategory): string {
  return `Eres un analista táctico de fútbol profesional de VITAS Football Intelligence.
Genera un informe táctico de equipo, breve y accionable.

Estructura tu respuesta como JSON con este formato:
{
  "executive_summary": "Resumen ejecutivo del partido en 2-3 oraciones",
  "tactical_overview": {
    "home": { "style": "descripción del estilo", "strengths": [".."], "weaknesses": [".."] },
    "away": { "style": "descripción del estilo", "strengths": [".."], "weaknesses": [".."] }
  },
  "key_battles": ["batalla 1", "batalla 2"],
  "momentum_shifts": ["cambio de momentum 1"],
  "recommendations": {
    "home": ["recomendación táctica 1", "recomendación 2"],
    "away": ["recomendación táctica 1", "recomendación 2"]
  },
  "overall_rating": { "home": 7.5, "away": 6.8 },
  "confidence_score": "number 0-100 · confianza real en este análisis según los datos disponibles",
  "data_completeness": "number 0-100 · % de dimensiones evaluadas con datos reales, no inferidos",
  "not_evaluated": ["string · aspectos que no se pudieron evaluar por falta de datos"]
}

EVIDENCIA Y PROCEDENCIA (docx #14):
- Todo (style, strengths, weaknesses, key_battles, momentum_shifts, recommendations, overall_rating) deriva ÚNICAMENTE de los datos aportados (formaciones, métricas de equipo, posesión, pressing, red de pases). Si un dato de entrada es null/vacío, escribe "No disponible" en ese punto y BAJA confidence_score; deja key_battles y momentum_shifts como [] si no hay evidencia. NUNCA inventes un valor táctico plausible.
- overall_rating: NO emitas notas si no hay métricas suficientes — deja {} en vez de inventar un número.
- Separa observación directa (visto en vídeo/tracking) de inferencia (estimado por modelo); marca explícitamente lo inferido.

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

${languageDirective(locale)}${categoryDirective(category, locale)}`;
}

export interface TeamReportV1Input {
  teamMetrics?: Record<string, unknown>;
  homeFormation?: string;
  awayFormation?: string;
  possession?: Record<string, unknown>;
  pressing?: Record<string, unknown>;
  passNetwork?: Record<string, unknown>;
  playerContext?: Record<string, unknown>;
  locale?: unknown;
  category?: unknown;
}

/** Datos de la respuesta de /api/agents/team-report (envuelta después en successResponse). */
export async function generateTeamReport(body: TeamReportV1Input): Promise<Record<string, unknown>> {
  if (!process.env.ANTHROPIC_API_KEY) {
    // Fallback honesto: sin modelo NO se fabrican estilos/batallas/ratings (docx #14
    // P4, inv #2). Se abstiene con campos vacíos y confianza 0; la UI lo señala por `source`.
    return {
      report: {
        executive_summary: "Informe de equipo no disponible: falta el motor de análisis (sin datos suficientes).",
        tactical_overview: {
          home: { style: "No disponible", strengths: [], weaknesses: [] },
          away: { style: "No disponible", strengths: [], weaknesses: [] },
        },
        key_battles: [],
        momentum_shifts: [],
        recommendations: { home: [], away: [] },
        overall_rating: {},
        confidence_score: 0,
        data_completeness: 0,
        not_evaluated: ["Análisis táctico: no disponible sin el motor"],
      },
      promptVersion: TEAM_REPORT_V1_PROMPT_VERSION,
      source: "mock_fallback",
    };
  }

  const userMessage = `Analiza este partido de fútbol con los siguientes datos:

Formación local: ${body.homeFormation ?? "No detectada"}
Formación visitante: ${body.awayFormation ?? "No detectada"}

Métricas de equipo: ${JSON.stringify(body.teamMetrics ?? {}, null, 2)}
Posesión: ${JSON.stringify(body.possession ?? {}, null, 2)}
Pressing: ${JSON.stringify(body.pressing ?? {}, null, 2)}
Red de pases: ${JSON.stringify(body.passNetwork ?? {}, null, 2)}

Genera el informe táctico.`;

  const locale = normalizeLocale(body.locale);
  // C1 multi-categoría: override explícito > edad cronológica > default "youth" (ruta v1 sin cambios).
  const category = resolveCategory({
    age: (body.playerContext as { chronologicalAge?: number } | undefined)?.chronologicalAge,
    category: body.category,
  });

  const call = await callReportModel({ system: buildSystemPromptV1(locale, category), user: userMessage, replyTokens: 1024 });
  if (!call.ok) {
    return {
      report: { executive_summary: "Error generando informe táctico." },
      promptVersion: TEAM_REPORT_V1_PROMPT_VERSION,
      source: "error_fallback",
    };
  }

  let report: unknown;
  try {
    report = parseJsonText(call.text || "{}");
  } catch {
    report = { executive_summary: call.text };
  }
  // Validar estructura antes de devolver — JSON válido con shape basura cae al fallback marcado.
  const validation = validateLLMReport(teamReportOutputSchema, report);
  if (!validation.ok) {
    console.error("[team-report] Schema inválido:", validation.issues);
    return {
      report: { executive_summary: "Informe táctico no disponible — respuesta del modelo con estructura inválida." },
      promptVersion: TEAM_REPORT_V1_PROMPT_VERSION,
      source: "fallback_schema_error",
    };
  }
  // Etiqueta de fuente = modelo REAL de la respuesta (antes el literal falso "claude_haiku").
  return { report: validation.report, promptVersion: TEAM_REPORT_V1_PROMPT_VERSION, source: "llm", model: call.model };
}

// ── v2 · informe A-vs-B del job de partido ───────────────────────────────────

export interface MatchReportV2Input {
  locale: ReportLocale;
  category: PlayerCategory | null;
  home: { name: string | null; kit: TeamKit | null };
  away: { name: string | null; kit: TeamKit | null };
  attackingDir1h: "left_to_right" | "right_to_left" | null;
  notes: string | null;
  observation: MatchObservation;
  names: NameGuard;
  replyTokens: number;
  timeoutMs: number;
  now?: Date;
}

export type MatchReportV2Result =
  | { kind: "report"; report: MatchReportV2; model: string; usage: AnthropicUsage | null }
  | { kind: "gate"; gate: MatchGate; model: string | null; usage: AnthropicUsage | null };

function buildSystemPromptV2(locale: ReportLocale, category: PlayerCategory | null): string {
  const sectionKeys = "in_possession, out_of_possession, transitions, set_pieces, strengths, areas_to_improve, recommendations";
  return `You are the VITAS Football Intelligence tactical analyst. You write a HOME vs AWAY team report ONLY from the time-stamped EVIDENCE and per-segment observations produced by a video model. You do not watch the video yourself and you never use outside knowledge about these teams.

HARD RULES:
- Every claim MUST cite at least one evidence id from the EVIDENCE list, exactly as written (e.g. "s3-e2"). A claim you cannot support with evidence must not be written. Uncited claims are discarded automatically and counted.
- Team level only. Never mention shirt numbers, dorsals, player names (not even names that appear in the coach notes) or any individual player.
- No ratings, scores, grades, confidence numbers or invented statistics. Possession may only be mentioned as "estimated by AI" using the values given; never present it as an official statistic.
- Restrict conclusions to the analysed video time. When coverage is partial, the FIRST summary claim must say explicitly which video time was analysed (use the coverage statement given). Times are "video time" (they include pre-kick-off and half-time), never match minutes.
- COACH NOTES are "provided by the coach, not observed": you may use them to choose what to emphasise, but they are never evidence and must never be stated as observed facts.
- not_evaluated: list, in plain words, what could not be evaluated and every video-time range that was not analysed or where the teams could not be told apart, with the reason given.

OUTPUT: only JSON with exactly these keys (no others):
{"claims":[{"text":"...","evidence_ids":["s0-e1"]}],
 "teams":{"home":{${sectionKeys} — each an array of claims},"away":{same keys}},
 "not_evaluated":["..."]}
Bounds: claims 1–${REPORT_BOUNDS.maxSummaryClaims}; each team list ≤ ${REPORT_BOUNDS.maxClaimsPerList}; ≤ ${REPORT_BOUNDS.maxEvidencePerClaim} evidence ids per claim; each text ≤ 300 characters; not_evaluated ≤ ${REPORT_BOUNDS.maxNotEvaluated}.
${category ? `\n${categoryDirective(category, locale)}\n` : ""}
${languageDirective(locale)}
The JSON keys and evidence ids stay exactly as specified; only the text values follow the language instruction.`;
}

function teamLine(side: "HOME" | "AWAY", t: { name: string | null; kit: TeamKit | null }): string {
  const kit = t.kit ? `shirt ${t.kit.shirt.label ? `${t.kit.shirt.label} ` : ""}(${t.kit.shirt.hex})` : "kit not declared";
  return `${side}: ${t.name ?? "(no name)"} · ${kit}`;
}

function coverageStatement(o: MatchObservation): string {
  const c = o.coverage;
  const dur = c.duration_sec.value;
  const analysed = c.segments.filter((s) => s.status === "done").map((s) => formatRange(s.start_sec, s.end_sec));
  const head =
    dur !== null
      ? `Analysed ${analysed.length} of ${c.segments.length} segments (${formatVideoTime(c.analysed_sec.value ?? 0)} of ${formatVideoTime(dur)} video time): ${analysed.join(", ") || "none"}.`
      : `Analysed segments: ${analysed.join(", ") || "none"}.`;
  const gaps = c.gaps.map((g) => `- ${g.kind} ${formatRange(g.start_sec, g.end_sec)}: ${g.reason}`);
  return [head, ...(gaps.length ? ["Gaps:", ...gaps] : [])].join("\n");
}

function valueOrNull(m: { value: unknown }): unknown {
  return m.value ?? null;
}

function segmentDigest(o: MatchObservation) {
  return o.segments.map((s) => ({
    segment: s.idx,
    video_time: formatRange(s.start_sec, s.end_sec),
    status: s.status,
    team_identification: valueOrNull(s.team_identification),
    dominance: valueOrNull(s.dominance),
    possession_estimated_by_ai: s.possession.home.value === null ? null : { home: s.possession.home.value, away: s.possession.away.value },
    possession_low_confidence: s.possession_low_confidence ?? null,
    home: {
      formation: valueOrNull(s.teams.home.formation),
      phase: valueOrNull(s.teams.home.phases.predominant),
      build_up: valueOrNull(s.teams.home.build_up.style),
      pressing: [valueOrNull(s.teams.home.pressing.height), valueOrNull(s.teams.home.pressing.intensity)],
      block: [valueOrNull(s.teams.home.block.height), valueOrNull(s.teams.home.block.compactness)],
      transitions: [valueOrNull(s.teams.home.transitions.attacking), valueOrNull(s.teams.home.transitions.defensive)],
      set_piece_threat: valueOrNull(s.teams.home.set_pieces.threat),
    },
    away: {
      formation: valueOrNull(s.teams.away.formation),
      phase: valueOrNull(s.teams.away.phases.predominant),
      build_up: valueOrNull(s.teams.away.build_up.style),
      pressing: [valueOrNull(s.teams.away.pressing.height), valueOrNull(s.teams.away.pressing.intensity)],
      block: [valueOrNull(s.teams.away.block.height), valueOrNull(s.teams.away.block.compactness)],
      transitions: [valueOrNull(s.teams.away.transitions.attacking), valueOrNull(s.teams.away.transitions.defensive)],
      set_piece_threat: valueOrNull(s.teams.away.set_pieces.threat),
    },
  }));
}

/** Posesión de baja confianza (sin base visual / 50-50 uniforme): Claude no debe apoyar nada en ella. */
function possessionCaveat(o: MatchObservation): string {
  const flags = o.possession_detail.low_confidence ?? [];
  if (flags.length === 0) return "";
  return `\nLOW CONFIDENCE — do not base any claim on possession and say so if you mention it: ${flags.map((f) => f.reason).join(" ")}`;
}

export function buildMatchReportV2UserMessage(input: MatchReportV2Input): string {
  const o = input.observation;
  const p = o.possession;
  const evidence = o.evidence.map((e) => `${e.id} [${formatRange(e.t_start, e.t_end)}] ${e.team} · ${e.category}: ${e.text}`);
  const dir = input.attackingDir1h
    ? `\nCoach-declared attacking direction of HOME in the 1st half (not observed): ${input.attackingDir1h}.`
    : "";
  return `${teamLine("HOME", input.home)}
${teamLine("AWAY", input.away)}${dir}

COVERAGE STATEMENT (derived from the job state; cite it when coverage is partial):
${coverageStatement(o)}

MATCH POSSESSION ESTIMATED BY AI (weighted by analysed seconds; not an official statistic): ${
    p.home.value === null ? `not available (${p.home.gate_reason})` : `HOME ${p.home.value}% – AWAY ${p.away.value}%`
  }${possessionCaveat(o)}

PER-SEGMENT OBSERVATION (video model, estimates; null = not evaluated):
${JSON.stringify(segmentDigest(o))}

EVIDENCE (the ONLY things you may cite):
${evidence.join("\n") || "(none)"}
${input.notes ? `\nCOACH NOTES (provided by the coach, not observed — never evidence):\n${input.notes}` : ""}`;
}

export async function generateMatchReportV2(input: MatchReportV2Input): Promise<MatchReportV2Result> {
  const { locale, observation } = input;
  const gate = (code: MatchGate["code"], detail?: string): MatchGate => ({ code, reason: gateReason(locale, code, { detail }) });

  const call = await callReportModel({
    system: buildSystemPromptV2(locale, input.category),
    user: buildMatchReportV2UserMessage(input),
    replyTokens: input.replyTokens,
    timeoutMs: input.timeoutMs,
  });
  if (!call.ok) {
    if (call.kind === "no_key") return { kind: "gate", gate: gate("report_engine_unavailable"), model: null, usage: null };
    return { kind: "gate", gate: gate("report_engine_error", call.kind), model: call.model, usage: call.usage };
  }

  let parsedJson: unknown;
  try {
    parsedJson = parseJsonText(call.text);
  } catch {
    return { kind: "gate", gate: gate("report_engine_error", "invalid_json"), model: call.model, usage: call.usage };
  }
  const parsed = matchReportLlmOutputSchema.safeParse(stripIndividualKeys(parsedJson).value);
  if (!parsed.success) {
    return { kind: "gate", gate: gate("report_engine_error", "schema"), model: call.model, usage: call.usage };
  }

  const ids = new Set(observation.evidence.map((e) => e.id));
  const v = validateReportCitations(parsed.data, ids, input.names);
  try {
    const report = matchReportV2Schema.parse({
      schema_version: MATCH_REPORT_SCHEMA_VERSION,
      purpose: "match_ab",
      locale,
      claims: v.claims,
      teams: v.teams,
      // Copiados de la observación (nunca recalculados, inv #7).
      possession: observation.possession,
      possession_low_confidence: observation.possession_detail.low_confidence ?? [],
      segments: observation.segments,
      evidence: observation.evidence,
      coverage: observation.coverage,
      not_evaluated: v.not_evaluated,
      dropped_claims: droppedClaimsBlock(v.dropped),
      coach_notes_provided: !!input.notes,
      source: {
        kind: "llm",
        model: call.model,
        prompt_version: TEAM_REPORT_PROMPT_VERSION,
        generated_at: (input.now ?? new Date()).toISOString(),
      },
    });
    return { kind: "report", report, model: call.model, usage: call.usage };
  } catch {
    return { kind: "gate", gate: gate("report_engine_error", "schema"), model: call.model, usage: call.usage };
  }
}
