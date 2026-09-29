/**
 * VITAS · PossessionEstimate — AI-estimated possession % per team (owner decision 4).
 *
 * Always ESTIMADA_LLM ("Estimado por IA"), never MEDIDA and never styled like an
 * official statistic (no big bar, no scoreboard digits). Every value goes through
 * the canonical MetricValue / ProvenanceBadge; a null value renders its
 * gate_reason (segment failed, teams ambiguous, sum incoherent…), never 0 or "—".
 * The confidence comes from the server config ("pendiente de validar"), never
 * from the model's self-report.
 *
 * Low confidence is decided by the SERVER, never here (invariant #7: one
 * implementation, api/_lib/matchJob/aggregate.ts). The UI only renders what the
 * contract carries:
 *   - full view: `possession_detail.low_confidence[]` / report
 *     `possession_low_confidence[]` — each flag's `reason` (job locale) is shown
 *     next to the value;
 *   - per segment: `segments[*].possession_low_confidence` (a code) — tag + the
 *     translated reason for that code.
 * The value is still shown (never hidden or replaced), but never as a confident figure.
 */

import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { MetricValue } from "@/components/metrics/MetricValue";
import type { MatchObservation, PossessionLowConfidenceCode } from "@/lib/shared/matchJob/contract";

/** `{home, away}` ESTIMADA_LLM pair, exactly as the contract stores it (match or per segment). */
export type PossessionPair = MatchObservation["possession"];

/** One server low-confidence flag of the aggregated estimate (code + reason in the job locale + segments). */
export type PossessionLowConfidenceFlag = NonNullable<MatchObservation["possession_detail"]["low_confidence"]>[number];

interface PossessionEstimateProps {
  possession: PossessionPair;
  homeName: string;
  awayName: string;
  /** Compact = one line inside the per-segment table (no title / note). */
  compact?: boolean;
  /** Full view: the server's flags for this estimate (empty = none). */
  lowConfidence?: readonly PossessionLowConfidenceFlag[];
  /** Per segment: the server's code for THIS segment (null = none). */
  lowConfidenceCode?: PossessionLowConfidenceCode | null;
  /** Compact only: false when the caller already states the reason once for the list (the tag stays). */
  showReason?: boolean;
}

const pctFormat = (v: number | string) => `${v} %`;

export default function PossessionEstimate({
  possession,
  homeName,
  awayName,
  compact = false,
  lowConfidence = [],
  lowConfidenceCode = null,
  showReason = true,
}: PossessionEstimateProps) {
  const { t } = useTranslation();
  const { home, away } = possession;
  // Both gated for the same reason ⇒ say it once (never two identical grey lines).
  const sameGate = home.value === null && away.value === null && home.gate_reason === away.gate_reason;
  const hasValue = home.value !== null || away.value !== null;
  // Reasons to show: the server's own text for the full view; the translated code per segment.
  const reasons: { key: string; text: string }[] = [
    ...lowConfidence.map((f) => ({ key: f.code, text: f.reason })),
    ...(lowConfidenceCode && !lowConfidence.some((f) => f.code === lowConfidenceCode)
      ? [{ key: lowConfidenceCode, text: t(`matchJob.possession.lowConfidence.${lowConfidenceCode}`) }]
      : []),
  ];
  const showLow = hasValue && reasons.length > 0;

  const tag = showLow && (
    <span
      data-testid="possession-low-confidence-tag"
      className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
    >
      {t("matchJob.possession.lowConfidenceTag")}
    </span>
  );

  const body = sameGate ? (
    <MetricValue result={home} className="text-[11px]" />
  ) : (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${showLow ? "opacity-70" : ""}`}>
      <span className="text-muted-foreground">{homeName}</span>
      <MetricValue result={home} format={pctFormat} />
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{awayName}</span>
      <MetricValue result={away} format={pctFormat} />
      {tag}
    </span>
  );

  if (compact) {
    return (
      <div data-testid="possession-estimate" className="space-y-0.5">
        {body}
        {showLow &&
          showReason &&
          reasons.map((r) => (
            <p key={r.key} data-testid="possession-low-confidence-reason" className="text-[10px] leading-relaxed text-amber-600 dark:text-amber-400">
              {r.text}
            </p>
          ))}
      </div>
    );
  }

  return (
    <section data-testid="possession-estimate" className="rounded-xl border border-border bg-secondary/20 p-3 space-y-1">
      <h5 className="font-display font-bold text-xs text-foreground">{t("matchJob.possession.title")}</h5>
      {body}
      {showLow && (
        <div
          role="status"
          data-testid="possession-low-confidence"
          className="flex items-start gap-1.5 rounded-lg border border-amber-500/30 bg-amber-500/10 p-2"
        >
          <AlertTriangle size={12} className="text-amber-500 shrink-0 mt-0.5" />
          <div className="space-y-0.5 text-[10px] leading-relaxed text-foreground">
            {reasons.map((r) => (
              <p key={r.key} data-testid="possession-low-confidence-reason">
                {r.text}
              </p>
            ))}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">{t("matchJob.possession.note")}</p>
    </section>
  );
}
