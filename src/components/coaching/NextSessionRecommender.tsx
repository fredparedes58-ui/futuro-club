/**
 * VITAS · NextSessionRecommender (Sprint 16)
 *
 * Card with recommendations + suggested drills linking to DRILLS_LIBRARY.
 */
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Lightbulb, ArrowRight, AlertTriangle, CheckCircle } from "lucide-react";
import type { DrillSuggestion } from "@/lib/shared/sessionTypes";

interface Props {
  areasToImprove: string[];
  nextSessionDrills: DrillSuggestion[];
  phvNotes: string | null;
}

const PRIORITY_COLORS: Record<string, string> = {
  high: "border-l-red-500",
  medium: "border-l-amber-500",
  low: "border-l-blue-500",
};

export default function NextSessionRecommender({ areasToImprove, nextSessionDrills, phvNotes }: Props) {
  const { t } = useTranslation();
  return (
    <div className="glass rounded-xl p-4 space-y-4">
      <div className="flex items-center gap-2">
        <Lightbulb size={16} className="text-amber-400" />
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("nextSessionRecommender.title")}
        </span>
      </div>

      {/* Areas to improve */}
      {areasToImprove.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
            {t("nextSessionRecommender.areasToImprove")}
          </span>
          {areasToImprove.map((area, i) => (
            <motion.div
              key={i}
              className="flex items-start gap-2 text-[10px] text-foreground/80"
              initial={{ opacity: 0, x: -8 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <ArrowRight size={10} className="text-primary mt-0.5 shrink-0" />
              <span>{area}</span>
            </motion.div>
          ))}
        </div>
      )}

      {/* Suggested drills */}
      {nextSessionDrills.length > 0 && (
        <div className="space-y-2">
          <span className="text-[9px] text-muted-foreground font-bold uppercase tracking-wider">
            {t("nextSessionRecommender.suggestedDrills")}
          </span>
          {nextSessionDrills.map((drill, i) => (
            <motion.div
              key={i}
              className={`glass rounded-lg p-3 border-l-2 ${PRIORITY_COLORS[drill.priority]} space-y-1`}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
            >
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-foreground">{drill.drillName}</span>
                <span className="text-[9px] font-mono text-muted-foreground">{drill.durationMin}′</span>
              </div>
              <p className="text-[9px] text-muted-foreground">{drill.reason}</p>
              <div className="flex items-center gap-1 text-[8px]">
                <CheckCircle size={8} className="text-emerald-400" />
                <span className="text-emerald-400/80">{drill.addressesGap}</span>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      {/* PHV Notes */}
      {phvNotes && (
        <div className="glass rounded-lg p-3 border border-amber-500/20 flex items-start gap-2">
          <AlertTriangle size={14} className="text-amber-400 shrink-0 mt-0.5" />
          <div>
            <span className="text-[9px] font-bold text-amber-400 uppercase tracking-wider">
              {t("nextSessionRecommender.phvNote")}
            </span>
            <p className="text-[10px] text-muted-foreground mt-0.5">{phvNotes}</p>
          </div>
        </div>
      )}
    </div>
  );
}
