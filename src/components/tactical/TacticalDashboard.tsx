/**
 * VITAS · TacticalDashboard
 *
 * Componente principal del módulo táctico. Integra:
 *   - Header con resumen del match (posesión + duración por fase)
 *   - PhaseSelector chips
 *   - PitchHeatmap (equipo) para la fase activa
 *   - PlayerHeatmapGrid (toggleable)
 *   - TacticalInsightsCard del agente
 *   - Botón "Generar insights" si no existen
 *   - Botón "Subir video" (inline modal compartido)
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  Sparkles, Loader2, RefreshCw, Users as UsersIcon,
  Video, Activity,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import {
  useTacticalMatch,
  useGenerateTacticalInsights,
} from "@/hooks/useTacticalHeatmap";
import { PitchHeatmap } from "./PitchHeatmap";
import { PhaseSelector } from "./PhaseSelector";
import { PlayerHeatmapGrid } from "./PlayerHeatmapGrid";
import { TacticalInsightsCard } from "./TacticalInsightsCard";
import { AnalysisVideoUploadDialog } from "@/components/video/AnalysisVideoUploadDialog";
import type { GamePhase } from "@/lib/tactical/tacticalTypes";

interface Props {
  matchId: string;
  /** Player names dict (id → name) for the player grid */
  playerNames?: Record<string, string>;
  /** Trigger video upload — needs a target player (or "team" placeholder) */
  uploadTargetPlayerId?: string;
  uploadTargetPlayerName?: string;
}

