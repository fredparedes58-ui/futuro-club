/**
 * VITAS · EngagementMiniCard (Sprint 16)
 *
 * Mini card showing 3 engagement bars: physical, social, emotional.
 * REUSED by Burnout Dashboard in Sprint 23.
 */
import { motion } from "framer-motion";
import { Activity, Users, Heart } from "lucide-react";
import { useTranslation } from "react-i18next";

export interface EngagementMiniCardProps {
  physical: number;    // 0-100
  social: number;      // 0-100
  emotional: number;   // 0-100
  composite?: number;  // 0-100
  trend?: "rising" | "stable" | "declining";
  compact?: boolean;
}

const BARS = [
  { key: "physical",  labelKey: "engagementMiniCard.barPhysical",  icon: Activity, color: "from-blue-500 to-cyan-400" },
  { key: "social",    labelKey: "engagementMiniCard.barSocial",    icon: Users,    color: "from-violet-500 to-purple-400" },
  { key: "emotional", labelKey: "engagementMiniCard.barEmotional", icon: Heart,   color: "from-rose-500 to-pink-400" },
] as const;

const trendKey: Record<string, string> = {
  rising: "engagementMiniCard.trendRising",
  stable: "engagementMiniCard.trendStable",
  declining: "engagementMiniCard.trendDeclining",
};
const trendColor: Record<string, string> = {
  rising: "text-emerald-400",
  stable: "text-muted-foreground",
  declining: "text-red-400",
};

export default function EngagementMiniCard({
  physical, social, emotional, composite, trend, compact,
}: EngagementMiniCardProps) {
  const { t } = useTranslation();
  const values: Record<string, number> = { physical, social, emotional };

  return (
    <div className={`glass rounded-xl ${compact ? "p-3" : "p-4"} space-y-3`}>
      {!compact && (
        <div className="flex items-center justify-between">
          <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
            Engagement
          </span>
          {composite !== undefined && (
            <span className="text-lg font-black font-mono text-foreground">
              {Math.round(composite)}
            </span>
          )}
        </div>
      )}

      <div className="space-y-2">
        {BARS.map(({ key, labelKey, icon: Icon, color }) => {
          const value = values[key] ?? 0;
          return (
            <div key={key} className="flex items-center gap-2">
              <Icon size={compact ? 12 : 14} className="text-muted-foreground shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-0.5">
                  <span className="text-[10px] text-muted-foreground">{t(labelKey)}</span>
                  <span className="text-[10px] font-mono font-bold text-foreground">
                    {Math.round(value)}
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full bg-gradient-to-r ${color}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, Math.max(0, value))}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {trend && !compact && (
        <div className={`text-[10px] font-display ${trendColor[trend]}`}>
          {t(trendKey[trend])}
        </div>
      )}
    </div>
  );
}
