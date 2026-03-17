import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ArrowLeft, TrendingUp, Brain, Dna, Zap } from "lucide-react";
import { mockPlayers } from "@/lib/mockData";
import VsiGauge from "@/components/VsiGauge";
import RadarChartComponent from "@/components/RadarChart";

const PlayerProfile = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const player = mockPlayers.find((p) => p.id === id) || mockPlayers[0];

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.08 } },
  };
  const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  const phvInfo = {
    early: { label: "Madurador Precoz", color: "text-gold", desc: "Ventaja física temporal. VSI corregido a la baja." },
    "on-time": { label: "Maduración Normal", color: "text-electric", desc: "Desarrollo acorde a su edad cronológica." },
    late: { label: "Madurador Tardío", color: "text-primary", desc: "Potencial oculto. VSI corregido al alza. ⭐" },
  };
  const phv = phvInfo[player.phvCategory];

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="px-4 pt-4 pb-24 space-y-5 max-w-lg mx-auto"
    >
      {/* Back button */}
      <motion.button
        variants={item}
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        <span className="font-display">Volver</span>
      </motion.button>

      {/* Player Header */}
      <motion.div variants={item} className="flex items-center gap-4">
        <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-primary/30">
          <img src={player.image} alt={player.name} className="w-full h-full object-cover grayscale" />
        </div>
        <div className="flex-1">
          <h1 className="font-display font-bold text-2xl text-foreground">{player.name}</h1>
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <span className="text-electric font-display font-semibold">{player.position}</span>
            <span>·</span>
            <span>{player.age} años</span>
            <span>·</span>
            <span>{player.academy}</span>
          </div>
        </div>
        <VsiGauge value={player.vsi} size="md" />
      </motion.div>

      {/* PHV Banner */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Dna size={14} className={phv.color} />
          <span className={`text-xs font-display font-semibold uppercase tracking-wider ${phv.color}`}>
            {phv.label}
          </span>
          <span className="text-[10px] text-muted-foreground ml-auto">
            PHV Offset: {player.phvOffset > 0 ? "+" : ""}{player.phvOffset}
          </span>
        </div>
        <p className="text-xs text-muted-foreground">{phv.desc}</p>
        <div className="mt-3 h-2 rounded-full bg-muted overflow-hidden">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-gold via-electric to-primary"
            initial={{ width: 0 }}
            animate={{ width: `${((player.phvOffset + 2) / 4) * 100}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
          />
        </div>
        <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
          <span>Precoz (-2.0)</span>
          <span>Normal (0)</span>
          <span>Tardío (+2.0)</span>
        </div>
      </motion.div>

      {/* Radar Chart */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-2">
          <Brain size={14} className="text-electric" />
          <h2 className="font-display font-semibold text-sm text-foreground">
            Perfil Técnico
          </h2>
          <span className="text-[10px] text-muted-foreground ml-auto">Ajustado por PHV</span>
        </div>
        <RadarChartComponent stats={player.stats} />
      </motion.div>

      {/* Stats Breakdown */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Zap size={14} className="text-primary" />
          <h2 className="font-display font-semibold text-sm text-foreground">
            Métricas Detalladas
          </h2>
        </div>
        <div className="space-y-3">
          {Object.entries(player.stats).map(([key, value]) => {
            const labels: Record<string, string> = {
              speed: "Velocidad",
              technique: "Técnica",
              vision: "Visión",
              stamina: "Resistencia",
              shooting: "Disparo",
              defending: "Defensa",
            };
            const getBarColor = (v: number) => {
              if (v >= 85) return "bg-primary";
              if (v >= 70) return "bg-electric";
              if (v >= 50) return "bg-gold";
              return "bg-danger";
            };
            return (
              <div key={key}>
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-muted-foreground font-display">
                    {labels[key] || key}
                  </span>
                  <span className="text-xs font-display font-bold text-foreground">{value}</span>
                </div>
                <div className="h-1.5 rounded-full bg-muted overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${getBarColor(value)}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${value}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </motion.div>

      {/* Recent Activity */}
      <motion.div variants={item} className="glass rounded-xl p-4">
        <h2 className="font-display font-semibold text-sm text-foreground mb-2">
          Actividad
        </h2>
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>{player.recentDrills} drills esta semana</span>
          <span>Última actividad: {player.lastActive}</span>
        </div>
        <div className="flex items-center gap-2 mt-3">
          <TrendingUp size={14} className="text-primary" />
          <span className="text-xs text-primary font-display font-medium">
            Tendencia: {player.trending === "up" ? "En ascenso 📈" : player.trending === "down" ? "En descenso 📉" : "Estable ➡️"}
          </span>
        </div>
      </motion.div>
    </motion.div>
  );
};

export default PlayerProfile;
