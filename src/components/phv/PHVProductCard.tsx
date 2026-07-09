/**
 * VITAS · PHVProductCard
 *
 * Card TITULAR del PHV como producto. Renderiza desde la evaluación CANÓNICA
 * (src/lib/phv/maturity.ts vía usePHVProduct.assessment): separa ESTADO
 * (pre/circa/post-PHV) de TIMING vs pares (precoz/en fase/tardío), muestra la
 * edad estimada del PHV (APHV) y el %talla adulta (Khamis-Roche) cuando hay
 * datos, y solo ajusta el VSI si el timing está firmemente establecido
 * (blindaje anti-falso-positivo). Ya NO muestra la "edad biológica" inválida.
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Sprout, TrendingUp, TrendingDown, Minus, Info } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { PHVProduct } from "@/hooks/usePHVProduct";
import {
  maturityTone,
  maturityStatusKey,
  maturityTimingKey,
  maturityConfidenceKey,
} from "@/lib/phv/playerMaturity";

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
  const { assessment: a, rawVSI, adjustedVSI } = data;
  const tone = TONE[maturityTone(a)];
  const ToneIcon = tone.Icon;

  // Solo mostramos el VSI ajustado si el timing es firme (factor ≠ 1).
  const showAdjusted = rawVSI != null && adjustedVSI != null && a.adjustmentFactor !== 1;
  const statusLabel = a.status !== "unknown" ? t(maturityStatusKey(a.status)) : null;
  const pct = a.percentPredictedAdultHeight;

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
          {t(maturityTimingKey(a.timing))}
        </Badge>
      </div>

      {/* Edad cronológica · PHV estimado (APHV) · %talla adulta */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("phvProductCard.chronologicalAge")}</div>
          <div className="text-lg font-bold text-foreground tabular-nums">
            {a.chronologicalAge != null ? a.chronologicalAge.toFixed(1) : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("maturity.ageAtPHV")}</div>
          <div className={cn("text-lg font-bold tabular-nums", tone.ring)}>
            {a.ageAtPHV != null ? a.ageAtPHV.toFixed(1) : "—"}
          </div>
        </div>
        <div className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
          <div className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("maturity.percentPAH")}</div>
          <div className={cn("text-lg font-bold tabular-nums", tone.ring)}>
            {pct != null ? `${pct}%` : "—"}
          </div>
        </div>
      </div>

      {/* Estado + confianza */}
      <div className="flex items-center justify-center gap-2 mb-3 text-[11px]">
        {statusLabel && (
          <span className="text-muted-foreground">{statusLabel}</span>
        )}
        <span className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">{t(maturityConfidenceKey(a.confidence))}</span>
      </div>

      {/* VSI crudo → ajustado (solo si el timing es firme) */}
      {rawVSI != null && (
        <div className="flex items-center justify-center gap-2 mb-3 text-sm">
          <span className="text-muted-foreground">VSI</span>
          {showAdjusted ? (
            <>
              <span className="font-mono text-muted-foreground line-through">{rawVSI}</span>
              <span className="text-muted-foreground">→</span>
              <span className={cn("font-bold text-lg tabular-nums", tone.ring)}>{adjustedVSI}</span>
              <span className="text-[10px] text-muted-foreground">{t("phvProductCard.adjustedByMaturation")}</span>
            </>
          ) : (
            <span className="font-bold text-lg tabular-nums text-foreground">{rawVSI}</span>
          )}
        </div>
      )}

      {/* Nota de validez honesta (p.ej. edad lejos del PHV, falta altura de padres) */}
      {!compact && a.validityNote && (
        <p className="text-[10px] text-amber-300/70 leading-snug flex items-start gap-1">
          <Info className="size-3 shrink-0 mt-0.5" />
          {a.validityNote}
        </p>
      )}
    </motion.div>
  );
}
