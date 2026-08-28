/**
 * VITAS · InsightCard (compartido)
 *
 * Card de un scout insight. Extraído de ScoutFeed.tsx para reutilizarlo en la
 * pestaña "Histórico" del PlayerHub sin duplicar la presentación (invariante #7:
 * una sola implementación por concepto). ScoutFeed y PlayerHub renderizan EL MISMO
 * card; solo cambian los handlers (opcionales) que cada contexto pasa.
 *
 * Honestidad: el enlace "Ver vídeo" solo aparece si el consumidor resuelve un vídeo
 * real de origen (via context_data.source_video_id) y pasa `onViewVideo`. Para
 * insights antiguos sin origen persistido, el consumidor NO pasa el callback y el
 * card se ABSTIENE de ofrecer el enlace — nunca adivina un vídeo.
 */

import { motion } from "framer-motion";
import {
  Clock, Archive, TrendingUp, TrendingDown, GitCompareArrows,
  AlertTriangle, Dumbbell, Award, Zap, Play,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import VsiGauge from "@/components/VsiGauge";
import { splitMetricValue } from "@/lib/scout/insightValue";
import type { ScoutInsightRow } from "@/hooks/useScoutFeed";

export const insightTypeColors: Record<string, string> = {
  breakout: "bg-primary/10 text-primary border-primary/20",
  comparison: "bg-electric/10 text-electric border-electric/20",
  "phv-alert": "bg-gold/10 text-gold border-gold/20",
  "drill-record": "bg-accent/10 text-accent border-accent/20",
  regression: "bg-destructive/10 text-destructive border-destructive/20",
  milestone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};
export const insightTypeIcons: Record<string, React.ReactNode> = {
  breakout: <TrendingUp size={11} />,
  comparison: <GitCompareArrows size={11} />,
  "phv-alert": <AlertTriangle size={11} />,
  "drill-record": <Dumbbell size={11} />,
  regression: <TrendingDown size={11} />,
  milestone: <Award size={11} />,
};
export const insightTypeLabelKeys: Record<string, string> = {
  breakout: "scout.insightTypes.breakout",
  comparison: "scout.insightTypes.comparison",
  "phv-alert": "scout.insightTypes.phvAlert",
  "drill-record": "scout.insightTypes.drillRecord",
  regression: "scout.insightTypes.regression",
  milestone: "scout.insightTypes.milestone",
};
export const insightUrgencyColors: Record<string, string> = {
  high: "border-l-destructive",
  medium: "border-l-gold",
  low: "border-l-muted-foreground/30",
};

// ── Relative time formatter ───────────────────────────────────────────────────

export function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

export interface InsightCardProps {
  insight: ScoutInsightRow;
  /** Marca leído al abrir la card. Opcional: si no se pasa, no cambia estado. */
  onMarkRead?: (id: string) => void;
  /** Botón de archivar. Opcional: si no se pasa, no se muestra. */
  onArchive?: (id: string) => void;
  /** "Ver jugador" → ficha del jugador. Default true; PlayerHub lo pone en false (ya estás en la ficha). */
  showViewPlayer?: boolean;
  /** Enlace a vídeo de origen. Solo se muestra si se pasa (origen resuelto). */
  onViewVideo?: () => void;
}

export default function InsightCard({
  insight,
  onMarkRead,
  onArchive,
  showViewPlayer = true,
  onViewVideo,
}: InsightCardProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={`glass rounded-2xl p-5 space-y-4 border-l-4 ${insightUrgencyColors[insight.urgency]} ${
        !insight.is_read ? "ring-1 ring-primary/20" : "opacity-85"
      }`}
      onClick={() => { if (!insight.is_read) onMarkRead?.(insight.id); }}
    >
      {/* Type badge + actions */}
      <div className="flex items-center justify-between">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-semibold uppercase tracking-wider border ${insightTypeColors[insight.insight_type]}`}>
          {insightTypeIcons[insight.insight_type]}
          {t(insightTypeLabelKeys[insight.insight_type] ?? "scout.insightTypes.breakout")}
        </div>
        <div className="flex items-center gap-1">
          {!insight.is_read && (
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" title={t("scout.unread")} />
          )}
          {onArchive && (
            <button
              onClick={(e) => { e.stopPropagation(); onArchive(insight.id); }}
              className="p-1.5 rounded-md hover:bg-secondary transition-colors"
              title={t("scout.archive")}
            >
              <Archive size={12} className="text-muted-foreground" />
            </button>
          )}
        </div>
      </div>

      {/* Player info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center font-display font-bold text-primary text-sm">
          {insight.player_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-foreground text-sm truncate">{insight.player_name}</h3>
          <div className="text-[10px] text-muted-foreground">
            {insight.context_data?.position as string ?? ""} · {insight.context_data?.age as number ?? ""} {t("common.years")}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onViewVideo && (
            <button
              onClick={(e) => { e.stopPropagation(); onViewVideo(); }}
              className="inline-flex items-center gap-1 text-[10px] text-primary font-display font-semibold hover:underline"
              title={t("scout.viewVideo")}
            >
              <Play size={11} /> {t("scout.viewVideo")}
            </button>
          )}
          {showViewPlayer && (
            <button
              onClick={(e) => { e.stopPropagation(); navigate(`/players/${insight.player_id}`); }}
              className="text-[10px] text-primary font-display font-semibold hover:underline"
            >
              {t("scout.viewPlayer")}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div>
        <h4 className="font-display font-bold text-lg text-foreground leading-tight mb-2">{insight.title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
      </div>

      {/* Metric + benchmark */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-3">
          {insight.context_data?.vsi && (
            <VsiGauge value={insight.context_data.vsi as number} size="sm" />
          )}
          {(() => {
            const mv = splitMetricValue(insight.metric_value);
            return (
              <div>
                <div className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{insight.metric}</div>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-display font-bold text-xl text-primary">{mv.base}</span>
                  {mv.delta && (
                    <span
                      title={t("scout.metricTrend")}
                      className={`inline-flex items-center gap-0.5 rounded px-1.5 py-0.5 text-[11px] font-semibold ${mv.up ? "bg-green-400/15 text-green-500" : "bg-red-400/15 text-red-500"}`}
                    >
                      {mv.up ? <TrendingUp size={11} /> : <TrendingDown size={11} />}
                      {mv.delta}
                    </span>
                  )}
                </div>
              </div>
            );
          })()}
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock size={10} />
          <span title={new Date(insight.created_at).toLocaleString("es-ES")}>{relativeTime(insight.created_at)}</span>
        </div>
      </div>

      {/* Benchmark */}
      {insight.benchmark && (
        <div className="px-3 py-2 bg-secondary/50 rounded-lg">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-display font-semibold text-foreground">{t("scout.benchmark")}:</span> {insight.benchmark}
          </p>
        </div>
      )}

      {/* Recommended drills */}
      {insight.rag_drills && insight.rag_drills.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-display font-semibold text-foreground uppercase tracking-wider">{t("scout.recommendedDrills")}</p>
          <div className="flex flex-wrap gap-1.5">
            {insight.rag_drills.map((drill, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-display text-primary cursor-default"
                title={drill.reason}
              >
                <Dumbbell size={9} className="inline mr-1 -mt-0.5" />
                {drill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action items */}
      {insight.action_items && insight.action_items.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-display font-semibold text-foreground uppercase tracking-wider">{t("scout.actionItems")}</p>
          <ul className="space-y-1">
            {insight.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Zap size={10} className="mt-0.5 text-primary shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tags */}
      {insight.tags && insight.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded bg-secondary text-[9px] font-display text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}
