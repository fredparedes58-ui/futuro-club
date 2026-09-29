/**
 * VITAS · Match job — agregación PURA y determinista (observación, evidencias, cobertura)
 *
 * Procedencia (CLAUDE.md inv #1, .claude/rules/metricas.md):
 *   - Todo lo que viene de Gemini (descriptores, dominio, posesión, conteos de evidencias
 *     citadas) es ESTIMADA_LLM. Una función determinista sobre entradas LLM sigue siendo
 *     ESTIMADA_LLM, no DERIVADA.
 *   - Cobertura desde el estado del job (duración, segundos analizados, fracción, tramos
 *     fallidos) = DERIVADA. Segundos ambiguos / no evaluables = autoinforme de Gemini →
 *     ESTIMADA_LLM, separados.
 *   - calibrated SIEMPRE false. Nada es MEDIDA, nada en metros, nada por jugador.
 *   - Confianza desde config ("pendiente de validar"), nunca del autoinforme del modelo;
 *     reducida en tramos `partial`.
 * Dato ausente ⇒ value null + gate_reason (en el locale del job) + gate_code. Sin
 * interpolación entre tramos, sin valores por defecto, sin 0 que signifique "no se sabe".
 *
 * Todo el resultado se valida con los schemas del contrato antes de devolverse.
 */
import { makeMetric, type Provenance } from "../../../src/lib/metrics/MetricResult";
import type { ReportLocale } from "../../../src/lib/shared/locale";
import {
  FORMATION_RE,
  MATCH_OBSERVATION_SCHEMA_VERSION,
  SEGMENT_PROMPT_VERSION,
  evidenceId,
  matchCoverageSchema,
  matchObservationSchema,
  type EvidenceItem,
  type MatchCoverage,
  type MatchGateCode,
  type MatchObservation,
  type PossessionLowConfidenceCode,
  type SegmentObservation,
  type SegmentStatus,
} from "../../../src/lib/shared/matchJob/contract";
import { segmentSourceRef } from "./prompts/segment.v1";
import type { NormalizedSegment } from "./segmentResult";
import {
  ambiguousGapReason,
  gateReason,
  notEvaluableGapReason,
  possessionLowConfidenceReason,
  segmentFailureDetail,
  type SegmentFailureKind,
} from "./messages";

export interface SegmentState {
  idx: number;
  start_sec: number;
  end_sec: number;
  status: SegmentStatus;
  /** Solo en status done. */
  result: NormalizedSegment | null;
  /** Motivo del fallo / salto (status failed | skipped). */
  failure: { kind: SegmentFailureKind; attempts: number } | null;
}

export interface AggregateConfidence {
  llm: number;
  partialFactor: number;
  possession: number;
  /** Posesión de baja confianza (sin base visual / salida uniforme 50-50). ≤ possession. */
  possessionLow: number;
}

export interface AggregateInput {
  /** Bunny `length` (cross-check ffprobe). null ⇒ gated. */
  durationSec: number | null;
  segments: readonly SegmentState[];
  locale: ReportLocale;
  geminiModel: string;
  confidence: AggregateConfidence;
}

interface Gate {
  code: MatchGateCode;
  reason: string;
}

type AnyMetric = {
  value: unknown;
  provenance: Provenance;
  confidence: number;
  units: string | null;
  calibrated: false;
  gate_reason: string | null;
  gate_code: MatchGateCode | null;
  source_ref?: string;
};

function metric(
  provenance: "ESTIMADA_LLM" | "DERIVADA",
  value: unknown,
  opts: { confidence: number; units?: string | null; sourceRef?: string; gate?: Gate | null },
): AnyMetric {
  const gated = value === null || value === undefined;
  const base = makeMetric({
    value: gated ? null : value,
    provenance,
    confidence: gated ? 0 : opts.confidence,
    units: opts.units ?? null,
    calibrated: false,
    gate_reason: gated ? (opts.gate?.reason ?? null) : null,
    ...(opts.sourceRef ? { source_ref: opts.sourceRef } : {}),
  });
  return { ...base, calibrated: false, gate_code: gated ? (opts.gate?.code ?? null) : null };
}

const llmM = (value: unknown, confidence: number, sourceRef: string, gate: Gate | null, units: string | null = null) =>
  metric("ESTIMADA_LLM", value, { confidence, sourceRef, gate, units });
const derivedM = (value: unknown, units: string | null, gate: Gate | null = null) =>
  metric("DERIVADA", value, { confidence: 1, units, gate });

function segLen(s: { start_sec: number; end_sec: number }): number {
  return s.end_sec - s.start_sec;
}

