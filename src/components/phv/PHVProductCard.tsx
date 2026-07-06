/**
 * VITAS · PHVProductCard (Sprint 2.4)
 *
 * La card TITULAR del PHV como producto: estado de maduración vs pares en
 * lenguaje claro, edad biológica vs cronológica, VSI ajustado destacado,
 * bio-banding y confianza. Es el diferenciador #1 vs aiScout hecho visible.
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Sprout, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PHVProduct } from "@/hooks/usePHVProduct";

interface Props {
  data: PHVProduct;
  compact?: boolean;
}

const TONE = {
  boost: { ring: "text-emerald-400", chip: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30", Icon: TrendingUp },
  discount: { ring: "text-amber-400", chip: "bg-amber-500/15 text-amber-300 border-amber-500/30", Icon: TrendingDown },
  neutral: { ring: "text-cyan-400", chip: "bg-cyan-500/15 text-cyan-300 border-cyan-500/30", Icon: Minus },
} as const;

export function PHVProductCard({ data, compact = false }: Props) {
  const { t } = useTranslation();
  const { maturation: m, mirwald, rawVSI, adjustedVSI, bioBandLabel, chronoBandLabel, rebands } = data;
  const tone = TONE[m.tone];
  const ToneIcon = tone.Icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-gradient-to-br from-emerald-500/5 via-transparent to-cyan-500/5 p-4"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-gradient-to-br from-emerald-500 to-teal-600">
            <Sprout className="size-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-tight">
              {t("phvProductCard.title")}
            </h3>
            <p className="text-[10px] text-muted-foreground">
              {t("phvProductCard.subtitle")}
            </p>
          </div>
        </div>
        <Badge variant="outline" className={cn("text-[10px] shrink-0", tone.chip)}>
          <ToneIcon className="size-3 mr-1 inline" />
          {m.label}
        </Badge>
      </div>

      {/* Edad bio vs crono */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("phvProductCard.chronologicalAge")}</div>
          <div className="text-lg font-bold text-foreground tabular-nums">{mirwald.chronologicalAge}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("phvProductCard.biologicalAge")}</div>
          <div className={cn("text-lg font-bold tabular-nums", tone.ring)}>{mirwald.biologicalAge.toFixed(1)}</div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("phvProductCard.vsPeers")}</div>
          <div className={cn("text-lg font-bold tabular-nums", tone.ring)}>
            {m.yearsVsPeers >= 0 ? "+" : ""}{m.yearsVsPeers.toFixed(1)}
          </div>
        </div>
      </div>

      {/* VSI crudo → ajustado */}
      {rawVSI != null && adjustedVSI != null && (
        <div className="flex items-center justify-center gap-2 mb-3 text-sm">
          <span className="text-muted-foreground">VSI</span>
          <span className="font-mono text-muted-foreground line-through">{rawVSI}</span>
          <span className="text-muted-foreground">→</span>
          <span className={cn("font-bold text-lg tabular-nums", tone.ring)}>{adjustedVSI}</span>
          <span className="text-[10px] text-muted-foreground">{t("phvProductCard.adjustedByMaturation")}</span>
        </div>
      )}

      {/* Bio-banding */}
      {rebands && (
        <div className="mb-3 flex items-center gap-1.5 rounded-lg bg-cyan-500/5 border border-cyan-500/20 p-2 text-[11px] text-cyan-200">
          <Info className="size-3 shrink-0" />
          {t("phvProductCard.bioBandingPrefix")}<strong>{chronoBandLabel}</strong>{t("phvProductCard.bioBandingMiddle")}<strong>{bioBandLabel}</strong>{t("phvProductCard.bioBandingSuffix")}
        </div>
      )}

      {!compact && (
        <p className="text-[11px] text-muted-foreground leading-snug">{m.rationale}</p>
      )}

      {mirwald.estimated && (
        <p className="text-[9px] text-amber-300/70 mt-2">
          {t("phvProductCard.estimatedWarning", { confidence: Math.round(mirwald.confidence * 100) })}
        </p>
      )}
    </motion.div>
  );
}
