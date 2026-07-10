/**
 * VITAS · IDPTimeline
 *
 * Timeline horizontal de milestones del mes. Agrupa por semana (4-5 weeks),
 * muestra status con color, permite click para marcar.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { CheckCircle2, Circle, XCircle, CircleDot } from "lucide-react";
import { cn } from "@/lib/utils";
import type { IDPMilestone } from "@/lib/idp/idpTypes";

interface Props {
  milestones: IDPMilestone[];
  onSelect?: (milestone: IDPMilestone) => void;
  /** Highlight a specific goalId — others are dimmed */
  highlightGoalId?: string;
}

const STATUS_VISUAL: Record<
  IDPMilestone["status"],
  { icon: typeof Circle; color: string; bg: string; ring: string }
> = {
  pending:   { icon: Circle,        color: "text-slate-400",   bg: "bg-slate-700/40",  ring: "ring-slate-600" },
  partial:   { icon: CircleDot,     color: "text-amber-400",   bg: "bg-amber-500/15",  ring: "ring-amber-500/40" },
  completed: { icon: CheckCircle2,  color: "text-emerald-400", bg: "bg-emerald-500/15",ring: "ring-emerald-500/40" },
  missed:    { icon: XCircle,       color: "text-rose-400",    bg: "bg-rose-500/15",   ring: "ring-rose-500/40" },
};

export function IDPTimeline({ milestones, onSelect, highlightGoalId }: Props) {
  const { t } = useTranslation();
  const weeks = useMemo(() => {
    const map = new Map<number, IDPMilestone[]>();
    for (const m of milestones) {
      const w = m.weekNumber;
      if (!map.has(w)) map.set(w, []);
      map.get(w)!.push(m);
    }
    return Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  }, [milestones]);

  if (weeks.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
        {t("idpTimeline.empty")}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {weeks.map(([weekNum, weekMilestones]) => (
        <div key={weekNum}>
          <div className="flex items-center gap-2 mb-2">
            <span className="text-xs font-mono text-slate-500 uppercase tracking-wider">
              {t("idpTimeline.week", { n: weekNum })}
            </span>
            <div className="h-px flex-1 bg-white/5" />
            <span className="text-[10px] text-slate-600">
              {weekMilestones.filter((m) => m.status === "completed").length}/{weekMilestones.length}
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
            {weekMilestones.map((m) => {
              const v = STATUS_VISUAL[m.status];
              const Icon = v.icon;
              const dimmed = highlightGoalId && m.goalId !== highlightGoalId;
              return (
                <motion.button
                  layout
                  key={m.id}
                  onClick={() => onSelect?.(m)}
                  className={cn(
                    "flex items-start gap-2 p-2.5 rounded-lg border text-left transition-all",
                    v.bg,
                    "border-white/5 hover:border-white/20",
                    dimmed && "opacity-30",
                    onSelect && "cursor-pointer",
                  )}
                  whileHover={onSelect ? { scale: 1.01 } : undefined}
                  whileTap={onSelect ? { scale: 0.99 } : undefined}
                >
                  <Icon className={cn("size-4 shrink-0 mt-0.5", v.color)} />
                  <div className="min-w-0 flex-1">
                    <div className="text-xs text-white font-medium leading-tight line-clamp-2">
                      {m.title}
                    </div>
                    {m.successCriteria && (
                      <div className="text-[10px] text-slate-400 mt-0.5 line-clamp-2">
                        {m.successCriteria}
                      </div>
                    )}
                    <div className="text-[10px] text-slate-500 mt-1 font-mono">
                      {new Date(m.dueDate).toLocaleDateString("es", {
                        day: "2-digit",
                        month: "short",
                      })}
                    </div>
                  </div>
                </motion.button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
