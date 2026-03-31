/**
 * VITAS · AnalysisTimeline
 * Historial de informes de inteligencia guardados por jugador.
 * Lee de player_analyses en Supabase.
 */

import { motion } from "framer-motion";
import { Clock, Brain, Star, TrendingUp, ChevronRight, Loader2, Zap } from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useSavedAnalyses } from "@/hooks/usePlayerIntelligence";
import type { VideoIntelligenceOutput } from "@/agents/contracts";

interface AnalysisTimelineProps {
  playerId: string;
  compact?: boolean;
}

const LEVEL_COLORS: Record<string, string> = {
  elite:       "#FFD700",
  alto:        "#22C55E",
  medio_alto:  "#3B82F6",
  medio:       "#F59E0B",
  desarrollo:  "#8B5CF6",
};

const LEVEL_LABELS: Record<string, string> = {
  elite:       "Élite",
  alto:        "Alto",
  medio_alto:  "Medio-Alto",
  medio:       "Medio",
  desarrollo:  "En Desarrollo",
};

function TimelineEntry({
  analysis,
  index,
  isLatest,
}: {
  analysis: { id: string; created_at: string; report: VideoIntelligenceOutput; video_id?: string };
  index:    number;
  isLatest: boolean;
}) {
  const report   = analysis.report;
  const estado   = report?.estadoActual;
  const clon     = report?.jugadorReferencia?.bestMatch;
  const plan     = report?.planDesarrollo;
  const confianza = report?.confianza ?? 0;

  const date     = new Date(analysis.created_at);
  const dateStr  = date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr  = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const levelColor = LEVEL_COLORS[estado?.nivelActual ?? "medio"] ?? "#3B82F6";
  const levelLabel = LEVEL_LABELS[estado?.nivelActual ?? "medio"] ?? "Medio";

  return (
    <motion.div
      initial={{ opacity: 0, x: -12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ delay: index * 0.08 }}
      className="relative pl-8"
    >
      {/* Línea vertical */}
      <div className="absolute left-3 top-0 bottom-0 w-px bg-border" />

      {/* Punto */}
      <div
        className={`absolute left-1.5 top-3 w-3 h-3 rounded-full border-2 ${isLatest ? "bg-primary border-primary" : "bg-background border-border"}`}
      />

      <div className={`glass rounded-2xl p-4 mb-4 ${isLatest ? "border border-primary/20" : ""}`}>
        {/* Header */}
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <div className="flex items-center gap-2">
              {isLatest && (
                <span className="text-[8px] font-bold px-1.5 py-0.5 rounded bg-primary/20 text-primary uppercase tracking-wider">
                  Último
                </span>
              )}
              <span className="text-xs font-bold text-foreground">{dateStr}</span>
              <span className="text-[10px] text-muted-foreground">{timeStr}</span>
            </div>
            {analysis.video_id && (
              <p className="text-[10px] text-muted-foreground mt-0.5">
                Video: {analysis.video_id.slice(0, 8)}...
              </p>
            )}
          </div>
          <span
            className="text-[9px] font-bold px-2 py-0.5 rounded-full border shrink-0"
            style={{ color: levelColor, borderColor: `${levelColor}40`, backgroundColor: `${levelColor}15` }}
          >
            {levelLabel}
          </span>
        </div>

        {/* Resumen */}
        {estado?.resumenEjecutivo && (
          <p className="text-[11px] text-muted-foreground leading-relaxed mb-3 line-clamp-2">
            {estado.resumenEjecutivo}
          </p>
        )}

        {/* Métricas rápidas */}
        <div className="grid grid-cols-3 gap-2 mb-3">
          {/* Confianza */}
          <div className="rounded-lg bg-secondary p-2 text-center">
            <Brain size={10} className="mx-auto mb-0.5 text-primary" />
            <p className="text-xs font-bold text-foreground">{Math.round(confianza * 100)}%</p>
            <p className="text-[8px] text-muted-foreground">Confianza</p>
          </div>

          {/* VSI delta */}
          {estado?.ajusteVSIVideoScore !== undefined && (
            <div className="rounded-lg bg-secondary p-2 text-center">
              <TrendingUp size={10} className="mx-auto mb-0.5 text-green-400" />
              <p className="text-xs font-bold text-foreground">
                {estado.ajusteVSIVideoScore > 0 ? "+" : ""}{estado.ajusteVSIVideoScore}
              </p>
              <p className="text-[8px] text-muted-foreground">VSI delta</p>
            </div>
          )}

          {/* Dimensión top */}
          {estado?.dimensiones && (() => {
            const dims = Object.entries(estado.dimensiones);
            const top = dims.sort(([, a], [, b]) => b.score - a.score)[0];
            const labels: Record<string, string> = {
              velocidadDecision:    "Decisión",
              tecnicaConBalon:      "Técnica",
              inteligenciaTactica:  "Táctica",
              capacidadFisica:      "Físico",
              liderazgoPresencia:   "Liderazgo",
              eficaciaCompetitiva:  "Eficacia",
            };
            return top ? (
              <div className="rounded-lg bg-secondary p-2 text-center">
                <Star size={10} className="mx-auto mb-0.5 text-gold" />
                <p className="text-xs font-bold text-foreground">{top[1].score.toFixed(1)}</p>
                <p className="text-[8px] text-muted-foreground truncate">{labels[top[0]]}</p>
              </div>
            ) : null;
          })()}
        </div>

        {/* Clon */}
        {clon && (
          <div className="flex items-center gap-2 rounded-xl border border-border px-3 py-2">
            <Star size={10} className="text-gold shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold text-foreground truncate">
                Se parece a {clon.nombre}
              </p>
              <p className="text-[9px] text-muted-foreground">{clon.posicion} · {clon.club}</p>
            </div>
            <span className="text-xs font-bold text-primary shrink-0">{clon.score.toFixed(0)}%</span>
          </div>
        )}

        {/* Objetivo 6 meses */}
        {plan?.objetivo6meses && (
          <p className="text-[10px] text-muted-foreground mt-2 pt-2 border-t border-border line-clamp-1">
            <span className="text-foreground font-medium">Plan: </span>
            {plan.objetivo6meses}
          </p>
        )}
      </div>
    </motion.div>
  );
}

