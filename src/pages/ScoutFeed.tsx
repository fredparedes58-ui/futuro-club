import { useRef } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowUp, Clock, GitCompareArrows } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useNavigate } from "react-router-dom";
import { useScoutInsights } from "@/hooks/useScoutFeed";
import { ScoutFeedSkeleton } from "@/components/shared/Skeletons";
import VsiGauge from "@/components/VsiGauge";
import { toast } from "sonner";

const typeColors: Record<string, string> = {
  breakout: "bg-primary/10 text-primary border-primary/20",
  comparison: "bg-electric/10 text-electric border-electric/20",
  "phv-alert": "bg-gold/10 text-gold border-gold/20",
  "drill-record": "bg-accent/10 text-accent border-accent/20",
};

const typeLabels: Record<string, string> = {
  breakout: "🔥 BREAKOUT",
  comparison: "🔬 COMPARATIVA",
  "phv-alert": "⚠️ ALERTA PHV",
  "drill-record": "🏆 RÉCORD DRILL",
};

const ScoutFeed = () => {
  const scrollRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { data: insights, isLoading, isError } = useScoutInsights();

  if (isError) toast.error("No se pudieron cargar los insights del scout feed");

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 glass-strong">
        <PageHeader
          title="ScoutFeed"
          subtitle="Insights generados por IA · Actualizados en tiempo real"
          rightContent={
            <button
              onClick={() => navigate("/compare")}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-display font-semibold hover:bg-primary/20 transition-colors"
            >
              <GitCompareArrows size={14} />
              Compare
            </button>
          }
        />
      </div>

      {/* Feed */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar snap-y snap-mandatory pb-20">
        {isLoading && (
          <>
            <ScoutFeedSkeleton />
            <ScoutFeedSkeleton />
          </>
        )}

        {!isLoading && (!insights || insights.length === 0) && (
          <div className="flex flex-col items-center justify-center h-full px-8 text-center">
            <Sparkles size={32} className="text-muted-foreground mb-3" />
            <p className="font-display font-bold text-lg">Sin insights disponibles</p>
            <p className="text-sm text-muted-foreground mt-1">Los insights se generan automáticamente cuando hay actividad nueva</p>
          </div>
        )}

        {insights?.map((insight, i) => (
          <motion.div
            key={insight.id}
            initial={{ opacity: 0 }}
            whileInView={{ opacity: 1 }}
            viewport={{ once: true, amount: 0.5 }}
            className="snap-start min-h-[calc(100vh-140px)] px-4 py-6 flex flex-col justify-center"
          >
            <div className={`inline-flex self-start items-center px-3 py-1 rounded-full text-[10px] font-display font-semibold uppercase tracking-wider border mb-4 ${typeColors[insight.insightType]}`}>
              {typeLabels[insight.insightType]}
            </div>

            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-primary">
                {insight.player.avatar}
              </div>
              <div>
                <h2 className="font-display font-bold text-lg text-foreground">{insight.player.name}</h2>
                <div className="text-xs text-muted-foreground">
                  {insight.player.positionShort} · {insight.player.age} años · {insight.player.academy}
                </div>
              </div>
            </div>

            <div className="glass rounded-2xl p-5 space-y-4">
              <h3 className="font-display font-bold text-xl text-foreground leading-tight">{insight.title}</h3>
              <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>

              <div className="flex items-center justify-between pt-2 border-t border-border">
                <div className="flex items-center gap-3">
                  <VsiGauge value={insight.player.vsi} size="sm" />
                  <div>
                    <div className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{insight.metric}</div>
                    <div className="font-display font-bold text-xl text-primary">{insight.metricValue}</div>
                  </div>
                </div>
                <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                  <Clock size={10} />
                  {insight.timestamp}
                </div>
              </div>
            </div>

            {insights && i < insights.length - 1 && (
              <div className="flex justify-center mt-6 animate-bounce">
                <ArrowUp size={16} className="text-muted-foreground rotate-180" />
              </div>
            )}
          </motion.div>
        ))}
      </div>
    </div>
  );
};

export default ScoutFeed;
