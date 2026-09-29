/**
 * VITAS · Match Report Page · /equipo/partido
 *
 * "Partido A vs B" from the FULL-MATCH VIDEO (Phase 1, docs/diseno-partido-completo.md):
 *   1. both team names + REQUIRED shirt colours (team identity = declared kit
 *      colours only, never face or shirt number);
 *   2. optional category (explicit, no default), attacking direction, coach notes
 *      ("aportado por el entrenador, no observado");
 *   3. REQUIRED coach declaration (versioned attestation);
 *   4. video: upload (resumable) or pick an existing one → async job
 *      (useMatchAnalysisJob: start + status polling + ?job= resume);
 *   5. the v2 report renders through TeamReportView with coverage + evidence chips.
 *
 * Secondary, explicitly labelled path: "Informe sin vídeo (solo notas)" — the old
 * notes-only /api/agents/team-report; its `source` is passed through so a
 * mock/error fallback shows a banner.
 *
 * AVAILABILITY (owner decision 29-sep, src/lib/match/matchVideoAvailability.ts):
 * the video path is OFF until it passes a validation. Unless the build flag
 * VITE_MATCH_VIDEO_ENABLED is exactly "true" (and the server has not refused with
 * match_video_disabled), the video tab reads "En validación" with the reason and
 * no form, the job hook makes no request, and the notes-only report is the
 * default, fully working path.
 *
 * IS_DEMO: no network at all. The video path is "En validación" too, with an
 * explicit example preview (MOCK job fixture); the notes path renders the MOCK
 * demo report. Both under the DemoDataBanner.
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ArrowLeft, ClipboardList, Sparkles, Loader2, AlertCircle, Home, Plane, Video, FileText, History } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { getAuthHeaders } from "@/lib/apiAuth";
import { IS_DEMO } from "@/lib/demoMode";
import { buildDemoMatchReport } from "@/lib/demo/demoTeam";
import { buildDemoMatchJob } from "@/lib/demo/demoMatchJob";
import i18n from "@/i18n";
import { normalizeLocale } from "@/lib/shared/locale";
import {
  ATTACKING_DIRECTIONS,
  MATCH_CATEGORIES,
  MATCH_NOTES_MAX_CHARS,
  type MatchJobStatusResponse,
} from "@/lib/shared/matchJob/contract";
import TeamReportView from "@/components/analysis/reports/TeamReportView";
import DemoDataBanner from "@/components/DemoDataBanner";
import KitColourPicker, { KitIdentityNote, KitSimilarityWarning } from "@/components/match/KitColourPicker";
import AttestationCheckbox, { buildAttestation } from "@/components/match/AttestationCheckbox";
import MatchJobProgress from "@/components/match/MatchJobProgress";
import MatchVideoPicker, { type PickedVideo } from "@/components/match/MatchVideoPicker";
import { isFeatureUnavailable, matchErrorMessage } from "@/components/match/matchErrorMessage";
import MatchVideoValidationNotice, { MatchVideoValidationBadge } from "@/components/match/MatchVideoValidationNotice";
import { EMPTY_KIT_DRAFT, kitDraftToTeamKit, type KitDraft } from "@/lib/match/kitColour";
import { isMatchVideoClientFlagOn, resolveMatchVideoAvailability } from "@/lib/match/matchVideoAvailability";
import { useMatchAnalysisJob, isTerminalMatchStatus } from "@/hooks/useMatchAnalysisJob";

type Mode = "video" | "notes";
type Category = (typeof MATCH_CATEGORIES)[number] | "";
type Direction = (typeof ATTACKING_DIRECTIONS)[number] | "";

export default function MatchReportPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  // ── Is the video path offered? (fail-closed; see matchVideoAvailability.ts) ──
  const [serverRefused, setServerRefused] = useState(false);
  const videoAvailable =
    resolveMatchVideoAvailability({ clientFlag: isMatchVideoClientFlagOn(), isDemo: IS_DEMO, serverDisabled: serverRefused }) ===
    "available";
  const [mode, setMode] = useState<Mode>(videoAvailable ? "video" : "notes");

  const [homeName, setHomeName] = useState("");
  const [awayName, setAwayName] = useState("");

  // ── Video path ──────────────────────────────────────────────────────────────
  const [homeKit, setHomeKit] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  const [awayKit, setAwayKit] = useState<KitDraft>(EMPTY_KIT_DRAFT);
  const [category, setCategory] = useState<Category>("");
  const [direction, setDirection] = useState<Direction>("");
  const [coachNotes, setCoachNotes] = useState("");
  const [attested, setAttested] = useState(false);
  const [video, setVideo] = useState<PickedVideo | null>(null);
  const [demoJob, setDemoJob] = useState<MatchJobStatusResponse | null>(null);
  // Disabled ⇒ zero network (no list, no status, no start).
  const job = useMatchAnalysisJob({ purpose: "match_ab", enabled: videoAvailable });

  // The server is the authority: a match_video_disabled refusal switches the path
  // to "En validación" for the rest of the session.
  useEffect(() => {
    if (job.startError?.code === "match_video_disabled") setServerRefused(true);
  }, [job.startError]);

  // ── Notes-only path (secondary) ─────────────────────────────────────────────
  const [homeFormation, setHomeFormation] = useState("");
  const [homeNotes, setHomeNotes] = useState("");
  const [awayFormation, setAwayFormation] = useState("");
  const [awayNotes, setAwayNotes] = useState("");
  const [matchContext, setMatchContext] = useState("");
  const [generating, setGenerating] = useState(false);
  const [report, setReport] = useState<Record<string, unknown> | null>(null);
  const [reportSource, setReportSource] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const namesOk = !!homeName.trim() && !!awayName.trim();
  const kitsOk = !!homeKit.shirt && !!awayKit.shirt;
  const formReady = namesOk && kitsOk && attested;
  const canStartVideo = videoAvailable && formReady && !!video && !job.starting;

  // Latest form state for the auto-start fired by a (possibly hours-long) upload.
  const formRef = useRef({ formReady, startVideo: (_v: PickedVideo) => Promise.resolve() });

  function missingHint(): string | null {
    if (!namesOk) return t("matchJob.form.namesRequired");
    if (!kitsOk) return t("matchJob.form.kitsRequired");
    if (!attested) return t("matchJob.errors.attestation_required");
    if (!video) return t("matchJob.form.videoRequired");
    return null;
  }

  async function startVideo(picked: PickedVideo | null) {
    if (!videoAvailable) return; // "En validación": never offered, never sent
    if (!formReady) {
      toast.error(missingHint() ?? t("matchJob.errors.invalid_request"));
      return;
    }
    const home = { name: homeName.trim(), kit: kitDraftToTeamKit(homeKit) };
    const away = { name: awayName.trim(), kit: kitDraftToTeamKit(awayKit) };
    const attestation = buildAttestation(attested);
    if (!picked || !attestation) {
      toast.error(missingHint() ?? t("matchJob.errors.invalid_request"));
      return;
    }
    const res = await job.start({
      videoId: picked.videoId,
      home,
      away,
      ...(direction ? { attackingDir1h: direction } : {}),
      ...(coachNotes.trim() ? { notes: coachNotes.trim().slice(0, MATCH_NOTES_MAX_CHARS) } : {}),
      ...(category ? { category } : {}),
      locale: normalizeLocale(i18n.language),
      attestation,
    });
    if (res) toast.success(t("matchJob.form.startedToast"));
  }
  formRef.current = { formReady, startVideo };

  function onVideoPicked(v: PickedVideo | null) {
    setVideo(v);
    // The file is entirely in Bunny: start now if the coach already completed the
    // form (the encode can take hours; the server waits for it). A picked existing
    // video waits for the explicit button.
    if (v?.source === "upload" && formRef.current.formReady) void formRef.current.startVideo(v);
  }

  async function handleGenerateNotes() {
    if (!namesOk) {
      toast.error(t("matchReportPage.namesRequiredToast"));
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      if (IS_DEMO) {
        setReport(buildDemoMatchReport(homeName.trim(), awayName.trim()) as Record<string, unknown>);
        setReportSource("demo");
        return;
      }
      const headers = await getAuthHeaders();
      const res = await fetch("/api/agents/team-report", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          homeFormation: homeFormation.trim() || undefined,
          awayFormation: awayFormation.trim() || undefined,
          teamMetrics: {
            home: { name: homeName.trim(), notes: homeNotes.trim() || undefined },
            away: { name: awayName.trim(), notes: awayNotes.trim() || undefined },
            matchContext: matchContext.trim() || undefined,
          },
          locale: normalizeLocale(i18n.language),
        }),
      });
      const json = await res.json();
      if (!res.ok || json.success === false) {
        throw new Error(json?.error?.message ?? t("matchReportPage.errorGenerating"));
      }
      // successResponse envuelve en { data }, y el agente vuelve a envolver en { data }
      const payload = (json.data?.data ?? json.data ?? json) as Record<string, unknown>;
      setReport((payload.report ?? {}) as Record<string, unknown>);
      // `source` se propaga: mock_fallback / error_fallback muestran banner (no parecen análisis).
      setReportSource(typeof payload.source === "string" ? payload.source : null);
      toast.success(t("matchReportPage.generatedToast"));
    } catch (err) {
      const msg = err instanceof Error ? err.message : t("matchReportPage.errorGeneric");
      setError(msg);
      toast.error(msg);
    } finally {
      setGenerating(false);
    }
  }

  // ── Result: demo job (MOCK) ─────────────────────────────────────────────────
  if (IS_DEMO && demoJob) {
    return (
      <PageShell
        title={t("matchJob.form.resultTitle", { home: demoJob.job.home.name, away: demoJob.job.away.name })}
        subtitle={t("matchJob.form.resultSubtitle")}
        onBack={() => navigate(-1)}
        action={{ label: t("matchReportPage.edit"), onClick: () => setDemoJob(null) }}
      >
        {/* The MOCK banner is rendered by TeamReportView itself (any MOCK payload ⇒ banner). */}
        <TeamReportView
          report={demoJob.report}
          match={{
            observation: demoJob.observation,
            coverage: demoJob.coverage,
            reportGate: demoJob.reportGate,
            embedUrl: null,
            homeName: demoJob.job.home.name ?? homeName,
            awayName: demoJob.job.away.name ?? awayName,
          }}
        />
      </PageShell>
    );
  }

  // ── Result / progress: real job (?job=<id>) ─────────────────────────────────
  if (videoAvailable && job.jobId) {
    const d = job.data;
    const hName = d?.job.home.name ?? homeName ?? "";
    const aName = d?.job.away.name ?? awayName ?? "";
    const status = d?.job.status;
    const completed = status === "completed";
    const hasResults = !!d && (completed || !!d.observation || !!d.coverage) && isTerminalMatchStatus(status);
    return (
      <PageShell
        title={hName && aName ? t("matchJob.form.resultTitle", { home: hName, away: aName }) : t("matchReportPage.headerTitle")}
        subtitle={t("matchJob.form.resultSubtitle")}
        onBack={() => navigate(-1)}
        action={{ label: t("matchJob.form.newAnalysis"), onClick: () => job.clear() }}
      >
        {!d && !job.error && (
          <div className="glass rounded-2xl p-8 text-center">
            <Loader2 size={20} className="animate-spin text-primary mx-auto" />
          </div>
        )}
        {(!completed || !d) && (
          <MatchJobProgress
            data={d}
            error={job.error}
            nextPollInSec={job.nextPollInSec}
            onCancel={() => void job.cancel()}
            cancelling={job.cancelling}
            onRefresh={() => void job.refresh()}
            onStartNew={() => job.clear()}
          />
        )}
        {hasResults && d && (
          <TeamReportView
            report={d.report}
            match={{
              observation: d.observation,
              coverage: d.coverage,
              reportGate: d.reportGate,
              embedUrl: d.playback?.embedUrl ?? null,
              homeName: hName,
              awayName: aName,
            }}
          />
        )}
      </PageShell>
    );
  }

  // ── Result: notes-only report (v1) ─────────────────────────────────────────
  if (report) {
    return (
      <PageShell
        title={t("matchReportPage.resultTitle", { home: homeName, away: awayName })}
        subtitle={t("matchJob.form.notesResultSubtitle")}
        onBack={() => navigate(-1)}
        action={{ label: t("matchReportPage.edit"), onClick: () => setReport(null) }}
      >
        {IS_DEMO && <DemoDataBanner />}
        <TeamReportView report={report} source={reportSource} />
      </PageShell>
    );
  }

  // ── Form ────────────────────────────────────────────────────────────────────
  const startError = job.startError;
  return (
    <PageShell title={t("matchReportPage.headerTitle")} subtitle={t("matchReportPage.headerSubtitle")} onBack={() => navigate(-1)} icon>
      <div className="flex gap-2" role="tablist" aria-label={t("matchReportPage.headerTitle")}>
        <ModeTab
          active={mode === "video"}
          onClick={() => setMode("video")}
          Icon={Video}
          label={t("matchJob.form.modeVideo")}
          badge={videoAvailable ? null : <MatchVideoValidationBadge />}
        />
        <ModeTab
          active={mode === "notes"}
          onClick={() => setMode("notes")}
          Icon={FileText}
          label={t("matchJob.form.modeNotes")}
          secondary={videoAvailable}
        />
      </div>

      {mode === "video" && !videoAvailable ? (
        <MatchVideoValidationNotice
          serverRefused={serverRefused}
          onUseNotes={() => setMode("notes")}
          onDemoPreview={IS_DEMO ? () => setDemoJob(buildDemoMatchJob({ homeName, awayName })) : undefined}
        />
      ) : mode === "video" ? (
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(["home", "away"] as const).map((side) => (
              <motion.div key={side} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 space-y-3">
                <TeamHeading side={side} title={side === "home" ? t("matchReportPage.homeTitle") : t("matchReportPage.awayTitle")} />
                <NameInput
                  id={`${side}-name`}
                  value={side === "home" ? homeName : awayName}
                  onChange={side === "home" ? setHomeName : setAwayName}
                />
                <KitColourPicker
                  idPrefix={side}
                  title={(side === "home" ? homeName : awayName).trim() || (side === "home" ? t("teamReport.home") : t("teamReport.away"))}
                  value={side === "home" ? homeKit : awayKit}
                  onChange={side === "home" ? setHomeKit : setAwayKit}
                  required
                />
              </motion.div>
            ))}
          </div>
          <KitSimilarityWarning home={homeKit} away={awayKit} />
          <KitIdentityNote />

          <div className="glass rounded-2xl p-4 space-y-3">
            <h2 className="font-display font-bold text-xs text-foreground">{t("matchJob.form.options")}</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <SelectField
                id="match-category"
                label={t("matchJob.form.category")}
                value={category}
                onChange={(v) => setCategory(v as Category)}
                options={[
                  { value: "", label: t("matchJob.form.categoryNone") },
                  { value: "youth", label: t("matchJob.form.categoryYouth") },
                  { value: "senior", label: t("matchJob.form.categorySenior") },
                ]}
              />
              <SelectField
                id="match-direction"
                label={t("matchJob.form.direction")}
                value={direction}
                onChange={(v) => setDirection(v as Direction)}
                options={[
                  { value: "", label: t("matchJob.form.directionNone") },
                  { value: "left_to_right", label: t("matchJob.form.directionLtr") },
                  { value: "right_to_left", label: t("matchJob.form.directionRtl") },
                ]}
              />
            </div>
            <div>
              <label htmlFor="match-coach-notes" className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
                {t("matchJob.form.notes")}
              </label>
              <textarea
                id="match-coach-notes"
                value={coachNotes}
                maxLength={MATCH_NOTES_MAX_CHARS}
                onChange={(e) => setCoachNotes(e.target.value)}
                rows={2}
                placeholder={t("matchJob.form.notesPlaceholder")}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none resize-none"
              />
              <p className="text-[10px] text-muted-foreground mt-0.5">{t("matchJob.form.notesHint")}</p>
            </div>
          </div>

          <AttestationCheckbox id="match-attestation" checked={attested} onChange={setAttested} />

          <div className="glass rounded-2xl p-4 space-y-3">
            <h2 className="font-display font-bold text-xs text-foreground">{t("matchJob.video.title")}</h2>
            <MatchVideoPicker value={video} onChange={onVideoPicked} />
            {!video && formReady && <p className="text-[10px] text-muted-foreground">{t("matchJob.form.autoStartHint")}</p>}

            {startError && (
              <div role="alert" className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 space-y-1.5 text-[11px] text-destructive">
                <p className="flex items-center gap-2">
                  <AlertCircle size={12} /> {matchErrorMessage(t, startError)}
                </p>
                {isFeatureUnavailable(startError) && (
                  <button type="button" onClick={() => setMode("notes")} className="font-bold underline">
                    {t("matchJob.form.modeNotes")}
                  </button>
                )}
              </div>
            )}

            <button
              type="button"
              onClick={() => void startVideo(video)}
              disabled={!canStartVideo}
              className="w-full py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {job.starting ? (
                <><Loader2 size={14} className="animate-spin" /> {t("matchJob.form.starting")}</>
              ) : (
                <><Sparkles size={14} /> {t("matchJob.form.start")}</>
              )}
            </button>
            {!canStartVideo && !job.starting && missingHint() && (
              <p className="text-[10px] text-muted-foreground text-center">{missingHint()}</p>
            )}
            <p className="text-[10px] text-muted-foreground text-center">{t("matchJob.form.startHint")}</p>
          </div>

          {job.recentJobs.length > 0 && (
            <div className="glass rounded-2xl p-4 space-y-2">
              <h2 className="flex items-center gap-1.5 font-display font-bold text-xs text-foreground">
                <History size={12} /> {t("matchJob.form.recentTitle")}
              </h2>
              <ul className="space-y-1.5">
                {job.recentJobs.slice(0, 5).map((j) => (
                  <li key={j.jobId} className="flex items-center justify-between gap-2 text-[11px]">
                    <span className="min-w-0 truncate text-foreground">
                      {j.homeName && j.awayName ? `${j.homeName} vs ${j.awayName}` : j.videoId}
                      <span className="text-muted-foreground"> · {t(`matchJob.stage.${j.stage}`)}</span>
                    </span>
                    <button type="button" onClick={() => job.open(j.jobId)} className="shrink-0 font-bold text-primary hover:underline">
                      {t("matchJob.form.recentOpen")}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          <p className="text-[11px] text-muted-foreground">
            {t(videoAvailable ? "matchJob.form.modeNotesHint" : "matchJob.form.modeNotesHintPrimary")}
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <TeamCard
              Icon={Home}
              title={t("matchReportPage.homeTitle")}
              color="#0066CC"
              name={homeName}
              onName={setHomeName}
              formation={homeFormation}
              onFormation={setHomeFormation}
              notes={homeNotes}
              onNotes={setHomeNotes}
            />
            <TeamCard
              Icon={Plane}
              title={t("matchReportPage.awayTitle")}
              color="#F59E0B"
              name={awayName}
              onName={setAwayName}
              formation={awayFormation}
              onFormation={setAwayFormation}
              notes={awayNotes}
              onNotes={setAwayNotes}
            />
          </div>

          <div className="glass rounded-2xl p-4 space-y-3">
            <div>
              <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
                {t("matchReportPage.contextLabel")}
              </label>
              <textarea
                value={matchContext}
                onChange={(e) => setMatchContext(e.target.value)}
                rows={2}
                placeholder={t("matchReportPage.contextPlaceholder")}
                className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none resize-none"
              />
            </div>

            {error && (
              <div className="rounded-lg bg-destructive/10 border border-destructive/30 p-2 flex items-center gap-2 text-[11px] text-destructive">
                <AlertCircle size={12} /> {error}
              </div>
            )}

            <button
              type="button"
              onClick={handleGenerateNotes}
              disabled={generating || !namesOk}
              className="w-full py-3 rounded-lg bg-secondary text-foreground border border-border font-display font-bold text-sm hover:bg-secondary/80 disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {generating ? (
                <><Loader2 size={14} className="animate-spin" /> {t("matchReportPage.analyzing")}</>
              ) : (
                <><FileText size={14} /> {t("matchJob.form.notesGenerate")}</>
              )}
            </button>
            <p className="text-[10px] text-muted-foreground text-center">{t("matchReportPage.footer")}</p>
          </div>
        </div>
      )}
    </PageShell>
  );
}

