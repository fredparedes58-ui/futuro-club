/**
 * VITAS · ArchetypeCard (Sprint 20)
 *
 * Visual card showing the player's behavioral archetype.
 * 6 archetypes with distinctive icon + color + description.
 */
import { motion } from "framer-motion";
import { Shield, Lightbulb, Zap, Ghost, Sword, Compass } from "lucide-react";

interface Props {
  archetype: string;
  mentalComposite: number;
  compact?: boolean;
}

const ARCHETYPES: Record<string, {
  label: string;
  description: string;
  icon: React.ElementType;
  color: string;
  bgGradient: string;
}> = {
  commander: {
    label: "Comandante",
    description: "Líder vocal que organiza al equipo y mantiene la calma bajo presión. Referente en el campo.",
    icon: Shield,
    color: "text-red-400",
    bgGradient: "from-red-500/20 to-red-600/5",
  },
  creator: {
    label: "Creador",
    description: "Jugador impredecible con visión de juego excepcional. Encuentra soluciones que nadie más ve.",
    icon: Lightbulb,
    color: "text-amber-400",
    bgGradient: "from-amber-500/20 to-amber-600/5",
  },
  engine: {
    label: "Motor",
    description: "Jugador constante y fiable que mantiene el rendimiento durante todo el partido. El corazón del equipo.",
    icon: Zap,
    color: "text-emerald-400",
    bgGradient: "from-emerald-500/20 to-emerald-600/5",
  },
  ghost: {
    label: "Fantasma",
    description: "Inteligencia silenciosa. Lee el juego antes que nadie pero lidera con el ejemplo, no con la voz.",
    icon: Ghost,
    color: "text-slate-400",
    bgGradient: "from-slate-500/20 to-slate-600/5",
  },
  warrior: {
    label: "Guerrero",
    description: "Mentalidad competitiva inquebrantable. Crece en los momentos difíciles y nunca se rinde.",
    icon: Sword,
    color: "text-orange-400",
    bgGradient: "from-orange-500/20 to-orange-600/5",
  },
  architect: {
    label: "Arquitecto",
    description: "Pensador estratégico con decisiones rápidas y precisas. Construye el juego desde la lectura del campo.",
    icon: Compass,
    color: "text-blue-400",
    bgGradient: "from-blue-500/20 to-blue-600/5",
  },
};

const DEFAULT_ARCHETYPE = ARCHETYPES.engine;

export default function ArchetypeCard({ archetype, mentalComposite, compact }: Props) {
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
              {arch.label}
            </h3>
            <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${arch.color} border-current/30 font-mono font-bold`}>
              {mentalComposite}
            </span>
          </div>
          {!compact && (
            <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
              {arch.description}
            </p>
          )}
        </div>
      </div>
    </motion.div>
  );
}