/** Longitud de la unión de intervalos (sin doble conteo). */
function mergedLength(intervals: readonly { start: number; end: number }[]): number {
  const sorted = [...intervals].filter((i) => i.end > i.start).sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = Number.NaN;
  let curEnd = Number.NaN;
  for (const i of sorted) {
    if (Number.isNaN(curEnd) || i.start > curEnd) {
      if (!Number.isNaN(curEnd)) total += curEnd - curStart;
      curStart = i.start;
      curEnd = i.end;
    } else if (i.end > curEnd) {
      curEnd = i.end;
    }
  }
  if (!Number.isNaN(curEnd)) total += curEnd - curStart;
  return total;
}

const STATUS_GATE: Record<Exclude<SegmentStatus, "done">, MatchGateCode> = {
  pending: "segment_pending",
  running: "segment_running",
  failed: "segment_failed",
  skipped: "segment_skipped",
};

function notDoneGate(s: SegmentState, locale: ReportLocale): Gate {
  const code = STATUS_GATE[s.status as Exclude<SegmentStatus, "done">];
  const detail = s.failure ? segmentFailureDetail(locale, s.failure.kind, s.failure.attempts) : undefined;
  return { code, reason: gateReason(locale, code, { startSec: s.start_sec, endSec: s.end_sec, detail }) };
}

function isAmbiguous(o: SegmentObservation): boolean {
  return o.team_identification === "ambiguous";
}

function segmentConfidence(o: SegmentObservation, base: number, partialFactor: number): number {
  return o.team_identification === "partial" ? base * partialFactor : base;
}

type PossessionCheck =
  | {
      ok: true;
      home: number;
      away: number;
      basis: NonNullable<SegmentObservation["possession_estimate"]>["basis"];
      confidence: number;
      /** Flag propio del tramo (sin base visual). El de salida uniforme es de partido. */
      lowConfidence: PossessionLowConfidenceCode | null;
    }
  | { ok: false; gate: Gate };

/**
 * Sin base visual: no consta que el modelo recibiera imagen del tramo (usageMetadata),
 * o el tramo no cita NINGUNA evidencia (nada visto que respalde una cifra).
 */
function lacksVisualBasis(r: NormalizedSegment): boolean {
  return (r.visual_basis ?? "unverified") !== "confirmed" || r.observation.evidence.length === 0;
}

/** Posesión 50/50 con dominio "equilibrado" (o sin dominio): indistinguible de un valor por defecto. */
function isUniformDefault(s: SegmentState, p: { home: number; away: number }): boolean {
  const dominance = s.result?.observation.dominance ?? null;
  return p.home === p.away && (dominance === "balanced" || dominance === null);
}

function checkPossession(s: SegmentState, input: AggregateInput): PossessionCheck {
  const range = { startSec: s.start_sec, endSec: s.end_sec };
  if (s.status !== "done" || !s.result) return { ok: false, gate: notDoneGate(s, input.locale) };
  const o = s.result.observation;
  if (isAmbiguous(o)) return { ok: false, gate: { code: "teams_ambiguous", reason: gateReason(input.locale, "teams_ambiguous", range) } };
  const p = o.possession_estimate;
  if (!p) return { ok: false, gate: { code: "possession_missing", reason: gateReason(input.locale, "possession_missing", range) } };
  if (p.home_pct + p.away_pct !== 100) {
    return { ok: false, gate: { code: "possession_incoherent", reason: gateReason(input.locale, "possession_incoherent", range) } };
  }
  const noVisual = lacksVisualBasis(s.result);
  const base = noVisual ? input.confidence.possessionLow : input.confidence.possession;
  const confidence = segmentConfidence(o, base, input.confidence.partialFactor);
  return {
    ok: true,
    home: p.home_pct,
    away: p.away_pct,
    basis: p.basis,
    confidence,
    lowConfidence: noVisual ? "no_visual_basis" : null,
  };
}

interface PossessionPlan {
  checks: Map<number, PossessionCheck>;
  /** Todos los tramos utilizables salieron 50/50 + "equilibrado" (gate de partido). */
  uniform: boolean;
}

function planPossession(segments: readonly SegmentState[], input: AggregateInput): PossessionPlan {
  const checks = new Map<number, PossessionCheck>();
  for (const s of segments) checks.set(s.idx, checkPossession(s, input));
  const usable = segments.filter((s) => checks.get(s.idx)?.ok);
  const uniform =
    usable.length > 0 &&
    usable.every((s) => {
      const c = checks.get(s.idx);
      return !!c && c.ok && isUniformDefault(s, c);
    });
  return { checks, uniform };
}

