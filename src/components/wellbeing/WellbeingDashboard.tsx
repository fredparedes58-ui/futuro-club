/**
 * VITAS · WellbeingDashboard (Sprint 23)
 *
 * Team wellbeing panel with risk traffic lights.
 * Grid of players ordered by dropout risk. Click → detail.
 * Used in /wellbeing page for coaches and directors.
 */
import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ArrowLeft, Sparkles, Loader2, AlertCircle, Users } from "lucide-react";
import {
  useDropoutRisk,
  useEngagementHistory,
  useAttendance,
  useBurnoutReport,
  useTeamDropoutRisk,
  useTeamEngagement,
  buildBurnoutInput,
  type DropoutRiskAssessment,
  type EngagementSnapshot,
} from "@/hooks/useWellbeing";
import { useAllPlayers } from "@/hooks/usePlayers";

import TeamRiskOverview from "./TeamRiskOverview";
import DropoutRiskGauge from "./DropoutRiskGauge";
import EngagementTimeline from "./EngagementTimeline";
import EngagementHeatmap from "./EngagementHeatmap";
import AttendanceCalendar from "./AttendanceCalendar";
import OvertrainingAlert from "./OvertrainingAlert";
import InterventionPlanView from "./InterventionPlanView";
import EngagementMiniCard from "@/components/coaching/EngagementMiniCard";
import BurnoutReportView from "@/components/analysis/reports/BurnoutReportView";

// Edad por defecto cuando el jugador no tiene edad registrada; el agente
// refleja la falta de datos en su confidence_score.
const DEFAULT_PLAYER_AGE = 13;

// ─── Heatmap semanal (a partir de snapshots reales de engagement) ──────────