// ─── Layout helpers ───────────────────────────────────────────────────────────

function PageShell({
  title,
  subtitle,
  onBack,
  action,
  icon = false,
  children,
}: {
  title: string;
  subtitle: string;
  onBack: () => void;
  action?: { label: string; onClick: () => void };
  icon?: boolean;
  children: React.ReactNode;
}) {
  const { t } = useTranslation();
  const backLabel = t("common.back");
  return (
    <div className="min-h-screen bg-background pb-28">
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="p-1.5 rounded-lg hover:bg-secondary" aria-label={backLabel}>
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">{title}</h1>
            <p className="text-[10px] text-muted-foreground">{subtitle}</p>
          </div>
          {action && (
            <button onClick={action.onClick} className="text-[11px] text-primary hover:text-primary/80 font-bold">
              {action.label}
            </button>
          )}
          {icon && <ClipboardList size={18} className="text-electric" />}
        </div>
      </div>
      <div className="px-4 py-4 space-y-4 max-w-2xl lg:max-w-5xl mx-auto">{children}</div>
    </div>
  );
}

function ModeTab({
  active,
  onClick,
  Icon,
  label,
  secondary = false,
  badge = null,
}: {
  active: boolean;
  onClick: () => void;
  Icon: LucideIcon;
  label: string;
  secondary?: boolean;
  /** e.g. the "En validación" pill. */
  badge?: React.ReactNode;
}) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`inline-flex flex-wrap items-center gap-1.5 rounded-lg border px-3 py-2 font-bold ${secondary ? "text-[10px]" : "flex-1 justify-center text-[11px]"} ${
        active ? "border-primary bg-primary/10 text-primary" : "border-border text-muted-foreground"
      }`}
    >
      <Icon size={12} /> {label}
      {badge}
    </button>
  );
}

