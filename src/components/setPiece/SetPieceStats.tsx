/**
 * VITAS · SetPieceStats — Aggregate metrics card
 */

import { motion } from "framer-motion";
import { Trophy, Target, TrendingUp, Award } from "lucide-react";
import {
  PATTERN_LABELS,
  SET_PIECE_TYPE_LABELS,
} from "@/services/real/setPieceService";
import type { SetPieceAggregateStats } from "@/lib/setPiece/types";

interface SetPieceStatsProps {
  stats: SetPieceAggregateStats;
}

export default function SetPieceStats({ stats }: SetPieceStatsProps) {
  const pctConv = Math.round(stats.conversionRate * 100);
  const pctShot = Math.round(stats.shotRate * 100);

  return (
    <div className="space-y-4">
      {/* KPIs grid */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <KpiCard
          icon={<Trophy size={16} />}
          label="Goles"
          value={stats.goals.toString()}
          color="emerald"
          delay={0}
        />
        <KpiCard
          icon={<Target size={16} />}
          label="Tiros a puerta"
          value={stats.shotsOnTarget.toString()}
          color="blue"
          delay={0.05}
        />
        <KpiCard
          icon={<TrendingUp size={16} />}
          label="Conversión"
          value={`${pctConv}%`}
          sub={`Tiro: ${pctShot}%`}
          color="purple"
          delay={0.1}
        />
        <KpiCard
          icon={<Award size={16} />}
          label="xG promedio"
          value={stats.avgXG.toFixed(2)}
          sub={`${stats.total} jugadas`}
          color="amber"
          delay={0.15}
        />
      </div>

      {/* Distribution + top patterns */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Distribution by type */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2 }}
          className="glass rounded-xl p-4"
        >
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Distribución por tipo
          </h4>
          <div className="space-y-2">
            {Object.entries(stats.byType)
              .filter(([, count]) => count > 0)
              .sort((a, b) => b[1] - a[1])
              .map(([type, count]) => {
                const pct = stats.total > 0 ? (count / stats.total) * 100 : 0;
                return (
                  <div key={type} className="space-y-1">
                    <div className="flex items-center justify-between text-[11px]">
                      <span className="text-foreground/90">
                        {SET_PIECE_TYPE_LABELS[type as keyof typeof SET_PIECE_TYPE_LABELS]}
                      </span>
                      <span className="text-muted-foreground font-mono">
                        {count} ({pct.toFixed(0)}%)
                      </span>
                    </div>
                    <div className="h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${pct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className="h-full bg-gradient-to-r from-primary to-purple-500"
                      />
                    </div>
                  </div>
                );
              })}
          </div>
        </motion.div>

        {/* Top patterns */}
        <motion.div
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.25 }}
          className="glass rounded-xl p-4"
        >
          <h4 className="text-xs uppercase tracking-wider text-muted-foreground font-bold mb-3">
            Patrones más exitosos
          </h4>
          <div className="space-y-2">
            {stats.topPatterns.map((p) => {
              const successPct = Math.round(p.successRate * 100);
              const color =
                successPct >= 50
                  ? "bg-emerald-500"
                  : successPct >= 30
                  ? "bg-amber-500"
                  : "bg-red-500";
              return (
                <div
                  key={p.pattern}
                  className="flex items-center justify-between gap-3 p-2 rounded-lg hover:bg-secondary/30 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-display font-semibold text-foreground truncate">
                      {PATTERN_LABELS[p.pattern]}
                    </p>
                    <p className="text-[9px] text-muted-foreground">
                      {p.count} jugadas
                    </p>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <div className="w-16 h-1.5 bg-secondary/40 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{ width: `${successPct}%` }}
                        transition={{ duration: 0.6, ease: "easeOut" }}
                        className={`h-full ${color}`}
                      />
                    </div>
                    <span className="text-[10px] font-mono font-bold text-foreground w-8 text-right">
                      {successPct}%
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function KpiCard({
  icon,
  label,
  value,
  sub,
  color,
  delay,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  sub?: string;
  color: "emerald" | "blue" | "purple" | "amber";
  delay: number;
}) {
  const colorMap = {
    emerald: "text-emerald-500 bg-emerald-500/10",
    blue: "text-blue-500 bg-blue-500/10",
    purple: "text-purple-500 bg-purple-500/10",
    amber: "text-amber-500 bg-amber-500/10",
  };
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay }}
      className="glass rounded-xl p-3 space-y-2"
    >
      <div
        className={`w-8 h-8 rounded-lg flex items-center justify-center ${colorMap[color]}`}
      >
        {icon}
      </div>
      <div>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
          {label}
        </p>
        <p className="text-xl font-display font-bold text-foreground leading-none mt-1">
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-1">{sub}</p>}
      </div>
    </motion.div>
  );
}
