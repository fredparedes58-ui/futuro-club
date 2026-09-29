/**
 * VITAS · BaselineMatchJobPanel — /equipo/baseline for a FULL-MATCH video.
 *
 * A video longer than the synchronous short-clip limit (videoLimits.ts) is not
 * sent to /api/agents/video-observation (which downloads it inside a 120 s
 * function). It runs as the async match job with purpose `team_baseline`:
 * own team name + OWN shirt colour required (identity by declared kit only),
 * rival colour optional, coach declaration required. When the job is completed,
 * the page calls /api/team/baseline-analysis with `matchAnalysisId` and the server
 * loads the observation itself (no invented playerContext, no client URL).
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { AlertCircle, CheckCircle2, Loader2, Sparkles } from "lucide-react";
import { MATCH_NOTES_MAX_CHARS } from "@/lib/shared/matchJob/contract";
import { normalizeLocale } from "@/lib/shared/locale";
import type { UseMatchAnalysisJobResult } from "@/hooks/useMatchAnalysisJob";
import { EMPTY_KIT_DRAFT, kitDraftToTeamKit, type KitDraft } from "@/lib/match/kitColour";
import { durationMinutesForDisplay } from "@/lib/shared/videoLimits";
import KitColourPicker, { KitIdentityNote, KitSimilarityWarning } from "@/components/match/KitColourPicker";
import AttestationCheckbox, { buildAttestation } from "@/components/match/AttestationCheckbox";
import MatchJobProgress from "@/components/match/MatchJobProgress";
import CoverageBanner from "@/components/match/CoverageBanner";
import { isFeatureUnavailable, matchErrorMessage } from "@/components/match/matchErrorMessage";

interface BaselineMatchJobPanelProps {
  job: UseMatchAnalysisJobResult;
  /** The uploaded video that is too long for the quick analysis (null when resuming a job). */
  videoId: string | null;
  durationSec: number | null;
  /** Back to the upload (forget the video and the job). */
  onReset: () => void;
}

