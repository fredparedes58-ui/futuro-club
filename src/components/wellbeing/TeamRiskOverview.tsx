/**
 * VITAS · TeamRiskOverview (Sprint 23)
 *
 * Macro grid for directors: all players with risk traffic light + filters.
 */
import { useState } from "react";
import { motion } from "framer-motion";
import { AlertTriangle, Filter, ArrowUpDown } from "lucide-react";
import { useTranslation } from "react-i18next";

interface PlayerRisk {
  playerId: string;
  playerName: string;
  riskScore: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  primaryFactor: string;
  engagementTrend: string;
  attendanceRate: number;
}

interface Props {
  players: PlayerRisk[];
  onPlayerClick?: (playerId: string) => void;
}

const LEVEL_COLORS: Record<string, { bg: string; ring: string; dot: string }> = {
  low:      { bg: "bg-emerald-500/10", ring: "ring-emerald-500/30", dot: "bg-emerald-500" },
  moderate: { bg: "bg-amber-500/10",   ring: "ring-amber-500/30",   dot: "bg-amber-500" },
  high:     { bg: "bg-orange-500/10",  ring: "ring-orange-500/30",  dot: "bg-orange-500" },
  critical: { bg: "bg-red-500/10",     ring: "ring-red-500/30",     dot: "bg-red-500" },
};

const FACTOR_LABELS: Record<string, string> = {
  engagementDecline: "Engagement",
  motivationType: "Motivación",
  overtrainingRisk: "Sobreentren.",
  vsiStagnation: "VSI Estanc.",
  attendanceDecline: "Asistencia",
  injuryRecurrence: "Lesiones",
  growthSpurtStress: "Estirón",
  lowResilience: "Resiliencia",
};

type SortField = "riskScore" | "name" | "attendance";
type FilterLevel = "all" | "critical" | "high" | "moderate" | "low";

export default function TeamRiskOverview({ players, onPlayerClick }: Props) {
  const { t } = useTranslation();
  const [sortBy, setSortBy] = useState<SortField>("riskScore");
  const [filterLevel, setFilterLevel] = useState<FilterLevel>("all");

  const filtered = filterLevel === "all"
    ? players
    : players.filter(p => p.riskLevel === filterLevel);

  const sorted = [...filtered].sort((a, b) => {
    if (sortBy === "riskScore") return b.riskScore - a.riskScore;
    if (sortBy === "name") return a.playerName.localeCompare(b.playerName);
    return a.attendanceRate - b.attendanceRate;
  });

  const counts = {
    critical: players.filter(p => p.riskLevel === "critical").length,
    high: players.filter(p => p.riskLevel === "high").length,
    moderate: players.filter(p => p.riskLevel === "moderate").length,
    low: players.filter(p => p.riskLevel === "low").length,
  };

  return (
    <div className="space-y-4">
      {/* Summary pills */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {(["all", "critical", "high", "moderate", "low"] as FilterLevel[]).map(level => {
          const count = level === "all" ? players.length : counts[level as keyof typeof counts];
          const isActive = filterLevel === level;
          return (
            <button
              key={level}
              onClick={() => setFilterLevel(level)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-[10px] font-bold transition-all ${
                isActive
                  ? "bg-white/20 text-foreground ring-1 ring-white/30"
                  : "bg-white/5 text-muted-foreground hover:bg-white/10"
              }`}
            >
              {level === "all" ? t("teamRiskOverview.filterAll") : level === "critical" ? t("teamRiskOverview.filterCritical") : level === "high" ? t("teamRiskOverview.filterHigh") : level === "moderate" ? t("teamRiskOverview.filterModerate") : t("teamRiskOverview.filterLow")}
              {" "}({count})
            </button>
          );
        })}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2">
        <ArrowUpDown size={12} className="text-muted-foreground" />
        {(["riskScore", "name", "attendance"] as SortField[]).map(field => (
          <button
            key={field}
            onClick={() => setSortBy(field)}
            className={`text-[10px] px-2 py-0.5 rounded ${
              sortBy === field ? "bg-white/15 text-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {field === "riskScore" ? t("teamRiskOverview.sortRisk") : field === "name" ? t("teamRiskOverview.sortName") : t("teamRiskOverview.sortAttendance")}
          </button>
        ))}
      </div>

      {/* Player grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
        {sorted.map(player => {
          const levelConfig = LEVEL_COLORS[player.riskLevel] ?? LEVEL_COLORS.low;
          return (
            <motion.button
              key={player.playerId}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              onClick={() => onPlayerClick?.(player.playerId)}
              className={`text-left rounded-xl p-3 ring-1 transition-all ${levelConfig.bg} ${levelConfig.ring} hover:ring-2`}
            >
              <div className="flex items-center gap-2 mb-2">
                <div className={`w-2.5 h-2.5 rounded-full ${levelConfig.dot}`} />
                <span className="text-sm font-display font-bold text-foreground truncate flex-1">
                  {player.playerName}
                </span>
                <span className="text-sm font-mono font-black text-foreground">
                  {player.riskScore}
                </span>
              </div>
              <div className="flex items-center gap-3 text-[9px] text-muted-foreground">
                <span>{t("teamRiskOverview.factorLabel")}: {FACTOR_LABELS[player.primaryFactor] ?? player.primaryFactor}</span>
                <span>{t("teamRiskOverview.attendanceShort")}: {Math.round(player.attendanceRate)}%</span>
              </div>
            </motion.button>
          );
        })}
      </div>

      {sorted.length === 0 && (
        <div className="text-center py-8">
          <Filter size={20} className="text-muted-foreground mx-auto mb-2" />
          <p className="text-xs text-muted-foreground">{t("teamRiskOverview.emptyFilter")}</p>
        </div>
      )}
    </div>
  );
}
