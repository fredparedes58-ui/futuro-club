/**
 * VITAS · PhaseSelector
 *
 * Chips horizontales (scroll) para alternar entre las 6 fases tácticas.
 * Muestra duración de cada fase y % del total. Resalta la fase activa.
 */
import { motion } from "framer-motion";
import { cn } from "@/lib/utils";
import type { GamePhase } from "@/lib/tactical/tacticalTypes";

interface Props {
  phaseDurations: Record<GamePhase, number>;
  active: GamePhase;
  onChange: (phase: GamePhase) => void;
}

const PHASE_META: Record<GamePhase, { label: string; icon: string; color: string }> = {
  build_up:             { label: "Construcción",   icon: "🏗", color: "from-blue-500 to-cyan-500" },
  attacking:            { label: "Ataque",         icon: "⚔️", color: "from-emerald-500 to-teal-500" },
  defending:            { label: "Defensa",        icon: "🛡️", color: "from-amber-500 to-orange-500" },
  defensive_transition: { label: "Trans. def.",    icon: "↓",  color: "from-rose-500 to-red-500" },
  offensive_transition: { label: "Trans. ofen.",   icon: "↑",  color: "from-violet-500 to-purple-500" },
  set_piece:            { label: "Balón parado",   icon: "⏸",  color: "from-slate-500 to-slate-700" },
};

const PHASES: GamePhase[] = [
  "build_up", "attacking", "defending",
  "defensive_transition", "offensive_transition", "set_piece",
];

export function PhaseSelector({ phaseDurations, active, onChange }: Props) {
  const total = Object.values(phaseDurations).reduce((a, b) => a + b, 0) || 1;
  return (
    <div className="flex gap-2 overflow-x-auto pb-2 -mx-1 px-1">
      {PHASES.map((p) => {
        const meta = PHASE_META[p];
        const sec = phaseDurations[p] ?? 0;
        const pct = Math.round((sec / total) * 100);
        const isActive = p === active;
        const disabled = sec < 5; // <5s phase → not really happened
        return (
          <motion.button
            key={p}
            whileTap={{ scale: 0.97 }}
            disabled={disabled}
            onClick={() => onChange(p)}
            className={cn(
              "shrink-0 rounded-lg px-3 py-2 text-left border transition-all",
              isActive
                ? `bg-gradient-to-br ${meta.color} border-white/20 text-white shadow-lg`
                : "bg-white/[0.03] border-white/10 text-slate-300 hover:border-white/25",
              disabled && "opacity-30 cursor-not-allowed",
            )}
          >
            <div className="flex items-center gap-1.5">
              <span className="text-sm">{meta.icon}</span>
              <span className="text-xs font-medium">{meta.label}</span>
            </div>
            <div className="text-[10px] mt-0.5 opacity-80">
              {Math.round(sec)}s · {pct}%
            </div>
          </motion.button>
        );
      })}
    </div>
  );
}

export { PHASE_META };
