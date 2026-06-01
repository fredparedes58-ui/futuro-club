/**
 * VITAS · IDPDataRichnessBanner
 *
 * Banner contextual que muestra qué datos están alimentando al agente IDP
 * y propone CTAs para enriquecer el dataset (subir video, completar PHV,
 * generar perfil mental).
 *
 * Aparece en el header del IDPDashboard cuando `richnessScore < 70`.
 */
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Video, Brain, Activity, Ruler, ArrowRight, Check } from "lucide-react";
import type { IDPDataRichness } from "@/hooks/useIDPArchitectInput";

interface Props {
  playerId: string;
  data: IDPDataRichness;
  /** Hide banner entirely if data is rich enough */
  hideThreshold?: number;
  /** Open inline video upload modal instead of navigating to Lab */
  onUploadVideo?: () => void;
}

interface Suggestion {
  icon: typeof Video;
  label: string;
  description: string;
  cta: string;
  /** Either a route (Link) or an inline action */
  to?: string;
  onClick?: () => void;
  color: string;
}

export function IDPDataRichnessBanner({
  playerId,
  data,
  hideThreshold = 80,
  onUploadVideo,
}: Props) {
  // Don't show if dataset is rich enough
  if (data.richnessScore >= hideThreshold) return null;

  const suggestions: Suggestion[] = [];

  // Video upload — inline modal if onUploadVideo is provided, otherwise link
  // to Lab as fallback.
  const videoAction: Pick<Suggestion, "to" | "onClick"> = onUploadVideo
    ? { onClick: onUploadVideo }
    : { to: `/lab?playerId=${playerId}` };

  if (!data.hasVideoAnalysis) {
    suggestions.push({
      icon: Video,
      label: "Analizar un video",
      description:
        "Detecta técnico/táctico/físico real del jugador en partido. El agente usa esos datos para afinar metas.",
      cta: "Subir video",
      ...videoAction,
      color: "from-cyan-500 to-blue-500",
    });
  } else if (data.videoAnalysisCount < 3) {
    suggestions.push({
      icon: Video,
      label: `${data.videoAnalysisCount} video${data.videoAnalysisCount === 1 ? "" : "s"} analizados`,
      description: "Con 3+ videos los datos se promedian — perfil más estable y plan más preciso.",
      cta: "Subir otro video",
      ...videoAction,
      color: "from-cyan-500 to-blue-500",
    });
  }

  if (!data.hasBehavioralProfile && data.hasVideoAnalysis) {
    suggestions.push({
      icon: Brain,
      label: "Generar perfil mental",
      description:
        "7 dimensiones cognitivas (decisión, scanning, resiliencia…) que enriquecen la dimensión Mental del plan.",
      cta: "Generar perfil",
      to: `/player/${playerId}?tab=mental`,
      color: "from-purple-500 to-pink-500",
    });
  }

  if (!data.hasPHV) {
    suggestions.push({
      icon: Ruler,
      label: "Completar medidas",
      description:
        "Altura, peso y altura sentado activan el cálculo PHV — clave para la dimensión Maduración.",
      cta: "Editar jugador",
      to: `/player/${playerId}/edit`,
      color: "from-amber-500 to-orange-500",
    });
  }

  if (!data.hasFatigueData) {
    suggestions.push({
      icon: Activity,
      label: "Registrar carga / lesiones",
      description:
        "ACWR + historial de lesiones permiten calibrar la dimensión Maduración (riesgo).",
      cta: "Ver Salud",
      to: `/player/${playerId}?tab=salud`,
      color: "from-rose-500 to-red-500",
    });
  }

  if (suggestions.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-cyan-500/20 bg-gradient-to-br from-cyan-500/5 via-transparent to-purple-500/5 p-4"
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div>
          <div className="text-xs font-medium text-cyan-300 mb-0.5 uppercase tracking-wider">
            Calidad de datos: {data.richnessScore}/100
          </div>
          <div className="text-sm text-slate-200">
            El plan será más preciso si enriqueces el dataset
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-slate-400">
          {data.hasVideoAnalysis && <Check className="size-3 text-emerald-400" />}
          <span>video</span>
          <span className="text-slate-600">·</span>
          {data.hasBehavioralProfile && <Check className="size-3 text-emerald-400" />}
          <span>mental</span>
          <span className="text-slate-600">·</span>
          {data.hasPHV && <Check className="size-3 text-emerald-400" />}
          <span>PHV</span>
          <span className="text-slate-600">·</span>
          {data.hasFatigueData && <Check className="size-3 text-emerald-400" />}
          <span>salud</span>
        </div>
      </div>

      {/* Progress bar */}
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden mb-4">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${data.richnessScore}%` }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="h-full bg-gradient-to-r from-cyan-400 to-purple-400"
        />
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {suggestions.slice(0, 4).map((s) => {
          const Icon = s.icon;
          const content = (
            <>
              <div className={`p-1.5 rounded-md bg-gradient-to-br ${s.color} shrink-0`}>
                <Icon className="size-3.5 text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-xs font-medium text-white">{s.label}</div>
                <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                  {s.description}
                </div>
                <div className="flex items-center gap-1 text-[10px] text-cyan-400 mt-1 group-hover:gap-1.5 transition-all">
                  {s.cta}
                  <ArrowRight className="size-2.5" />
                </div>
              </div>
            </>
          );
          const className =
            "flex items-start gap-3 p-2.5 rounded-lg bg-white/[0.03] hover:bg-white/[0.06] border border-white/5 hover:border-white/15 transition-colors group text-left w-full";
          if (s.onClick) {
            return (
              <button key={s.label} onClick={s.onClick} className={className}>
                {content}
              </button>
            );
          }
          return (
            <Link key={s.label} to={s.to ?? "#"} className={className}>
              {content}
            </Link>
          );
        })}
      </div>
    </motion.div>
  );
}
