/**
 * VITAS · RetentionRadarCard (Sprint 3.7 💎)
 *
 * El "Radar de Retención" para el director: semáforos de abandono de la plantilla
 * + los jugadores en riesgo ESTE MES + el argumento de ROI en euros.
 * Único módulo con retorno directo demostrable — la palanca de venta a clubes.
 */
import { useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ShieldAlert, TrendingUp, ChevronRight, Euro } from "lucide-react";
import { PlayerService } from "@/services/real/playerService";
import {
  estimateDropoutRisk,
  bucketRisk,
  computeRetentionROI,
  RISK_META,
  FACTOR_LABELS,
  eur,
  type DropoutAssessment,
  type RiskLevel,
} from "@/lib/retention";

const LEVEL_ORDER: RiskLevel[] = ["critical", "high", "moderate", "low"];

export function RetentionRadarCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { assessments, buckets, roi } = useMemo(() => {
    const players = PlayerService.getAll();
    const list: DropoutAssessment[] = players.map((p) =>
      estimateDropoutRisk(String((p as { id: string }).id)),
    );
    const nameById = new Map(
      players.map((p) => [String((p as { id: string }).id), String((p as { name?: string }).name ?? t("retentionRadarCard.defaultPlayerName"))]),
    );
    const b = bucketRisk(list);
    const r = computeRetentionROI({ playersAtRisk: b.atRisk });
    // Adjunta nombre + ordena por riesgo desc
    const withNames = list
      .map((a) => ({ ...a, name: nameById.get(a.playerId) ?? t("retentionRadarCard.defaultPlayerName") }))
      .sort((x, y) => y.riskScore - x.riskScore);
    return { assessments: withNames, buckets: b, roi: r };
  }, [t]);

  const topAtRisk = assessments.filter((a) => a.riskLevel === "high" || a.riskLevel === "critical").slice(0, 5);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-4 space-y-4 border border-rose-500/15"
    >
      {/* Header */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center shrink-0">
          <ShieldAlert size={16} className="text-rose-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-sm text-foreground">{t("retentionRadarCard.title")}</h2>
          <p className="text-[10px] text-muted-foreground">{t("retentionRadarCard.subtitle")}</p>
        </div>
        <span className="text-2xl font-display font-bold text-rose-400 leading-none">{buckets.atRisk}</span>
      </div>

      {/* Semáforos */}
      <div className="grid grid-cols-4 gap-2">
        {LEVEL_ORDER.map((lvl) => (
          <div key={lvl} className="rounded-lg bg-white/[0.03] border border-white/5 p-2 text-center">
            <div className="flex items-center justify-center gap-1">
              <span className={`inline-block w-2 h-2 rounded-full ${RISK_META[lvl].dot}`} />
              <span className="font-display font-bold text-sm text-foreground">{buckets[lvl]}</span>
            </div>
            <p className={`text-[9px] mt-0.5 ${RISK_META[lvl].color}`}>{RISK_META[lvl].label}</p>
          </div>
        ))}
      </div>

      {/* Jugadores en riesgo este mes */}
      {topAtRisk.length > 0 ? (
        <div className="space-y-1.5">
          <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">
            {t("retentionRadarCard.playersAtRiskThisMonth", { count: buckets.atRisk })}
          </p>
          <div className="glass rounded-lg divide-y divide-white/5">
            {topAtRisk.map((a) => (
              <button
                key={a.playerId}
                onClick={() => navigate(`/players/${a.playerId}`)}
                className="w-full flex items-center gap-2.5 p-2.5 hover:bg-primary/5 transition-colors text-left first:rounded-t-lg last:rounded-b-lg"
              >
                <span className={`inline-block w-2 h-2 rounded-full shrink-0 ${RISK_META[a.riskLevel].dot}`} />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-display font-semibold text-foreground truncate">{a.name}</p>
                  <p className="text-[10px] text-muted-foreground truncate">{FACTOR_LABELS[a.primaryFactor]}</p>
                </div>
                <span className={`text-xs font-display font-bold ${RISK_META[a.riskLevel].color}`}>{a.riskScore}</span>
                <ChevronRight size={13} className="text-muted-foreground shrink-0" />
              </button>
            ))}
          </div>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center py-2">
          {t("retentionRadarCard.noHighRiskPlayers")}
        </p>
      )}

      {/* ROI en euros */}
      <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/[0.06] p-3 space-y-2">
        <div className="flex items-center gap-2">
          <Euro size={14} className="text-emerald-400" />
          <h3 className="text-xs font-display font-semibold text-emerald-300">{roi.headline}</h3>
        </div>
        <p className="text-[11px] text-muted-foreground leading-snug">{roi.narrative}</p>
        <div className="grid grid-cols-3 gap-2 pt-1">
          <div className="text-center">
            <p className="font-display font-bold text-sm text-foreground flex items-center justify-center gap-0.5">
              <TrendingUp size={11} className="text-emerald-400" /> {roi.roiMultiple.toFixed(1)}×
            </p>
            <p className="text-[9px] text-muted-foreground">{t("retentionRadarCard.roiReturnLabel")}</p>
          </div>
          <div className="text-center">
            <p className="font-display font-bold text-sm text-foreground">{eur(roi.revenueSaved)}</p>
            <p className="text-[9px] text-muted-foreground">{t("retentionRadarCard.roiRecoveredLabel")}</p>
          </div>
          <div className="text-center">
            <p className="font-display font-bold text-sm text-foreground">{eur(roi.vitasAnnualCost)}</p>
            <p className="text-[9px] text-muted-foreground">{t("retentionRadarCard.roiCostLabel")}</p>
          </div>
        </div>
      </div>

      {/* CTA */}
      <button
        onClick={() => navigate("/wellbeing")}
        className="w-full flex items-center justify-center gap-1.5 text-xs font-display text-primary hover:underline"
      >
        {t("retentionRadarCard.ctaWellbeingDetail")}
        <ChevronRight size={13} />
      </button>
    </motion.div>
  );
}
