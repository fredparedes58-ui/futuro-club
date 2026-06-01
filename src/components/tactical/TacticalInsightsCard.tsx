/**
 * VITAS · TacticalInsightsCard
 *
 * Card que renderiza el output del agente TacticalPattern:
 *   - headline + summary
 *   - byPhase (con badge de riesgo + sugerencia)
 *   - strengths, weaknesses, coachingTips
 */
import { motion } from "framer-motion";
import { Lightbulb, AlertTriangle, ThumbsUp, ChevronsRight } from "lucide-react";
import type { TacticalInsights } from "@/lib/tactical/tacticalTypes";
import { PHASE_META } from "./PhaseSelector";
import { cn } from "@/lib/utils";

interface Props {
  insights: TacticalInsights;
}

const RISK_COLORS = {
  low: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30",
  moderate: "bg-amber-500/15 text-amber-300 border-amber-500/30",
  high: "bg-rose-500/15 text-rose-300 border-rose-500/30",
} as const;

const RISK_LABELS = { low: "Bajo", moderate: "Moderado", high: "Alto" } as const;

export function TacticalInsightsCard({ insights }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-4"
    >
      {/* Headline + summary */}
      <div className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 p-4">
        <div className="flex items-start gap-3">
          <div className="p-2 rounded-lg bg-gradient-to-br from-cyan-500 to-purple-500">
            <Lightbulb className="size-4 text-white" />
          </div>
          <div>
            <h3 className="text-base font-semibold text-white leading-tight">
              {insights.headline}
            </h3>
            <p className="text-sm text-slate-300 mt-2 leading-relaxed">{insights.summary}</p>
          </div>
        </div>
      </div>

      {/* By phase */}
      {insights.byPhase.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs uppercase tracking-wider text-slate-400">Análisis por fase</h4>
          {insights.byPhase.map((p, i) => {
            const meta = PHASE_META[p.phase];
            return (
              <div
                key={i}
                className="rounded-lg border border-white/10 bg-white/[0.02] p-3 space-y-2"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <span>{meta.icon}</span>
                    <span className="text-sm font-medium text-white">{meta.label}</span>
                  </div>
                  <span className={cn("text-[10px] px-2 py-0.5 rounded-full border", RISK_COLORS[p.risk])}>
                    Riesgo {RISK_LABELS[p.risk]}
                  </span>
                </div>
                <p className="text-xs text-slate-300">{p.observation}</p>
                <div className="flex items-start gap-1.5 text-xs text-cyan-300 bg-cyan-500/5 rounded-md px-2 py-1.5">
                  <ChevronsRight className="size-3 shrink-0 mt-0.5" />
                  <span>{p.suggestion}</span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Strengths + Weaknesses */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        {insights.strengths.length > 0 && (
          <div className="rounded-lg border border-emerald-500/20 bg-emerald-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <ThumbsUp className="size-3.5 text-emerald-400" />
              <span className="text-xs font-medium text-emerald-300">Fortalezas</span>
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              {insights.strengths.map((s, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-emerald-500">+</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {insights.weaknesses.length > 0 && (
          <div className="rounded-lg border border-rose-500/20 bg-rose-500/5 p-3">
            <div className="flex items-center gap-2 mb-2">
              <AlertTriangle className="size-3.5 text-rose-400" />
              <span className="text-xs font-medium text-rose-300">Debilidades</span>
            </div>
            <ul className="space-y-1 text-xs text-slate-300">
              {insights.weaknesses.map((s, i) => (
                <li key={i} className="flex gap-1.5">
                  <span className="text-rose-500">−</span>
                  <span>{s}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Coaching tips */}
      {insights.coachingTips.length > 0 && (
        <div className="rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
          <div className="flex items-center gap-2 mb-2">
            <Lightbulb className="size-3.5 text-amber-400" />
            <span className="text-xs font-medium text-amber-300">Tips para el próximo entrenamiento</span>
          </div>
          <ul className="space-y-1 text-xs text-slate-300">
            {insights.coachingTips.map((s, i) => (
              <li key={i} className="flex gap-1.5">
                <span className="text-amber-500">→</span>
                <span>{s}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}
