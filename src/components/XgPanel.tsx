/**
 * VITAS · XG Panel (Sprint 6 — xG with PHV)
 *
 * UI panel showing:
 *   - Total xG number (with PHV adjustment indicator)
 *   - Shot map with proportional circles
 *   - Cumulative xG timeline
 *   - Key stats: goals, overperformance, xG/90
 */

import React from "react";
import type { XgSummary } from "@/lib/xg/xgAccumulator";

interface XgPanelProps {
  summary: XgSummary | null;
  /** Whether PHV adjustment is active */
  phvActive?: boolean;
  /** Player's PHV offset */
  phvOffset?: number | null;
}

const XgPanel: React.FC<XgPanelProps> = ({
  summary,
  phvActive = false,
  phvOffset = null,
}) => {
  if (!summary || summary.shotCount === 0) {
    return (
      <div className="glass rounded-xl p-4 space-y-2">
        <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
          Expected Goals (xG)
        </h3>
        <p className="text-[11px] text-muted-foreground">
          No se han detectado tiros aún. Los datos xG aparecerán cuando se detecten disparos al arco.
        </p>
      </div>
    );
  }

  const displayXg = phvActive && summary.totalXgPhvAdjusted !== null
    ? summary.totalXgPhvAdjusted
    : summary.totalXg;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
          Expected Goals (xG)
        </h3>
        {phvActive && phvOffset !== null && (
          <span className="text-[8px] px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20 font-display">
            PHV {phvOffset > 0 ? "+" : ""}{phvOffset.toFixed(1)}
          </span>
        )}
      </div>

      {/* Main xG Display */}
      <div className="flex items-baseline gap-3">
        <span className="text-3xl font-display font-black text-primary tabular-nums">
          {displayXg.toFixed(2)}
        </span>
        <span className="text-[10px] font-display text-muted-foreground uppercase">
          xG total
        </span>
        {summary.goals > 0 && (
          <span className="text-lg font-display font-bold text-green-400 ml-auto">
            {summary.goals} GOL{summary.goals > 1 ? "ES" : ""}
          </span>
        )}
      </div>

      {/* Overperformance indicator */}
      {summary.shotCount >= 2 && (
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${
            summary.overperformance > 0 ? "bg-green-400" :
            summary.overperformance < -0.3 ? "bg-red-400" : "bg-yellow-400"
          }`} />
          <span className="text-[10px] font-display text-muted-foreground">
            {summary.overperformance > 0
              ? `+${summary.overperformance.toFixed(2)} sobre esperado`
              : summary.overperformance < 0
                ? `${summary.overperformance.toFixed(2)} bajo esperado`
                : "En línea con esperado"}
          </span>
        </div>
      )}

      {/* Stats Grid */}
      <div className="grid grid-cols-3 gap-2">
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-[8px] text-muted-foreground uppercase font-display">Tiros</p>
          <p className="text-sm font-display font-bold text-foreground">{summary.shotCount}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-[8px] text-muted-foreground uppercase font-display">xG/Tiro</p>
          <p className="text-sm font-display font-bold text-foreground">{summary.avgXgPerShot.toFixed(2)}</p>
        </div>
        <div className="text-center p-2 rounded-lg bg-secondary/30">
          <p className="text-[8px] text-muted-foreground uppercase font-display">xG/90</p>
          <p className="text-sm font-display font-bold text-foreground">
            {summary.sessionMinutes > 5 ? summary.xgPer90.toFixed(2) : "—"}
          </p>
        </div>
      </div>

      {/* Shot Map (mini pitch) */}
      {summary.shots.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
            Mapa de Tiros
          </p>
          <div className="relative w-full h-24 bg-green-900/20 rounded-lg border border-green-800/30 overflow-hidden">
            {/* Half-field representation (attacking half) */}
            {/* Penalty area box */}
            <div className="absolute border border-green-600/30"
              style={{ left: "60%", top: "15%", width: "35%", height: "70%" }} />
            {/* Goal area box */}
            <div className="absolute border border-green-600/30"
              style={{ left: "82%", top: "30%", width: "15%", height: "40%" }} />
            {/* Goal line */}
            <div className="absolute bg-green-400/40"
              style={{ right: "2%", top: "38%", width: "2px", height: "24%" }} />

            {/* Shot circles */}
            {summary.shots.map((shot, i) => {
              // Map field coords (only showing attacking half: x 52.5-105, y 0-68)
              const relX = Math.max(0, Math.min(1, (shot.position.fx - 52.5) / 52.5));
              const relY = Math.max(0, Math.min(1, shot.position.fy / 68));
              // Circle size proportional to xG (min 4px, max 16px)
              const size = Math.max(4, Math.min(16, shot.xg * 40));

              return (
                <div
                  key={`shot-${i}-${shot.timestampMs}`}
                  className={`absolute rounded-full border-2 ${
                    shot.isGoal
                      ? "bg-green-400/60 border-green-400"
                      : "bg-red-400/40 border-red-400/60"
                  }`}
                  style={{
                    left: `${relX * 95 + 2}%`,
                    top: `${relY * 90 + 5}%`,
                    width: `${size}px`,
                    height: `${size}px`,
                    transform: "translate(-50%, -50%)",
                  }}
                  title={`xG: ${shot.xg.toFixed(2)} | ${shot.isGoal ? "GOL" : "No gol"} | ${shot.distanceM.toFixed(0)}m`}
                />
              );
            })}
          </div>
          <div className="flex items-center gap-3 justify-center">
            <span className="flex items-center gap-1 text-[8px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-green-400 inline-block" /> Gol
            </span>
            <span className="flex items-center gap-1 text-[8px] text-muted-foreground">
              <span className="w-2 h-2 rounded-full bg-red-400/60 inline-block" /> No gol
            </span>
            <span className="text-[8px] text-muted-foreground">
              Tamaño = xG
            </span>
          </div>
        </div>
      )}

      {/* PHV Adjustment Note */}
      {phvActive && summary.totalXgPhvAdjusted !== null && summary.totalXgPhvAdjusted !== summary.totalXg && (
        <div className="text-[9px] text-orange-400/80 bg-orange-500/5 rounded-lg px-3 py-1.5 border border-orange-500/10">
          xG ajustado por madurez biológica: {summary.totalXg.toFixed(2)} → {summary.totalXgPhvAdjusted.toFixed(2)}
          {phvOffset !== null && phvOffset < -2 && " (pre-PHV: distancia y cabezazos reducidos)"}
          {phvOffset !== null && phvOffset >= -2 && phvOffset <= 1 && " (circa-PHV: ajuste moderado)"}
        </div>
      )}
    </div>
  );
};

export default XgPanel;
