/**
 * TeamValuationRanking — Ranked table of team players by valuation potential
 *
 * Club plan only. Shows all players ranked by ceiling score
 * with tier badges, VSI, and injury risk indicators.
 *
 * Sprint 13: Valuation Dashboard & Integration
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Trophy, ArrowRight, Download } from "lucide-react";
import { Button } from "@/components/ui/button";
import TierBadge from "./TierBadge";

export interface TeamPlayerValuation {
  playerId: string;
  name: string;
  position: string;
  age?: number;
  overallScore: number;
  tier: string;
  tierColor: string;
  vsi?: number | null;
  injuryRisk?: number | null;
}

interface TeamValuationRankingProps {
  players: TeamPlayerValuation[];
  onPlayerClick?: (playerId: string) => void;
  onExportCSV?: () => void;
  loading?: boolean;
}

export default function TeamValuationRanking({
  players,
  onPlayerClick,
  onExportCSV,
  loading = false,
}: TeamValuationRankingProps) {
  const sorted = useMemo(
    () => [...players].sort((a, b) => b.overallScore - a.overallScore),
    [players],
  );

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Ranking de Potencial</h3>
        </div>
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 rounded-xl bg-muted/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (players.length === 0) {
    return (
      <div className="text-center py-8">
        <Trophy size={24} className="text-muted-foreground/40 mx-auto mb-2" />
        <p className="text-xs text-muted-foreground">Sin datos de valoracion de equipo</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Trophy size={16} className="text-primary" />
          <h3 className="font-display font-bold text-sm text-foreground">Ranking de Potencial</h3>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-muted-foreground">{players.length} jugadores</span>
          {onExportCSV && (
            <Button variant="ghost" size="sm" onClick={onExportCSV} className="h-7 gap-1 text-xs">
              <Download size={12} /> CSV
            </Button>
          )}
        </div>
      </div>

      <div className="glass rounded-xl divide-y divide-border/30 overflow-hidden">
        {/* Header */}
        <div className="grid grid-cols-[2rem_1fr_4rem_4rem_3rem_3rem] gap-2 px-3 py-2 bg-muted/30">
          <span className="text-[9px] text-muted-foreground font-bold">#</span>
          <span className="text-[9px] text-muted-foreground font-bold">Jugador</span>
          <span className="text-[9px] text-muted-foreground font-bold text-center">Tier</span>
          <span className="text-[9px] text-muted-foreground font-bold text-center">Score</span>
          <span className="text-[9px] text-muted-foreground font-bold text-center">VSI</span>
          <span className="text-[9px] text-muted-foreground font-bold text-center">Risk</span>
        </div>

        {/* Rows */}
        {sorted.map((player, i) => (
          <motion.div
            key={player.playerId}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: i * 0.02 }}
            className="grid grid-cols-[2rem_1fr_4rem_4rem_3rem_3rem] gap-2 px-3 py-2 hover:bg-secondary/20 transition-colors cursor-pointer items-center"
            onClick={() => onPlayerClick?.(player.playerId)}
          >
            <span className="text-xs font-display font-bold text-muted-foreground">
              {i + 1}
            </span>
            <div className="min-w-0">
              <p className="text-xs font-medium text-foreground truncate">{player.name}</p>
              <p className="text-[9px] text-muted-foreground">
                {player.position}{player.age ? ` · ${player.age}a` : ""}
              </p>
            </div>
            <div className="flex justify-center">
              <TierBadge tier={player.tier} tierColor={player.tierColor} score={player.overallScore} compact />
            </div>
            <div className="text-center">
              <span className="text-xs font-display font-bold text-foreground">{player.overallScore}</span>
            </div>
            <div className="text-center">
              <span className="text-[10px] text-muted-foreground">{player.vsi ?? "—"}</span>
            </div>
            <div className="text-center">
              {player.injuryRisk != null ? (
                <span
                  className="text-[10px] font-bold"
                  style={{
                    color: player.injuryRisk >= 75 ? "#ef4444" :
                           player.injuryRisk >= 50 ? "#f97316" :
                           player.injuryRisk >= 30 ? "#eab308" :
                           "#22c55e",
                  }}
                >
                  {player.injuryRisk}
                </span>
              ) : (
                <span className="text-[10px] text-muted-foreground">—</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}
