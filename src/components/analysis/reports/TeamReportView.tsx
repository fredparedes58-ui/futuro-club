/**
 * VITAS · TeamReportView — the one renderer of the "Local vs Visitante" report.
 *
 * Two inputs, one component:
 *
 *  1. v2 — report from the full-match VIDEO job (`schema_version` match-report.v2,
 *     src/lib/shared/matchJob/contract.ts), or the job observation alone when the
 *     report is gated (no engine, engine error, 0 analysed segments):
 *       - CoverageBanner at the top (visible without scrolling);
 *       - every claim carries mm:ss evidence chips that open the Bunny player;
 *       - every value goes through MetricValue / ProvenanceBadge ("Estimado por IA",
 *         "Calculado"); a null value renders its gate_reason, never "—" or 0;
 *       - NO overall_rating and NO LLM self-reported confidence chip (the contract
 *         rejects them); possession is an AI estimate, never an official statistic,
 *         labelled "baja confianza" with the reason next to it when the SERVER
 *         flags it (report `possession_low_confidence` / observation
 *         `possession_detail.low_confidence`, per segment
 *         `possession_low_confidence`). The UI never re-derives that gate (inv #7);
 *       - defence in depth for identidad.md: any text that still mentions a shirt
 *         number or an individual (contract `mentionsIndividual`, the same predicate
 *         as the backend identityGuard) is NOT rendered, a claim left without a
 *         visible evidence chip is not rendered, and the count is shown;
 *       - MOCK (demo fixture) ⇒ "Datos de ejemplo" banner.
 *
 *  2. v1 — legacy notes-only report (/api/agents/team-report): executive_summary ·
 *     tactical_overview · key_battles · momentum_shifts · recommendations ·
 *     overall_rating. The `source` is passed through, so mock_fallback /
 *     error_fallback / fallback_schema_error show a banner instead of looking like
 *     an analysis. The numeric rating (when the model emits one) is rendered as an
 *     ESTIMADA_LLM MetricResult with a fixed config confidence, never bare.
 */

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import {
  Swords, Users, Gauge, Flame, Activity, Lightbulb, AlertTriangle, ListChecks, Scale, Quote, ChevronDown, ChevronUp, NotebookPen,
} from "lucide-react";
import ReportConfidenceChip from "@/components/analysis/reports/ReportConfidenceChip";
import DemoDataBanner from "@/components/DemoDataBanner";
import { MetricValue, ProvenanceBadge } from "@/components/metrics/MetricValue";
import CoverageBanner from "@/components/match/CoverageBanner";
import EvidenceLink, { EvidencePlayerDialog, type OpenEvidence } from "@/components/match/EvidenceLink";
import PossessionEstimate, { type PossessionLowConfidenceFlag } from "@/components/match/PossessionEstimate";
import { estimatedLLM, gated, mock, type MetricResult } from "@/lib/metrics/MetricResult";
import { MATCH_UI_CONFIG } from "@/lib/match/matchUiConfig";
import { formatVideoRange } from "@/lib/match/videoTime";
import {
  MATCH_REPORT_SCHEMA_VERSION,
  matchReportV2Schema,
  mentionsIndividual,
  type EvidenceItem,
  type MatchCoverage,
  type MatchGate,
  type MatchMetric,
  type MatchObservation,
  type MatchReportV2,
  type ReportClaim,
  type SegmentSummary,
} from "@/lib/shared/matchJob/contract";

// ─────────────────────────────────────────────────────────────────────────────
// Public API
// ─────────────────────────────────────────────────────────────────────────────

/** v2 context from GET /api/match/status (null on the notes-only path). */
export interface MatchReportContext {
  observation: MatchObservation | null;
  coverage: MatchCoverage | null;
  reportGate: MatchGate | null;
  /** status.playback.embedUrl (null ⇒ evidence chips are disabled). */
  embedUrl: string | null;
  homeName: string;
  awayName: string;
}

interface TeamReportViewProps {
  report: Record<string, unknown> | MatchReportV2 | null;
  /** v1 only: the agent's `source` (mock_fallback | error_fallback | fallback_schema_error | …). */
  source?: string | null;
  /** v2 only. */
  match?: MatchReportContext | null;
}

