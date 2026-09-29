/**
 * VITAS · CoverageBanner — what part of the video the job actually analysed.
 *
 * Placed at the TOP of the report so it is visible without scrolling
 * (docs/diseno-partido-completo.md §14): analysed of total (video time), every
 * segment not analysed and every teams-ambiguous interval with its reason, and the
 * AI-estimated ambiguous / not-evaluable time kept separate from the DERIVADA
 * figures. A session with gaps is NOT a complete session and never reads as one:
 * the percentage is floored and capped at 99 % whenever a segment is not done,
 * even if rounding would say 100 %.
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { ScanEye } from "lucide-react";
import { MetricValue, ProvenanceBadge } from "@/components/metrics/MetricValue";
import type { MatchCoverage } from "@/lib/shared/matchJob/contract";
import { formatVideoRange, formatVideoTime } from "@/lib/match/videoTime";

/** Not-evaluable intervals shown before the "show more" toggle (half-time, replays…). */
const NOT_EVALUABLE_VISIBLE = 2;

/**
 * Percentage for display. Floored (0.996 → 99, never 100) and capped at 99 while any
 * segment is not done — the banner must never claim full coverage with a gap.
 */
export function coveragePercentForDisplay(fraction: number, allSegmentsDone: boolean): number {
  const pct = Math.floor(Math.max(0, Math.min(1, fraction)) * 100);
  return allSegmentsDone ? pct : Math.min(pct, 99);
}

export default function CoverageBanner({ coverage }: { coverage: MatchCoverage }) {
  const { t } = useTranslation();
  const [showAllNotEvaluable, setShowAllNotEvaluable] = useState(false);

  const segments = coverage.segments ?? [];
  const allDone = segments.length > 0 && segments.every((s) => s.status === "done");
  const gaps = [...(coverage.gaps ?? [])].sort((a, b) => a.start_sec - b.start_sec);
  const keyGaps = gaps.filter((g) => g.kind !== "not_evaluable");
  const notEvaluable = gaps.filter((g) => g.kind === "not_evaluable");
  const visibleNotEvaluable = showAllNotEvaluable ? notEvaluable : notEvaluable.slice(0, NOT_EVALUABLE_VISIBLE);
  const hiddenCount = notEvaluable.length - visibleNotEvaluable.length;

  const timeFormat = (v: number | string) => formatVideoTime(Number(v));
  const pctFormat = (v: number | string) => `${coveragePercentForDisplay(Number(v), allDone)} %`;

  const gapText = (g: (typeof gaps)[number]) => {
    const range = formatVideoRange(g.start_sec, g.end_sec);
    const key =
      g.kind === "segment_not_analysed"
        ? "matchJob.coverage.gapSegment"
        : g.kind === "teams_ambiguous"
          ? "matchJob.coverage.gapAmbiguous"
          : "matchJob.coverage.gapNotEvaluable";
    return t(key, { range, reason: g.reason });
  };

  return (
    <section
      data-testid="coverage-banner"
      aria-label={t("matchJob.coverage.title")}
      className={`rounded-xl border p-3 space-y-2 ${allDone ? "border-sky-500/30 bg-sky-500/5" : "border-amber-500/40 bg-amber-500/10"}`}
    >
      <div className="flex items-center gap-1.5">
        <ScanEye size={13} className={allDone ? "text-sky-500" : "text-amber-500"} />
        <h5 className="font-display font-bold text-xs text-foreground">{t("matchJob.coverage.title")}</h5>
      </div>

      <p className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-foreground" data-testid="coverage-summary">
        <span>{t("matchJob.coverage.analysedLabel")}</span>
        <MetricValue result={coverage.analysed_sec} format={timeFormat} />
        <span>{t("matchJob.coverage.ofLabel")}</span>
        <MetricValue result={coverage.duration_sec} format={timeFormat} />
        <span className="text-muted-foreground">·</span>
        <MetricValue result={coverage.analysed_fraction} format={pctFormat} />
      </p>
      <p className="text-[10px] text-muted-foreground">
        {allDone ? t("matchJob.coverage.complete") : segments.length === 0 ? t("matchJob.coverage.noSegments") : t("matchJob.coverage.partialNote")}
        {" "}
        {t("matchJob.coverage.videoTimeNote")}
      </p>

      {keyGaps.length > 0 && (
        <ul className="space-y-1" data-testid="coverage-gaps">
          {keyGaps.map((g, i) => (
            <li key={`${g.kind}-${g.start_sec}-${i}`} className="flex flex-wrap items-center gap-1.5 text-[11px] text-foreground">
              <span>{gapText(g)}</span>
              <ProvenanceBadge provenance={g.provenance} />
            </li>
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px]">
        <span className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">{t("matchJob.coverage.failedSegments")}</span>
          <MetricValue result={coverage.failed_segments} />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">{t("matchJob.coverage.ambiguousLabel")}</span>
          <MetricValue result={coverage.ambiguous_sec} format={timeFormat} />
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="text-muted-foreground">{t("matchJob.coverage.notEvaluableLabel")}</span>
          <MetricValue result={coverage.not_evaluable_sec} format={timeFormat} />
        </span>
      </div>

      {notEvaluable.length > 0 && (
        <div className="space-y-1">
          <ul className="space-y-0.5">
            {visibleNotEvaluable.map((g, i) => (
              <li key={`ne-${g.start_sec}-${i}`} className="flex flex-wrap items-center gap-1.5 text-[10px] text-muted-foreground">
                <span>{gapText(g)}</span>
                <ProvenanceBadge provenance={g.provenance} />
              </li>
            ))}
          </ul>
          {(hiddenCount > 0 || showAllNotEvaluable) && notEvaluable.length > NOT_EVALUABLE_VISIBLE && (
            <button
              type="button"
              onClick={() => setShowAllNotEvaluable((v) => !v)}
              className="text-[10px] text-primary hover:underline"
            >
              {showAllNotEvaluable ? t("matchJob.coverage.showLess") : t("matchJob.coverage.moreGaps", { n: hiddenCount })}
            </button>
          )}
        </div>
      )}
    </section>
  );
}
