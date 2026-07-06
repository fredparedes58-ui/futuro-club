/**
 * VITAS · ArchetypeCard (Sprint 20)
 *
 * Visual card showing the player's behavioral archetype.
 * 6 archetypes with distinctive icon + color + description.
 */
import { motion } from "framer-motion";
import { Shield, Lightbulb, Zap, Ghost, Sword, Compass } from "lucide-react";
import { useTranslation } from "react-i18next";

interface Props {
  archetype: string;
  mentalComposite: number;
  compact?: boolean;
}

const ARCHETYPES: Record<string, {
  labelKey: string;
  descriptionKey: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
}> = {
  commander: {
    labelKey: "archetypeCard.commanderLabel",
    descriptionKey: "archetypeCard.commanderDescription",
    icon: Shield,
    color: "text-red-400",
    bgGradient: "from-red-500/20 to-red-600/5",
  },
  creator: {
    labelKey: "archetypeCard.creatorLabel",
    descriptionKey: "archetypeCard.creatorDescription",
    icon: Lightbulb,
    color: "text-amber-400",
    bgGradient: "from-amber-500/20 to-amber-600/5",
  },
  engine: {
    labelKey: "archetypeCard.engineLabel",
    descriptionKey: "archetypeCard.engineDescription",
    icon: Zap,
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/20 to-emerald-600/5",
  },
  ghost: {
    labelKey: "archetypeCard.ghostLabel",
    descriptionKey: "archetypeCard.ghostDescription",
    icon: Ghost,
    color: "text-slate-400",
    bgGradient: "from-slate-500/20 to-slate-600/5",
  },
  warrior: {
    labelKey: "archetypeCard.warriorLabel",
    descriptionKey: "archetypeCard.warriorDescription",
    icon: Sword,
    color: "text-orange-400",
    bgGradient: "from-orange-500/20 to-orange-600/5",
  },
  architect: {
    labelKey: "archetypeCard.architectLabel",
    descriptionKey: "archetypeCard.architectDescription",
    icon: Compass,
    color: "text-blue-400",
    bgGradient: "from-blue-500/20 to-blue-600/5",
  },
};

const DEFAULT_ARCHETYPE = ARCHETYPES.engine;

export default function ArchetypeCard({ archetype, mentalComposite, compact }: Props) {
  const { t } = useTranslation();
  const arch = ARCHETYPES[archetype] ?? DEFAULT_ARCHETYPE;
  const Icon = arch.icon;

  return (
    <motion.div
      className={`glass rounded-xl ${compact ? "p-3" : "p-5"} bg-gradient-to-br ${arch.bgGradient} border border-white/5`}
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ duration: 0.3 }}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg bg-white/5 ${arch.color}`}>
          <Icon size={compact ? 20 : 28} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className={`${compact ? "text-sm" : "text-lg"} font-bold text-foreground`}>
              {t(arch.labelKey)}
            </h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${arch.color} border-current/30 font-mono font-bold`}>
              {mentalComposite}
            </span>
          </div>
          {!compact && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {t(arch.descriptionKey)}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
