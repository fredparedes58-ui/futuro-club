/**
 * VITAS · InterventionPlanView (Sprint 23)
 *
 * Action plan for coach + parents + club with timeline.
 * Differentiates actions by audience and priority.
 */
import { motion } from "framer-motion";
import { User, Users, Building2, Calendar, AlertCircle } from "lucide-react";

interface InterventionAction {
  audience: string;
  action: string;
  priority: string;
}

interface Props {
  urgency: string;
  actions: InterventionAction[];
  followUpDate: string;
  escalationNeeded: boolean;
  primaryFactor?: string;
}

const AUDIENCE_CONFIG: Record<string, { icon: React.ElementType; label: string; color: string; bg: string }> = {
  coach:  { icon: User,      label: "Entrenador", color: "text-blue-400",   bg: "bg-blue-500/10" },
  parent: { icon: Users,     label: "Familia",    color: "text-violet-400", bg: "bg-violet-500/10" },
  club:   { icon: Building2, label: "Club",       color: "text-amber-400",  bg: "bg-amber-500/10" },
};

const PRIORITY_BADGE: Record<string, { label: string; color: string }> = {
  immediate:  { label: "Inmediato",   color: "bg-red-500/20 text-red-400" },
  this_week:  { label: "Esta semana", color: "bg-orange-500/20 text-orange-400" },
  this_month: { label: "Este mes",    color: "bg-amber-500/20 text-amber-400" },
  monitor:    { label: "Monitorizar", color: "bg-gray-500/20 text-gray-400" },
};

const URGENCY_LABELS: Record<string, string> = {
  immediate: "Intervención inmediata",
  this_week: "Actuar esta semana",
  this_month: "Planificar este mes",
  monitor: "Seguimiento rutinario",
};

export default function InterventionPlanView({
  urgency, actions, followUpDate, escalationNeeded, primaryFactor,
}: Props) {
  // Group actions by audience
  const grouped: Record<string, InterventionAction[]> = {};
  for (const a of actions) {
    if (!grouped[a.audience]) grouped[a.audience] = [];
    grouped[a.audience].push(a);
  }

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Plan de Intervención
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          urgency === "immediate" ? "bg-red-500/20 text-red-400" :
          urgency === "this_week" ? "bg-orange-500/20 text-orange-400" :
          "bg-amber-500/20 text-amber-400"
        }`}>
          {URGENCY_LABELS[urgency] ?? urgency}
        </span>
      </div>

      {/* Escalation alert */}
      {escalationNeeded && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex items-center gap-2 bg-red-500/10 rounded-lg p-3 border border-red-500/20"
        >
          <AlertCircle size={16} className="text-red-400 shrink-0" />
          <div>
            <p className="text-xs font-bold text-red-400">Escalación necesaria</p>
            <p className="text-[10px] text-red-300/70">
              Involucrar a dirección o psicólogo deportivo externo
            </p>
          </div>
        </motion.div>
      )}

      {/* Actions by audience */}
      {Object.entries(grouped).map(([audience, audienceActions]) => {
        const config = AUDIENCE_CONFIG[audience] ?? AUDIENCE_CONFIG.coach;
        const Icon = config.icon;

        return (
          <motion.div
            key={audience}
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            className="space-y-2"
          >
            <div className={`flex items-center gap-2 ${config.color}`}>
              <Icon size={14} />
              <span className="text-xs font-bold">{config.label}</span>
            </div>

            <div className="space-y-1.5 ml-5">
              {audienceActions.map((action, i) => {
                const badge = PRIORITY_BADGE[action.priority] ?? PRIORITY_BADGE.monitor;
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-lg p-2 ${config.bg}`}>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${badge.color} shrink-0 mt-0.5`}>
                      {badge.label}
                    </span>
                    <p className="text-[11px] text-foreground/80 leading-relaxed">
                      {action.action}
                    </p>
                  </div>
                );
              })}
            </div>
          </motion.div>
        );
      })}

      {/* Follow-up date */}
      <div className="flex items-center gap-2 bg-white/5 rounded-lg p-2.5">
        <Calendar size={14} className="text-muted-foreground" />
        <div>
          <p className="text-[10px] text-muted-foreground">Próxima revisión</p>
          <p className="text-xs font-bold text-foreground">{followUpDate}</p>
        </div>
      </div>
    </div>
  );
}
