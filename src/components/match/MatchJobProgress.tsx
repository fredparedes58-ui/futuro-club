/**
 * VITAS · MatchJobProgress — where a full-match job is, in plain words.
 *
 * Stages come from the contract (MATCH_STATUS_TO_STAGE): Subiendo → Bunny
 * procesando (puede tardar horas) → Preparando vídeo → Analizando tramo k/n
 * (tiempo de vídeo mm:ss–mm:ss) → Redactando informe → Listo. There is NO invented
 * percentage bar: progress is the stage plus segmentsDone/segmentsTotal, and the
 * total stays unknown until the server plans the segments. The Bunny encode % is
 * shown only when Bunny reports it (operational, not a metric).
 */

import { useTranslation } from "react-i18next";
import { AlertCircle, Ban, CheckCircle2, Circle, Loader2, RefreshCw } from "lucide-react";
import type { MatchJobStage, MatchJobStatusResponse } from "@/lib/shared/matchJob/contract";
import type { MatchApiError } from "@/services/real/matchAnalysisService";
import { formatVideoRange } from "@/lib/match/videoTime";
import { matchErrorMessage } from "@/components/match/matchErrorMessage";

/** Ordered happy-path steps. "uploading" is the browser → Bunny TUS upload (done once a job exists). */
const STEPS = ["uploading", "encoding", "preparing", "analysing", "reporting", "done"] as const;
type Step = (typeof STEPS)[number];

interface MatchJobProgressProps {
  data: MatchJobStatusResponse | null;
  /** The start request is in flight (no job yet). */
  starting?: boolean;
  /** Last status error (transient ones keep polling). */
  error?: MatchApiError | null;
  nextPollInSec?: number | null;
  onCancel?: () => void;
  cancelling?: boolean;
  onRefresh?: () => void;
  onStartNew?: () => void;
}

function stepLabelKey(step: Step | MatchJobStage, purpose: string | undefined): string {
  // team_baseline has no Claude report in the job: "aggregating" is not "writing".
  if (step === "reporting" && purpose === "team_baseline") return "matchJob.stage.aggregating";
  return `matchJob.stage.${step}`;
}