/** Legacy sources that are NOT an analysis and must say so. */
export const FALLBACK_SOURCES: Readonly<Record<string, string>> = {
  mock_fallback: "matchJob.fallback.mock",
  error_fallback: "matchJob.fallback.error",
  fallback_schema_error: "matchJob.fallback.schema",
};

export function isMatchReportV2(report: unknown): boolean {
  return !!report && typeof report === "object" && (report as { schema_version?: unknown }).schema_version === MATCH_REPORT_SCHEMA_VERSION;
}

export default function TeamReportView({ report, source = null, match = null }: TeamReportViewProps) {
  if (isMatchReportV2(report) || match) {
    return <MatchReportV2View report={report} match={match} />;
  }
  return <LegacyTeamReport report={(report as Record<string, unknown>) ?? {}} source={source} />;
}

// ─────────────────────────────────────────────────────────────────────────────
// Shared mini <Section> (replicates AnalysisDashboard without an import cycle)
// ─────────────────────────────────────────────────────────────────────────────

function Section({ heading, color, children }: { heading: string; color: string; children: React.ReactNode }) {
  return (
    <section>
      <h5 className={`font-display font-bold text-xs ${color} mb-1.5`}>{heading}</h5>
      <ul className="list-disc list-inside space-y-1 text-xs text-foreground">{children}</ul>
    </section>
  );
}