/** Confianza y flag finales de la posesión de un tramo, con el gate de salida uniforme aplicado. */
function finalPossession(c: Extract<PossessionCheck, { ok: true }>, plan: PossessionPlan, input: AggregateInput) {
  if (!plan.uniform) return { confidence: c.confidence, flag: c.lowConfidence };
  return {
    confidence: Math.min(c.confidence, input.confidence.possessionLow),
    flag: c.lowConfidence ?? ("uniform_output" as const),
  };
}

function teamMetrics(
  s: SegmentState,
  side: "home" | "away",
  input: AggregateInput,
  sourceRef: string,
): MatchObservation["segments"][number]["teams"]["home"] {
  const range = { startSec: s.start_sec, endSec: s.end_sec };
  let blanket: Gate | null = null;
  if (s.status !== "done" || !s.result) blanket = notDoneGate(s, input.locale);
  else if (isAmbiguous(s.result.observation)) {
    blanket = { code: "teams_ambiguous", reason: gateReason(input.locale, "teams_ambiguous", range) };
  }
  const notEvaluated: Gate = { code: "not_evaluated_by_model", reason: gateReason(input.locale, "not_evaluated_by_model", range) };
  const t = blanket ? null : s.result!.observation.teams[side];
  const conf = blanket ? 0 : segmentConfidence(s.result!.observation, input.confidence.llm, input.confidence.partialFactor);
  const m = (v: unknown) => (blanket ? llmM(null, 0, sourceRef, blanket) : llmM(v ?? null, conf, sourceRef, notEvaluated));

  let formation: AnyMetric;
  if (blanket || !t) formation = llmM(null, 0, sourceRef, blanket ?? notEvaluated);
  else if (t.formation === null) formation = llmM(null, 0, sourceRef, notEvaluated);
  else if (!FORMATION_RE.test(t.formation)) {
    formation = llmM(null, 0, sourceRef, { code: "invalid_model_value", reason: gateReason(input.locale, "invalid_model_value", range) });
  } else formation = llmM(t.formation, conf, sourceRef, null);

  return {
    formation,
    phases: { predominant: m(t?.phases.predominant) },
    build_up: { style: m(t?.build_up.style) },
    pressing: { height: m(t?.pressing.height), intensity: m(t?.pressing.intensity) },
    block: { height: m(t?.block.height), compactness: m(t?.block.compactness) },
    transitions: { attacking: m(t?.transitions.attacking), defensive: m(t?.transitions.defensive) },
    set_pieces: { threat: m(t?.set_pieces.threat) },
    note: t?.note ?? null,
  } as MatchObservation["segments"][number]["teams"]["home"];
}

function segmentSummary(s: SegmentState, input: AggregateInput, plan: PossessionPlan): MatchObservation["segments"][number] {
  const sourceRef = segmentSourceRef(input.geminiModel, s);
  const range = { startSec: s.start_sec, endSec: s.end_sec };
  const done = s.status === "done" && s.result ? s.result.observation : null;
  const blanket = done ? null : notDoneGate(s, input.locale);
  const conf = done ? segmentConfidence(done, input.confidence.llm, input.confidence.partialFactor) : 0;

  const teamIdentification = done ? llmM(done.team_identification, conf, sourceRef, null) : llmM(null, 0, sourceRef, blanket);
  let dominance: AnyMetric;
  if (!done) dominance = llmM(null, 0, sourceRef, blanket);
  else if (isAmbiguous(done)) dominance = llmM(null, 0, sourceRef, { code: "teams_ambiguous", reason: gateReason(input.locale, "teams_ambiguous", range) });
  else dominance = llmM(done.dominance, conf, sourceRef, { code: "not_evaluated_by_model", reason: gateReason(input.locale, "not_evaluated_by_model", range) });

  const pos = plan.checks.get(s.idx) ?? checkPossession(s, input);
  let possession: { home: AnyMetric; away: AnyMetric };
  let lowFlag: PossessionLowConfidenceCode | null = null;
  if (pos.ok) {
    const fin = finalPossession(pos, plan, input);
    lowFlag = fin.flag;
    possession = { home: llmM(pos.home, fin.confidence, sourceRef, null, "%"), away: llmM(pos.away, fin.confidence, sourceRef, null, "%") };
  } else {
    possession = { home: llmM(null, 0, sourceRef, pos.gate, "%"), away: llmM(null, 0, sourceRef, pos.gate, "%") };
  }

  return {
    idx: s.idx,
    start_sec: s.start_sec,
    end_sec: s.end_sec,
    status: s.status,
    team_identification: teamIdentification,
    dominance,
    possession,
    possession_basis: pos.ok ? pos.basis : null,
    possession_low_confidence: lowFlag,
    teams: { home: teamMetrics(s, "home", input, sourceRef), away: teamMetrics(s, "away", input, sourceRef) },
    not_evaluable_intervals: done ? done.not_evaluable_intervals : [],
    source_ref: sourceRef,
  } as MatchObservation["segments"][number];
}

