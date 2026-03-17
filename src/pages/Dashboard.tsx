import { motion } from "framer-motion";
import { Activity, Users, Zap, TrendingUp, Camera, LayoutDashboard, GitCompareArrows, Settings } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { mockPlayers, mockMatches } from "@/lib/mockData";
import LiveMatchCard from "@/components/LiveMatchCard";
import PlayerCard from "@/components/PlayerCard";

const statCards = [
  { label: "Jugadores Activos", value: "147", icon: Users, change: "+12 hoy" },
  { label: "Drills Completados", value: "38", icon: Zap, change: "+8 hoy" },
  { label: "VSI Promedio", value: "76.4", icon: Activity, change: "+2.1" },
  { label: "Talentos Ocultos", value: "5", icon: TrendingUp, change: "PHV ajustado" },
];

const Dashboard = () => {
  const navigate = useNavigate();
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-24 space-y-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <motion.div variants={item} className="flex items-center justify-between">
        <div>
          <h1 className="font-display font-bold text-2xl text-foreground tracking-tight">
            VITAS<span className="text-primary">.</span>
          </h1>
          <p className="text-xs text-muted-foreground font-display tracking-wider uppercase">
            Centro de Inteligencia
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
          <span className="text-[10px] font-display text-primary uppercase tracking-widest">
            En vivo
          </span>
        </div>
      </motion.div>

      {/* Stats Grid */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <div key={stat.label} className="glass rounded-xl p-3">
              <div className="flex items-center gap-2 mb-2">
                <Icon size={14} className="text-primary" />
                <span className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">
                  {stat.label}
                </span>
              </div>
              <div className="font-display font-bold text-xl text-foreground">{stat.value}</div>
              <div className="text-[10px] text-primary font-medium">{stat.change}</div>
            </div>
          );
        })}
      </motion.div>

      {/* Quick Access Grid */}
      <motion.div variants={item} className="grid grid-cols-2 gap-3">
        <button
          onClick={() => navigate("/master")}
          className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 border border-transparent transition-all"
        >
          <LayoutDashboard size={20} className="text-primary" />
          <span className="font-display font-bold text-xs text-foreground">Master Dashboard</span>
          <span className="text-[9px] text-muted-foreground">Academy Intelligence</span>
        </button>
        <button
          onClick={() => navigate("/lab")}
          className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 border border-transparent transition-all"
        >
          <Camera size={20} className="text-primary" />
          <span className="font-display font-bold text-xs text-foreground">VITAS.LAB</span>
          <span className="text-[9px] text-muted-foreground">Video Analysis</span>
        </button>
        <button
          onClick={() => navigate("/compare")}
          className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 border border-transparent transition-all"
        >
          <GitCompareArrows size={20} className="text-electric" />
          <span className="font-display font-bold text-xs text-foreground">Comparison Tool</span>
          <span className="text-[9px] text-muted-foreground">Scout Analysis</span>
        </button>
        <button
          onClick={() => navigate("/settings")}
          className="glass rounded-xl p-4 flex flex-col items-center gap-2 hover:border-primary/30 border border-transparent transition-all"
        >
          <Settings size={20} className="text-gold" />
          <span className="font-display font-bold text-xs text-foreground">Configuración</span>
          <span className="text-[9px] text-muted-foreground">Ajustes</span>
        </button>
      </motion.div>

      {/* Live Matches */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Partidos
        </h2>
        <div className="flex gap-3 overflow-x-auto no-scrollbar snap-x snap-mandatory pb-1">
          {mockMatches.map((match) => (
            <LiveMatchCard key={match.id} match={match} />
          ))}
        </div>
      </motion.div>

      {/* Trending Players */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Talentos en Tendencia
        </h2>
        <div className="space-y-2">
          {mockPlayers
            .filter((p) => p.trending === "up")
            .slice(0, 4)
            .map((player) => (
              <PlayerCard key={player.id} player={player} />
            ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default Dashboard;