export function TacticalDashboard({
  matchId,
  playerNames,
  uploadTargetPlayerId,
  uploadTargetPlayerName,
}: Props) {
  const { t } = useTranslation();
  const { data: summary, isLoading } = useTacticalMatch(matchId);
  const generateInsights = useGenerateTacticalInsights();

  const [activePhase, setActivePhase] = useState<GamePhase>("attacking");
  const [showPlayers, setShowPlayers] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="size-6 text-cyan-400 animate-spin" />
      </div>
    );
  }

  if (!summary) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-8 text-center"
      >
        <Activity className="size-8 text-cyan-400 mx-auto mb-3" />
        <h3 className="text-lg font-semibold text-white mb-2">
          {t("tacticalDashboard.emptyTitle")}
        </h3>
        <p className="text-sm text-slate-400 max-w-md mx-auto mb-5">
          {t("tacticalDashboard.emptyDescription")}
        </p>
        {uploadTargetPlayerId && (
          <Button onClick={() => setUploadOpen(true)} size="lg">
            <Video className="size-4 mr-2" />
            {t("tacticalDashboard.uploadMatchVideo")}
          </Button>
        )}

        <AnalysisVideoUploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          playerId={uploadTargetPlayerId ?? ""}
          playerName={uploadTargetPlayerName}
          subtitle={t("tacticalDashboard.uploadSubtitle")}
          helperText={t("tacticalDashboard.uploadHelperText")}
          successDescription={t("tacticalDashboard.uploadSuccessDescription")}
          invalidateKeys={[["tactical"]]}
        />
      </motion.div>
    );
  }

  // Pick the team heatmap for the active phase
  const teamHm = summary.teamHeatmaps.find((h) => h.phaseType === activePhase);
  const playerHms = summary.playerHeatmaps.filter((h) => h.phaseType === activePhase);

  async function handleGenerateInsights() {
    try {
      await generateInsights.mutateAsync({ matchId });
      toast.success(t("tacticalDashboard.insightsGenerated"));
    } catch (err) {
      toast.error(t("tacticalDashboard.insightsError"), {
        description: err instanceof Error ? err.message : t("tacticalDashboard.errorFallback"),
      });
    }
  }

  return (
    <div className="space-y-5">
      {/* Header */}
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="rounded-xl border border-white/10 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 p-4"
      >
        <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
          <div>
            <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
              <Activity className="size-3 mr-1 inline" />
              {t("tacticalDashboard.tacticalAnalysis")}
            </Badge>
            <h2 className="text-base font-semibold text-white mt-1.5">
              {t("tacticalDashboard.matchLabel")} {matchId.slice(0, 8)}
            </h2>
          </div>
          <div className="flex gap-2">
            {uploadTargetPlayerId && (
              <Button
                size="sm"
                variant="outline"
                onClick={() => setUploadOpen(true)}
                className="border-cyan-500/30 hover:bg-cyan-500/10"
              >
                <Video className="size-3.5 mr-1" />
                {t("tacticalDashboard.uploadVideo")}
              </Button>
            )}
            {!summary.insights && (
              <Button
                size="sm"
                onClick={handleGenerateInsights}
                disabled={generateInsights.isPending}
                className="bg-gradient-to-br from-cyan-600 to-purple-600 hover:opacity-90"
              >
                {generateInsights.isPending ? (
                  <Loader2 className="size-3.5 mr-1 animate-spin" />
                ) : (
                  <Sparkles className="size-3.5 mr-1" />
                )}
                {t("tacticalDashboard.generateInsights")}
              </Button>
            )}
            {summary.insights && (
              <Button
                size="sm"
                variant="outline"
                onClick={handleGenerateInsights}
                disabled={generateInsights.isPending}
              >
                <RefreshCw className={`size-3.5 mr-1 ${generateInsights.isPending ? "animate-spin" : ""}`} />
                {t("tacticalDashboard.regenerate")}
              </Button>
            )}
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tacticalDashboard.possession")}</div>
            <div className="text-xl font-bold text-white tabular-nums">{summary.possessionPct}%</div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tacticalDashboard.players")}</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {new Set(summary.playerHeatmaps.map((h) => h.playerId)).size}
            </div>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">{t("tacticalDashboard.phases")}</div>
            <div className="text-xl font-bold text-white tabular-nums">
              {Object.values(summary.phaseDurations).filter((s) => s > 5).length}/6
            </div>
          </div>
        </div>
      </motion.div>

      {/* Phase selector */}
      <PhaseSelector
        phaseDurations={summary.phaseDurations}
        active={activePhase}
        onChange={setActivePhase}
      />

      {/* Team heatmap */}
      <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-medium text-white">{t("tacticalDashboard.teamHeatmap")}</h3>
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setShowPlayers(!showPlayers)}
            className="text-xs"
          >
            <UsersIcon className="size-3.5 mr-1" />
            {showPlayers ? t("tacticalDashboard.hidePlayers") : t("tacticalDashboard.showPlayers")}
          </Button>
        </div>
        {teamHm ? (
          <div className="flex justify-center">
            <PitchHeatmap
              bins={teamHm.bins}
              hotZones={teamHm.hotZones}
              height={320}
            />
          </div>
        ) : (
          <div className="text-sm text-slate-400 text-center py-8">
            {t("tacticalDashboard.noPhaseData")}
          </div>
        )}
      </div>

      {/* Player grid (toggleable) */}
      {showPlayers && (
        <div className="rounded-xl border border-white/10 bg-white/[0.02] p-4">
          <h3 className="text-sm font-medium text-white mb-3">
            {t("tacticalDashboard.playerHeatmapCount", { count: playerHms.length })}
          </h3>
          <PlayerHeatmapGrid heatmaps={playerHms} playerNames={playerNames} />
        </div>
      )}

      {/* Insights */}
      {summary.insights && <TacticalInsightsCard insights={summary.insights} />}

      {/* Video upload modal */}
      {uploadTargetPlayerId && (
        <AnalysisVideoUploadDialog
          open={uploadOpen}
          onClose={() => setUploadOpen(false)}
          playerId={uploadTargetPlayerId}
          playerName={uploadTargetPlayerName}
          subtitle={t("tacticalDashboard.uploadSubtitle")}
          helperText={t("tacticalDashboard.uploadHelperText")}
          successDescription={t("tacticalDashboard.uploadSuccessDescription")}
          invalidateKeys={[["tactical"]]}
        />
      )}
    </div>
  );
}