export default function MatchJobProgress({
  data,
  starting = false,
  error = null,
  nextPollInSec = null,
  onCancel,
  cancelling = false,
  onRefresh,
  onStartNew,
}: MatchJobProgressProps) {
  const { t } = useTranslation();
  const job = data?.job ?? null;
  const stage = job?.stage ?? null;
  const purpose = job?.purpose;
  const terminal = stage === "done" || stage === "failed" || stage === "cancelled";
  const currentIdx = stage && (STEPS as readonly string[]).includes(stage) ? STEPS.indexOf(stage as Step) : starting ? 1 : -1;

  // Segment k/n + its video-time range (only what the server reports).
  const p = data?.progress;
  const total = p?.segmentsTotal ?? null;
  const k = p ? (p.currentSegmentIdx !== null && p.currentSegmentIdx !== undefined ? p.currentSegmentIdx + 1 : p.segmentsDone + 1) : null;
  const seg =
    p?.currentSegmentIdx !== null && p?.currentSegmentIdx !== undefined
      ? data?.coverage?.segments?.find((s) => s.idx === p.currentSegmentIdx) ?? null
      : null;

  const detailFor = (step: Step): string | null => {
    if (step === "encoding" && stage === "encoding") {
      const pct = data?.encode?.encodeProgressPct;
      return typeof pct === "number" ? t("matchJob.progress.encodeProgress", { pct }) : t("matchJob.progress.encodeHint");
    }
    if (step === "analysing" && stage === "analysing") {
      if (total === null || k === null) return t("matchJob.progress.segmentsPending");
      const kk = Math.min(k, total);
      const label = t("matchJob.progress.segment", { k: kk, n: total });
      return seg ? `${label} · ${t("matchJob.progress.segmentRange", { range: formatVideoRange(seg.start_sec, seg.end_sec) })}` : label;
    }
    return null;
  };

  return (
    <section data-testid="match-job-progress" className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <h2 className="font-display font-bold text-sm text-foreground">{t("matchJob.progress.title")}</h2>
        {stage && (
          <span className="text-[10px] uppercase tracking-wider font-bold text-primary" data-testid="match-job-stage">
            {t(stepLabelKey(stage, purpose))}
          </span>
        )}
      </div>

      {stage !== "failed" && stage !== "cancelled" && (
        <ol className="space-y-1.5" aria-label={t("matchJob.progress.stepsLabel")}>
          {STEPS.map((step, i) => {
            const done = currentIdx > i || stage === "done";
            const active = currentIdx === i && !terminal;
            const detail = active ? detailFor(step) : null;
            return (
              <li key={step} className="flex items-start gap-2 text-[11px]" aria-current={active ? "step" : undefined}>
                {done ? (
                  <CheckCircle2 size={13} className="text-green-500 shrink-0 mt-px" />
                ) : active ? (
                  <Loader2 size={13} className="text-primary animate-spin shrink-0 mt-px" />
                ) : (
                  <Circle size={13} className="text-muted-foreground/50 shrink-0 mt-px" />
                )}
                <div className="min-w-0">
                  <span className={active ? "font-semibold text-foreground" : done ? "text-foreground" : "text-muted-foreground"}>
                    {t(stepLabelKey(step, purpose))}
                  </span>
                  {detail && <p className="text-[10px] text-muted-foreground">{detail}</p>}
                </div>
              </li>
            );
          })}
        </ol>
      )}

      {stage === "failed" && (
        <div role="alert" className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 space-y-1">
          <p className="flex items-center gap-1.5 text-[11px] font-bold text-destructive">
            <AlertCircle size={12} /> {t("matchJob.progress.failedTitle")}
          </p>
          {data?.error && (
            <>
              <p className="text-[11px] text-foreground">{data.error.message}</p>
              <p className="text-[10px] font-mono text-muted-foreground">{t("matchJob.progress.errorCode", { code: data.error.code })}</p>
            </>
          )}
        </div>
      )}

      {stage === "cancelled" && (
        <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
          <Ban size={12} /> {t("matchJob.progress.cancelledTitle")}
        </p>
      )}

      {error && (
        <p role="status" className="text-[10px] text-amber-600 dark:text-amber-400">
          {t("matchJob.progress.statusError", { message: matchErrorMessage(t, error) })}
        </p>
      )}

      <div className="flex flex-wrap items-center gap-3">
        {!terminal && nextPollInSec !== null && (
          <span className="text-[10px] text-muted-foreground">{t("matchJob.progress.nextPoll", { sec: nextPollInSec })}</span>
        )}
        {!terminal && onRefresh && (
          <button type="button" onClick={onRefresh} className="inline-flex items-center gap-1 text-[10px] text-primary hover:underline">
            <RefreshCw size={10} /> {t("matchJob.progress.retry")}
          </button>
        )}
        {!terminal && job && onCancel && (
          <button
            type="button"
            disabled={cancelling}
            onClick={() => {
              if (typeof window === "undefined" || window.confirm(t("matchJob.progress.confirmCancel"))) onCancel();
            }}
            className="ml-auto text-[10px] font-bold text-destructive hover:underline disabled:opacity-50"
          >
            {cancelling ? t("matchJob.progress.cancelling") : t("matchJob.progress.cancel")}
          </button>
        )}
        {terminal && onStartNew && (
          <button type="button" onClick={onStartNew} className="ml-auto text-[10px] font-bold text-primary hover:underline">
            {t("matchJob.progress.startNew")}
          </button>
        )}
      </div>

      {!terminal && <p className="text-[10px] text-muted-foreground leading-relaxed">{t("matchJob.progress.closeHint")}</p>}
    </section>
  );
}
