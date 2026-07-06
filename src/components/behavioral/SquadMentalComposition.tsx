/**
 * VITAS · SquadMentalComposition (Sprint 3.6 💎 ADN Mental)
 *
 * Vista de club: "tienes 4 Guerreros y ningún Arquitecto".
 * Convierte los 6 arquetipos mentales en una lectura de plantilla accionable
 * — qué perfiles abundan, cuáles faltan y de quién dependes demasiado.
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Brain, AlertTriangle, TrendingUp, CheckCircle2 } from "lucide-react";
import {
  ALL_ARCHETYPES,
  ARCHETYPE_META,
  analyzeSquadComposition,
  type Archetype,
} from "@/lib/behavioral/archetypeMeta";

interface Props {
  counts: Record<Archetype, number>;
  total: number;
}

export function SquadMentalComposition({ counts, total }: Props) {
  const { t } = useTranslation();
  const insights = analyzeSquadComposition(counts, total);
  const maxCount = Math.max(1, ...ALL_ARCHETYPES.map((a) => counts[a]));

  const toneIcon = { gap: AlertTriangle, reliance: TrendingUp, balanced: CheckCircle2 } as const;
  const toneColor = { gap: "text-amber-400", reliance: "text-orange-400", balanced: "text-emerald-400" } as const;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-4 space-y-4 border border-purple-500/15"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center shrink-0">
          <Brain size={16} className="text-purple-400" />
        </div>
        <div className="flex-1 min-w-0">
          <h2 className="font-display font-semibold text-sm text-foreground">{t("squadMentalComposition.title")}</h2>
          <p className="text-[10px] text-muted-foreground">{t("squadMentalComposition.subtitle", { count: total })}</p>
        </div>
      </div>

      {/* Tiles de arquetipos */}
      <div className="grid grid-cols-3 gap-2">
        {ALL_ARCHETYPES.map((a) => {
          const m = ARCHETYPE_META[a];
          const n = counts[a];
          return (
            <div
              key={a}
              className="rounded-xl p-2.5 border text-center"
              style={{
                background: n > 0 ? `${m.color}12` : "rgba(255,255,255,0.02)",
                borderColor: n > 0 ? `${m.color}40` : "rgba(255,255,255,0.06)",
              }}
            >
              <div className="text-lg leading-none mb-1">{m.emoji}</div>
              <div className="font-display font-bold text-lg leading-none" style={{ color: n > 0 ? m.color : "#64748b" }}>
                {n}
              </div>
              <p className="text-[9px] mt-0.5 text-muted-foreground truncate">{m.label}</p>
              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                <div
                  className="h-full rounded-full"
                  style={{ width: `${(n / maxCount) * 100}%`, background: m.color }}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Insights de composición */}
      <div className="space-y-1.5">
        {insights.map((ins, i) => {
          const Icon = toneIcon[ins.tone];
          return (
            <div key={i} className="flex items-start gap-2">
              <Icon className={`size-3.5 shrink-0 mt-0.5 ${toneColor[ins.tone]}`} />
              <p className="text-[11px] text-muted-foreground leading-snug">{ins.text}</p>
            </div>
          );
        })}
      </div>
    </motion.div>
  );
}
