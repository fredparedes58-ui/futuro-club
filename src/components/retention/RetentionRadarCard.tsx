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
import { ShieldAlert, ChevronRight } from "lucide-react";
import { PlayerService } from "@/services/real/playerService";
import DemoDataBanner from "@/components/DemoDataBanner";
import {
  estimateDropoutRisk,
  bucketRisk,
  RISK_META,
  FACTOR_LABELS,
  type DropoutAssessment,
  type RiskLevel,
} from "@/lib/retention";

const LEVEL_ORDER: RiskLevel[] = ["critical", "high", "moderate", "low"];

export function RetentionRadarCard() {
  const navigate = useNavigate();
  const { t } = useTranslation();

  const { assessments, buckets } = useMemo(() => {
    const players = PlayerService.getAll();
    const list: DropoutAssessment[] = players.map((p) =>
      estimateDropoutRisk(String((p as { id: string }).id)),
    );
    const nameById = new Map(
      players.map((p) => [String((p as { id: string }).id), String((p as { name?: string }).name ?? t("retentionRadarCard.defaultPlayerName"))]),
    );
    const b = bucketRisk(list);
    // Adjunta nombre + ordena por riesgo desc
    const withNames = list
      .map((a) => ({ ...a, name: nameById.get(a.playerId) ?? t("retentionRadarCard.defaultPlayerName") }))
      .sort((x, y) => y.riskScore - x.riskScore);
    return { assessments: withNames, buckets: b };
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

      {/* Banner honesto (G5): los riesgos salen de un hash del id, no de señales
          reales (asistencia/engagement/fatiga). Visible SIN scroll. */}
      <DemoDataBanner messageKey="retentionRadarCard.demoNotice" />

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

      {/* ROI en € RETIRADO (G5): procedía de computeRetentionROI sobre riesgos
          hash-based → cifra en euros sintética. El plan prohíbe mostrar € mientras
          no venga de señales reales. Volverá cuando el riesgo se derive de datos. */}

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