function Banner({ tone, children, testId }: { tone: "warn" | "error"; children: React.ReactNode; testId?: string }) {
  const cls = tone === "error" ? "border-destructive/30 bg-destructive/10" : "border-amber-500/30 bg-amber-500/10";
  return (
    <div role="status" data-testid={testId} className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 ${cls}`}>
      <AlertTriangle size={14} className={tone === "error" ? "text-destructive shrink-0 mt-0.5" : "text-amber-500 shrink-0 mt-0.5"} />
      <div className="text-[11px] leading-relaxed text-foreground">{children}</div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v2 · report from the full-match video job
// ─────────────────────────────────────────────────────────────────────────────

const TEAM_SECTIONS = [
  "in_possession",
  "out_of_possession",
  "transitions",
  "set_pieces",
  "strengths",
  "areas_to_improve",
  "recommendations",
] as const;

function MatchReportV2View({ report: rawReport, match }: { report: unknown; match: MatchReportContext | null }) {
  const { t } = useTranslation();
  const [openEvidence, setOpenEvidence] = useState<OpenEvidence | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showEvidence, setShowEvidence] = useState(false);

  // The service already validated; re-validate here so no caller can render a
  // payload that breaks the contract (e.g. an unknown evidence id).
  const parsed = useMemo(() => (rawReport ? matchReportV2Schema.safeParse(rawReport) : null), [rawReport]);
  const report: MatchReportV2 | null = parsed?.success ? parsed.data : null;
  const invalid = !!rawReport && parsed !== null && !parsed.success;

  const observation = match?.observation ?? null;
  const coverage = report?.coverage ?? observation?.coverage ?? match?.coverage ?? null;
  const rawEvidence = useMemo<EvidenceItem[]>(() => report?.evidence ?? observation?.evidence ?? [], [report, observation]);
  const segments = useMemo<SegmentSummary[]>(() => report?.segments ?? observation?.segments ?? [], [report, observation]);
  const possession = report?.possession ?? observation?.possession ?? null;
  // The server's low-confidence flags (the report copies them from the observation, never recomputes).
  const possessionFlags = useMemo<PossessionLowConfidenceFlag[]>(
    () => report?.possession_low_confidence ?? observation?.possession_detail.low_confidence ?? [],
    [report, observation],
  );
  const homeName = match?.homeName || t("teamReport.home");
  const awayName = match?.awayName || t("teamReport.away");
  const embedUrl = match?.embedUrl ?? null;
  const isMock =
    report?.source.kind === "mock" ||
    coverage?.analysed_sec.provenance === "MOCK" ||
    rawEvidence.some((e) => e.provenance === "MOCK");

  // Identity defence in depth: never render a text that names a dorsal / individual.
  const scrubbed = useMemo(() => scrubIndividualTexts(report, rawEvidence, segments), [report, rawEvidence, segments]);
  const { evidence, evidenceById } = scrubbed;

  const teamLabel = (team: string) => (team === "home" ? homeName : team === "away" ? awayName : t("matchJob.evidence.teamAmbiguous"));

  const renderClaims = (claims: ReportClaim[]) => (
    <ul className="space-y-1.5">
      {claims.map((c, i) => (
        <li key={i} className="text-xs text-foreground leading-relaxed">
          <span>{c.text}</span>{" "}
          <span className="inline-flex flex-wrap gap-1 align-middle">
            {c.evidence_ids.map((id) => {
              const item = evidenceById.get(id);
              return item ? <EvidenceLink key={id} item={item} embedUrl={embedUrl} onOpen={setOpenEvidence} /> : null;
            })}
          </span>
        </li>
      ))}
    </ul>
  );

  return (
    <div className="space-y-4" data-testid="team-report-v2">
      {isMock && <DemoDataBanner messageKey="matchJob.demo.banner" />}
      {coverage && <CoverageBanner coverage={coverage} />}

      {invalid && (
        <Banner tone="error" testId="report-invalid">
          {t("matchJob.errors.invalid_response")}
        </Banner>
      )}

      {scrubbed.hidden > 0 && (
        <Banner tone="warn" testId="identity-scrubbed">
          {t("matchJob.report.identityScrubbed", { n: scrubbed.hidden })}
        </Banner>
      )}

      {!report && match?.reportGate && (
        <Banner tone="warn" testId="report-gate">
          <p className="font-bold">{t("matchJob.report.gateTitle")}</p>
          <p>{match.reportGate.reason}</p>
          {observation && <p className="text-muted-foreground">{t("matchJob.report.observationOnly")}</p>}
        </Banner>
      )}

      {report && (
        <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20 space-y-2">
          <div className="flex items-center gap-1.5">
            <Swords size={13} className="text-primary" />
            <span className="text-[10px] uppercase tracking-wider text-primary font-bold">{t("matchJob.report.summaryTitle")}</span>
            <ProvenanceBadge provenance={report.source.kind === "mock" ? "MOCK" : "ESTIMADA_LLM"} />
          </div>
          {scrubbed.claims.length > 0 ? renderClaims(scrubbed.claims) : <p className="text-xs text-muted-foreground italic">{t("matchJob.report.noClaims")}</p>}
          <p className="text-[10px] text-muted-foreground">{t("matchJob.evidence.legend")}</p>
        </div>
      )}

      {possession && (
        <PossessionEstimate
          possession={possession}
          homeName={homeName}
          awayName={awayName}
          lowConfidence={possessionFlags}
        />
      )}

      {observation?.cited_events && (
        <section className="rounded-xl border border-border bg-secondary/20 p-3 space-y-1">
          <h5 className="flex items-center gap-1.5 font-display font-bold text-xs text-foreground">
            <Quote size={12} /> {t("matchJob.report.citedEventsTitle")}
          </h5>
          <p className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
            <span className="inline-flex items-center gap-1"><span className="text-muted-foreground">{homeName}</span><MetricValue result={observation.cited_events.home} /></span>
            <span className="inline-flex items-center gap-1"><span className="text-muted-foreground">{awayName}</span><MetricValue result={observation.cited_events.away} /></span>
            <span className="inline-flex items-center gap-1"><span className="text-muted-foreground">{t("matchJob.evidence.teamAmbiguous")}</span><MetricValue result={observation.cited_events.ambiguous} /></span>
          </p>
          <p className="text-[10px] text-muted-foreground">{t("matchJob.report.citedEventsNote")}</p>
        </section>
      )}

      {segments.length > 0 && (
        <SegmentBreakdown
          segments={segments}
          homeName={homeName}
          awayName={awayName}
          possessionFlags={possessionFlags}
          showDetails={showDetails}
          onToggleDetails={() => setShowDetails((v) => !v)}
        />
      )}

      {report && scrubbed.teams && (
        <section>
          <div className="flex items-center gap-1.5 mb-2">
            <Users size={13} className="text-primary" />
            <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.tacticalOverview")}</h5>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {(["home", "away"] as const).map((side) => {
              const sections = scrubbed.teams[side];
              const nonEmpty = TEAM_SECTIONS.filter((k) => sections[k].length > 0);
              return (
                <div key={side} className="rounded-xl bg-secondary/30 border border-border p-3 space-y-2">
                  <div className="text-[10px] uppercase tracking-wider text-primary font-bold">{side === "home" ? homeName : awayName}</div>
                  {nonEmpty.length === 0 && <p className="text-[11px] text-muted-foreground">{t("matchJob.report.emptySection")}</p>}
                  {nonEmpty.map((k) => (
                    <div key={k}>
                      <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">{t(`matchJob.report.section.${k}`)}</div>
                      {renderClaims(sections[k])}
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {report && scrubbed.notEvaluated.length > 0 && (
        <Section heading={t("matchJob.report.notEvaluatedTitle")} color="text-amber-500">
          {scrubbed.notEvaluated.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </Section>
      )}

      {report && (
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
          <span className="inline-flex items-center gap-1">
            <ListChecks size={12} className="text-muted-foreground" />
            <span className="text-muted-foreground">{t("matchJob.report.droppedClaims")}</span>
            <MetricValue result={report.dropped_claims.total} />
          </span>
        </div>
      )}

      {report?.coach_notes_provided && (
        <p className="flex items-start gap-1.5 text-[10px] text-muted-foreground">
          <NotebookPen size={11} className="shrink-0 mt-px" /> {t("matchJob.report.coachNotes")}
        </p>
      )}

      {evidence.length > 0 && (
        <section className="space-y-1.5">
          <button
            type="button"
            onClick={() => setShowEvidence((v) => !v)}
            className="inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
            aria-expanded={showEvidence}
          >
            {showEvidence ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            {t("matchJob.evidence.listTitle", { n: evidence.length })}
          </button>
          {showEvidence && (
            <ul className="space-y-1" data-testid="evidence-list">
              {evidence.map((e) => (
                <li key={e.id} className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground">
                  <EvidenceLink item={e} embedUrl={embedUrl} onOpen={setOpenEvidence} />
                  <span className="text-muted-foreground">{teamLabel(e.team)}</span>
                  <span className="text-muted-foreground">· {t(`matchJob.evidence.category.${e.category}`)}</span>
                  <span>{e.text}</span>
                  <ProvenanceBadge provenance={e.provenance} />
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {report && (
        <p className="text-[10px] text-muted-foreground">
          {report.source.model
            ? t("matchJob.report.generatedBy", { model: report.source.model, prompt: report.source.prompt_version })
            : t("matchJob.report.generatedByMock", { prompt: report.source.prompt_version })}
        </p>
      )}

      <EvidencePlayerDialog target={openEvidence} onClose={() => setOpenEvidence(null)} />
    </div>
  );
}

// ── Identity defence in depth (render side) ───────────────────────────────────

type TeamSections = MatchReportV2["teams"]["home"];

export interface ScrubbedReportTexts {
  evidence: EvidenceItem[];
  evidenceById: Map<string, EvidenceItem>;
  claims: ReportClaim[];
  teams: { home: TeamSections; away: TeamSections } | null;
  notEvaluated: string[];
  /** Texts not rendered (evidence, claims, not-evaluated lines, segment notes). */
  hidden: number;
}

/**
 * Drops every text that still mentions a shirt number or an individual, using the
 * contract's `mentionsIndividual` (the SAME predicate as the backend identityGuard:
 * one implementation, inv #7). A claim is kept only if its own text is clean AND at
 * least one of its evidence ids is still visible (a claim is never shown without
 * evidence). Over-scrubbing is the safe direction (identidad.md).
 */
export function scrubIndividualTexts(
  report: MatchReportV2 | null,
  rawEvidence: readonly EvidenceItem[],
  segments: readonly SegmentSummary[],
): ScrubbedReportTexts {
  const evidence = rawEvidence.filter((e) => !mentionsIndividual(e.text));
  const evidenceById = new Map(evidence.map((e) => [e.id, e]));
  let hidden = rawEvidence.length - evidence.length;

  const keep = (claims: ReportClaim[]): ReportClaim[] => {
    const kept = claims
      .filter((c) => !mentionsIndividual(c.text))
      .map((c) => ({ ...c, evidence_ids: c.evidence_ids.filter((id) => evidenceById.has(id)) }))
      .filter((c) => c.evidence_ids.length > 0);
    hidden += claims.length - kept.length;
    return kept;
  };
  const keepSections = (s: TeamSections): TeamSections =>
    Object.fromEntries(TEAM_SECTIONS.map((k) => [k, keep(s[k])])) as TeamSections;

  for (const s of segments) {
    for (const side of ["home", "away"] as const) {
      const note = s.teams[side].note;
      if (note && mentionsIndividual(note)) hidden += 1;
    }
  }

  if (!report) return { evidence, evidenceById, claims: [], teams: null, notEvaluated: [], hidden };
  const claims = keep(report.claims);
  const teams = { home: keepSections(report.teams.home), away: keepSections(report.teams.away) };
  const notEvaluated = report.not_evaluated.filter((n) => !mentionsIndividual(n));
  hidden += report.not_evaluated.length - notEvaluated.length;
  return { evidence, evidenceById, claims, teams, notEvaluated, hidden };
}

// ── Per-segment dominance + possession (+ optional team descriptors) ──────────

type DescriptorKey =
  | "formation"
  | "phases"
  | "build_up"
  | "pressing_height"
  | "pressing_intensity"
  | "block_height"
  | "block_compactness"
  | "transition_attacking"
  | "transition_defensive"
  | "set_pieces";

function teamDescriptors(t: SegmentSummary["teams"]["home"]): [DescriptorKey, MatchMetric<string>][] {
  return [
    ["formation", t.formation],
    ["phases", t.phases.predominant],
    ["build_up", t.build_up.style],
    ["pressing_height", t.pressing.height],
    ["pressing_intensity", t.pressing.intensity],
    ["block_height", t.block.height],
    ["block_compactness", t.block.compactness],
    ["transition_attacking", t.transitions.attacking],
    ["transition_defensive", t.transitions.defensive],
    ["set_pieces", t.set_pieces.threat],
  ];
}

function SegmentBreakdown({
  segments,
  homeName,
  awayName,
  possessionFlags,
  showDetails,
  onToggleDetails,
}: {
  segments: SegmentSummary[];
  homeName: string;
  awayName: string;
  /** Match-level server flags (only used for the "uniform output" line above the list). */
  possessionFlags: readonly PossessionLowConfidenceFlag[];
  showDetails: boolean;
  onToggleDetails: () => void;
}) {
  const { t } = useTranslation();
  const dominanceFormat = (v: number | string) =>
    v === "home"
      ? t("matchJob.dominance.home", { team: homeName })
      : v === "away"
        ? t("matchJob.dominance.away", { team: awayName })
        : t("matchJob.dominance.balanced");
  const valueFormat = (v: number | string) => t(`matchJob.segments.value.${String(v)}`, { defaultValue: String(v) });
  const rawFormat = (v: number | string) => String(v);
  const uniformOutput =
    possessionFlags.some((f) => f.code === "uniform_output") || segments.some((s) => s.possession_low_confidence === "uniform_output");

  return (
    <section className="space-y-2" data-testid="segment-breakdown">
      <div className="flex items-center gap-1.5">
        <Scale size={13} className="text-primary" />
        <h5 className="font-display font-bold text-xs text-primary">{t("matchJob.segments.title")}</h5>
      </div>
      {uniformOutput && (
        <p role="status" data-testid="segments-uniform-warning" className="text-[10px] text-amber-600 dark:text-amber-400">
          {t("matchJob.segments.uniformWarning")}
        </p>
      )}
      <ul className="space-y-1.5">
        {segments.map((s) => (
          <li key={s.idx} className="rounded-lg border border-border bg-secondary/20 p-2 space-y-1">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <span className="font-mono text-[11px] text-foreground">{formatVideoRange(s.start_sec, s.end_sec)}</span>
              <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t(`matchJob.segments.status.${s.status}`)}</span>
            </div>
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px]">
              <span className="text-muted-foreground">{t("matchJob.segments.dominance")}</span>
              <MetricValue result={s.dominance} format={dominanceFormat} />
            </div>
            <PossessionEstimate
              possession={s.possession}
              homeName={homeName}
              awayName={awayName}
              compact
              lowConfidenceCode={s.possession_low_confidence ?? null}
              // The uniform-output reason is said once above the list, not once per segment.
              showReason={!(uniformOutput && s.possession_low_confidence === "uniform_output")}
            />
            {showDetails && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1">
                {(["home", "away"] as const).map((side) => (
                  <div key={side} className="space-y-0.5">
                    <div className="text-[9px] uppercase tracking-wider text-primary font-bold">{side === "home" ? homeName : awayName}</div>
                    {teamDescriptors(s.teams[side]).map(([k, m]) => (
                      <div key={k} className="flex flex-wrap items-center gap-1 text-[10px]">
                        <span className="text-muted-foreground">{t(`matchJob.segments.descriptor.${k}`)}</span>
                        <MetricValue result={m} format={k === "formation" ? rawFormat : valueFormat} />
                      </div>
                    ))}
                    {s.teams[side].note && !mentionsIndividual(s.teams[side].note) && (
                      <p className="text-[10px] text-foreground/80 italic">{s.teams[side].note}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </li>
        ))}
      </ul>
      <button type="button" onClick={onToggleDetails} className="text-[10px] text-primary hover:underline" aria-expanded={showDetails}>
        {showDetails ? t("matchJob.segments.detailsHide") : t("matchJob.segments.detailsShow")}
      </button>
    </section>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// v1 · legacy notes-only report (/api/agents/team-report)
// ─────────────────────────────────────────────────────────────────────────────

interface TacticalTeam {
  style: string;
  strengths: string[];
  weaknesses: string[];
}

const asString = (v: unknown): string => (typeof v === "string" ? v : "");

const asStringArray = (v: unknown): string[] =>
  Array.isArray(v) ? v.filter((i): i is string => typeof i === "string") : [];

const asObject = (v: unknown): Record<string, unknown> =>
  typeof v === "object" && v !== null ? (v as Record<string, unknown>) : {};

const readTacticalTeam = (v: unknown): TacticalTeam => {
  const o = asObject(v);
  return {
    style: asString(o.style),
    strengths: asStringArray(o.strengths),
    weaknesses: asStringArray(o.weaknesses),
  };
};

/** Legacy LLM rating → MetricResult (ESTIMADA_LLM, or MOCK for demo/mock sources); missing ⇒ gated. */
function legacyRating(value: unknown, source: string | null, missingReason: string): MetricResult<number> {
  const isMock = source === "mock_fallback" || source === "demo";
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return gated<number>(missingReason, { provenance: isMock ? "MOCK" : "ESTIMADA_LLM" });
  }
  const o = { confidence: MATCH_UI_CONFIG.notesOnlyReportConfidence, source_ref: `team-report@${source ?? "unknown"}` };
  return isMock ? mock(value, o) : estimatedLLM(value, o);
}

function LegacyTeamReport({ report, source }: { report: Record<string, unknown>; source: string | null }) {
  const { t } = useTranslation();

  const executiveSummary = asString(report.executive_summary);

  const tactical = asObject(report.tactical_overview);
  const tacticalHome = readTacticalTeam(tactical.home);
  const tacticalAway = readTacticalTeam(tactical.away);

  const keyBattles = asStringArray(report.key_battles);
  const momentumShifts = asStringArray(report.momentum_shifts);

  const recommendations = asObject(report.recommendations);
  const recsHome = asStringArray(recommendations.home);
  const recsAway = asStringArray(recommendations.away);

  const rating = asObject(report.overall_rating);
  const hasRating = typeof rating.home === "number" || typeof rating.away === "number";
  const ratingHome = legacyRating(rating.home, source, t("matchJob.legacy.ratingMissing"));
  const ratingAway = legacyRating(rating.away, source, t("matchJob.legacy.ratingMissing"));

  const hasTactical = !!(
    tacticalHome.style ||
    tacticalHome.strengths.length ||
    tacticalHome.weaknesses.length ||
    tacticalAway.style ||
    tacticalAway.strengths.length ||
    tacticalAway.weaknesses.length
  );
  const hasRecs = recsHome.length > 0 || recsAway.length > 0;

  const isEmpty =
    !executiveSummary &&
    !hasTactical &&
    keyBattles.length === 0 &&
    momentumShifts.length === 0 &&
    !hasRecs &&
    !hasRating;

  const fallbackKey = source ? FALLBACK_SOURCES[source] : undefined;

  const tacticalColumns = [
    { label: t("teamReport.home"), data: tacticalHome },
    { label: t("teamReport.away"), data: tacticalAway },
  ];
  const recsColumns = [
    { label: t("teamReport.home"), items: recsHome },
    { label: t("teamReport.away"), items: recsAway },
  ];

  return (
    <div className="space-y-4" data-testid="team-report-v1">
      {fallbackKey && (
        <Banner tone={source === "mock_fallback" ? "warn" : "error"} testId="report-fallback-banner">
          {t(fallbackKey)}
        </Banner>
      )}
      {/* A fallback is not an analysis: its placeholder confidence_score 0 is never shown as "0 %". */}
      {!fallbackKey && <ReportConfidenceChip report={report} />}

      {isEmpty ? (
        <p className="text-xs text-muted-foreground italic">{t("teamReport.noContent")}</p>
      ) : (
        <>
          {executiveSummary && (
            <div className="glass rounded-xl p-4 bg-gradient-to-br from-primary/10 via-electric/5 to-transparent border border-primary/20">
              <div className="flex items-center gap-1.5 mb-2">
                <Swords size={13} className="text-primary" />
                <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
                  {t("teamReport.executiveSummary")}
                </span>
              </div>
              <p className="text-xs text-foreground leading-relaxed">{executiveSummary}</p>
            </div>
          )}

          {/* Valoración global · MetricResult ESTIMADA_LLM (nunca un número desnudo) */}
          {hasRating && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Gauge size={13} className="text-primary" />
                <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.overallRating")}</h5>
              </div>
              <div className="rounded-xl bg-secondary/30 border border-border p-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex-1 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{t("teamReport.home")}</div>
                    <MetricValue result={ratingHome} className="text-sm" />
                  </div>
                  <span className="shrink-0 text-[10px] uppercase tracking-wider text-muted-foreground font-bold">{t("teamReport.vs")}</span>
                  <div className="flex-1 text-center">
                    <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-1">{t("teamReport.away")}</div>
                    <MetricValue result={ratingAway} className="text-sm" />
                  </div>
                </div>
              </div>
            </section>
          )}

          {hasTactical && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Users size={13} className="text-primary" />
                <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.tacticalOverview")}</h5>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {tacticalColumns.map((col, i) => {
                  const hasCol = col.data.style || col.data.strengths.length || col.data.weaknesses.length;
                  return (
                    <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3 space-y-2">
                      <div className="text-[10px] uppercase tracking-wider text-primary font-bold">{col.label}</div>
                      {!hasCol && <p className="text-[11px] text-muted-foreground">{t("matchJob.legacy.sectionEmpty")}</p>}
                      {col.data.style && (
                        <div>
                          <div className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold mb-0.5">
                            {t("teamReport.style")}
                          </div>
                          <p className="text-[11px] text-foreground leading-relaxed">{col.data.style}</p>
                        </div>
                      )}
                      {col.data.strengths.length > 0 && (
                        <Section heading={t("teamReport.strengths")} color="text-green-400">
                          {col.data.strengths.map((s, j) => (
                            <li key={j}>{s}</li>
                          ))}
                        </Section>
                      )}
                      {col.data.weaknesses.length > 0 && (
                        <Section heading={t("teamReport.weaknesses")} color="text-amber-400">
                          {col.data.weaknesses.map((w, j) => (
                            <li key={j}>{w}</li>
                          ))}
                        </Section>
                      )}
                    </div>
                  );
                })}
              </div>
            </section>
          )}

          {keyBattles.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Flame size={13} className="text-electric" />
                <h5 className="font-display font-bold text-xs text-electric">{t("teamReport.keyBattles")}</h5>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
                {keyBattles.map((b, i) => (
                  <li key={i}>{b}</li>
                ))}
              </ul>
            </div>
          )}

          {momentumShifts.length > 0 && (
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Activity size={13} className="text-primary" />
                <h5 className="font-display font-bold text-xs text-primary">{t("teamReport.momentumShifts")}</h5>
              </div>
              <ul className="list-disc list-inside space-y-1 text-xs text-foreground">
                {momentumShifts.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </div>
          )}

          {hasRecs && (
            <section>
              <div className="flex items-center gap-1.5 mb-2">
                <Lightbulb size={13} className="text-electric" />
                <h5 className="font-display font-bold text-xs text-electric">{t("teamReport.recommendations")}</h5>
              </div>
              <div className="grid grid-cols-2 gap-2">
                {recsColumns.map((col, i) => (
                  <div key={i} className="rounded-xl bg-secondary/30 border border-border p-3">
                    <div className="text-[10px] uppercase tracking-wider text-primary font-bold mb-1.5">{col.label}</div>
                    {col.items.length > 0 ? (
                      <ul className="list-disc list-inside space-y-1 text-[11px] text-foreground">
                        {col.items.map((r, j) => (
                          <li key={j}>{r}</li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-[11px] text-muted-foreground">{t("matchJob.legacy.noRecommendations")}</p>
                    )}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
