import React from "react";
import { motion } from "framer-motion";
import { Activity, Users, Zap, TrendingUp, Camera, LayoutDashboard, GitCompareArrows, Settings, Plus, Trophy } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useNavigate } from "react-router-dom";
import { useDashboardStats, useTrendingPlayers, useLiveMatches } from "@/hooks/useDashboard";
import { DashboardStatsSkeleton, MatchesSkeleton, PlayerListSkeleton } from "@/components/shared/Skeletons";
import LiveMatchCard from "@/components/LiveMatchCard";
import LiveFixtures from "@/components/LiveFixtures";
import PlayerCard from "@/components/PlayerCard";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useTranslation } from "react-i18next";

const statIcons = [Users, Zap, Activity, TrendingUp];
const statLabelKeys = ["dashboard.stats.activePlayers", "dashboard.stats.drillsCompleted", "dashboard.stats.avgVsi", "dashboard.stats.hiddenTalents"];
const statSubLabelKeys = ["dashboard.stats.activePlayersDesc", "dashboard.stats.drillsCompletedDesc", "dashboard.stats.avgVsiDesc", "dashboard.stats.hiddenTalentsDesc"];

const Dashboard = () => {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const { isDirector } = useUserProfile();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats();
  const { data: players, isLoading: playersLoading, isError: playersError } = useTrendingPlayers();
  const { data: matches, isLoading: matchesLoading, isError: matchesError } = useLiveMatches();

  // Show errors via useEffect to avoid calling toast during render
  const hasStatsError = statsError;
  const hasPlayersError = playersError;
  const hasMatchesError = matchesError;

  React.useEffect(() => {
    if (hasStatsError) toast.error(t("toasts.statsError"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasStatsError]);
  React.useEffect(() => {
    if (hasPlayersError) toast.error(t("toasts.trendingError"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasPlayersError]);
  React.useEffect(() => {
    if (hasMatchesError) toast.error(t("toasts.matchesError"));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [hasMatchesError]);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

  const statValues = stats
    ? [String(stats.activePlayers), String(stats.drillsCompleted), String(stats.avgVsi), String(stats.hiddenTalents)]
    : [];

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-24 space-y-6 max-w-lg mx-auto">
      {/* Header */}
      <motion.div variants={item}>
        <PageHeader
          title="VITAS."
          subtitle={t("dashboard.subtitle")}
          rightContent={
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
              <span className="text-[10px] font-display text-primary uppercase tracking-widest">{t("dashboard.live")}</span>
            </div>
          }
        />
      </motion.div>

      {/* Stats */}
      <motion.div variants={item}>
        {statsLoading ? (
          <DashboardStatsSkeleton />
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {statLabelKeys.map((labelKey, i) => {
              const Icon = statIcons[i];
              return (
                <div key={labelKey} className="glass rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className="text-primary" />
                    <span className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{t(labelKey)}</span>
                  </div>
                  <div className="font-display font-bold text-xl text-foreground">{statValues[i]}</div>
                  <div className="text-[10px] text-muted-foreground font-medium">{t(statSubLabelKeys[i])}</div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Quick Access */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        {[
          { path: "/master", icon: LayoutDashboard, label: t("dashboard.quickAccess.masterDashboard"), sub: t("dashboard.quickAccess.masterSub"), color: "text-primary" },
          { path: "/lab", icon: Camera, label: t("dashboard.quickAccess.vitasLab"), sub: t("dashboard.quickAccess.vitasLabSub"), color: "text-primary" },
          { path: "/compare", icon: GitCompareArrows, label: t("dashboard.quickAccess.comparisonTool"), sub: t("dashboard.quickAccess.comparisonToolSub"), color: "text-electric" },
          ...(isDirector ? [{ path: "/director", icon: Trophy, label: "Director", sub: t("dashboard.quickAccess.directorSub"), color: "text-gold" }] : [{ path: "/settings", icon: Settings, label: t("dashboard.quickAccess.config"), sub: t("dashboard.quickAccess.configSub"), color: "text-gold" }]),
        ].map(({ path, icon: Icon, label, sub, color }) => (
          <button
            key={path}
            onClick={() => navigate(path)}
            className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 border border-transparent transition-all"
          >
            <Icon size={20} className={color} />
            <span className="font-display font-bold text-xs text-foreground">{label}</span>
            <span className="text-[9px] text-muted-foreground">{sub}</span>
          </button>
        ))}
      </motion.div>

      {/* Matches */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">{t("dashboard.matches")}</h2>
        {matchesLoading ? (
          <MatchesSkeleton />
        ) : matches?.length ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
            {matches.map((match) => <LiveMatchCard key={match.id} match={match} />)}
          </div>
        ) : (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">{t("dashboard.noMatches")}</p>
          </div>
        )}
      </motion.div>

      {/* Fixtures en Vivo — Football-Data.org */}
      <motion.div variants={item}>
        <LiveFixtures compact />
      </motion.div>

      {/* Trending Players */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("dashboard.trendingPlayers")}</h2>
          <Button size="sm" variant="ghost" className="h-6 text-xs gap-1 text-primary" onClick={() => navigate("/players/new")}>
            <Plus size={11} /> {t("common.new")}
          </Button>
        </div>
        {playersLoading ? (
          <PlayerListSkeleton count={4} />
        ) : players?.length ? (
          <div className="space-y-2">
            {players.map((player) => <PlayerCard key={player.id} player={player} />)}
          </div>
        ) : (
          <div className="glass rounded-xl p-8 text-center space-y-3">
            <Users size={32} className="text-muted-foreground mx-auto" />
            <p className="font-display font-bold text-base text-foreground">{t("dashboard.noPlayers.title")}</p>
            <p className="text-xs text-muted-foreground">{t("dashboard.noPlayers.description")}</p>
            <Button size="sm" className="gap-1.5" onClick={() => navigate("/players/new")}>
              <Plus size={14} /> {t("dashboard.noPlayers.cta")}
            </Button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
