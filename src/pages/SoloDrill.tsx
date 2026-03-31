/**
 * VITAS · SoloDrill
 * Sesiones individuales de entrenamiento + acceso rápido a Intelligence.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Camera, Play, Zap, ChevronRight,
  Users, Target, Brain, TrendingUp, Upload,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { PlayerService } from "@/services/real/playerService";
import { adaptPlayerForUI } from "@/services/real/adapters";

const DRILL_CATEGORIES = [
  { id: "tecnica", label: "Técnica", icon: "⚽", desc: "Control, pase, regate", color: "from-primary/20 to-primary/5 border-primary/20" },
  { id: "tactica", label: "Táctica", icon: "🧠", desc: "Posicionamiento, decisiones", color: "from-violet-500/20 to-violet-500/5 border-violet-500/20" },
  { id: "fisico",  label: "Físico",  icon: "⚡", desc: "Velocidad, resistencia", color: "from-amber-500/20 to-amber-500/5 border-amber-500/20" },
  { id: "disparo", label: "Disparo", icon: "🎯", desc: "Potencia y precisión", color: "from-red-500/20 to-red-500/5 border-red-500/20" },
];

const QUICK_ACTIONS = [
  { label: "Ver Rankings",        icon: TrendingUp, path: "/rankings",     color: "text-primary" },
  { label: "Comparar Jugadores",  icon: Target,     path: "/compare",      color: "text-electric" },
  { label: "Intelligence Report", icon: Brain,      path: null,            color: "text-gold" },
  { label: "Subir Video",         icon: Upload,     path: "/reports",      color: "text-violet-400" },
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const SoloDrill = () => {
  const navigate = useNavigate();

  const recentPlayers = useMemo(() => {
    PlayerService.seedIfEmpty();
    return PlayerService.getAll().slice(0, 5).map(adaptPlayerForUI);
  }, []);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-24 space-y-6 max-w-lg mx-auto">

      {/* Header */}
      <motion.div variants={item}>
        <PageHeader title="Solo Drill" subtitle="Sesiones individuales de entrenamiento" />
      </motion.div>

      {/* Record CTA */}
      <motion.div
        variants={item}
        whileTap={{ scale: 0.97 }}
        onClick={() => navigate("/reports")}
        className="relative overflow-hidden rounded-2xl border border-primary/30 p-6 cursor-pointer group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <Camera size={24} className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-bold text-lg text-foreground">Subir Video de Entrenamiento</h2>
            <p className="text-xs text-muted-foreground">
              Sube un video y VITAS genera el informe de inteligencia con IA
            </p>
          </div>
          <Play size={20} className="text-primary group-hover:scale-110 transition-transform" />
        </div>
      </motion.div>

      {/* Categorías de drill */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Categorías de Entrenamiento
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {DRILL_CATEGORIES.map((cat) => (
            <motion.div
              key={cat.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => navigate("/reports")}
              className={`rounded-xl border bg-gradient-to-br p-4 cursor-pointer transition-opacity hover:opacity-80 ${cat.color}`}
            >
              <div className="text-2xl mb-2">{cat.icon}</div>
              <h3 className="font-display font-semibold text-sm text-foreground">{cat.label}</h3>
              <p className="text-[10px] text-muted-foreground">{cat.desc}</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Acciones rápidas */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Acciones Rápidas
        </h2>
        <div className="grid grid-cols-2 gap-2">
          {QUICK_ACTIONS.map((action) => {
            const Icon = action.icon;
            return (
              <button
                key={action.label}
                onClick={() => action.path ? navigate(action.path) : recentPlayers[0] && navigate(`/players/${recentPlayers[0].id}/intelligence`)}
                className="glass rounded-xl p-3 flex items-center gap-3 hover:border-primary/30 border border-transparent transition-all text-left"
              >
                <Icon size={16} className={action.color} />
                <span className="text-xs font-display font-medium text-foreground">{action.label}</span>
              </button>
            );
          })}
        </div>
      </motion.div>

      {/* Jugadores recientes */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Zap size={14} className="text-primary" />
            <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Mis Jugadores
            </h2>
          </div>
          <button
            onClick={() => navigate("/rankings")}
            className="text-[10px] text-primary font-display font-semibold flex items-center gap-1"
          >
            Ver todos <ChevronRight size={10} />
          </button>
        </div>

        {recentPlayers.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center space-y-2">
            <Users size={24} className="text-muted-foreground mx-auto" />
            <p className="text-sm font-display font-semibold text-foreground">Sin jugadores</p>
            <p className="text-xs text-muted-foreground">Agrega jugadores para iniciar sesiones de drill</p>
            <button
              onClick={() => navigate("/players/new")}
              className="text-xs text-primary font-display font-semibold hover:underline"
            >
              Agregar primer jugador →
            </button>
          </div>
        ) : (
          <div className="space-y-2">
            {recentPlayers.map((player) => (
              <motion.div
                key={player.id}
                whileTap={{ scale: 0.98 }}
                className="glass rounded-xl p-3 flex items-center gap-3"
              >
                <div className="w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center shrink-0">
                  <span className="text-xs font-display font-bold text-muted-foreground">
                    {player.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-medium text-foreground truncate">{player.name}</p>
                  <p className="text-[10px] text-muted-foreground">{player.positionShort} · VSI {player.vsi}</p>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => navigate(`/players/${player.id}/intelligence`)}
                    className="p-1.5 rounded-lg bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                    title="Intelligence"
                  >
                    <Brain size={12} />
                  </button>
                  <button
                    onClick={() => navigate(`/players/${player.id}/role-profile`)}
                    className="p-1.5 rounded-lg bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    title="Perfil de rol"
                  >
                    <Target size={12} />
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>
    </motion.div>
  );
};

export default SoloDrill;
