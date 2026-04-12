/**
 * VITAS · PlayerEvolutionPanel
 * Panel embebible que muestra la evolucion video-a-video del jugador.
 * Requiere al menos 2 analisis guardados para mostrar datos.
 *
 * Incluye:
 *  1. Tabla comparativa de metricas (prev → actual, delta, %)
 *  2. Grafico de evolucion VSI
 *  3. Sparklines por metrica (6 dimensiones IA)
 *  4. Resumen textual IA de la evolucion
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import {
  ArrowUpRight, ArrowDownRight, Minus, TrendingUp,
  Activity, BarChart3, FileText, ChevronRight,
} from "lucide-react";
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis,
  Tooltip, CartesianGrid,
} from "recharts";
import { useNavigate } from "react-router-dom";
import type { VideoIntelligenceOutput } from "@/agents/contracts";

// ─── Types ──────────────────────────────────────────────────────────────────

interface AnalysisRow {
  id: string;
  created_at: string;
  report: unknown;
  video_id?: string;
}

interface Props {
  playerId: string;
  analyses: AnalysisRow[];
}

// ─── Constants ──────────────────────────────────────────────────────────────

const METRIC_KEYS = ["speed", "technique", "vision", "stamina", "shooting", "defending"] as const;
type MetricKey = typeof METRIC_KEYS[number];

const METRIC_LABELS: Record<MetricKey, string> = {
  speed:     "Velocidad",
  technique: "Tecnica",
  vision:    "Vision",
  stamina:   "Resistencia",
  shooting:  "Disparo",
  defending: "Defensa",
};

const DIM_KEYS = [
  "velocidadDecision", "tecnicaConBalon", "inteligenciaTactica",
  "capacidadFisica", "liderazgoPresencia", "eficaciaCompetitiva",
] as const;

const DIM_LABELS: Record<string, string> = {
  velocidadDecision:   "Vel. Decision",
  tecnicaConBalon:     "Tecnica",
  inteligenciaTactica: "Tactica",
  capacidadFisica:     "Fisica",
  liderazgoPresencia:  "Liderazgo",
  eficaciaCompetitiva: "Eficacia",
};

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractMetrics(report: VideoIntelligenceOutput): Record<MetricKey, number> | null {
  const dims = report.estadoActual?.dimensiones;
  if (!dims) return null;
  const d = dims as Record<string, { score: number }>;
  // Map dimension scores (0-10) → metric scale (0-100)
  return {
    speed:     Math.round((d.velocidadDecision?.score ?? 0) * 10),
    technique: Math.round((d.tecnicaConBalon?.score ?? 0) * 10),
    vision:    Math.round((d.inteligenciaTactica?.score ?? 0) * 10),
    stamina:   Math.round((d.capacidadFisica?.score ?? 0) * 10),
    shooting:  Math.round((d.eficaciaCompetitiva?.score ?? 0) * 10),
    defending: Math.round((d.liderazgoPresencia?.score ?? 0) * 10),
  };
}

function getDimScores(report: VideoIntelligenceOutput) {
  const dims = report.estadoActual?.dimensiones;
  if (!dims) return null;
  const scores: Record<string, number> = {};
  for (const key of DIM_KEYS) {
    scores[key] = (dims as Record<string, { score: number }>)[key]?.score ?? 0;
  }
  return scores;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString("es-ES", { day: "2-digit", month: "short" });
}

function deltaColor(d: number) {
  if (d > 0) return "text-green-400";
  if (d < 0) return "text-red-400";
  return "text-muted-foreground";
}

function deltaBg(d: number) {
  if (d > 0) return "bg-green-500/10";
  if (d < 0) return "bg-red-500/10";
  return "bg-muted/50";
}

function DeltaIcon({ delta }: { delta: number }) {
  if (delta > 0) return <ArrowUpRight size={10} className="text-green-400" />;
  if (delta < 0) return <ArrowDownRight size={10} className="text-red-400" />;
  return <Minus size={10} className="text-muted-foreground" />;
}

// ─── Subcomponents ──────────────────────────────────────────────────────────

function MetricsComparisonTable({ prev, curr }: {
  prev: Record<MetricKey, number>;
  curr: Record<MetricKey, number>;
}) {
  return (
    <div className="space-y-1.5">
      {METRIC_KEYS.map((key) => {
        const prevVal = prev[key];
        const currVal = curr[key];
        const delta = currVal - prevVal;
        const pct = prevVal > 0 ? Math.round((delta / prevVal) * 100) : 0;

        return (
          <div key={key} className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 ${deltaBg(delta)}`}>
            <span className="text-[10px] font-display text-muted-foreground w-16 shrink-0">
              {METRIC_LABELS[key]}
            </span>
            <span className="text-[10px] text-muted-foreground font-mono w-6 text-right">{prevVal}</span>
            <span className="text-[9px] text-muted-foreground">→</span>
            <span className="text-[10px] font-display font-bold text-foreground w-6">{currVal}</span>
            <div className="flex items-center gap-0.5 ml-auto">
              <DeltaIcon delta={delta} />
              <span className={`text-[10px] font-bold font-mono ${deltaColor(delta)}`}>
                {delta > 0 ? "+" : ""}{delta}
              </span>
              {pct !== 0 && (
                <span className={`text-[8px] ${deltaColor(delta)}`}>
                  ({pct > 0 ? "+" : ""}{pct}%)
                </span>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function DimensionSparkline({ dimKey, data }: {
  dimKey: string;
  data: Array<{ date: string; value: number }>;
}) {
  if (data.length < 2) return null;
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const delta = last - first;
  const color = delta > 0.3 ? "#22C55E" : delta < -0.3 ? "#EF4444" : "#94A3B8";

  return (
    <div className="rounded-lg bg-secondary/30 border border-border p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-display font-bold text-foreground">{DIM_LABELS[dimKey]}</span>
        <div className="flex items-center gap-0.5">
          <span className="text-[9px] text-muted-foreground">{first.toFixed(1)}</span>
          <span className="text-[8px] text-muted-foreground">→</span>
          <span className="text-[9px] font-bold" style={{ color }}>{last.toFixed(1)}</span>
          <span className="text-[8px] font-bold" style={{ color }}>
            ({delta >= 0 ? "+" : ""}{delta.toFixed(1)})
          </span>
        </div>
      </div>
      <ResponsiveContainer width="100%" height={40}>
        <AreaChart data={data} margin={{ top: 2, right: 2, bottom: 2, left: 2 }}>
          <defs>
            <linearGradient id={`spark-${dimKey}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="5%" stopColor={color} stopOpacity={0.3} />
              <stop offset="95%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <Area
            type="monotone"
            dataKey="value"
            stroke={color}
            fill={`url(#spark-${dimKey})`}
            strokeWidth={1.5}
            dot={{ r: 1.5, fill: color }}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

function EvolutionSummaryText({ analyses }: { analyses: AnalysisRow[] }) {
  const sorted = [...analyses].reverse(); // oldest first
  if (sorted.length < 2) return null;

  const first = sorted[0].report as VideoIntelligenceOutput;
  const last = sorted[sorted.length - 1].report as VideoIntelligenceOutput;
  const firstMetrics = extractMetrics(first);
  const lastMetrics = extractMetrics(last);

  if (!firstMetrics || !lastMetrics) return null;

  const lines: string[] = [];

  // Per-metric changes
  const deltas = METRIC_KEYS.map((key) => ({
    key,
    label: METRIC_LABELS[key],
    prev: firstMetrics[key],
    curr: lastMetrics[key],
    delta: lastMetrics[key] - firstMetrics[key],
    pct: firstMetrics[key] > 0
      ? Math.round(((lastMetrics[key] - firstMetrics[key]) / firstMetrics[key]) * 100)
      : 0,
  }));

  // Sort by absolute delta
  const sorted_deltas = [...deltas].sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));

  for (const d of sorted_deltas) {
    if (d.delta > 0) {
      lines.push(`${d.label} mejoro +${d.delta} puntos (${d.prev}→${d.curr}) desde el primer analisis`);
    } else if (d.delta < 0) {
      lines.push(`${d.label} bajo ${d.delta} puntos (${d.prev}→${d.curr})`);
    } else {
      lines.push(`${d.label} se mantuvo estable en ${d.curr}`);
    }
  }

  // Best improvement
  const bestImprovement = deltas.reduce((best, d) =>
    d.pct > (best?.pct ?? -Infinity) ? d : best, deltas[0]);
  if (bestImprovement.delta > 0) {
    lines.push(`Area de mayor mejora: ${bestImprovement.label} (+${bestImprovement.pct}%)`);
  }

  // Worst decline
  const worstDecline = deltas.reduce((worst, d) =>
    d.delta < (worst?.delta ?? Infinity) ? d : worst, deltas[0]);
  if (worstDecline.delta < 0) {
    lines.push(`Area que necesita atencion: ${worstDecline.label} (${worstDecline.delta})`);
  }

  return (
    <div className="rounded-xl bg-secondary/30 border border-border p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-2">
        <FileText size={11} className="text-primary" />
        <span className="text-[10px] font-display font-bold text-foreground uppercase tracking-wider">
          Resumen de Evolucion
        </span>
      </div>
      {lines.map((line, i) => (
        <p key={i} className="text-[10px] text-muted-foreground leading-relaxed">
          {line.startsWith("Area") ? (
            <span className="font-bold text-foreground">{line}</span>
          ) : (
            <>
              <span className="text-foreground font-semibold">{line.split(" ")[0]}</span>{" "}
              {line.split(" ").slice(1).join(" ")}
            </>
          )}
        </p>
      ))}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────────────────────

export default function PlayerEvolutionPanel({ playerId, analyses }: Props) {
  const navigate = useNavigate();

  // Sort oldest first
  const sorted = useMemo(() => [...(analyses ?? [])].reverse(), [analyses]);
  const total = sorted.length;

  // Extract chart data for VSI evolution (dimension-based avg * 10)
  const chartData = useMemo(() => {
    return sorted.map((a) => {
      const r = a.report as VideoIntelligenceOutput;
      const scores = getDimScores(r);
      const avg = scores
        ? Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length
        : 0;
      return {
        date: a.created_at,
        dateLabel: formatDate(a.created_at),
        vsi: Math.round(avg * 10),
      };
    });
  }, [sorted]);

  // Per-dimension sparkline data
  const dimSparkData = useMemo(() => {
    const result: Record<string, Array<{ date: string; value: number }>> = {};
    for (const key of DIM_KEYS) {
      result[key] = sorted.map((a) => {
        const r = a.report as VideoIntelligenceOutput;
        const scores = getDimScores(r);
        return {
          date: formatDate(a.created_at),
          value: scores?.[key] ?? 0,
        };
      });
    }
    return result;
  }, [sorted]);

  // Prev and current metrics for comparison table
  const prevReport = sorted.length >= 2 ? sorted[sorted.length - 2].report as VideoIntelligenceOutput : null;
  const currReport = sorted.length >= 1 ? sorted[sorted.length - 1].report as VideoIntelligenceOutput : null;
  const prevMetrics = prevReport ? extractMetrics(prevReport) : null;
  const currMetrics = currReport ? extractMetrics(currReport) : null;

  // ── Empty state ──
  if (total < 2) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl p-4"
      >
        <div className="flex items-center gap-2 mb-2">
          <TrendingUp size={14} className="text-green-400" />
          <h2 className="font-display font-semibold text-sm text-foreground">
            Evolucion del Jugador
          </h2>
        </div>
        <div className="text-center py-6 space-y-2">
          <TrendingUp size={24} className="mx-auto text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            Necesitas al menos 2 analisis para ver la evolucion
          </p>
          <p className="text-[10px] text-muted-foreground">
            Genera mas informes VITAS Intelligence analizando videos del jugador.
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Overall trend ──
  const firstAvg = chartData[0]?.vsi ?? 0;
  const lastAvg = chartData[chartData.length - 1]?.vsi ?? 0;
  const trendDelta = lastAvg - firstAvg;

  // Custom tooltip for VSI chart
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { dateLabel: string; vsi: number } }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass rounded-lg px-2 py-1.5 text-[10px] border border-border">
        <p className="text-muted-foreground">{d.dateLabel}</p>
        <p className="text-primary font-bold">VSI Estimado: {d.vsi}</p>
      </div>
    );
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 space-y-4"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <TrendingUp size={14} className="text-green-400" />
          <h2 className="font-display font-semibold text-sm text-foreground">
            Evolucion del Jugador
          </h2>
          <span className="text-[9px] font-display px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
            {total} analisis
          </span>
        </div>
        <div className={`flex items-center gap-1 text-[10px] font-bold ${trendDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
          {trendDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
          {trendDelta >= 0 ? "+" : ""}{trendDelta} pts
        </div>
      </div>

      {/* VSI Evolution Chart */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Activity size={11} className="text-primary" />
          <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
            Evolucion VSI (estimado)
          </span>
        </div>
        <ResponsiveContainer width="100%" height={120}>
          <AreaChart data={chartData} margin={{ top: 5, right: 5, bottom: 5, left: -15 }}>
            <defs>
              <linearGradient id="evoGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="hsl(230, 70%, 58%)" stopOpacity={0.3} />
                <stop offset="95%" stopColor="hsl(230, 70%, 58%)" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(225, 18%, 18%)" />
            <XAxis dataKey="dateLabel" tick={{ fontSize: 9, fill: "hsl(220, 12%, 55%)" }} />
            <YAxis tick={{ fontSize: 9, fill: "hsl(220, 12%, 55%)" }} />
            <Tooltip content={<CustomTooltip />} />
            <Area
              type="monotone"
              dataKey="vsi"
              stroke="hsl(230, 70%, 58%)"
              fill="url(#evoGrad)"
              strokeWidth={2}
              dot={{ r: 3, fill: "hsl(230, 70%, 58%)" }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Metrics Comparison Table */}
      {prevMetrics && currMetrics && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 size={11} className="text-electric" />
            <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
              Comparacion con analisis anterior
            </span>
          </div>
          <MetricsComparisonTable prev={prevMetrics} curr={currMetrics} />
        </div>
      )}

      {/* Per-Dimension Sparklines */}
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Activity size={11} className="text-primary" />
          <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
            Evolucion por Dimension IA
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DIM_KEYS.map((key) => (
            <DimensionSparkline key={key} dimKey={key} data={dimSparkData[key]} />
          ))}
        </div>
      </div>

      {/* AI Summary Text */}
      <EvolutionSummaryText analyses={analyses} />

      {/* Link to full Evolution Page */}
      <button
        onClick={() => navigate(`/players/${playerId}/evolution`)}
        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-display font-bold text-primary hover:text-primary/80 transition-colors pt-1"
      >
        Ver evolucion completa <ChevronRight size={12} />
      </button>
    </motion.div>
  );
}
