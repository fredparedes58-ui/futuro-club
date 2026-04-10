/**
 * VITAS · Player Reports Page
 * /players/:id/reports
 *
 * Historial completo de todos los reportes de inteligencia
 * guardados para un jugador, ordenados cronológicamente.
 */

import { useParams, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowLeft, Brain, Star, TrendingUp, ChevronRight,
  Loader2, FileText, Calendar, Video, Zap,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";

import { PlayerService } from "@/services/real/playerService";
import { VideoService } from "@/services/real/videoService";
import { useSavedAnalyses } from "@/hooks/usePlayerIntelligence";
import type { VideoIntelligenceOutput } from "@/agents/contracts";

// ─── Shared helpers ──────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  elite: "Elite", alto: "Alto", medio_alto: "Medio-Alto",
  medio: "Medio", desarrollo: "En Desarrollo",
};
const LEVEL_COLORS: Record<string, string> = {
  elite: "#FFD700", alto: "#22C55E", medio_alto: "#3B82F6",
  medio: "#F59E0B", desarrollo: "#8B5CF6",
};

function MiniScoreRing({ score, label }: { score: number; label: string }) {
  const r = 14, circ = 2 * Math.PI * r, dash = (score / 10) * circ;
  return (
    <div className="flex flex-col items-center gap-0.5">
      <svg width="36" height="36" viewBox="0 0 36 36">
        <circle cx="18" cy="18" r={r} fill="none" stroke="hsl(var(--secondary))" strokeWidth="3" />
        <circle cx="18" cy="18" r={r} fill="none" stroke="hsl(var(--primary))" strokeWidth="3"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round" transform="rotate(-90 18 18)" />
        <text x="18" y="21" textAnchor="middle" fontSize="9" fontWeight="bold" fill="currentColor" className="text-foreground">
          {score.toFixed(1)}
        </text>
      </svg>
      <span className="text-[7px] text-muted-foreground leading-tight text-center max-w-[36px]">{label}</span>
    </div>
  );
}

const DIM_LABELS: Record<string, string> = {
  velocidadDecision: "V.Dec",
  tecnicaConBalon: "Téc",
  inteligenciaTactica: "Tác",
  capacidadFisica: "Fís",
  liderazgoPresencia: "Lid",
  eficaciaCompetitiva: "Efic",
};

// ─── Report Card ─────────────────────────────────────────────────────────────

