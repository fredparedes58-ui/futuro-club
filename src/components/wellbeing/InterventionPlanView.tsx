/**
 * VITAS · InterventionPlanView (Sprint 23)
 *
 * Action plan for coach + parents + club with timeline.
 * Differentiates actions by audience and priority.
 */
import { motion } from "framer-motion";
import { User, Users, Building2, Calendar, AlertCircle } from "lucide-react";
import { useTranslation } from "react-i18next";

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

const AUDIENCE_CONFIG: Record<string, { icon: React.ElementType; labelKey: string; color: string; bg: string }> = {
  coach:  { icon: User,      labelKey: "interventionPlanView.audienceCoach",  color: "text-blue-400",   bg: "bg-blue-500/10" },
  parent: { icon: Users,     labelKey: "interventionPlanView.audienceParent", color: "text-violet-400", bg: "bg-violet-500/10" },
  club:   { icon: Building2, labelKey: "interventionPlanView.audienceClub",   color: "text-amber-400",  bg: "bg-amber-500/10" },
};

const PRIORITY_BADGE: Record<string, { labelKey: string; color: string }> = {
  immediate:  { labelKey: "interventionPlanView.priorityImmediate", color: "bg-red-500/20 text-red-400" },
  this_week:  { labelKey: "interventionPlanView.priorityThisWeek",  color: "bg-orange-500/20 text-orange-400" },
  this_month: { labelKey: "interventionPlanView.priorityThisMonth", color: "bg-amber-500/20 text-amber-400" },
  monitor:    { labelKey: "interventionPlanView.priorityMonitor",   color: "bg-gray-500/20 text-gray-400" },
};

const URGENCY_LABEL_KEYS: Record<string, string> = {
  immediate: "interventionPlanView.urgencyImmediate",
  this_week: "interventionPlanView.urgencyThisWeek",
  this_month: "interventionPlanView.urgencyThisMonth",
  monitor: "interventionPlanView.urgencyMonitor",
};

export default function InterventionPlanView({
  urgency, actions, followUpDate, escalationNeeded, primaryFactor,
}: Props) {
  const { t } = useTranslation();
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
          {t("interventionPlanView.title")}
        </span>
        <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
          urgency === "immediate" ? "bg-red-500/20 text-red-400" :
          urgency === "this_week" ? "bg-orange-500/20 text-orange-400" :
          "bg-amber-500/20 text-amber-400"
        }`}>
          {URGENCY_LABEL_KEYS[urgency] ? t(URGENCY_LABEL_KEYS[urgency]) : urgency}
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
            <p className="text-xs font-bold text-red-400">{t("interventionPlanView.escalationTitle")}</p>
            <p className="text-[10px] text-red-300/70">
              {t("interventionPlanView.escalationDescription")}
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
              <span className="text-xs font-bold">{t(config.labelKey)}</span>
            </div>

            <div className="space-y-1.5 ml-5">
              {audienceActions.map((action, i) => {
                const badge = PRIORITY_BADGE[action.priority] ?? PRIORITY_BADGE.monitor;
                return (
                  <div key={i} className={`flex items-start gap-2 rounded-lg p-2 ${config.bg}`}>
                    <span className={`text-[8px] font-bold px-1.5 py-0.5 rounded ${badge.color} shrink-0 mt-0.5`}>
                      {t(badge.labelKey)}
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
          <p className="text-[10px] text-muted-foreground">{t("interventionPlanView.nextReview")}</p>
          <p className="text-xs font-bold text-foreground">{followUpDate}</p>
        </div>
      </div>
    </div>
  );
}
