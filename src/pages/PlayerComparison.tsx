import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft, Download, Share2, TrendingUp, Zap, Target, Brain, Users,
} from "lucide-react";
import { useAllPlayers } from "@/hooks/usePlayers";
import RadarChartComponent from "@/components/RadarChart";
import VsiGauge from "@/components/VsiGauge";
import TopNav from "@/components/TopNav";
import { PlayerListSkeleton } from "@/components/shared/Skeletons";
import { toast } from "sonner";
import {
  ResponsiveContainer,
  RadarChart as ReRadar,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  Legend,
} from "recharts";

const labelMap: Record<string, string> = {
  speed: "PACE",
  technique: "TÉC",
  vision: "VIS",
  stamina: "PHY",
  shooting: "DRI",
  defending: "DEF",
};

// ─── Animaciones ──────────────────────────────────────────────────────────────
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };
const item = { hidden: { opacity: 0, y: 24 }, show: { opacity: 1, y: 0, transition: { duration: 0.45 } } };

// ─── Vacío ───────────────────────────────────────────────────────────────────
function EmptyState({ navigate }: { navigate: ReturnType<typeof useNavigate> }) {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] gap-4 px-8 text-center">
      <Users size={40} className="text-muted-foreground" />
      <p className="font-display font-bold text-lg text-foreground">Necesitas al menos 2 jugadores</p>
      <p className="text-sm text-muted-foreground">Agrega jugadores en Rankings para comparar.</p>
      <button
        onClick={() => navigate("/rankings")}
        className="px-5 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold"
      >
        Ir al Ranking
      </button>
    </div>
  );
}

