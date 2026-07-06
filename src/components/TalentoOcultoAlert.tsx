/**
 * VITAS · Talento Oculto Alert (B1)
 *
 * Detecta automáticamente si un jugador tiene PHV pre-pico,
 * lo que significa que su rendimiento actual está penalizado
 * por la maduración biológica. Proyecta mejora post-pico.
 *
 * Este alert es el diferenciador #1 de VITAS — NADIE más lo puede hacer
 * sin PHV integrado.
 */

import { motion } from "framer-motion";
import { Sparkles, TrendingUp, Info } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { Player } from "@/services/real/playerService";

interface Props {
  player: Player;
}

export default function TalentoOcultoAlert({ player }: Props) {
  const { t } = useTranslation();
  // Solo mostrar si:
  // 1. Tiene datos de PHV
  // 2. Está en categoría "early" (pre-pico) o su maturityOffset es < -0.5
  const isPrePeak =
    player.phvCategory === "early" ||
    (typeof player.maturityOffset === "number" && player.maturityOffset < -0.5);

  if (!isPrePeak || !player.phvAge) return null;

  // Calcular edad madurativa vs cronológica
  const chronoAge = player.age;
  const maturityDiff = typeof player.maturityOffset === "number"
    ? Math.abs(player.maturityOffset).toFixed(1)
    : null;

  // Proyección simple: VSI actual + bonus por potencial de crecimiento
  const currentVsi = player.vsi ?? 0;
  const projectedBonus = typeof player.maturityOffset === "number"
    ? Math.min(Math.round(Math.abs(player.maturityOffset) * 10), 20)
    : 12;
  const projectedVsi = Math.min(currentVsi + projectedBonus, 99);

  return (
    <motion.div
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
      className="relative overflow-hidden rounded-2xl border-2 border-amber-400/40 bg-gradient-to-r from-amber-500/10 via-orange-500/5 to-yellow-500/10 p-4"
    >
      {/* Glow background */}
      <div className="absolute top-0 right-0 w-32 h-32 bg-amber-400/10 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

      <div className="relative flex items-start gap-3">
        {/* Icon */}
        <div className="w-10 h-10 rounded-xl bg-amber-400/20 border border-amber-400/30 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-amber-400" />
        </div>

        {/* Content */}
        <div className="flex-1 space-y-2">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-bold text-sm text-amber-300">
              {t("talentoOcultoAlert.title")}
            </h3>
            <span className="px-2 py-0.5 rounded-full bg-amber-400/20 text-[9px] font-bold text-amber-300 uppercase tracking-wider">
              {t("talentoOcultoAlert.badge")}
            </span>
          </div>

          <p className="text-xs text-foreground/80 leading-relaxed">
            {maturityDiff
              ? t("talentoOcultoAlert.descriptionWithDiff", {
                  name: player.name,
                  chronoAge,
                  maturityDiff,
                })
              : t("talentoOcultoAlert.description", {
                  name: player.name,
                  chronoAge,
                })}
          </p>

          {/* Projection */}
          <div className="flex items-center gap-4 pt-1">
            <div className="text-center">
              <p className="text-[9px] text-muted-foreground uppercase tracking-wider">{t("talentoOcultoAlert.currentVsi")}</p>
              <p className="font-display font-bold text-lg text-foreground">{currentVsi}</p>
            </div>
            <TrendingUp size={16} className="text-amber-400" />
            <div className="text-center">
              <p className="text-[9px] text-amber-400 uppercase tracking-wider">{t("talentoOcultoAlert.projectionPostPeak")}</p>
              <p className="font-display font-bold text-lg text-amber-300">~{projectedVsi}</p>
            </div>
          </div>

          <div className="flex items-start gap-1.5 pt-1">
            <Info size={10} className="text-muted-foreground mt-0.5 shrink-0" />
            <p className="text-[10px] text-muted-foreground leading-relaxed">
              {t("talentoOcultoAlert.projectionNote")}
            </p>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
