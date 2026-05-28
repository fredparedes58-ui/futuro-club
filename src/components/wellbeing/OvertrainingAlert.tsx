/**
 * VITAS · OvertrainingAlert (Sprint 23)
 *
 * Card alert: ACWR trend + load vs recommended + suggested reduction.
 */
import { motion } from "framer-motion";
import { AlertTriangle, TrendingDown, Activity, ArrowDown } from "lucide-react";

interface Props {
  risk: number;          // 0-100
  riskLevel: string;
  currentLoadAU: number;
  recommendedLoadAU: number;
  adjustmentPct: number; // negative = reduce
  recommendations?: string[];
}

const LEVEL_CONFIG: Record<string, { color: string; bg: string; icon: string }> = {
  low:      { color: "text-emerald-400", bg: "bg-emerald-500/10", icon: "text-emerald-400" },
  moderate: { color: "text-amber-400",   bg: "bg-amber-500/10",   icon: "text-amber-400" },
  high:     { color: "text-orange-400",  bg: "bg-orange-500/10",  icon: "text-orange-400" },
  critical: { color: "text-red-400",     bg: "bg-red-500/10",     icon: "text-red-400" },
};

export default function OvertrainingAlert({
  risk, riskLevel, currentLoadAU, recommendedLoadAU, adjustmentPct, recommendations,
}: Props) {
  const config = LEVEL_CONFIG[riskLevel] ?? LEVEL_CONFIG.low;
  const needsReduction = adjustmentPct < -5;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Sobreentrenamiento
        </span>
        <div className={`flex items-center gap-1 px-2 py-0.5 rounded-full ${config.bg}`}>
          <AlertTriangle size={10} className={config.icon} />
          <span className={`text-[10px] font-bold ${config.color}`}>
            {risk}/100
          </span>
        </div>
      </div>

      {/* Load comparison */}
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <Activity size={14} className="text-muted-foreground mx-auto mb-1" />
          <div className="text-[8px] uppercase text-muted-foreground font-bold">Carga actual</div>
          <div className={`text-lg font-black font-mono ${needsReduction ? "text-orange-400" : "text-foreground"}`}>
            {currentLoadAU}
          </div>
          <div className="text-[8px] text-muted-foreground">AU/semana</div>
        </div>
        <div className="bg-white/5 rounded-lg p-3 text-center">
          <TrendingDown size={14} className="text-muted-foreground mx-auto mb-1" />
          <div className="text-[8px] uppercase text-muted-foreground font-bold">Recomendada</div>
          <div className="text-lg font-black font-mono text-emerald-400">
            {recommendedLoadAU}
          </div>
          <div className="text-[8px] text-muted-foreground">AU/semana</div>
        </div>
      </div>

      {/* Adjustment */}
      {needsReduction && (
        <motion.div
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
          className={`flex items-center gap-2 rounded-lg p-2.5 ${config.bg}`}
        >
          <ArrowDown size={14} className={config.color} />
          <div>
            <p className={`text-xs font-bold ${config.color}`}>
              Reducir carga {Math.abs(adjustmentPct)}%
            </p>
            <p className="text-[10px] text-muted-foreground">
              De {currentLoadAU} AU a {recommendedLoadAU} AU esta semana
            </p>
          </div>
        </motion.div>
      )}

      {/* Recommendations */}
      {recommendations && recommendations.length > 0 && (
        <div className="space-y-1">
          {recommendations.map((rec, i) => (
            <p key={i} className="text-[10px] text-muted-foreground flex items-start gap-1.5">
              <span className="text-muted-foreground/50 shrink-0">•</span>
              {rec}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