export default function AnalysisTimeline({ playerId, compact = false }: AnalysisTimelineProps) {
  const navigate = useNavigate();
  const { data: analyses, isLoading } = useSavedAnalyses(playerId);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 size={20} className="animate-spin text-primary" />
      </div>
    );
  }

  if (!analyses || analyses.length === 0) {
    return (
      <div className="glass rounded-2xl p-6 text-center">
        <Zap size={24} className="mx-auto mb-2 text-primary/40" />
        <p className="text-sm font-bold text-foreground mb-1">Sin análisis previos</p>
        <p className="text-xs text-muted-foreground mb-3">
          Genera el primer informe de inteligencia
        </p>
        <button
          onClick={() => navigate(`/players/${playerId}/intelligence`)}
          className="text-xs font-bold text-primary flex items-center gap-1 mx-auto"
        >
          Ir a VITAS Intelligence <ChevronRight size={12} />
        </button>
      </div>
    );
  }

  const toShow = compact ? analyses.slice(0, 3) : analyses;

  return (
    <div className="space-y-2">
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <Clock size={12} className="text-primary" />
          <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            Historial · {analyses.length} {analyses.length === 1 ? "análisis" : "análisis"}
          </span>
        </div>
        {compact && analyses.length > 3 && (
          <button
            onClick={() => navigate(`/players/${playerId}/intelligence`)}
            className="text-[10px] text-primary flex items-center gap-0.5"
          >
            Ver todos <ChevronRight size={10} />
          </button>
        )}
      </div>

      {/* Timeline */}
      <div className="relative">
        {toShow.map((analysis, i) => (
          <TimelineEntry
            key={analysis.id}
            analysis={analysis as { id: string; created_at: string; report: VideoIntelligenceOutput; video_id?: string }}
            index={i}
            isLatest={i === 0}
          />
        ))}
      </div>
    </div>
  );
}