/** Lunes (ISO, YYYY-MM-DD) de la semana a la que pertenece la fecha dada. */
function mondayOf(dateStr: string): string {
  const d = new Date(`${dateStr.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(d.getTime())) return dateStr.slice(0, 10);
  const dayFromMonday = (d.getDay() + 6) % 7; // Lun=0 … Dom=6
  d.setDate(d.getDate() - dayFromMonday);
  return d.toISOString().slice(0, 10);
}

type HeatmapRow = {
  playerId: string;
  playerName: string;
  weeks: Array<{ weekLabel: string; score: number | null }>;
};

/**
 * Construye el heatmap engagement (jugadores × últimas 6 semanas) a partir de
 * los snapshots reales por jugador. Semanas alineadas entre jugadores (mismas
 * columnas); celdas sin datos = null (el heatmap las pinta vacías).
 */
function buildEngagementHeatmap(
  players: Array<{ id: string; name: string }>,
  snapshotsByPlayer: Array<EngagementSnapshot[] | undefined>,
): HeatmapRow[] {
  // Conjunto compartido de semanas (las 6 más recientes con algún dato).
  const allWeeks = new Set<string>();
  snapshotsByPlayer.forEach((snaps) => {
    (snaps ?? []).forEach((s) => allWeeks.add(mondayOf(s.date)));
  });
  const weekKeys = [...allWeeks].sort().slice(-6);

  return players.map((p, i) => {
    const snaps = snapshotsByPlayer[i] ?? [];
    // Media de engagementScore por semana.
    const byWeek = new Map<string, { sum: number; n: number }>();
    snaps.forEach((s) => {
      const wk = mondayOf(s.date);
      const acc = byWeek.get(wk) ?? { sum: 0, n: 0 };
      acc.sum += s.engagementScore;
      acc.n += 1;
      byWeek.set(wk, acc);
    });
    return {
      playerId: p.id,
      playerName: p.name,
      weeks: weekKeys.map((wk) => {
        const acc = byWeek.get(wk);
        const label = wk.slice(8, 10) + "/" + wk.slice(5, 7); // dd/mm
        return { weekLabel: label, score: acc ? Math.round(acc.sum / acc.n) : null };
      }),
    };
  });
}

// ─── Player Detail View ──────────────────────────────────────────────────

function PlayerDetail({
  playerId,
  playerName,
  onBack,
}: {
  playerId: string;
  playerName: string;
  onBack: () => void;
}) {
  const { t } = useTranslation();
  const { data: risk } = useDropoutRisk(playerId);
  const { data: engagement } = useEngagementHistory(playerId);
  const { data: attendance } = useAttendance(playerId);

  return (
    <motion.div
      initial={{ opacity: 0, x: 20 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: -20 }}
      className="space-y-4"
    >
      <button
        onClick={onBack}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={14} />
        {t("wellbeingDashboard.backToTeam")}
      </button>

      {risk && (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <DropoutRiskGauge
              score={risk.riskScore}
              riskLevel={risk.riskLevel}
              primaryFactor={risk.primaryFactor}
              factors={risk.factors}
            />
            <div className="space-y-4">
              <EngagementMiniCard
                physical={risk.engagement.current}
                social={Math.round(risk.engagement.current * 0.9)}
                emotional={Math.round(risk.engagement.current * 0.85)}
                composite={risk.engagement.current}
                trend={risk.engagement.trend === "declining" ? "declining" : risk.engagement.trend === "improving" ? "rising" : "stable"}
              />
              <OvertrainingAlert
                risk={risk.overtraining.risk}
                riskLevel={risk.overtraining.riskLevel}
                currentLoadAU={risk.overtraining.currentLoadAU}
                recommendedLoadAU={risk.overtraining.recommendedLoadAU}
                adjustmentPct={risk.overtraining.adjustmentPct}
              />
            </div>
          </div>

          {engagement && engagement.length > 0 && (
            <EngagementTimeline
              data={engagement.map(e => ({
                date: e.date,
                engagementScore: e.engagementScore,
                physicalEngagement: e.physicalEngagement,
                socialEngagement: e.socialEngagement,
                emotionalEngagement: e.emotionalEngagement,
              }))}
            />
          )}

          {attendance && (
            <AttendanceCalendar
              records={attendance.records.map(r => ({ date: r.date, status: r.status }))}
              rate={attendance.rate}
            />
          )}

          <InterventionPlanView
            urgency={risk.intervention.urgency}
            actions={risk.intervention.actions}
            followUpDate={risk.intervention.followUpDate}
            escalationNeeded={risk.intervention.escalationNeeded}
            primaryFactor={risk.primaryFactor}
          />

          <BurnoutReportSection risk={risk} playerName={playerName} />
        </>
      )}
    </motion.div>
  );
}

// ─── AI Burnout Report Section ─────────────────────────────────────────────

function BurnoutReportSection({
  risk,
  playerName,
}: {
  risk: DropoutRiskAssessment;
  playerName: string;
}) {
  const { t } = useTranslation();
  const mutation = useBurnoutReport();

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("burnoutReport.sectionTitle")}
        </span>
        {!mutation.data && (
          <button
            onClick={() => mutation.mutate(buildBurnoutInput(risk, playerName, DEFAULT_PLAYER_AGE))}
            disabled={mutation.isPending}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors disabled:opacity-50"
          >
            {mutation.isPending ? <Loader2 size={12} className="animate-spin" /> : <Sparkles size={12} />}
            {mutation.isPending ? t("burnoutReport.generating") : t("burnoutReport.generate")}
          </button>
        )}
      </div>

      {mutation.isError && (
        <div className="flex items-start gap-1.5 text-[11px] text-rose-400">
          <AlertCircle size={12} className="mt-0.5 shrink-0" />
          <span>{t("burnoutReport.error")}</span>
        </div>
      )}

      {mutation.data && <BurnoutReportView report={mutation.data.report} />}

      {!mutation.data && !mutation.isPending && !mutation.isError && (
        <p className="text-[11px] text-muted-foreground">{t("burnoutReport.hint")}</p>
      )}
    </div>
  );
}

// ─── Main Dashboard ──────────────────────────────────────────────────────

export default function WellbeingDashboard() {
  const { t } = useTranslation();
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);

  // Roster real del club (antes: 8 jugadores mock hardcodeados).
  const { data: roster, isLoading: rosterLoading } = useAllPlayers();
  const players = useMemo(
    () => (roster ?? []).map((p) => ({ id: String(p.id), name: p.name })),
    [roster],
  );
  const playerIds = useMemo(() => players.map((p) => p.id), [players]);

  // Riesgo de abandono + engagement reales por jugador (batch).
  const riskResults = useTeamDropoutRisk(playerIds);
  const engagementResults = useTeamEngagement(playerIds);

  const teamRisk = useMemo(
    () =>
      players.map((p, i) => {
        const r = riskResults[i]?.data;
        return {
          playerId: p.id,
          playerName: p.name,
          riskScore: r?.riskScore ?? 0,
          riskLevel: r?.riskLevel ?? ("low" as const),
          primaryFactor: r?.primaryFactor ?? "—",
          engagementTrend: r?.engagement?.trend ?? "stable",
          attendanceRate: r?.attendance?.rate ?? 0,
        };
      }),
    [players, riskResults],
  );

  const heatmapData = useMemo(
    () => buildEngagementHeatmap(players, engagementResults.map((q) => q.data)),
    [players, engagementResults],
  );
  const hasEngagementData = heatmapData.some((row) =>
    row.weeks.some((w) => w.score !== null),
  );

  const risksLoading = riskResults.some((q) => q.isLoading);

  // Empty state: sin roster todavía.
  if (!rosterLoading && players.length === 0) {
    return (
      <div className="glass rounded-xl p-8 text-center space-y-2">
        <Users size={24} className="mx-auto text-muted-foreground" />
        <p className="text-sm font-display font-bold text-foreground">
          {t("wellbeingDashboard.emptyTitle")}
        </p>
        <p className="text-xs text-muted-foreground max-w-sm mx-auto">
          {t("wellbeingDashboard.emptyDescription")}
        </p>
      </div>
    );
  }

  if (rosterLoading) {
    return (
      <div className="flex items-center justify-center py-16">
        <Loader2 size={20} className="animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <AnimatePresence mode="wait">
        {selectedPlayerId ? (
          <PlayerDetail
            key="detail"
            playerId={selectedPlayerId}
            playerName={
              teamRisk.find((p) => p.playerId === selectedPlayerId)?.playerName ?? selectedPlayerId
            }
            onBack={() => setSelectedPlayerId(null)}
          />
        ) : (
          <motion.div
            key="overview"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="space-y-6"
          >
            {/* Team risk overview */}
            <div className="glass rounded-xl p-4 space-y-4">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
                  {t("wellbeingDashboard.teamWellbeingPanel")}
                </span>
                {risksLoading && <Loader2 size={12} className="animate-spin text-muted-foreground" />}
              </div>
              <TeamRiskOverview
                players={teamRisk}
                onPlayerClick={setSelectedPlayerId}
              />
            </div>

            {/* Engagement heatmap — solo si hay datos reales de engagement */}
            {hasEngagementData && <EngagementHeatmap data={heatmapData} />}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
