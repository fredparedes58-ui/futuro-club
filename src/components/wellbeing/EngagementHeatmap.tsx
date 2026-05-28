/**
 * VITAS · EngagementHeatmap (Sprint 23)
 *
 * Heatmap: X=weeks, Y=players. Color=engagement score.
 * Interactive hover with detailed tooltip.
 */
import { useState } from "react";
import { motion } from "framer-motion";

interface PlayerWeekData {
  playerId: string;
  playerName: string;
  weeks: Array<{
    weekLabel: string;
    score: number | null; // null = no data
  }>;
}

interface Props {
  data: PlayerWeekData[];
}

function cellColor(score: number | null): string {
  if (score === null) return "rgba(255,255,255,0.03)";
  if (score >= 70) return "rgba(34,197,94,0.6)";
  if (score >= 50) return "rgba(245,158,11,0.5)";
  if (score >= 30) return "rgba(249,115,22,0.5)";
  return "rgba(239,68,68,0.5)";
}

export default function EngagementHeatmap({ data }: Props) {
  const [hoveredCell, setHoveredCell] = useState<{ player: string; week: string; score: number | null } | null>(null);

  if (data.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center">
        <p className="text-xs text-muted-foreground">Sin datos de engagement</p>
      </div>
    );
  }

  const weeks = data[0]?.weeks.map(w => w.weekLabel) ?? [];

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Engagement del Equipo
      </span>

      <div className="overflow-x-auto">
        <div className="min-w-[400px]">
          {/* Week headers */}
          <div className="flex mb-1">
            <div className="w-24 shrink-0" />
            {weeks.map(w => (
              <div key={w} className="flex-1 text-center text-[8px] text-muted-foreground">
                {w}
              </div>
            ))}
          </div>

          {/* Player rows */}
          {data.map(player => (
            <div key={player.playerId} className="flex items-center mb-0.5">
              <div className="w-24 shrink-0 text-[10px] text-muted-foreground truncate pr-2">
                {player.playerName}
              </div>
              <div className="flex flex-1 gap-0.5">
                {player.weeks.map((w, i) => (
                  <motion.div
                    key={i}
                    className="flex-1 h-6 rounded-sm cursor-pointer transition-all"
                    style={{ backgroundColor: cellColor(w.score) }}
                    whileHover={{ scale: 1.3, zIndex: 10 }}
                    onMouseEnter={() => setHoveredCell({ player: player.playerName, week: w.weekLabel, score: w.score })}
                    onMouseLeave={() => setHoveredCell(null)}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Tooltip */}
      {hoveredCell && (
        <div className="text-center text-[10px] text-muted-foreground">
          {hoveredCell.player} · {hoveredCell.week}:{" "}
          <span className="font-bold text-foreground">
            {hoveredCell.score !== null ? `${Math.round(hoveredCell.score)}/100` : "Sin datos"}
          </span>
        </div>
      )}

      {/* Legend */}
      <div className="flex items-center justify-center gap-3">
        {[
          { label: "Alto", color: "rgba(34,197,94,0.6)" },
          { label: "Medio", color: "rgba(245,158,11,0.5)" },
          { label: "Bajo", color: "rgba(249,115,22,0.5)" },
          { label: "Crítico", color: "rgba(239,68,68,0.5)" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: l.color }} />
            <span className="text-[8px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
