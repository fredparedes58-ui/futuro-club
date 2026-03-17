import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Download,
  Share2,
  TrendingUp,
  Zap,
  Target,
  Shield,
  Brain,
} from "lucide-react";
import { mockPlayers } from "@/lib/mockData";
import RadarChartComponent from "@/components/RadarChart";
import VsiGauge from "@/components/VsiGauge";
import TopNav from "@/components/TopNav";
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

interface ComparisonMetric {
  id: string;
  name: string;
  description: string;
  icon: React.ReactNode;
  getValueA: () => number;
  getValueB: () => number;
  format?: (v: number) => string;
}

const PlayerComparison = () => {
  const navigate = useNavigate();
  const [playerAIndex, setPlayerAIndex] = useState(0);
  const [playerBIndex, setPlayerBIndex] = useState(4);

  const playerA = mockPlayers[playerAIndex];
  const playerB = mockPlayers[playerBIndex];

  // Build overlaid radar data
  const radarData = Object.entries(playerA.stats).map(([key, value]) => ({
    stat: labelMap[key] || key,
    playerA: value,
    playerB: (playerB.stats as Record<string, number>)[key] || 0,
    fullMark: 100,
  }));

  // Comparison metrics
  const metrics: ComparisonMetric[] = [
    {
      id: "vaep",
      name: "VAEP per 90",
      description: "Valued Actions by Estimating Probabilities",
      icon: <TrendingUp size={18} className="text-primary" />,
      getValueA: () => +(((playerA.stats.technique + playerA.stats.vision) / 200) * 0.9 + 0.1).toFixed(3),
      getValueB: () => +(((playerB.stats.technique + playerB.stats.vision) / 200) * 0.9 + 0.1).toFixed(3),
      format: (v) => v.toFixed(3),
    },
    {
      id: "sprints",
      name: "Sprint Counts",
      description: "High Intensity Actions > 25km/h",
      icon: <Zap size={18} className="text-gold" />,
      getValueA: () => +(playerA.stats.speed * 0.26 + 1).toFixed(1),
      getValueB: () => +(playerB.stats.speed * 0.26 + 1).toFixed(1),
      format: (v) => v.toFixed(1),
    },
    {
      id: "ubi",
      name: "UBI Index",
      description: "Unified Bias Index · Biological Truth Filter",
      icon: <Target size={18} className="text-electric" />,
      getValueA: () => Math.round(playerA.vsi * 0.85 + (playerA.phvOffset > 0 ? -5 : 8)),
      getValueB: () => Math.round(playerB.vsi * 0.85 + (playerB.phvOffset > 0 ? -5 : 8)),
    },
  ];

  const getMetricLabel = (val: number, isWinner: boolean, metric: ComparisonMetric) => {
    if (metric.id === "vaep") {
      if (val > 0.8) return "ELITE RANGE";
      return isWinner ? "WINNER" : "BELOW AVG";
    }
    if (metric.id === "sprints") {
      return isWinner ? "ELITE RANGE" : "WINNER";
    }
    if (metric.id === "ubi") {
      if (val > 80) return "WINNER (REAL TALENT)";
      if (val > 65) return "BIAS RISK: MED";
      return "BIAS RISK: HIGH";
    }
    return "";
  };

  const phvTagA = playerA.phvCategory === "early" ? "PRECOZ" : playerA.phvCategory === "late" ? "TARDÍO" : "NORMAL";
  const phvTagB = playerB.phvCategory === "early" ? "PRECOZ" : playerB.phvCategory === "late" ? "TARDÍO" : "NORMAL";

  // AI Insight generation
  const aiWinner = playerA.vsi >= playerB.vsi ? playerA : playerB;
  const aiLoser = playerA.vsi >= playerB.vsi ? playerB : playerA;
  const probabilityElite = (aiWinner.vsi * 0.95 + (aiWinner.phvCategory === "late" ? 5 : 0)).toFixed(1);

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.07 } },
  };
  const item = {
    hidden: { opacity: 0, y: 24 },
    show: { opacity: 1, y: 0, transition: { duration: 0.45 } },
  };

  return (
    <motion.div
      variants={container}
      initial="hidden"
      animate="show"
      className="min-h-screen pb-24"
    >
      {/* Header */}
      <motion.div variants={item} className="glass-strong px-4 py-4">
        <div className="flex items-center justify-between max-w-5xl mx-auto">
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate(-1)}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              <ArrowLeft size={20} />
            </button>
            <div>
              <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-primary">
                Predictive Analysis
              </span>
              <h1 className="font-display font-bold text-xl text-foreground">
                Scout Comparison Tool
              </h1>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-sm font-display font-medium text-foreground hover:bg-secondary transition-colors">
              <Download size={14} />
              Export Report
            </button>
            <button className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display font-semibold hover:bg-primary/90 transition-colors">
              <Share2 size={14} />
              Share View
            </button>
          </div>
        </div>
      </motion.div>

      <div className="max-w-5xl mx-auto px-4 pt-6 space-y-6">
        {/* Player Selectors + Overlaid Radar */}
        <motion.div variants={item} className="glass rounded-2xl p-6">
          <div className="grid grid-cols-[1fr_2fr_1fr] gap-4 items-center">
            {/* Player A Card */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-24 h-24 rounded-xl bg-secondary border border-border flex items-center justify-center">
                <span className="text-3xl font-display font-bold text-muted-foreground">
                  {playerA.avatar}
                </span>
              </div>
              <VsiGauge value={playerA.vsi} size="sm" />
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  {playerA.name}
                </h3>
                <p className="text-xs text-primary font-display font-semibold">
                  {playerA.positionShort} · {playerA.age}y · {playerA.academy}
                </p>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider border border-border text-foreground bg-secondary">
                  {phvTagA}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider border border-border text-foreground bg-secondary">
                  RIGHT-FOOTED
                </span>
              </div>
              {/* Player selector */}
              <select
                value={playerAIndex}
                onChange={(e) => setPlayerAIndex(Number(e.target.value))}
                className="mt-2 bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs font-display text-foreground w-full"
              >
                {mockPlayers.map((p, i) => (
                  <option key={p.id} value={i} disabled={i === playerBIndex}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>

            {/* Overlaid Radar Chart */}
            <div className="relative">
              <ResponsiveContainer width="100%" height={320}>
                <ReRadar data={radarData}>
                  <PolarGrid stroke="hsl(215, 20%, 18%)" />
                  <PolarAngleAxis
                    dataKey="stat"
                    tick={{
                      fill: "hsl(215, 16%, 52%)",
                      fontSize: 12,
                      fontFamily: "Rajdhani",
                      fontWeight: 600,
                    }}
                  />
                  <Radar
                    name={playerA.name.split(" ")[1] || playerA.name}
                    dataKey="playerA"
                    stroke="hsl(140, 100%, 50%)"
                    fill="hsl(140, 100%, 50%)"
                    fillOpacity={0.15}
                    strokeWidth={2}
                  />
                  <Radar
                    name={playerB.name.split(" ")[1] || playerB.name}
                    dataKey="playerB"
                    stroke="hsl(217, 91%, 60%)"
                    fill="hsl(217, 91%, 60%)"
                    fillOpacity={0.12}
                    strokeWidth={2}
                  />
                  <Legend
                    wrapperStyle={{
                      fontFamily: "Rajdhani",
                      fontSize: 12,
                      color: "hsl(215, 16%, 52%)",
                    }}
                  />
                </ReRadar>
              </ResponsiveContainer>
            </div>

            {/* Player B Card */}
            <div className="flex flex-col items-center text-center space-y-3">
              <div className="w-24 h-24 rounded-xl bg-secondary border border-border flex items-center justify-center">
                <span className="text-3xl font-display font-bold text-muted-foreground">
                  {playerB.avatar}
                </span>
              </div>
              <VsiGauge value={playerB.vsi} size="sm" />
              <div>
                <h3 className="font-display font-bold text-lg text-foreground">
                  {playerB.name}
                </h3>
                <p className="text-xs text-primary font-display font-semibold">
                  {playerB.positionShort} · {playerB.age}y · {playerB.academy}
                </p>
              </div>
              <div className="flex gap-2">
                <span className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider border border-border text-foreground bg-secondary">
                  {phvTagB}
                </span>
                <span className="px-2 py-0.5 rounded text-[10px] font-display font-semibold uppercase tracking-wider border border-border text-foreground bg-secondary">
                  DUAL-FOOTED
                </span>
              </div>
              <select
                value={playerBIndex}
                onChange={(e) => setPlayerBIndex(Number(e.target.value))}
                className="mt-2 bg-secondary border border-border rounded-lg px-3 py-1.5 text-xs font-display text-foreground w-full"
              >
                {mockPlayers.map((p, i) => (
                  <option key={p.id} value={i} disabled={i === playerAIndex}>
                    {p.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </motion.div>

        {/* Metrics Comparison Table */}
        <motion.div variants={item} className="glass rounded-2xl overflow-hidden">
          {/* Table Header */}
          <div className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-3 border-b border-border">
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Metric Description
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground text-center">
              {playerA.name.split(" ")[0]} {playerA.name.split(" ")[1]?.[0]}.
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground text-center">
              Differential
            </span>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground text-center">
              {playerB.name.split(" ")[0]} {playerB.name.split(" ")[1]?.[0]}.
            </span>
          </div>

          {/* Metric Rows */}
          {metrics.map((metric) => {
            const valA = metric.getValueA();
            const valB = metric.getValueB();
            const diff = +(valA - valB).toFixed(2);
            const absStr = diff > 0 ? `+${Math.abs(diff)}` : diff < 0 ? `+${Math.abs(diff)}` : "0";
            const aWins = valA >= valB;
            const formatFn = metric.format || ((v: number) => String(v));

            return (
              <div
                key={metric.id}
                className="grid grid-cols-[2fr_1fr_1fr_1fr] gap-4 px-6 py-5 border-b border-border last:border-b-0 items-center"
              >
                {/* Metric info */}
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                    {metric.icon}
                  </div>
                  <div>
                    <h4 className="font-display font-bold text-sm text-foreground">
                      {metric.name}
                    </h4>
                    <p className="text-[10px] text-muted-foreground">
                      {metric.description}
                    </p>
                  </div>
                </div>

                {/* Player A value */}
                <div className="text-center">
                  <div
                    className={`inline-block px-3 py-2 rounded-lg border ${
                      aWins
                        ? "border-primary/30 bg-primary/5"
                        : "border-border bg-secondary"
                    }`}
                  >
                    <span
                      className={`font-display font-bold text-2xl ${
                        aWins ? "text-primary" : "text-foreground"
                      }`}
                    >
                      {formatFn(valA)}
                    </span>
                  </div>
                  <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mt-1">
                    {getMetricLabel(valA, aWins, metric)}
                  </p>
                </div>

                {/* Differential */}
                <div className="text-center">
                  <span className="text-sm font-display font-semibold text-primary">
                    {diff > 0 ? `+${Math.abs(diff)}` : diff < 0 ? `-${Math.abs(diff)}` : "0"}
                  </span>
                  <div className="mt-2 h-1 rounded-full bg-muted overflow-hidden mx-4">
                    <motion.div
                      className="h-full rounded-full bg-electric"
                      initial={{ width: 0 }}
                      animate={{
                        width: `${Math.min(100, Math.abs(diff) * 20 + 30)}%`,
                      }}
                      transition={{ duration: 0.8, ease: "easeOut" }}
                    />
                  </div>
                </div>

                {/* Player B value */}
                <div className="text-center">
                  <div
                    className={`inline-block px-3 py-2 rounded-lg border ${
                      !aWins
                        ? "border-electric/30 bg-electric/5"
                        : "border-border bg-secondary"
                    }`}
                  >
                    <span
                      className={`font-display font-bold text-2xl ${
                        !aWins ? "text-electric" : "text-foreground"
                      }`}
                    >
                      {formatFn(valB)}
                    </span>
                  </div>
                  <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mt-1">
                    {getMetricLabel(valB, !aWins, metric)}
                  </p>
                </div>
              </div>
            );
          })}
        </motion.div>

        {/* AI Comparison Insight */}
        <motion.div variants={item} className="grid grid-cols-[3fr_2fr] gap-4">
          {/* Insight Text */}
          <div className="glass rounded-2xl p-6">
            <div className="flex items-center gap-3 mb-4">
              <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center">
                <Brain size={18} className="text-primary" />
              </div>
              <h3 className="font-display font-bold text-lg text-foreground">
                AI Comparison Insight
              </h3>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              While {playerA.name} demonstrates a higher current VAEP efficiency, the{" "}
              <span className="text-primary font-semibold">Truth Filter</span> suggests{" "}
              {aiWinner.name} possesses a higher ceiling. {aiWinner.name === playerB.name ? "Marco's" : `${aiWinner.name.split(" ")[0]}'s`} current output is achieved despite being in a{" "}
              <span className="font-bold text-foreground">
                {aiWinner.phvCategory === "late" ? "TARDÍO" : aiWinner.phvCategory === "early" ? "PRECOZ" : "NORMAL"}
              </span>{" "}
              maturation state. Once his biological development synchronizes with his technical data, our model predicts a{" "}
              <span className="text-primary font-bold">{probabilityElite}% probability</span>{" "}
              of reaching Elite tier (UEFA Top 5 Leagues) within 36 months.
            </p>
          </div>

          {/* Recommendation Card */}
          <div className="glass rounded-2xl p-6 flex flex-col items-center justify-center text-center">
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">
              Overall Recommendation
            </span>
            <h2 className="font-display font-bold text-4xl text-electric leading-tight mb-1">
              {aiWinner.name.split(" ")[0].toUpperCase()}
            </h2>
            <h2 className="font-display font-bold text-4xl text-electric leading-tight mb-3">
              {(aiWinner.name.split(" ")[1] || "").toUpperCase()}
            </h2>
            <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
              High Potential Target · 1st Priority
            </p>
            <button className="w-full px-6 py-3 rounded-lg border border-border text-sm font-display font-bold text-foreground hover:bg-secondary transition-colors uppercase tracking-wider">
              Add to Shortlist
            </button>
          </div>
        </motion.div>

        {/* Engine Status Footer */}
        <motion.div variants={item} className="flex items-center justify-between text-[10px] text-muted-foreground font-display px-2 pb-4">
          <div className="flex items-center gap-4">
            <span>
              ENGINE STATUS: <span className="text-primary">OPTIMAL</span>
            </span>
            <span>LATENCY: 12MS</span>
          </div>
          <span>© 2024 VITAS AI · PROPHET HORIZON TECHNOLOGY</span>
        </motion.div>
      </div>
    </motion.div>
  );
};

export default PlayerComparison;
