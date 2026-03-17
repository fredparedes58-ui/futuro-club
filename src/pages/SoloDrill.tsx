import { motion } from "framer-motion";
import { Camera, Play, ChevronRight, Trophy, Flame } from "lucide-react";
import { mockDrillCategories, mockPlayers } from "@/lib/mockData";

const SoloDrill = () => {
  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.06 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const colorMap: Record<string, string> = {
    neon: "from-primary/20 to-primary/5 border-primary/20",
    electric: "from-electric/20 to-electric/5 border-electric/20",
    gold: "from-gold/20 to-gold/5 border-gold/20",
    accent: "from-accent/20 to-accent/5 border-accent/20",
    danger: "from-danger/20 to-danger/5 border-danger/20",
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
        <h1 className="font-display font-bold text-2xl text-foreground">
          Solo Drill<span className="text-primary">.</span>
        </h1>
        <p className="text-xs text-muted-foreground font-display tracking-wider uppercase">
          Análisis biomecánico individual
        </p>
      </motion.div>

      {/* Record CTA */}
      <motion.div
        variants={item}
        whileTap={{ scale: 0.97 }}
        className="relative overflow-hidden rounded-2xl border border-primary/30 p-6 cursor-pointer group"
      >
        <div className="absolute inset-0 bg-gradient-to-br from-primary/10 to-transparent" />
        <div className="relative flex items-center gap-4">
          <div className="w-14 h-14 rounded-full bg-primary/20 flex items-center justify-center neon-glow">
            <Camera size={24} className="text-primary" />
          </div>
          <div className="flex-1">
            <h2 className="font-display font-bold text-lg text-foreground">
              Grabar Nuevo Drill
            </h2>
            <p className="text-xs text-muted-foreground">
              Apunta con tu cámara y Vitas analiza tu técnica en tiempo real
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
              className={`rounded-xl border bg-gradient-to-br p-4 cursor-pointer ${
                colorMap[cat.color] || colorMap.neon
              }`}
            >
              <div className="text-2xl mb-2">{cat.icon}</div>
              <h3 className="font-display font-semibold text-sm text-foreground">
                {cat.name}
              </h3>
              <p className="text-[10px] text-muted-foreground">
                {cat.drillCount} drills disponibles
              </p>
            </motion.div>
          ))}
        </div>
      </motion.div>

      {/* Recent Activity */}
      <motion.div variants={item}>
        <div className="flex items-center gap-2 mb-3">
          <Flame size={14} className="text-primary" />
          <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            Actividad Reciente
          </h2>
        </div>
        <div className="space-y-2">
          {mockPlayers.slice(0, 3).map((player) => (
            <div
              key={player.id}
              className="glass rounded-xl p-3 flex items-center justify-between"
            >
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-secondary flex items-center justify-center font-display text-xs font-bold text-primary">
                  {player.avatar}
                </div>
                <div>
                  <p className="text-sm font-display font-medium text-foreground">
                    {player.name}
                  </p>
                  <p className="text-[10px] text-muted-foreground">
                    {player.recentDrills} drills · {player.lastActive}
                  </p>
                </div>
              </div>
              <div className="flex items-center gap-1">
                <Trophy size={12} className="text-gold" />
                <span className="text-xs font-display font-bold text-gold">
                  {player.recentDrills}
                </span>
              </div>
            </div>
          ))}
        </div>
      </motion.div>
    </motion.div>
  );
};

export default SoloDrill;
