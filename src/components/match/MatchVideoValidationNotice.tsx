/**
 * VITAS · MatchVideoValidationNotice — the full-match video path while it is
 * "En validación" (owner decision 29-sep, src/lib/match/matchVideoAvailability.ts).
 *
 * The path is shown, but NOT offered: no form, no start button, the reason in
 * plain words, and the notes-only report as the working alternative. In the demo
 * an explicit example preview (MOCK fixture under the demo banner) may be offered.
 */

import { useTranslation } from "react-i18next";
import { FileText, FlaskConical, Hourglass } from "lucide-react";

interface MatchVideoValidationNoticeProps {
  /** The server refused a start with match_video_disabled in this session. */
  serverRefused?: boolean;
  /** Switch to the notes-only report. */
  onUseNotes?: () => void;
  /** IS_DEMO only: show the MOCK example. */
  onDemoPreview?: () => void;
}

/** "En validación" pill for tabs and headings. */
export function MatchVideoValidationBadge() {
  const { t } = useTranslation();
  return (
    <span className="inline-flex items-center rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide text-amber-600 dark:text-amber-400">
      {t("matchJob.validation.badge")}
    </span>
  );
}

export default function MatchVideoValidationNotice({ serverRefused = false, onUseNotes, onDemoPreview }: MatchVideoValidationNoticeProps) {
  const { t } = useTranslation();
  return (
    <section
      role="status"
      aria-live="polite"
      data-testid="match-video-in-validation"
      className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4 space-y-2"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Hourglass size={14} className="text-amber-500 shrink-0" />
        <h2 className="font-display font-bold text-sm text-foreground">{t("matchJob.validation.title")}</h2>
        <MatchVideoValidationBadge />
      </div>
      <p className="text-[11px] leading-relaxed text-foreground">{t("matchJob.validation.reason")}</p>
      {serverRefused && <p className="text-[11px] leading-relaxed text-foreground">{t("matchJob.validation.serverRefused")}</p>}
      <p className="text-[11px] leading-relaxed text-muted-foreground">{t("matchJob.validation.meanwhile")}</p>
      <div className="flex flex-wrap items-center gap-3 pt-1">
        {onUseNotes && (
          <button
            type="button"
            onClick={onUseNotes}
            className="inline-flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground hover:bg-primary/90"
          >
            <FileText size={12} /> {t("matchJob.validation.useNotes")}
          </button>
        )}
        {onDemoPreview && (
          <button
            type="button"
            onClick={onDemoPreview}
            className="inline-flex items-center gap-1.5 text-[11px] font-bold text-primary hover:underline"
          >
            <FlaskConical size={12} /> {t("matchJob.validation.demoPreview")}
          </button>
        )}
      </div>
    </section>
  );
}