function ReportCard({
  analysis,
  index,
  total,
  onView,
  onEvolution,
}: {
  analysis: { id: string; created_at: string; report: unknown; video_id?: string };
  index: number;
  total: number;
  onView: () => void;
  onEvolution: () => void;
}) {
  const report = analysis.report as VideoIntelligenceOutput | null;
  if (!report) return null;

  const estado = report.estadoActual;
  const dims = estado?.dimensiones;
  const clon = report.jugadorReferencia?.bestMatch;
  const confianza = report.confianza ?? 0;
  const nivel = estado?.nivelActual ?? "medio";

  const date = new Date(analysis.created_at);
  const dateStr = date.toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" });
  const timeStr = date.toLocaleTimeString("es-ES", { hour: "2-digit", minute: "2-digit" });

  const videoTitle = report.videoId
    ? VideoService.getById(report.videoId)?.title ?? "Video"
    : "Sin video";

  const isLatest = index === 0;

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: index * 0.06 }}
      className="glass rounded-2xl p-4 space-y-3"
    >
      {/* Header: date + video + level */}
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Calendar size={12} className="text-muted-foreground" />
            <span className="text-[11px] text-muted-foreground">{dateStr}, {timeStr}</span>
            {isLatest && (
              <Badge className="text-[8px] bg-primary/20 text-primary border-primary/30">
                Ultimo
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1.5">
            <Video size={11} className="text-primary/60" />
            <span className="text-[10px] text-foreground font-medium truncate max-w-[200px]">{videoTitle}</span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge
            className="text-[9px] font-bold"
            style={{
              backgroundColor: `${LEVEL_COLORS[nivel]}20`,
              color: LEVEL_COLORS[nivel],
              borderColor: LEVEL_COLORS[nivel],
            }}
          >
            {LEVEL_LABELS[nivel]}
          </Badge>
          <span className="text-[9px] text-muted-foreground">
            {Math.round(confianza * 100)}%
          </span>
        </div>
      </div>

      {/* Executive summary */}
      {estado?.resumenEjecutivo && (
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">
          {estado.resumenEjecutivo}
        </p>
      )}

      {/* 6 dimension mini scores */}
      {dims && (
        <div className="flex items-center justify-between px-1">
          {Object.entries(DIM_LABELS).map(([key, label]) => {
            const score = (dims as Record<string, { score: number }>)[key]?.score ?? 0;
            return <MiniScoreRing key={key} score={score} label={label} />;
          })}
        </div>
      )}

      {/* Clone + actions */}
      <div className="flex items-center justify-between pt-1">
        <div className="flex items-center gap-1.5">
          {clon && (
            <>
              <Star size={10} className="text-gold" />
              <span className="text-[10px] text-muted-foreground">
                Clon: <span className="text-foreground font-medium">{clon.nombre}</span>
                {" "}({clon.score}%)
              </span>
            </>
          )}
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onEvolution}
            className="flex items-center gap-1 text-[10px] text-primary hover:text-primary/80 transition-colors"
          >
            <TrendingUp size={10} />
            Evolucion
          </button>
          <button
            onClick={onView}
            className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-primary/80 transition-colors"
          >
            Ver Completo
            <ChevronRight size={10} />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────

export default function PlayerReportsPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const player = id ? PlayerService.getById(id) : null;
  const { data: analyses, isLoading } = useSavedAnalyses(id ?? "");

  if (!player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <Brain size={32} className="text-destructive" />
        <p className="text-sm text-muted-foreground">Jugador no encontrado</p>
      </div>
    );
  }

  // Summary stats
  const total = analyses?.length ?? 0;
  const firstDate = total > 0
    ? new Date(analyses![analyses!.length - 1].created_at).toLocaleDateString("es-ES", { month: "short", year: "numeric" })
    : "";
  const lastDate = total > 0
    ? new Date(analyses![0].created_at).toLocaleDateString("es-ES", { month: "short", year: "numeric" })
    : "";

  // Trend calculation
  let trendDelta = 0;
  if (total >= 2) {
    const getAvg = (report: VideoIntelligenceOutput) => {
      const dims = report.estadoActual?.dimensiones;
      if (!dims) return 0;
      const scores = Object.values(dims).map((d: { score: number }) => d?.score ?? 0);
      return scores.reduce((a, b) => a + b, 0) / scores.length;
    };
    const latest = analyses![0].report as VideoIntelligenceOutput;
    const oldest = analyses![analyses!.length - 1].report as VideoIntelligenceOutput;
    trendDelta = getAvg(latest) - getAvg(oldest);
  }

  return (
    <div className="min-h-screen bg-background pb-28">
      {/* Header */}
      <div className="sticky top-0 z-30 bg-background/90 backdrop-blur-md border-b border-border px-4 py-3">
        <div className="flex items-center gap-3">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-bold text-foreground truncate">
              {player.name}
            </h1>
            <p className="text-[10px] text-muted-foreground">Historial de Reportes</p>
          </div>
          <FileText size={18} className="text-primary" />
        </div>
      </div>

      <div className="px-4 py-4 space-y-4 max-w-lg mx-auto">
        {/* Summary bar */}
        {total > 0 && (
          <div className="glass rounded-xl p-3 flex items-center justify-between">
            <div className="flex items-center gap-4">
              <div className="text-center">
                <p className="text-lg font-display font-bold text-foreground">{total}</p>
                <p className="text-[8px] text-muted-foreground uppercase tracking-wider">Reportes</p>
              </div>
              {total >= 2 && (
                <div className="text-[10px] text-muted-foreground">
                  {firstDate} → {lastDate}
                </div>
              )}
            </div>
            {total >= 2 && (
              <div className={`flex items-center gap-1 text-xs font-bold ${trendDelta >= 0 ? "text-green-400" : "text-red-400"}`}>
                <TrendingUp size={12} className={trendDelta < 0 ? "rotate-180" : ""} />
                {trendDelta >= 0 ? "+" : ""}{trendDelta.toFixed(1)}
              </div>
            )}
          </div>
        )}

        {/* Loading */}
        {isLoading && (
          <div className="flex items-center justify-center py-12">
            <Loader2 size={24} className="animate-spin text-primary" />
          </div>
        )}

        {/* Empty state */}
        {!isLoading && total === 0 && (
          <div className="glass rounded-2xl p-8 text-center space-y-3">
            <Brain size={32} className="mx-auto text-primary/50" />
            <h3 className="text-sm font-display font-bold text-foreground">Sin reportes todavia</h3>
            <p className="text-xs text-muted-foreground">
              Genera tu primer informe VITAS Intelligence para comenzar a hacer seguimiento.
            </p>
            <button
              onClick={() => navigate(`/players/${id}/intelligence`)}
              className="inline-flex items-center gap-1.5 text-xs font-bold text-primary"
            >
              <Zap size={12} /> Generar primer informe
            </button>
          </div>
        )}

        {/* Report cards */}
        {analyses?.map((a, idx) => (
          <ReportCard
            key={a.id ?? idx}
            analysis={a as { id: string; created_at: string; report: unknown; video_id?: string }}
            index={idx}
            total={total}
            onView={() => navigate(`/players/${id}/intelligence?report=${idx}`)}
            onEvolution={() => navigate(`/players/${id}/evolution`)}
          />
        ))}

        {/* Evolution button */}
        {total >= 2 && (
          <motion.button
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            onClick={() => navigate(`/players/${id}/evolution`)}
            className="w-full glass rounded-xl p-4 flex items-center justify-center gap-2 border border-primary/30 hover:border-primary/50 transition-colors"
          >
            <TrendingUp size={16} className="text-primary" />
            <span className="text-sm font-display font-bold text-primary">Ver Evolucion Completa</span>
          </motion.button>
        )}
      </div>
    </div>
  );
}