/** Índice de evidencias en tiempo de vídeo absoluto: ids `s{idx}-e{n}` (n desde 1). */
export function buildEvidenceIndex(segments: readonly SegmentState[], geminiModel: string): EvidenceItem[] {
  const out: EvidenceItem[] = [];
  for (const s of segments) {
    if (s.status !== "done" || !s.result) continue;
    const sourceRef = segmentSourceRef(geminiModel, s);
    s.result.observation.evidence.forEach((e, i) => {
      out.push({
        id: evidenceId(s.idx, i + 1),
        segment_idx: s.idx,
        t_start: e.t_start,
        t_end: e.t_end,
        team: e.team,
        category: e.category,
        text: e.text,
        provenance: "ESTIMADA_LLM",
        source_ref: sourceRef,
      });
    });
  }
  return out;
}

/** Cobertura: DERIVADA sobre el estado del job; ambiguo / no evaluable = ESTIMADA_LLM. */
export function buildCoverage(input: AggregateInput): MatchCoverage {
  const { segments, locale, durationSec } = input;
  const done = segments.filter((s) => s.status === "done" && s.result);
  const coverageRef = `${input.geminiModel}@${SEGMENT_PROMPT_VERSION}#coverage`;
  const durationGate: Gate = { code: "duration_unknown", reason: gateReason(locale, "duration_unknown") };
  const noUsable: Gate = { code: "no_usable_segments", reason: gateReason(locale, "no_usable_segments") };

  const analysed = done.reduce((acc, s) => acc + segLen(s), 0);
  let ambiguous = 0;
  let notEvaluable = 0;
  const gaps: MatchCoverage["gaps"] = [];

  for (const s of segments) {
    if (s.status !== "done" || !s.result) {
      gaps.push({
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        kind: "segment_not_analysed",
        provenance: "DERIVADA",
        reason: notDoneGate(s, locale).reason,
      });
      continue;
    }
    const o = s.result.observation;
    const ivs = o.not_evaluable_intervals;
    const nonAmb = ivs.filter((i) => i.reason !== "teams_indistinguishable");
    const ne = mergedLength(nonAmb);
    notEvaluable += ne;
    if (isAmbiguous(o)) {
      ambiguous += segLen(s) - ne;
      gaps.push({
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        kind: "teams_ambiguous",
        provenance: "ESTIMADA_LLM",
        reason: ambiguousGapReason(locale, s.start_sec, s.end_sec),
      });
    } else {
      ambiguous += mergedLength(ivs) - ne;
    }
    for (const i of ivs) {
      if (isAmbiguous(o) && i.reason === "teams_indistinguishable") continue;
      gaps.push({
        start_sec: i.start,
        end_sec: i.end,
        kind: i.reason === "teams_indistinguishable" ? "teams_ambiguous" : "not_evaluable",
        provenance: "ESTIMADA_LLM",
        reason:
          i.reason === "teams_indistinguishable"
            ? ambiguousGapReason(locale, i.start, i.end)
            : notEvaluableGapReason(locale, i.reason, i.start, i.end),
      });
    }
  }
  gaps.sort((a, b) => a.start_sec - b.start_sec);

  const coverage = {
    time_base: "video" as const,
    duration_sec: durationSec === null ? derivedM(null, "s", durationGate) : derivedM(durationSec, "s"),
    analysed_sec: derivedM(analysed, "s"),
    analysed_fraction: durationSec === null || durationSec <= 0 ? derivedM(null, null, durationGate) : derivedM(analysed / durationSec, null),
    failed_segments: derivedM(segments.filter((s) => s.status === "failed").length, null),
    ambiguous_sec: done.length === 0 ? llmM(null, 0, coverageRef, noUsable, "s") : llmM(ambiguous, input.confidence.llm, coverageRef, null, "s"),
    not_evaluable_sec:
      done.length === 0 ? llmM(null, 0, coverageRef, noUsable, "s") : llmM(notEvaluable, input.confidence.llm, coverageRef, null, "s"),
    segments: segments.map((s) => {
      const g = s.status === "done" && s.result ? null : notDoneGate(s, locale);
      return {
        idx: s.idx,
        start_sec: s.start_sec,
        end_sec: s.end_sec,
        status: s.status,
        gate_code: g ? g.code : null,
        reason: g ? g.reason : null,
      };
    }),
    gaps,
  };
  return matchCoverageSchema.parse(coverage);
}

