import { motion } from "framer-motion";
import { Activity, Users, Zap, TrendingUp, Camera, LayoutDashboard, GitCompareArrows, Settings } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useNavigate } from "react-router-dom";
import { useDashboardStats, useTrendingPlayers, useLiveMatches } from "@/hooks/useDashboard";
import { DashboardStatsSkeleton, MatchesSkeleton, PlayerListSkeleton } from "@/components/shared/Skeletons";
import LiveMatchCard from "@/components/LiveMatchCard";
import PlayerCard from "@/components/PlayerCard";
import { toast } from "sonner";

const statIcons = [Users, Zap, Activity, TrendingUp];
const statLabels = ["Jugadores Activos", "Drills Completados", "VSI Promedio", "Talentos Ocultos"];
const statChanges = ["+12 hoy", "+8 hoy", "+2.1", "PHV ajustado"];

const Dashboard = () => {
  const navigate = useNavigate();
  const { data: stats, isLoading: statsLoading, isError: statsError } = useDashboardStats();
  const { data: players, isLoading: playersLoading, isError: playersError } = useTrendingPlayers();
  const { data: matches, isLoading: matchesLoading, isError: matchesError } = useLiveMatches();

  if (statsError) toast.error("No se pudieron cargar las estadísticas");
  if (playersError) toast.error("No se pudieron cargar los jugadores en tendencia");
  if (matchesError) toast.error("No se pudieron cargar los partidos");

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
          subtitle="Centro de Inteligencia"
          rightContent={
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
              <span className="text-[10px] font-display text-primary uppercase tracking-widest">En vivo</span>
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
            {statLabels.map((label, i) => {
              const Icon = statIcons[i];
              return (
                <div key={label} className="glass rounded-xl p-3">
                  <div className="flex items-center gap-2 mb-2">
                    <Icon size={14} className="text-primary" />
                    <span className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{label}</span>
                  </div>
                  <div className="font-display font-bold text-xl text-foreground">{statValues[i]}</div>
                  <div className="text-[10px] text-primary font-medium">{statChanges[i]}</div>
                </div>
              );
            })}
          </div>
        )}
      </motion.div>

      {/* Quick Access */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        {[
          { path: "/master", icon: LayoutDashboard, label: "Master Dashboard", sub: "Academy Intelligence", color: "text-primary" },
          { path: "/lab", icon: Camera, label: "VITAS.LAB", sub: "Video Analysis", color: "text-primary" },
          { path: "/compare", icon: GitCompareArrows, label: "Comparison Tool", sub: "Scout Analysis", color: "text-electric" },
          { path: "/settings", icon: Settings, label: "Configuración", sub: "Ajustes", color: "text-gold" },
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
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">Partidos</h2>
        {matchesLoading ? (
          <MatchesSkeleton />
        ) : matches?.length ? (
          <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
            {matches.map((match) => <LiveMatchCard key={match.id} match={match} />)}
          </div>
        ) : (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No hay partidos programados</p>
          </div>
        )}
      </motion.div>

      {/* Trending Players */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">Talentos en Tendencia</h2>
        {playersLoading ? (
          <PlayerListSkeleton count={4} />
        ) : players?.length ? (
          <div className="space-y-2">
            {players.map((player) => <PlayerCard key={player.id} player={player} />)}
          </div>
        ) : (
          <div className="glass rounded-xl p-6 text-center">
            <p className="text-sm text-muted-foreground">No hay jugadores en tendencia</p>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
