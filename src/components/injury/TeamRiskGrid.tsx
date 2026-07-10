/**
 * TeamRiskGrid — Grid view of all team players colored by injury risk
 *
 * Shows player cards in a grid with color-coded risk levels.
 * Click to navigate to individual player injury dashboard.
 * Gated: Club plan only.
 *
 * Sprint 11: Injury Dashboard & Alerts
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { useTranslation } from "react-i18next";
import { Users, Shield, AlertTriangle, ArrowRight } from "lucide-react";
import InjuryRiskGauge from "./InjuryRiskGauge";

// ── Types ───────────────────────────────────────────────────────────────────

export interface TeamPlayerRisk {
  playerId: string;
  name: string;
  position: string;
  age?: number;
  overallRisk: number;
  riskCategory: "low" | "moderate" | "high" | "critical";
  topFactor?: string;
  acwr?: number | null;
  coldStart?: boolean;
}

interface TeamRiskGridProps {
  players: TeamPlayerRisk[];
  onPlayerClick?: (playerId: string) => void;
  loading?: boolean;
}

// ── Sort helpers ────────────────────────────────────────────────────────────

const RISK_ORDER = { critical: 0, high: 1, moderate: 2, low: 3 };

function sortByRisk(a: TeamPlayerRisk, b: TeamPlayerRisk): number {
  return (RISK_ORDER[a.riskCategory] ?? 4) - (RISK_ORDER[b.riskCategory] ?? 4);
}

// ── Component ───────────────────────────────────────────────────────────────

export default function TeamRiskGrid({
  players,
  onPlayerClick,
  loading = false,
}: TeamRiskGridProps) {
  const { t } = useTranslation();
  const sorted = useMemo(() => [...players].sort(sortByRisk), [players]);

  const stats = useMemo(() => {
    const critical = players.filter((p) => p.riskCategory === "critical").length;
    const high = players.filter((p) => p.riskCategory === "high").length;
    const moderate = players.filter((p) => p.riskCategory === "moderate").length;
    const low = players.filter((p) => p.riskCategory === "low").length;
    return { critical, high, moderate, low };
  }, [players]);

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">{t("teamRiskGrid.title")}</h3>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-28 rounded-xl bg-muted/20 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-8">
        <Users size={24} className="text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">{t("teamRiskGrid.noData")}</p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users size={16} className="text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">{t("teamRiskGrid.title")}</h3>
        </div>
        <span className="text-[10px] text-muted-foreground">{t("teamRiskGrid.playerCount", { count: players.length })}</span>
      </div>

      {/* Summary badges */}
      <div className="flex flex-wrap gap-2">
        {stats.critical > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-red-500/10 border border-red-500/20">
            <AlertTriangle size={10} className="text-red-500" />
            <span className="text-[10px] font-bold text-red-500">{t("teamRiskGrid.critical", { count: stats.critical })}</span>
          </div>
        )}
        {stats.high > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-orange-500/10 border border-orange-500/20">
            <span className="text-[10px] font-medium text-orange-500">{t("teamRiskGrid.high", { count: stats.high })}</span>
          </div>
        )}
        {stats.moderate > 0 && (
          <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <span className="text-[10px] font-medium text-amber-500">{t("teamRiskGrid.moderate", { count: stats.moderate })}</span>
          </div>
        )}
        <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-emerald-500/10 border border-emerald-500/20">
          <Shield size={10} className="text-emerald-500" />
          <span className="text-[10px] font-medium text-emerald-500">{t("teamRiskGrid.low", { count: stats.low })}</span>
        </div>
      </div>

      {/* Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {sorted.map((player, i) => (
          <motion.div
            key={player.playerId}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.03 }}
            className="glass rounded-xl p-3 border border-border/30 hover:border-primary/30 transition-colors cursor-pointer group"
            onClick={() => onPlayerClick?.(player.playerId)}
          >
            <div className="flex items-start justify-between mb-2">
              <div className="min-w-0 flex-1">
                <p className="text-xs font-display font-bold text-foreground truncate">
                  {player.name}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {player.position}
                  {player.age ? ` · ${player.age}a` : ""}
                </p>
              </div>
              <InjuryRiskGauge
                value={player.overallRisk}
                category={player.riskCategory}
                size={36}
                showLabel={false}
                compact
              />
            </div>

            {player.topFactor && (
              <p className="text-[9px] text-muted-foreground truncate">
                {t("teamRiskGrid.factor", { factor: player.topFactor })}
              </p>
            )}

            {player.coldStart && (
              <p className="text-[8px] text-muted-foreground/50 mt-1">{t("teamRiskGrid.limitedData")}</p>
            )}

            <div className="flex items-center justify-end mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <ArrowRight size={10} className="text-primary" />
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
