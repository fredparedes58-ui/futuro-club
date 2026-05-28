/**
 * VITAS · ParticipationHeatmap (Sprint 16)
 *
 * Heatmap: X = drills, Y = players, color = participationScore.
 * Uses Recharts ScatterChart to render a grid heatmap.
 */
import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import type { PlayerDrillMetrics, DrillCategory } from "@/lib/shared/sessionTypes";

interface Props {
  metrics: PlayerDrillMetrics[];
  playerNames?: Record<string, string>;
}

const DRILL_SHORT: Record<DrillCategory, string> = {
  rondo: "Ron",
  possession: "Pos",
  positional_play: "P.P",
  small_sided_game: "SSG",
  full_game: "PRT",
  shooting_drill: "Tir",
  pressing_drill: "Pre",
  transition_drill: "Tra",
  individual_technique: "Tec",
  set_piece_practice: "ABP",
  physical_conditioning: "Fís",
  warmup: "Cal",
  cooldown: "VC",
};

function scoreColor(v: number): string {
  if (v >= 75) return "bg-emerald-500/80";
  if (v >= 55) return "bg-emerald-500/40";
  if (v >= 40) return "bg-amber-500/40";
  if (v >= 25) return "bg-red-500/40";
  return "bg-red-500/70";
}

export default function ParticipationHeatmap({ metrics, playerNames }: Props) {
  const [hoveredCell, setHoveredCell] = useState<{ player: string; drill: number } | null>(null);

  const { playerIds, drillIndices, grid } = useMemo(() => {
    const pSet = new Set<string>();
    const dSet = new Set<number>();
    const grid = new Map<string, PlayerDrillMetrics>();

    for (const m of metrics) {
      pSet.add(m.playerId);
      dSet.add(m.drillIndex);
      grid.set(`${m.playerId}-${m.drillIndex}`, m);
    }

    return {
      playerIds: Array.from(pSet),
      drillIndices: Array.from(dSet).sort((a, b) => a - b),
      grid,
    };
  }, [metrics]);

  if (playerIds.length === 0 || drillIndices.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        Sin datos de participación disponibles
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Participación por Jugador × Ejercicio
      </span>

      <div className="overflow-x-auto -mx-2 px-2">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="text-[9px] text-muted-foreground font-normal text-left pr-2 pb-1">
                Jugador
              </th>
              {drillIndices.map(di => {
                const sample = metrics.find(m => m.drillIndex === di);
                return (
                  <th key={di} className="text-[8px] text-muted-foreground font-normal text-center pb-1 px-0.5 min-w-[28px]">
                    {sample ? DRILL_SHORT[sample.drillType] || `E${di + 1}` : `E${di + 1}`}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {playerIds.map(pid => (
              <tr key={pid}>
                <td className="text-[9px] text-foreground/70 pr-2 py-0.5 whitespace-nowrap max-w-[80px] truncate">
                  {playerNames?.[pid] ?? pid.slice(0, 8)}
                </td>
                {drillIndices.map(di => {
                  const m = grid.get(`${pid}-${di}`);
                  const score = m?.participationScore ?? 0;
                  const isHovered =
                    hoveredCell?.player === pid && hoveredCell?.drill === di;

                  return (
                    <td key={di} className="px-0.5 py-0.5">
                      <motion.div
                        className={`w-6 h-6 rounded-sm ${scoreColor(score)} flex items-center justify-center cursor-default relative`}
                        onMouseEnter={() => setHoveredCell({ player: pid, drill: di })}
                        onMouseLeave={() => setHoveredCell(null)}
                        whileHover={{ scale: 1.3, zIndex: 10 }}
                      >
                        <span className="text-[8px] font-mono font-bold text-white/90">
                          {Math.round(score)}
                        </span>

                        {isHovered && m && (
                          <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 z-20 pointer-events-none">
                            <div className="glass rounded-md px-2 py-1 text-[9px] whitespace-nowrap space-y-0.5">
                              <div>Toques: <b>{m.touches}</b></div>
                              <div>Distancia: <b>{m.distanceM.toFixed(0)}m</b></div>
                              <div>Intensidad: <b>{Math.round(m.avgIntensity)}</b></div>
                              <div>Idle: <b>{Math.round(m.idlePct)}%</b></div>
                            </div>
                          </div>
                        )}
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Color legend */}
      <div className="flex items-center gap-2 justify-center">
        {[
          { label: "Bajo", cls: "bg-red-500/70" },
          { label: "Medio", cls: "bg-amber-500/40" },
          { label: "Alto", cls: "bg-emerald-500/40" },
          { label: "Excelente", cls: "bg-emerald-500/80" },
        ].map(l => (
          <div key={l.label} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${l.cls}`} />
            <span className="text-[8px] text-muted-foreground">{l.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
