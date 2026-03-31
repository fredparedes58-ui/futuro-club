import { useMemo } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { Camera, Play, Trophy, Flame, Lock, ChevronRight, Users } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { mockDrillCategories } from "@/lib/mockData";
import { PlayerService } from "@/services/real/playerService";
import { adaptPlayerForUI } from "@/services/real/adapters";
import { toast } from "sonner";

const colorMap: Record<string, string> = {
  neon:     "from-primary/20 to-primary/5 border-primary/20",
  electric: "from-electric/20 to-electric/5 border-electric/20",
  gold:     "from-gold/20 to-gold/5 border-gold/20",
  accent:   "from-accent/20 to-accent/5 border-accent/20",
  danger:   "from-destructive/20 to-destructive/5 border-destructive/20",
};

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, y: 20 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };

const SoloDrill = () => {
  const navigate = useNavigate();

  // Actividad reciente con jugadores reales
  const recentPlayers = useMemo(() => {
    PlayerService.seedIfEmpty();
    return PlayerService.getAll().slice(0, 3).map(adaptPlayerForUI);
  }, []);

  const handleRecord = () => {
    toast.info("🎥 Grabación disponible en Fase 2", {
      description: "En Fase 2 podrás grabar desde la cámara y analizar en tiempo real.",
      duration: 4000,
    });
  };

  const handleDrillCategory = (name: string) => {
    toast.info(`📋 Categoría: ${name}`, {
      description: "Drills individuales disponibles en Fase 2 con análisis biomecánico.",
      duration: 3000,
    });
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-24 space-y-6 max-w-lg mx-auto"
    >
      {/* Header */}
      <motion.div variants={item}>
        <PageHeader title="Solo Drill" subtitle="Análisis biomecánico individual" />
      </motion.div>

      {/* Fase 2 Banner */}
      <motion.div variants={item} className="glass rounded-xl p-3 border border-primary/20 flex items-center gap-3">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Lock size={14} className="text-primary" />
        </div>
        <div>
          <p className="text-xs font-display font-semibold text-foreground">Módulo activo en Fase 2</p>
          <p className="text-[10px] text-muted-foreground">Grabación con cámara + análisis IA disponibles pronto</p>
        </div>
        <span className="ml-auto text-[9px] font-display font-bold uppercase tracking-wider px-2 py-1 rounded bg-primary/10 text-primary shrink-0">
          PRÓXIMO
        </span>
      </motion.div>

      {/* Record CTA */}
      <motion.div
        variants={item}
        whileTap={{ scale: 0.97 }}
        onClick={handleRecord}
        className="relative overflow-hidden rounded-2xl border border-primary/30 p-6 cursor-pointer group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center">
            <Camera size={24} className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-bold text-lg text-foreground">Grabar Nuevo Drill</h2>
            <p className="text-xs text-muted-foreground">
              Apunta con tu cámara y VITAS analiza tu técnica en tiempo real
            </p>
          </div>
          <Play size={20} className="text-primary group-hover:scale-110 transition-transform" />
        </div>
      </motion.div>

      {/* Drill Categories */}
      <motion.div variants={item}>
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider mb-3">
          Categorías de Drill
        </h2>
        <div className="grid grid-cols-2 gap-3">
          {mockDrillCategories.map((cat) => (
            <motion.div
              key={cat.id}
              whileTap={{ scale: 0.96 }}
              onClick={() => handleDrillCategory(cat.name)}
              className={`rounded-xl border bg-gradient-to-br p-4 cursor-pointer transition-opacity hover:opacity-80 ${
                colorMap[cat.color] || colorMap.neon
              }`}
            >
              <div className="text-2xl mb-2">{cat.icon}</div>
              <h3 className="font-display font-semibold text-sm text-foreground">{cat.name}</h3>
              <p className="text-[10px] text-muted-foreground">{cat.drillCount} drills disponibles</p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Actividad Reciente con jugadores reales */}
      <motion.div variants={item}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Flame size={14} className="text-primary" />
            <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
              Actividad Reciente
            </h2>
          </div>
          <button
            onClick={() => navigate("/rankings")}
            className="text-[10px] text-primary font-display font-semibold hover:underline flex items-center gap-1"
          >
            Ver todos <ChevronRight size={10} />
          </button>
        </div>

        {recentPlayers.length === 0 ? (
          <div className="glass rounded-xl p-6 text-center space-y-2">
            <Users size={24} className="text-muted-foreground mx-auto" />
            <p className="text-sm font-display font-semibold text-foreground">Sin actividad registrada</p>
            <p className="text-xs text-muted-foreground">Agrega jugadores para ver su actividad aquí</p>
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
                onClick={() => navigate(`/player/${player.id}`)}
                className="glass rounded-xl p-3 flex items-center justify-between cursor-pointer hover:border-primary/30 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
                    <span className="text-xs font-display font-bold text-muted-foreground">
                      {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                    </span>
                  </div>
                  <div>
                    <p className="text-sm font-display font-medium text-foreground">{player.name}</p>
                    <p className="text-[10px] text-muted-foreground">
                      {player.recentDrills} drills · {player.positionShort}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Trophy size={12} className="text-gold" />
                  <span className="text-xs font-display font-bold text-gold">{player.recentDrills}</span>
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