// ─── Componente principal ─────────────────────────────────────────────────────
const PlayerComparison = () => {
  const navigate = useNavigate();
  const [playerAIndex, setPlayerAIndex] = useState(0);
  const [playerBIndex, setPlayerBIndex] = useState(1);

  const { data: allPlayers, isLoading } = useAllPlayers();
  const players = allPlayers ?? [];

  if (isLoading) {
    return (
      <div className="min-h-screen pb-24">
        <TopNav />
        <div className="max-w-5xl mx-auto px-4 pt-8">
          <PlayerListSkeleton count={3} />
        </div>
      </div>
    );
  }

  if (players.length < 2) {
    return (
      <div className="min-h-screen pb-24">
        <TopNav />
        <EmptyState navigate={navigate} />
      </div>
    );
  }

  // Asegurar índices válidos
  const safeAIndex = Math.min(playerAIndex, players.length - 1);
  const safeBIndex = Math.min(playerBIndex, players.length - 1);

  const playerA = players[safeAIndex];
  const playerB = players[safeBIndex];

  // Radar superpuesto
  const radarData = Object.entries(playerA.stats).map(([key, value]) => ({
    stat: labelMap[key] || key,
    playerA: value,
    playerB: (playerB.stats as Record<string, number>)[key] ?? 0,
    fullMark: 100,
  }));

  // PHV labels
  const phvLabel = (cat: string) =>
    cat === "early" ? "PRECOZ" : cat === "late" ? "TARDÍO" : "NORMAL";

  const phvTagA = phvLabel(playerA.phvCategory);
  const phvTagB = phvLabel(playerB.phvCategory);

  // Métricas de comparación
  const metrics = [
    {
      id: "vaep",
      name: "VAEP per 90",
      description: "Valor estimado de acciones por 90 minutos",
      icon: <TrendingUp size={18} className="text-primary" />,
      getValueA: () =>
        +(((playerA.stats.technique + playerA.stats.vision) / 200) * 0.9 + 0.1).toFixed(3),
      getValueB: () =>
        +(((playerB.stats.technique + playerB.stats.vision) / 200) * 0.9 + 0.1).toFixed(3),
      format: (v: number) => v.toFixed(3),
    },
    {
      id: "sprints",
      name: "Sprint Count",
      description: "Acciones de alta intensidad >25km/h",
      icon: <Zap size={18} className="text-gold" />,
      getValueA: () => +(playerA.stats.speed * 0.26 + 1).toFixed(1),
      getValueB: () => +(playerB.stats.speed * 0.26 + 1).toFixed(1),
      format: (v: number) => v.toFixed(1),
    },
    {
      id: "ubi",
      name: "UBI Index",
      description: "Índice de sesgo biológico corregido",
      icon: <Target size={18} className="text-electric" />,
      getValueA: () =>
        Math.round(playerA.vsi * 0.85 + (playerA.phvCategory === "late" ? 5 : -3)),
      getValueB: () =>
        Math.round(playerB.vsi * 0.85 + (playerB.phvCategory === "late" ? 5 : -3)),
    },
  ];

  const getMetricLabel = (val: number, isWinner: boolean, metricId: string) => {
    if (metricId === "ubi") {
      if (val > 80) return "TALENTO REAL";
      if (val > 65) return "SESGO MEDIO";
      return "SESGO ALTO";
    }
    return isWinner ? "SUPERIOR" : "POR DEBAJO";
  };

  // IA winner
  const aiWinner = playerA.vsi >= playerB.vsi ? playerA : playerB;
  const probabilityElite = (
    aiWinner.vsi * 0.95 +
    (aiWinner.phvCategory === "late" ? 5 : 0)
  ).toFixed(1);

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-screen pb-24">
      <TopNav />

      {/* Header */}
      <motion.div variants={item} className="px-4 pt-6 max-w-5xl mx-auto">
        <div className="flex items-center justify-between">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground mb-2 transition-colors"
            >
              <ArrowLeft size={14} /> Volver
            </button>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-primary">
              Análisis Predictivo
            </span>
            <h1 className="font-display font-bold text-3xl text-foreground italic">
              Scout Comparison Tool
            </h1>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => toast.info("Exportar PDF disponible en Fase 2")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-display font-medium text-foreground hover:bg-secondary transition-colors"
            >
              <Download size={16} />
              Exportar
            </button>
            <button
              onClick={() => toast.info("Compartir disponible en Fase 3")}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/90 transition-colors"
            >
              <Share2 size={16} />
              Compartir
            </button>
          </div>
        </div>
      </motion.div>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Selectores + Radar superpuesto */}
        <motion.div variants={item} className="glass rounded-2xl p-6">
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-4 items-center">
            {/* Jugador A */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-24 h-24 rounded-xl bg-secondary border border-border flex items-center justify-center">
                <span className="text-3xl font-display font-bold text-muted-foreground">
                  {playerA.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
              </div>
              <VsiGauge value={playerA.vsi} size="sm" />
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">{playerA.name}</h3>
                <p className="text-xs text-primary font-display font-semibold">
                  {playerA.positionShort} · {playerA.age}a · {playerA.academy}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <span className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider border border-border text-foreground bg-secondary">
                  {phvTagA}
                </span>
              </div>
              <select
                value={safeAIndex}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val === safeBIndex) return;
                  setPlayerAIndex(val);
                }}
                className="mt-2 bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs font-display text-foreground w-full"
              >
                {players.map((p, i) => (
                  <option key={p.id} value={i} disabled={i === safeBIndex}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Radar superpuesto */}
            <div>
              <ResponsiveContainer width="100%" height={320}>
                <ReRadar data={radarData}>
                  <PolarGrid stroke="hsl(225, 18%, 22%)" />
                  <PolarAngleAxis
                    dataKey="stat"
                    tick={{ fill: "hsl(220, 12%, 55%)", fontSize: 12, fontFamily: "Rajdhani", fontWeight: 600 }}
                  />
                  <Radar
                    name={playerA.name.split(" ")[0]}
                    dataKey="playerA"
                    stroke="hsl(230, 70%, 58%)"
                    fill="hsl(230, 70%, 58%)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Radar
                    name={playerB.name.split(" ")[0]}
                    dataKey="playerB"
                    stroke="hsl(270, 60%, 55%)"
                    fill="hsl(270, 60%, 55%)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                  <Legend wrapperStyle={{ fontFamily: "Rajdhani", fontSize: 12, color: "hsl(220, 12%, 55%)" }} />
                </ReRadar>
              </ResponsiveContainer>
            </div>

            {/* Jugador B */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-24 h-24 rounded-xl bg-secondary border border-border flex items-center justify-center">
                <span className="text-3xl font-display font-bold text-muted-foreground">
                  {playerB.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
              </div>
              <VsiGauge value={playerB.vsi} size="sm" />
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">{playerB.name}</h3>
                <p className="text-xs text-primary font-display font-semibold">
                  {playerB.positionShort} · {playerB.age}a · {playerB.academy}
                </p>
              </div>
              <div className="flex gap-2 flex-wrap justify-center">
                <span className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider border border-border text-foreground bg-secondary">
                  {phvTagB}
                </span>
              </div>
              <select
                value={safeBIndex}
                onChange={(e) => {
                  const val = Number(e.target.value);
                  if (val === safeAIndex) return;
                  setPlayerBIndex(val);
                }}
                className="mt-2 bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs font-display text-foreground w-full"
              >
                {players.map((p, i) => (
                  <option key={p.id} value={i} disabled={i === safeAIndex}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Tabla de métricas */}
        <motion.div variants={item} className="glass rounded-2xl overflow-hidden">
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-border">
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Métrica
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground text-center">
              {playerA.name.split(" ")[0]}
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Δ
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground text-center">
              {playerB.name.split(" ")[0]}
            </span>
          </div>

          {metrics.map((metric) => {
            const valA = metric.getValueA();
            const valB = metric.getValueB();
            const diff = +(valA - valB).toFixed(2);
            const aWins = valA >= valB;
            const fmt = metric.format || ((v: number) => String(v));

            return (
              <div
                key={metric.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-5 border-b border-border last:border-b-0 items-center"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                    {metric.icon}
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-sm text-foreground">{metric.name}</h4>
                    <p className="text-[10px] text-muted-foreground">{metric.description}</p>
                  </div>
                </div>

                {/* Valor A */}
                <div className="text-center">
                  <div className={`inline-block px-3 py-2 rounded-lg border ${aWins ? "border-primary/30 bg-primary/5" : "border-border bg-secondary"}`}>
                    <span className={`font-display font-bold text-2xl ${aWins ? "text-primary" : "text-foreground"}`}>
                      {fmt(valA)}
                    </span>
                  </div>
                  <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mt-1">
                    {getMetricLabel(valA, aWins, metric.id)}
                  </p>
                </div>

                {/* Diferencial */}
                <div className="text-center">
                  <span className="text-sm font-display font-semibold text-primary">
                    {diff > 0 ? `+${Math.abs(diff)}` : diff < 0 ? `-${Math.abs(diff)}` : "0"}
                  </span>
                  <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden mx-4">
                    <motion.div
                      className="h-full rounded-full bg-electric"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, Math.abs(diff) * 20 + 30)}%` }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Valor B */}
                <div className="text-center">
                  <div className={`inline-block px-3 py-2 rounded-lg border ${!aWins ? "border-electric/30 bg-electric/5" : "border-border bg-secondary"}`}>
                    <span className={`font-display font-bold text-2xl ${!aWins ? "text-electric" : "text-foreground"}`}>
                      {fmt(valB)}
                    </span>
                  </div>
                  <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mt-1">
                    {getMetricLabel(valB, !aWins, metric.id)}
                  </p>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* Insight IA */}
        <motion.div variants={item} className="grid grid-cols-[3fr_2fr] gap-4">
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain size={18} className="text-primary" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">Análisis Comparativo</h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Comparando a{" "}
              <span className="font-semibold text-foreground">{playerA.name}</span> y{" "}
              <span className="font-semibold text-foreground">{playerB.name}</span>, el filtro
              de sesgo biológico indica que{" "}
              <span className="text-primary font-bold">{aiWinner.name}</span> tiene mayor techo
              de desarrollo. Su estado de maduración{" "}
              <span className="font-bold text-foreground">
                {aiWinner.phvCategory === "late"
                  ? "TARDÍO"
                  : aiWinner.phvCategory === "early"
                  ? "PRECOZ"
                  : "NORMAL"}
              </span>{" "}
              indica que el modelo proyecta una probabilidad del{" "}
              <span className="text-primary font-bold">{probabilityElite}%</span> de alcanzar
              nivel elite en 36 meses.
            </p>
          </div>

          <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Recomendación
            </span>
            <h2 className="font-display font-bold text-4xl text-electric leading-tight mb-1">
              {aiWinner.name.split(" ")[0].toUpperCase()}
            </h2>
            <h2 className="font-display font-bold text-2xl text-electric leading-tight mb-3">
              {(aiWinner.name.split(" ")[1] ?? "").toUpperCase()}
            </h2>
            <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              Alta prioridad · Seguimiento recomendado
            </p>
            <button
              onClick={() => navigate(`/player/${aiWinner.id}`)}
              className="w-full px-4 py-2.5 rounded-lg border border-border text-sm font-display font-bold text-foreground hover:bg-secondary transition-colors uppercase tracking-wider"
            >
              Ver Perfil Completo
            </button>
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div variants={item} className="flex items-center justify-between text-[10px] text-muted-foreground font-display px-2 pb-4">
          <span>VITAS ENGINE: <span className="text-primary">ACTIVO</span></span>
          <span>© 2026 VITAS · Football Intelligence</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default PlayerComparison;
