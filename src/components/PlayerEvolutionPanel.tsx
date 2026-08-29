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
import { useTranslation } from "react-i18next";
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

const DIM_KEYS = [
  "velocidadDecision", "tecnicaConBalon", "inteligenciaTactica",
  "capacidadFisica", "liderazgoPresencia", "eficaciaCompetitiva",
] as const;

// ─── Helpers ────────────────────────────────────────────────────────────────

function extractMetrics(report: VideoIntelligenceOutput): Record<MetricKey, number> | null {
  // #dimensiones fabricadas: el pipeline de vídeo NO puntúa por dimensión. Sólo se
  // leen los scores si el informe declara estadoActual.dimensionesMedidas === true.
  const dimensionesMedidas = ((report.estadoActual as Record<string, unknown> | undefined)?.dimensionesMedidas === true);
  if (!dimensionesMedidas) return null;
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
  // #dimensiones fabricadas: mismo gate que extractMetrics — sin dimensionesMedidas
  // === true, las dimensiones no existen como dato y no se derivan series de ellas.
  const dimensionesMedidas = ((report.estadoActual as Record<string, unknown> | undefined)?.dimensionesMedidas === true);
  if (!dimensionesMedidas) return null;
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
  const { t } = useTranslation();
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
              {t(`playerEvolutionPanel.metrics.${key}`)}
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
  const { t } = useTranslation();
  if (data.length < 2) return null;
  const first = data[0].value;
  const last = data[data.length - 1].value;
  const delta = last - first;
  const color = delta > 0.3 ? "#22C55E" : delta < -0.3 ? "#EF4444" : "#94A3B8";

  return (
    <div className="rounded-lg bg-secondary/30 border border-border p-2">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[9px] font-display font-bold text-foreground">{t(`playerEvolutionPanel.dims.${dimKey}`)}</span>
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
  const { t } = useTranslation();
  const sorted = [...analyses].reverse(); // oldest first
  if (sorted.length < 2) return null;

  const first = sorted[0].report as VideoIntelligenceOutput;
  const last = sorted[sorted.length - 1].report as VideoIntelligenceOutput;
  const firstMetrics = extractMetrics(first);
  const lastMetrics = extractMetrics(last);

  if (!firstMetrics || !lastMetrics) return null;

  // `whole: true` → emphasize the entire line; otherwise emphasize the leading label word.
  const lines: Array<{ text: string; whole: boolean }> = [];

  // Per-metric changes
  const deltas = METRIC_KEYS.map((key) => ({
    key,
    label: t(`playerEvolutionPanel.metrics.${key}`),
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
      lines.push({ text: t("playerEvolutionPanel.summaryImproved", { label: d.label, delta: d.delta, prev: d.prev, curr: d.curr }), whole: false });
    } else if (d.delta < 0) {
      lines.push({ text: t("playerEvolutionPanel.summaryDeclined", { label: d.label, delta: d.delta, prev: d.prev, curr: d.curr }), whole: false });
    } else {
      lines.push({ text: t("playerEvolutionPanel.summaryStable", { label: d.label, curr: d.curr }), whole: false });
    }
  }

  // Best improvement
  const bestImprovement = deltas.reduce((best, d) =>
    d.pct > (best?.pct ?? -Infinity) ? d : best, deltas[0]);
  if (bestImprovement.delta > 0) {
    lines.push({ text: t("playerEvolutionPanel.summaryBiggest", { label: bestImprovement.label, pct: bestImprovement.pct }), whole: true });
  }

  // Worst decline
  const worstDecline = deltas.reduce((worst, d) =>
    d.delta < (worst?.delta ?? Infinity) ? d : worst, deltas[0]);
  if (worstDecline.delta < 0) {
    lines.push({ text: t("playerEvolutionPanel.summaryNeedsAttention", { label: worstDecline.label, delta: worstDecline.delta }), whole: true });
  }

  return (
    <div className="rounded-xl bg-secondary/30 border border-border p-3 space-y-1.5">
      <div className="flex items-center gap-1.5 mb-2">
        <FileText size={11} className="text-primary" />
        <span className="text-[10px] font-display font-bold text-foreground uppercase tracking-wider">
          {t("playerEvolutionPanel.summaryTitle")}
        </span>
      </div>
      {lines.map(({ text, whole }, i) => (
        <p key={i} className="text-[10px] text-muted-foreground leading-relaxed">
          {whole ? (
            <span className="font-bold text-foreground">{text}</span>
          ) : (
            <>
              <span className="text-foreground font-semibold">{text.split(" ")[0]}</span>{" "}
              {text.split(" ").slice(1).join(" ")}
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
  const { t } = useTranslation();

  // Sort oldest first
  const sorted = useMemo(() => [...(analyses ?? [])].reverse(), [analyses]);
  const total = sorted.length;

  // Extract chart data for VSI evolution (dimension-based avg * 10)
  // #dimensiones fabricadas: getDimScores ya devuelve null si el informe no declara
  // dimensionesMedidas === true. Sólo entran en la serie los informes con dims reales;
  // los demás se descartan (nunca se sintetiza un VSI a partir de un 0 inventado).
  const chartData = useMemo(() => {
    return sorted
      .map((a) => {
        const r = a.report as VideoIntelligenceOutput;
        const scores = getDimScores(r);
        if (!scores) return null;
        const avg = Object.values(scores).reduce((s, v) => s + v, 0) / Object.values(scores).length;
        return {
          date: a.created_at,
          dateLabel: formatDate(a.created_at),
          vsi: Math.round(avg * 10),
        };
      })
      .filter((d): d is { date: string; dateLabel: string; vsi: number } => d !== null);
  }, [sorted]);

  // Per-dimension sparkline data
  // #dimensiones fabricadas: sólo los informes con dims reales (getDimScores !== null)
  // alimentan las sparklines; los demás no aportan un value:0 inventado a la serie.
  const dimSparkData = useMemo(() => {
    const withDims = sorted.filter(
      (a) => getDimScores(a.report as VideoIntelligenceOutput) !== null
    );
    const result: Record<string, Array<{ date: string; value: number }>> = {};
    for (const key of DIM_KEYS) {
      result[key] = withDims.map((a) => {
        const scores = getDimScores(a.report as VideoIntelligenceOutput)!;
        return {
          date: formatDate(a.created_at),
          value: scores[key] ?? 0,
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
            {t("playerEvolutionPanel.header")}
          </h2>
        </div>
        <div className="text-center py-6 space-y-2">
          <TrendingUp size={24} className="mx-auto text-muted-foreground/50" />
          <p className="text-xs text-muted-foreground">
            {t("playerEvolutionPanel.needTwoAnalyses")}
          </p>
          <p className="text-[10px] text-muted-foreground">
            {t("playerEvolutionPanel.needMoreDesc")}
          </p>
        </div>
      </motion.div>
    );
  }

  // ── Overall trend ──
  const firstAvg = chartData[0]?.vsi ?? 0;
  const lastAvg = chartData[chartData.length - 1]?.vsi ?? 0;
  const trendDelta = lastAvg - firstAvg;

  // #dimensiones fabricadas: la serie VSI, el delta de tendencia y las sparklines
  // derivan del score por dimensión; sólo se muestran si al menos dos informes traen
  // dims reales (chartData ya está filtrado a esos informes).
  const hasDimEvolution = chartData.length >= 2;

  // Custom tooltip for VSI chart
  const CustomTooltip = ({ active, payload }: { active?: boolean; payload?: Array<{ payload: { dateLabel: string; vsi: number } }> }) => {
    if (!active || !payload?.length) return null;
    const d = payload[0].payload;
    return (
      <div className="glass rounded-lg px-2 py-1.5 text-[10px] border border-border">
        <p className="text-muted-foreground">{d.dateLabel}</p>
        <p className="text-primary font-bold">{t("playerEvolutionPanel.tooltipVsi", { vsi: d.vsi })}</p>
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
            {t("playerEvolutionPanel.header")}
          </h2>
          <span className="text-[9px] font-display px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
            {t("playerEvolutionPanel.analysesCount", { count: total })}
          </span>
        </div>
        {/* #dimensiones fabricadas: el delta de tendencia sale del VSI sintético por dims */}
        {hasDimEvolution && (
          <div className={`flex items-center gap-1 text-[10px] font-bold ${trendDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
            {trendDelta >= 0 ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />}
            {trendDelta >= 0 ? "+" : ""}{trendDelta} pts
          </div>
        )}
      </div>

      {/* VSI Evolution Chart — #dimensiones fabricadas: la serie es el promedio de scores
          por dimensión; se oculta si ningún informe (o menos de dos) trae dims reales */}
      {hasDimEvolution && (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Activity size={11} className="text-primary" />
          <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
            {t("playerEvolutionPanel.vsiEvolution")}
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
      )}

      {/* Metrics Comparison Table */}
      {prevMetrics && currMetrics && (
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <BarChart3 size={11} className="text-electric" />
            <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
              {t("playerEvolutionPanel.comparisonPrev")}
            </span>
          </div>
          <MetricsComparisonTable prev={prevMetrics} curr={currMetrics} />
        </div>
      )}

      {/* Per-Dimension Sparklines — #dimensiones fabricadas: cada sparkline es la serie
          del score por dimensión; se oculta la sección entera sin dims reales suficientes */}
      {hasDimEvolution && (
      <div>
        <div className="flex items-center gap-1.5 mb-2">
          <Activity size={11} className="text-primary" />
          <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
            {t("playerEvolutionPanel.dimEvolution")}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-1.5">
          {DIM_KEYS.map((key) => (
            <DimensionSparkline key={key} dimKey={key} data={dimSparkData[key]} />
          ))}
        </div>
      </div>
      )}

      {/* AI Summary Text */}
      <EvolutionSummaryText analyses={analyses} />

      {/* Link to full Evolution Page */}
      <button
        onClick={() => navigate(`/players/${playerId}/evolution`)}
        className="w-full flex items-center justify-center gap-1.5 text-[10px] font-display font-bold text-primary hover:text-primary/80 transition-colors pt-1"
      >
        {t("playerEvolutionPanel.viewFull")} <ChevronRight size={12} />
      </button>
    </motion.div>
  );
}
