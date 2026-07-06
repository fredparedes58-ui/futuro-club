/**
 * DrillRecommendations — Muestra ejercicios recomendados desde el RAG
 * agrupados por área de desarrollo del jugador.
 */
import { Dumbbell, Loader2, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";
import { useRAGDrillRecommendations } from "@/hooks/useAgents";
import DrillCard from "./DrillCard";

interface DrillRecommendationsProps {
  areasDesarrollo: string[];
}

export default function DrillRecommendations({ areasDesarrollo }: DrillRecommendationsProps) {
  const { t } = useTranslation();
  const { data, isLoading, isError } = useRAGDrillRecommendations(areasDesarrollo);

  if (isLoading) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Dumbbell size={12} className="text-primary" />
          <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            {t("drillRecommendations.title")}
          </span>
        </div>
        <div className="flex items-center justify-center py-6 gap-2 text-muted-foreground">
          <Loader2 size={14} className="animate-spin" />
          <span className="text-[10px]">{t("drillRecommendations.loading")}</span>
        </div>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="glass rounded-2xl p-4">
        <div className="flex items-center gap-2 mb-3">
          <Dumbbell size={12} className="text-primary" />
          <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
            {t("drillRecommendations.title")}
          </span>
        </div>
        <div className="flex items-center justify-center py-4 gap-2 text-amber-400">
          <AlertCircle size={12} />
          <span className="text-[10px]">{t("drillRecommendations.error")}</span>
        </div>
      </div>
    );
  }

  if (!data || data.length === 0) {
    return null;
  }

  return (
    <div className="glass rounded-2xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Dumbbell size={12} className="text-primary" />
        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
          {t("drillRecommendations.titleRag")}
        </span>
      </div>

      {data.map((group) => (
        <div key={group.area} className="space-y-2">
          <p className="text-[10px] font-semibold text-foreground/80 uppercase tracking-wide">
            {group.area}
          </p>
          <div className="grid gap-2">
            {group.drills.map((drill) => (
              <DrillCard
                key={drill.id}
                content={drill.content}
                similarity={drill.similarity}
                metadata={drill.metadata as Record<string, unknown>}
                traceId={(drill as { traceId?: string }).traceId}
              />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