/** Observación agregada completa (validada con matchObservationSchema). */
export function aggregateMatch(input: AggregateInput): MatchObservation {
  const segments = [...input.segments].sort((a, b) => a.idx - b.idx);
  const ordered = { ...input, segments };
  const plan = planPossession(segments, ordered);
  const summaries = segments.map((s) => segmentSummary(s, ordered, plan));
  const evidence = buildEvidenceIndex(segments, input.geminiModel);
  const coverage = buildCoverage(ordered);
  const aggRef = `${input.geminiModel}@${SEGMENT_PROMPT_VERSION}#possession[weighting:analysed_sec]`;

  // Posesión agregada: Σ wᵢ·pᵢ / Σ wᵢ con wᵢ = segundos analizados del tramo; sigue siendo ESTIMADA_LLM.
  // Confianza = la MENOR de los tramos usados (un tramo sin base visual arrastra el total).
  let wSum = 0;
  let homeWeighted = 0;
  let minConf = Number.POSITIVE_INFINITY;
  const used: number[] = [];
  const noVisual: SegmentState[] = [];
  const excluded: { idx: number; gate_code: MatchGateCode }[] = [];
  for (const s of segments) {
    const p = plan.checks.get(s.idx);
    if (!p || !p.ok) {
      excluded.push({ idx: s.idx, gate_code: p && !p.ok ? p.gate.code : "segment_pending" });
      continue;
    }
    const w = segLen(s);
    wSum += w;
    homeWeighted += w * p.home;
    minConf = Math.min(minConf, finalPossession(p, plan, ordered).confidence);
    used.push(s.idx);
    if (p.lowConfidence === "no_visual_basis") noVisual.push(s);
  }
  const lowConfidence: { code: PossessionLowConfidenceCode; reason: string; segments: number[] }[] = [];
  if (noVisual.length > 0) {
    lowConfidence.push({
      code: "no_visual_basis",
      reason: possessionLowConfidenceReason(input.locale, "no_visual_basis", noVisual),
      segments: noVisual.map((s) => s.idx),
    });
  }
  if (plan.uniform) {
    const usedSegs = segments.filter((s) => used.includes(s.idx));
    lowConfidence.push({
      code: "uniform_output",
      reason: possessionLowConfidenceReason(input.locale, "uniform_output", usedSegs),
      segments: [...used],
    });
  }
  const noUsable: Gate = { code: "no_usable_segments", reason: gateReason(input.locale, "no_usable_segments") };
  let possession: { home: AnyMetric; away: AnyMetric };
  if (wSum > 0) {
    const home = Math.round(homeWeighted / wSum);
    possession = { home: llmM(home, minConf, aggRef, null, "%"), away: llmM(100 - home, minConf, aggRef, null, "%") };
  } else {
    possession = { home: llmM(null, 0, aggRef, noUsable, "%"), away: llmM(null, 0, aggRef, noUsable, "%") };
  }

  const citedRef = `${input.geminiModel}@${SEGMENT_PROMPT_VERSION}#cited_events`;
  const anyDone = segments.some((s) => s.status === "done" && s.result);
  const count = (team: EvidenceItem["team"]) =>
    anyDone ? llmM(evidence.filter((e) => e.team === team).length, input.confidence.llm, citedRef, null) : llmM(null, 0, citedRef, noUsable);

  const guard = segments.reduce(
    (acc, s) => ({
      keys_stripped: acc.keys_stripped + (s.result?.guard.keys_stripped ?? 0),
      items_dropped: acc.items_dropped + (s.result?.guard.items_dropped ?? 0),
    }),
    { keys_stripped: 0, items_dropped: 0 },
  );

  return matchObservationSchema.parse({
    schema_version: MATCH_OBSERVATION_SCHEMA_VERSION,
    segments: summaries,
    evidence,
    possession,
    possession_detail: {
      weighting: "analysed_sec",
      segments_used: used,
      segments_excluded: excluded,
      low_confidence: lowConfidence,
    },
    coverage,
    cited_events: { home: count("home"), away: count("away"), ambiguous: count("ambiguous") },
    identity_guard: guard,
  });
}

/** ¿Hay al menos un tramo analizado? (sin él no se genera informe — se bloquea). */
export function hasAnalysedSegments(observation: MatchObservation): boolean {
  return observation.segments.some((s) => s.status === "done");
}
