/**
 * VITAS · GrowthSpurtShieldAlert (Sprint 2.5 💎)
 *
 * Escudo de Estirón — alerta PHV × lesión. Dos audiencias:
 *   audience="coach"  → mensaje técnico + reducción de carga + lesiones a vigilar
 *   audience="parent" → mensaje llano y tranquilizador (canal B2C Plan Familia)
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { ShieldAlert, ShieldCheck, Activity, HelpCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import type { GrowthSpurtShield } from "@/lib/phv";

interface Props {
  shield: GrowthSpurtShield;
  audience?: "coach" | "parent";
  /** Si true, no renderiza nada cuando el escudo está inactivo. */
  hideWhenInactive?: boolean;
}

const LEVEL_STYLE = {
  peak: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-300", labelKey: "levelPeak" },
  high: { border: "border-orange-500/40", bg: "bg-orange-500/10", text: "text-orange-300", labelKey: "levelHigh" },
  moderate: { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-300", labelKey: "levelModerate" },
  low: { border: "border-emerald-500/25", bg: "bg-emerald-500/5", text: "text-emerald-300", labelKey: "levelLow" },
  minimal: { border: "border-emerald-500/25", bg: "bg-emerald-500/5", text: "text-emerald-300", labelKey: "levelMinimal" },
} as const;

// Estado de ABSTENCIÓN (offset no fiable / datos estimados): grafía NEUTRA (gris), NUNCA
// el verde de "bajo riesgo confirmado". Un jugador sin medir es DESCONOCIDO, no seguro (inv #3).
const ABSTAINED_STYLE = { border: "border-slate-500/30", bg: "bg-slate-500/10", text: "text-slate-300" } as const;

export function GrowthSpurtShieldAlert({ shield, audience = "coach", hideWhenInactive = false }: Props) {
  const { t } = useTranslation();

  if (hideWhenInactive && !shield.active) return null;

  // Abstención (datos estimados/ausentes) = estado DESCONOCIDO: grafía neutra + icono de
  // interrogación + etiqueta "Sin datos", NUNCA el verde/ShieldCheck de "bajo riesgo" (inv #3).
  const abstained = shield.abstained;
  const style = abstained ? ABSTAINED_STYLE : LEVEL_STYLE[shield.level];
  const labelText = abstained
    ? "Sin datos suficientes"
    : t(`growthSpurtShieldAlert.${LEVEL_STYLE[shield.level].labelKey}`);
  const message = audience === "parent" ? shield.parentMessage : shield.coachMessage;
  const Icon = abstained ? HelpCircle : shield.active ? ShieldAlert : ShieldCheck;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={cn("rounded-xl border p-4", style.border, style.bg)}
    >
      <div className="flex items-start gap-3">
        <div className={cn("p-1.5 rounded-md shrink-0", style.bg)}>
          <Icon className={cn("size-4", style.text)} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <h3 className={cn("text-sm font-semibold", style.text)}>
              🛡️ {t("growthSpurtShieldAlert.title")}
            </h3>
            <span className={cn("text-[10px] px-1.5 py-0.5 rounded-full border", style.border, style.text)}>
              {labelText}
            </span>
            {shield.active && shield.loadReductionPct > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/5 text-foreground">
                {t("growthSpurtShieldAlert.loadReduction", { pct: shield.loadReductionPct, weeks: shield.windowWeeks })}
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground leading-snug">{message}</p>

          {audience === "coach" && shield.watchInjuries.length > 0 && (
            <div className="mt-2 flex items-start gap-1.5">
              <Activity className="size-3 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground">
                {t("growthSpurtShieldAlert.watch", { injuries: shield.watchInjuries.join(" · ") })}
              </p>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
