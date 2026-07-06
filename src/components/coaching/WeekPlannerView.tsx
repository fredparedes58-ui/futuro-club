/**
 * VITAS · WeekPlannerView (Sprint 16)
 *
 * Weekly session planner view. Shows sessions per day with
 * suggested drills and intensity levels.
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Calendar, Dumbbell, Flame, Snowflake, Zap } from "lucide-react";
import type { WeeklySessionPlan, DrillSuggestion } from "@/lib/shared/sessionTypes";

interface Props {
  weeklyPlan: WeeklySessionPlan[];
  loadAdjustment?: string;
}

const DAY_KEYS = ["", "day1", "day2", "day3", "day4", "day5", "day6", "day7"];

const INTENSITY_ICON: Record<string, React.ElementType> = {
  low: Snowflake,
  medium: Zap,
  high: Flame,
};
const INTENSITY_COLOR: Record<string, string> = {
  low: "text-sky-400",
  medium: "text-amber-400",
  high: "text-red-400",
};
const INTENSITY_KEY: Record<string, string> = {
  low: "intensityLow",
  medium: "intensityMedium",
  high: "intensityHigh",
};

const PRIORITY_BADGE: Record<string, string> = {
  high: "bg-red-500/20 text-red-300 border-red-500/30",
  medium: "bg-amber-500/20 text-amber-300 border-amber-500/30",
  low: "bg-blue-500/20 text-blue-300 border-blue-500/30",
};

function DrillCard({ drill }: { drill: DrillSuggestion }) {
  return (
    <div className="glass rounded-lg p-2 space-y-1">
      <div className="flex items-center justify-between gap-1">
        <span className="text-[10px] font-bold text-foreground truncate">
          {drill.drillName}
        </span>
        <span className={`text-[8px] px-1 py-0.5 rounded border ${PRIORITY_BADGE[drill.priority]}`}>
          {drill.priority === "high" ? "!" : drill.priority === "medium" ? "·" : ""}
        </span>
      </div>
      <p className="text-[9px] text-muted-foreground line-clamp-2">{drill.reason}</p>
      <div className="flex items-center gap-2 text-[8px] text-muted-foreground">
        <span className="font-mono">{drill.durationMin}′</span>
        <span>→ {drill.addressesGap}</span>
      </div>
    </div>
  );
}

export default function WeekPlannerView({ weeklyPlan, loadAdjustment }: Props) {
  const { t } = useTranslation();
  if (!weeklyPlan || weeklyPlan.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        <Calendar size={20} className="mx-auto mb-2 opacity-40" />
        {t("weekPlannerView.noWeeklyPlan")}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("weekPlannerView.weeklyPlan")}
        </span>
        <Calendar size={14} className="text-muted-foreground" />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
        {weeklyPlan.map((day, i) => {
          const IntIcon = INTENSITY_ICON[day.intensityLevel] ?? Zap;
          return (
            <motion.div
              key={day.dayOfWeek}
              className="glass rounded-xl p-3 space-y-2 border border-white/5"
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.08 }}
            >
              {/* Day header */}
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-foreground">
                  {DAY_KEYS[day.dayOfWeek]
                    ? t(`weekPlannerView.${DAY_KEYS[day.dayOfWeek]}`)
                    : t("weekPlannerView.dayFallback", { day: day.dayOfWeek })}
                </span>
                <div className="flex items-center gap-1">
                  <IntIcon size={12} className={INTENSITY_COLOR[day.intensityLevel]} />
                  <span className={`text-[9px] ${INTENSITY_COLOR[day.intensityLevel]}`}>
                    {INTENSITY_KEY[day.intensityLevel]
                      ? t(`weekPlannerView.${INTENSITY_KEY[day.intensityLevel]}`)
                      : day.intensityLevel}
                  </span>
                </div>
              </div>

              {/* Focus */}
              <p className="text-[10px] text-muted-foreground">{day.focus}</p>

              {/* Duration */}
              <div className="flex items-center gap-1 text-[9px] text-muted-foreground">
                <Dumbbell size={10} />
                <span className="font-mono font-bold text-foreground">{day.totalMinutes}′</span>
              </div>

              {/* Drills */}
              <div className="space-y-1.5">
                {day.suggestedDrills.map((drill, j) => (
                  <DrillCard key={j} drill={drill} />
                ))}
              </div>
            </motion.div>
          );
        })}
      </div>

      {loadAdjustment && (
        <div className="glass rounded-lg p-3 text-[10px] text-muted-foreground border border-amber-500/20">
          <span className="font-bold text-amber-400">{t("weekPlannerView.loadAdjustment")}</span>{" "}
          {loadAdjustment}
        </div>
      )}
    </div>
  );
}
