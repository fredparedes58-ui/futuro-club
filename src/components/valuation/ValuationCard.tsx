/**
 * ValuationCard — Summary card for player valuation assessment
 *
 * Shows:
 * - Tier badge with score
 * - Probability gauges (1yr, 3yr, 5yr, 1st div, top-5)
 * - Factor breakdown
 * - Ceiling projection
 * - Cold-start indicator
 *
 * Data source: valuation-model deterministic output.
 *
 * Sprint 12: Valuation Model
 */

import { motion } from "framer-motion";
import {
  Trophy,
  TrendingUp,
  Target,
  BarChart3,
  Info,
  ChevronRight,
} from "lucide-react";
import TierBadge from "./TierBadge";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValuationData {
  playerId: string;
  overallScore: number;
  tier: string;
  tierColor: string;
  tierDescription: string;
  factors: Array<{
    factor: string;
    weight: number;
    score: number;
    label: string;
  }>;
  probabilities: {
    prob1Year: number;
    prob3Year: number;
    prob5Year: number;
    probFirstDiv: number;
    probTop5League: number;
  };
  coldStartWarning: boolean;
  confidenceLevel: number;
  dataPointsUsed: number;
  analysisCount: number;
}

interface ValuationCardProps {
  data: ValuationData;
  compact?: boolean;
  onViewDetails?: () => void;
}

// ── Probability gauge ───────────────────────────────────────────────────────

function ProbGauge({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground">{label}</span>
        <span className="text-[10px] font-display font-bold" style={{ color }}>
          {value}%
        </span>
      </div>
      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
        <motion.div
          className="h-full rounded-full"
          style={{ backgroundColor: color }}
          initial={{ width: 0 }}
          animate={{ width: `${Math.min(100, value)}%` }}
          transition={{ duration: 0.8, ease: "easeOut" }}
        />
      </div>
    </div>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function ValuationCard({
  data,
  compact = false,
  onViewDetails,
}: ValuationCardProps) {
  // ── Compact mode ─────────────────────────────────────────────
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl p-4 space-y-3 border border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
        onClick={onViewDetails}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Trophy size={16} className="text-primary" />
            <span className="text-sm font-display font-bold text-foreground">Valoracion</span>
          </div>
          <TierBadge tier={data.tier} tierColor={data.tierColor} score={data.overallScore} compact />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <ProbGauge label="1ra Div" value={data.probabilities.probFirstDiv} color={data.tierColor} />
          <ProbGauge label="Top-5 Ligas" value={data.probabilities.probTop5League} color="#3B82F6" />
        </div>
        {onViewDetails && (
          <button className="flex items-center gap-1 text-[10px] text-primary font-medium">
            Ver detalles <ChevronRight size={10} />
          </button>
        )}
      </motion.div>
    );
  }

  // ── Full mode ────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 space-y-5 border border-border/50"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Trophy size={18} className="text-primary" />
            <h3 className="font-display font-bold text-base text-foreground">
              Valoracion Predictiva
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Modelo deterministico VITAS · {data.dataPointsUsed} datos · {data.analysisCount} analisis
          </p>
        </div>
        <TierBadge tier={data.tier} tierColor={data.tierColor} score={data.overallScore} />
      </div>

      {/* Tier description */}
      <p className="text-[11px] text-muted-foreground leading-relaxed">
        {data.tierDescription}
      </p>

      {/* Cold-start warning */}
      {data.coldStartWarning && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <Info size={14} className="text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Menos de 3 analisis. La valoracion mejorara con mas datos.
          </p>
        </div>
      )}

      {/* Probabilities */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Target size={14} className="text-primary" />
          <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
            Probabilidades
          </h4>
        </div>
        <div className="grid grid-cols-2 gap-x-4 gap-y-2">
          <ProbGauge label="Mejora 1 ano" value={data.probabilities.prob1Year} color="#22C55E" />
          <ProbGauge label="Mejora 3 anos" value={data.probabilities.prob3Year} color="#3B82F6" />
          <ProbGauge label="1ra Division" value={data.probabilities.probFirstDiv} color={data.tierColor} />
          <ProbGauge label="Top-5 Ligas" value={data.probabilities.probTop5League} color="#FFD700" />
        </div>
      </div>

      {/* Factor breakdown */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 size={14} className="text-primary" />
          <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
            Factores
          </h4>
        </div>
        <div className="space-y-1.5">
          {data.factors.map((factor) => (
            <div key={factor.factor} className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground w-28 truncate shrink-0">
                {factor.label}
              </span>
              <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ backgroundColor: data.tierColor }}
                  initial={{ width: 0 }}
                  animate={{ width: `${factor.score}%` }}
                  transition={{ duration: 0.6, ease: "easeOut" }}
                />
              </div>
              <span className="text-[10px] font-display font-bold text-foreground tabular-nums w-6 text-right">
                {factor.score}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Trend indicator */}
      {data.factors[0] && data.factors[0].factor === "vsiTrend" && data.factors[0].score > 60 && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <TrendingUp size={14} className="text-emerald-500" />
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Tendencia positiva — el jugador esta mejorando
          </span>
        </div>
      )}

      {/* Confidence footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Confianza:</span>
          <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${data.confidenceLevel}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {data.confidenceLevel}%
          </span>
        </div>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="flex items-center gap-1 text-[10px] text-primary font-display font-medium hover:underline"
          >
            Dashboard completo <ChevronRight size={10} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
