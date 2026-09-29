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
 * Low confidence (src/lib/shared/matchJob/possessionReliability.ts): a flat
 * 50/50 + "balanced" everywhere, or a value without a stated basis, is the answer
 * the model gives without visual basis. It is then labelled "baja confianza" with
 * the reason and muted — the value is still shown (never hidden or replaced), but
 * never as a confident figure.
 */

import { useTranslation } from "react-i18next";
import { AlertTriangle } from "lucide-react";
import { MetricValue } from "@/components/metrics/MetricValue";
import type { MatchObservation } from "@/lib/shared/matchJob/contract";
import type { PossessionReliabilityFlag } from "@/lib/shared/matchJob/possessionReliability";

/** `{home, away}` ESTIMADA_LLM pair, exactly as the contract stores it (match or per segment). */
export type PossessionPair = MatchObservation["possession"];

interface PossessionEstimateProps {
  possession: PossessionPair;
  homeName: string;
  awayName: string;
  /** Compact = one line inside the per-segment table (no title / note). */
  compact?: boolean;
  /** Render as low confidence (flat pattern / no stated basis). */
  lowConfidence?: boolean;
  /** Why (full view only). */
  reliabilityFlags?: readonly PossessionReliabilityFlag[];
}

const pctFormat = (v: number | string) => `${v} %`;

export default function PossessionEstimate({
  possession,
  homeName,
  awayName,
  compact = false,
  lowConfidence = false,
  reliabilityFlags = [],
}: PossessionEstimateProps) {
  const { t } = useTranslation();
  const { home, away } = possession;
  // Both gated for the same reason ⇒ say it once (never two identical grey lines).
  const sameGate = home.value === null && away.value === null && home.gate_reason === away.gate_reason;
  const hasValue = home.value !== null || away.value !== null;
  const showLow = lowConfidence && hasValue;

  const body = sameGate ? (
    <MetricValue result={home} className="text-[11px]" />
  ) : (
    <span className={`inline-flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] ${showLow ? "opacity-70" : ""}`}>
      <span className="text-muted-foreground">{homeName}</span>
      <MetricValue result={home} format={pctFormat} />
      <span className="text-muted-foreground">·</span>
      <span className="text-muted-foreground">{awayName}</span>
      <MetricValue result={away} format={pctFormat} />
      {showLow && (
        <span
          data-testid="possession-low-confidence-tag"
          className="rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400"
        >
          {t("matchJob.possession.lowConfidenceTag")}
        </span>
      )}
    </span>
  );

  if (compact) return <div data-testid="possession-estimate">{body}</div>;

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
            {reliabilityFlags.length > 0 ? (
              reliabilityFlags.map((f) => <p key={f}>{t(`matchJob.possession.lowConfidence.${f}`)}</p>)
            ) : (
              <p>{t("matchJob.possession.lowConfidence.generic")}</p>
            )}
          </div>
        </div>
      )}
      <p className="text-[10px] text-muted-foreground">{t("matchJob.possession.note")}</p>
    </section>
  );
}