export default function BaselineMatchJobPanel({ job, videoId, durationSec, onReset }: BaselineMatchJobPanelProps) {
  const { t, i18n } = useTranslation();
  const [ownName, setOwnName] = useState("");
  const [ownSide, setOwnSide] = useState<"home" | "away">("home");
  const [ownKit, setOwnKit] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  const [rivalName, setRivalName] = useState("");
  const [rivalKit, setRivalKit] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  const [notes, setNotes] = useState("");
  const [attested, setAttested] = useState(false);

  // ── A job exists: progress, then coverage once completed ─────────────────────
  if (job.jobId) {
    const d = job.data;
    const completed = d?.job.status === "completed";
    return (
      <div className="space-y-3" data-testid="baseline-match-job">
        {!completed && (
          <MatchJobProgress
            data={d}
            error={job.error}
            nextPollInSec={job.nextPollInSec}
            onCancel={() => void job.cancel()}
            cancelling={job.cancelling}
            onRefresh={() => void job.refresh()}
            onStartNew={() => {
              job.clear();
              onReset();
            }}
          />
        )}
        {completed && (
          <div className="flex items-center gap-2 p-3 rounded-lg bg-green-500/10 border border-green-500/30">
            <CheckCircle2 size={14} className="text-green-500" />
            <span className="text-xs text-foreground">{t("matchJob.baseline.completedHint")}</span>
          </div>
        )}
        {d?.coverage && <CoverageBanner coverage={d.coverage} />}
        {!completed && <p className="text-[10px] text-muted-foreground">{t("matchJob.baseline.notCompleted")}</p>}
      </div>
    );
  }

  const canStart = !!videoId && !!ownName.trim() && !!ownKit.shirt && attested && !job.starting;

  async function handleStart() {
    const attestation = buildAttestation(attested);
    if (!videoId || !attestation || !ownKit.shirt || !ownName.trim()) return;
    const own = { name: ownName.trim(), kit: kitDraftToTeamKit(ownKit) };
    const rival = {
      ...(rivalName.trim() ? { name: rivalName.trim() } : {}),
      ...(rivalKit.shirt ? { kit: kitDraftToTeamKit(rivalKit) } : {}),
    };
    await job.start({
      videoId,
      home: ownSide === "home" ? own : rival,
      away: ownSide === "away" ? own : rival,
      focusTeam: ownSide,
      ...(notes.trim() ? { notes: notes.trim().slice(0, MATCH_NOTES_MAX_CHARS) } : {}),
      locale: normalizeLocale(i18n.language),
      attestation,
    });
  }

  return (
    <div className="space-y-3 rounded-xl border border-primary/30 bg-primary/5 p-3" data-testid="baseline-match-form">
      <div>
        <h3 className="text-xs font-display font-bold text-foreground">{t("matchJob.baseline.fullMatchTitle")}</h3>
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          {durationSec !== null
            ? t("matchJob.baseline.fullMatchDesc", { duration: durationMinutesForDisplay(durationSec) })
            : t("matchJob.baseline.fullMatchDescNoDuration")}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <label htmlFor="baseline-own-name" className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider">
            {t("matchJob.baseline.ownTeamName")} <span className="text-destructive">*</span>
          </label>
          <input
            id="baseline-own-name"
            type="text"
            maxLength={60}
            value={ownName}
            onChange={(e) => setOwnName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <label htmlFor="baseline-own-side" className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider">
            {t("matchJob.baseline.ownSide")}
          </label>
          <select
            id="baseline-own-side"
            value={ownSide}
            onChange={(e) => setOwnSide(e.target.value === "away" ? "away" : "home")}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
          >
            <option value="home">{t("matchJob.baseline.sideHome")}</option>
            <option value="away">{t("matchJob.baseline.sideAway")}</option>
          </select>
          <KitColourPicker idPrefix="own" title={ownName.trim() || t("matchJob.baseline.ownTeam")} value={ownKit} onChange={setOwnKit} required />
        </div>
        <div className="space-y-2">
          <label htmlFor="baseline-rival-name" className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider">
            {t("matchJob.baseline.rivalName")}
          </label>
          <input
            id="baseline-rival-name"
            type="text"
            maxLength={60}
            value={rivalName}
            onChange={(e) => setRivalName(e.target.value)}
            className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
          />
          <KitColourPicker
            idPrefix="rival"
            title={rivalName.trim() || t("matchJob.baseline.rival")}
            value={rivalKit}
            onChange={setRivalKit}
            required={false}
          />
          <p className="text-[10px] text-muted-foreground">{t("matchJob.baseline.rivalHint")}</p>
        </div>
      </div>
      {/* Symmetric check: which side is "ours" does not matter for the distance. */}
      <KitSimilarityWarning home={ownKit} away={rivalKit} />
      <KitIdentityNote />

      <div>
        <label htmlFor="baseline-notes" className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchJob.form.notes")}
        </label>
        <textarea
          id="baseline-notes"
          rows={2}
          maxLength={MATCH_NOTES_MAX_CHARS}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none resize-none"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">{t("matchJob.form.notesHint")}</p>
      </div>

      <AttestationCheckbox id="baseline-attestation" checked={attested} onChange={setAttested} />

      {job.startError && (
        <div role="alert" className="flex items-center gap-2 rounded-lg bg-destructive/10 border border-destructive/30 p-2 text-[11px] text-destructive">
          <AlertCircle size={12} /> {matchErrorMessage(t, job.startError)}
          {isFeatureUnavailable(job.startError) && <span className="text-muted-foreground"> {t("matchJob.baseline.unavailableHint")}</span>}
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => void handleStart()}
          disabled={!canStart}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 disabled:opacity-50"
        >
          {job.starting ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
          {job.starting ? t("matchJob.form.starting") : t("matchJob.baseline.start")}
        </button>
        <button type="button" onClick={onReset} className="text-[11px] text-muted-foreground hover:text-foreground">
          {t("matchJob.video.change")}
        </button>
      </div>
    </div>
  );
}
