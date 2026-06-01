/**
 * VITAS · IDPGoalCard
 *
 * Card que representa UN goal del IDP. Muestra:
 *   - dimensión (chip con color)
 *   - título + rationale (toggleable)
 *   - progress bar baseline → current → target
 *   - chips de drills asignados (max 3 visibles)
 *   - status (badge)
 *   - acciones: editar (coach), marcar achieved/missed
 */

import { useState } from "react";
import { motion } from "framer-motion";
import {
  Brain, Dumbbell, Target, Sparkles, Activity,
  Edit3, CheckCircle2, XCircle, ChevronDown, ChevronUp,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";
import type { IDPDimension, IDPGoal } from "@/lib/idp/idpTypes";
import { computeGoalProgress } from "@/lib/idp";

interface Props {
  goal: IDPGoal;
  /** Latest measured metric value (overrides currentValue) */
  liveMetric?: number;
  /** Coach can edit (Pro+ feature gate handled by parent) */
  editable?: boolean;
  onEdit?: (goal: IDPGoal) => void;
  onMarkAchieved?: (goal: IDPGoal) => void;
  onMarkMissed?: (goal: IDPGoal) => void;
}

const DIMENSION_META: Record<
  IDPDimension,
  { label: string; color: string; icon: React.ComponentType<{ className?: string }> }
> = {
  technical:  { label: "Técnico",   color: "bg-blue-500/10 text-blue-300 border-blue-500/30",   icon: Target },
  tactical:   { label: "Táctico",   color: "bg-purple-500/10 text-purple-300 border-purple-500/30", icon: Brain },
  physical:   { label: "Físico",    color: "bg-emerald-500/10 text-emerald-300 border-emerald-500/30", icon: Dumbbell },
  mental:     { label: "Mental",    color: "bg-amber-500/10 text-amber-300 border-amber-500/30", icon: Sparkles },
  maturation: { label: "Maduración", color: "bg-rose-500/10 text-rose-300 border-rose-500/30",  icon: Activity },
};

const STATUS_META: Record<IDPGoal["status"], { label: string; color: string }> = {
  pending:     { label: "Pendiente",     color: "bg-slate-500/15 text-slate-300" },
  in_progress: { label: "En progreso",   color: "bg-blue-500/15 text-blue-300" },
  achieved:    { label: "Logrado",       color: "bg-emerald-500/15 text-emerald-300" },
  missed:      { label: "No logrado",    color: "bg-rose-500/15 text-rose-300" },
  cancelled:   { label: "Cancelado",     color: "bg-slate-500/15 text-slate-400" },
};

export function IDPGoalCard({
  goal,
  liveMetric,
  editable = false,
  onEdit,
  onMarkAchieved,
  onMarkMissed,
}: Props) {
  const [showDetails, setShowDetails] = useState(false);

  const meta = DIMENSION_META[goal.dimension];
  const Icon = meta.icon;
  const current = liveMetric ?? goal.currentValue ?? goal.baselineMetric.value;
  const progress = computeGoalProgress(goal, current);

  const baseline = goal.baselineMetric.value;
  const target = goal.targetMetric.value;
  const unit = goal.targetMetric.unit ?? "";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-white/[0.03] backdrop-blur-sm p-4 hover:border-white/20 transition-colors"
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <div className={cn("p-2 rounded-lg border", meta.color)}>
            <Icon className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap mb-1">
              <Badge variant="outline" className={cn("text-xs", meta.color)}>
                {meta.label}
              </Badge>
              <Badge className={cn("text-xs", STATUS_META[goal.status].color)}>
                {STATUS_META[goal.status].label}
              </Badge>
              {goal.coachEdited && (
                <Badge variant="outline" className="text-xs bg-violet-500/10 text-violet-300 border-violet-500/30">
                  Editado
                </Badge>
              )}
              {goal.aiProposed && !goal.coachEdited && (
                <Badge variant="outline" className="text-xs bg-cyan-500/10 text-cyan-300 border-cyan-500/30">
                  IA
                </Badge>
              )}
            </div>
            <h3 className="font-medium text-white text-sm leading-tight">{goal.title}</h3>
          </div>
        </div>

        {editable && (
          <div className="flex gap-1 shrink-0">
            {onEdit && (
              <Button size="icon" variant="ghost" className="size-8" onClick={() => onEdit(goal)}>
                <Edit3 className="size-3.5" />
              </Button>
            )}
            {onMarkAchieved && goal.status !== "achieved" && (
              <Button size="icon" variant="ghost" className="size-8 text-emerald-400" onClick={() => onMarkAchieved(goal)}>
                <CheckCircle2 className="size-3.5" />
              </Button>
            )}
            {onMarkMissed && goal.status !== "missed" && (
              <Button size="icon" variant="ghost" className="size-8 text-rose-400" onClick={() => onMarkMissed(goal)}>
                <XCircle className="size-3.5" />
              </Button>
            )}
          </div>
        )}
      </div>

      {/* Progress */}
      <div className="mt-4">
        <div className="flex items-baseline justify-between text-xs text-slate-400 mb-1.5">
          <span>{goal.baselineMetric.label ?? goal.baselineMetric.metric}</span>
          <span className="font-mono">
            <span className="text-slate-500">{baseline}</span>
            {" → "}
            <span className="text-white font-medium">{current.toFixed(1)}</span>
            {" / "}
            <span className="text-emerald-400">{target}</span>
            {unit && <span className="text-slate-500 ml-0.5">{unit}</span>}
          </span>
        </div>
        <Progress value={progress} className="h-1.5" />
        <div className="text-[10px] text-slate-500 mt-1 text-right">{progress}% del objetivo</div>
      </div>

      {/* Drills assigned (collapsible) */}
      {goal.drillsAssigned.length > 0 && (
        <div className="mt-3">
          <div className="flex flex-wrap gap-1">
            {goal.drillsAssigned.slice(0, 3).map((id) => (
              <span
                key={id}
                className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-300 font-mono"
              >
                {id}
              </span>
            ))}
            {goal.drillsAssigned.length > 3 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded bg-white/5 text-slate-400">
                +{goal.drillsAssigned.length - 3} más
              </span>
            )}
          </div>
        </div>
      )}

      {/* Toggle details */}
      {(goal.rationale || goal.description) && (
        <button
          className="mt-3 flex items-center gap-1 text-xs text-slate-400 hover:text-white transition-colors"
          onClick={() => setShowDetails(!showDetails)}
        >
          {showDetails ? <ChevronUp className="size-3" /> : <ChevronDown className="size-3" />}
          {showDetails ? "Ocultar contexto" : "Ver contexto"}
        </button>
      )}

      {showDetails && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          className="mt-2 space-y-2 text-xs text-slate-400 overflow-hidden"
        >
          {goal.description && (
            <p>
              <span className="text-slate-500 uppercase tracking-wide mr-1">Qué:</span>
              {goal.description}
            </p>
          )}
          {goal.rationale && (
            <p>
              <span className="text-slate-500 uppercase tracking-wide mr-1">Por qué:</span>
              {goal.rationale}
            </p>
          )}
        </motion.div>
      )}
    </motion.div>
  );
}