function TeamHeading({ side, title }: { side: "home" | "away"; title: string }) {
  const Icon = side === "home" ? Home : Plane;
  const color = side === "home" ? "#0066CC" : "#F59E0B";
  return (
    <div className="flex items-center gap-2 pb-2 border-b border-border">
      <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
        <Icon size={13} style={{ color }} />
      </div>
      <h2 className="font-display font-bold text-sm text-foreground">{title}</h2>
    </div>
  );
}

function NameInput({ id, value, onChange }: { id: string; value: string; onChange: (v: string) => void }) {
  const { t } = useTranslation();
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
        {t("matchReportPage.teamNameLabel")} <span className="text-destructive">*</span>
      </label>
      <input
        id={id}
        type="text"
        value={value}
        maxLength={60}
        onChange={(e) => onChange(e.target.value)}
        placeholder={t("matchReportPage.teamNamePlaceholder")}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
      />
    </div>
  );
}

function SelectField({
  id,
  label,
  value,
  onChange,
  options,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
}) {
  return (
    <div>
      <label htmlFor={id} className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </div>
  );
}

// ─── Notes-only team card ─────────────────────────────────────────────────────

function TeamCard({
  Icon, title, color, name, onName, formation, onFormation, notes, onNotes,
}: {
  Icon: LucideIcon;
  title: string;
  color: string;
  name: string;
  onName: (v: string) => void;
  formation: string;
  onFormation: (v: string) => void;
  notes: string;
  onNotes: (v: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2 pb-2 border-b border-border">
        <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor: `${color}20` }}>
          <Icon size={13} style={{ color }} />
        </div>
        <h2 className="font-display font-bold text-sm text-foreground">{title}</h2>
      </div>
      <div>
        <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchReportPage.teamNameLabel")}
        </label>
        <input
          type="text"
          value={name}
          onChange={(e) => onName(e.target.value)}
          placeholder={t("matchReportPage.teamNamePlaceholder")}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchReportPage.formationLabel")}
        </label>
        <input
          type="text"
          value={formation}
          onChange={(e) => onFormation(e.target.value)}
          placeholder={t("matchReportPage.formationPlaceholder")}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none"
        />
      </div>
      <div>
        <label className="block text-[10px] font-display text-muted-foreground uppercase tracking-wider mb-1">
          {t("matchReportPage.notesLabel")}
        </label>
        <textarea
          value={notes}
          onChange={(e) => onNotes(e.target.value)}
          rows={3}
          placeholder={t("matchReportPage.notesPlaceholder")}
          className="w-full px-3 py-2 rounded-lg bg-background border border-border text-xs text-foreground focus:border-primary focus:outline-none resize-none"
        />
      </div>
    </motion.div>
  );
}
