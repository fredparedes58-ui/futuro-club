/**
 * VITAS · Team Dashboard (Sprint 8)
 *
 * Dashboard showing team-level analysis:
 *   - Formation 2D visualization
 *   - Pass network graph
 *   - Possession timeline
 *   - Pressing heatmap
 *   - Comparative table (home vs away)
 *   - Rival scouting insights
 */

import React from "react";
import type { TeamAnalysisReport, PossessionStat, TeamMetrics } from "@/lib/tracking/teamAnalysisEngine";
import type { FormationTimeline, DetectedFormation } from "@/lib/tracking/formationDetector";
import type { RivalScoutReport } from "@/lib/tracking/rivalAnalysisEngine";

// ─── Types ───────────────────────────────────────────────────────────────────

interface TeamDashboardProps {
  teamReport: TeamAnalysisReport | null;
  homeFormation: FormationTimeline | null;
  awayFormation: FormationTimeline | null;
  rivalReport: RivalScoutReport | null;
  /** Which mode: "team" for full comparison, "rival" for scouting */
  mode: "team" | "rival";
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

const StatCard: React.FC<{
  label: string;
  value: string | number;
  color?: string;
  sub?: string;
}> = ({ label, value, color = "text-primary", sub }) => (
  <div className="glass rounded-lg p-3 text-center">
    <p className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">
      {label}
    </p>
    <p className={`text-lg font-display font-black ${color}`}>{value}</p>
    {sub && <p className="text-[8px] text-muted-foreground">{sub}</p>}
  </div>
);

const CompareRow: React.FC<{
  label: string;
  homeVal: string | number;
  awayVal: string | number;
  highlight?: "home" | "away" | "none";
}> = ({ label, homeVal, awayVal, highlight = "none" }) => (
  <div className="flex items-center justify-between py-1.5 border-b border-border/30 last:border-0">
    <span
      className={`text-xs font-display font-bold tabular-nums ${
        highlight === "home" ? "text-blue-400" : "text-foreground"
      }`}
    >
      {homeVal}
    </span>
    <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground flex-1 text-center">
      {label}
    </span>
    <span
      className={`text-xs font-display font-bold tabular-nums ${
        highlight === "away" ? "text-red-400" : "text-foreground"
      }`}
    >
      {awayVal}
    </span>
  </div>
);

// ─── Formation Mini Pitch ────────────────────────────────────────────────────

const FormationViz: React.FC<{
  formation: DetectedFormation | null;
  label: string;
  color: string;
}> = ({ formation, label, color }) => {
  if (!formation || formation.lines.length === 0) {
    return (
      <div className="glass rounded-lg p-3 text-center">
        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <p className="text-xs text-muted-foreground mt-1">No detectada</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-lg p-3">
      <div className="flex items-center justify-between mb-2">
        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
          {label}
        </p>
        <span
          className={`text-[10px] font-display font-bold px-1.5 py-0.5 rounded ${color}`}
        >
          {formation.label}
        </span>
      </div>
      <div className="relative w-full h-28 bg-green-900/20 rounded-lg border border-green-800/30 overflow-hidden">
        {/* Field markings */}
        <div
          className="absolute border-r border-green-600/20"
          style={{ left: "50%", top: 0, bottom: 0 }}
        />
        <div
          className="absolute border border-green-600/20 rounded-full"
          style={{
            left: "50%",
            top: "50%",
            width: 20,
            height: 20,
            transform: "translate(-50%, -50%)",
          }}
        />

        {/* Formation lines and dots */}
        {formation.lines.map((line, li) => {
          const relX = (line.avgX / 105) * 100;
          return line.trackIds.map((_, pi) => {
            const ySpread = line.playerCount > 1 ? 70 : 0;
            const yOffset = line.playerCount > 1
              ? ((pi / (line.playerCount - 1)) * ySpread) + (100 - ySpread) / 2
              : 50;
            return (
              <div
                key={`${li}-${pi}`}
                className={`absolute w-3 h-3 rounded-full border-2 ${color.includes("blue") ? "bg-blue-400/60 border-blue-400" : "bg-red-400/60 border-red-400"}`}
                style={{
                  left: `${relX}%`,
                  top: `${yOffset}%`,
                  transform: "translate(-50%, -50%)",
                }}
              />
            );
          });
        })}

        {/* GK dot */}
        {formation.gkDetected && (
          <div
            className={`absolute w-3.5 h-3.5 rounded-full border-2 ${color.includes("blue") ? "bg-yellow-400/60 border-yellow-400" : "bg-yellow-400/60 border-yellow-400"}`}
            style={{ left: "5%", top: "50%", transform: "translate(-50%, -50%)" }}
          />
        )}
      </div>
      <p className="text-[8px] text-muted-foreground mt-1 text-center">
        Confianza: {Math.round(formation.confidence * 100)}%
      </p>
    </div>
  );
};

// ─── Main Component ──────────────────────────────────────────────────────────

const TeamDashboard: React.FC<TeamDashboardProps> = ({
  teamReport,
  homeFormation,
  awayFormation,
  rivalReport,
  mode,
}) => {
  if (!teamReport) {
    return (
      <div className="glass rounded-xl p-4 space-y-2">
        <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
          {mode === "team" ? "Análisis de Equipo" : "Scouting Rival"}
        </h3>
        <p className="text-[11px] text-muted-foreground">
          Inicia tracking en modo equipo para ver métricas tácticas.
        </p>
      </div>
    );
  }

  const { cumulative } = teamReport;
  const home = cumulative.home;
  const away = cumulative.away;
  const poss = cumulative.possession;

  // ── Team comparison mode ────────────────────────────────────────────────
  if (mode === "team") {
    return (
      <div className="space-y-4">
        {/* Header */}
        <div className="glass rounded-xl p-4">
          <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">
            Análisis Táctico de Equipo
          </h3>

          {/* Possession Bar */}
          <div className="mb-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-display font-bold text-blue-400">
                {poss.homePct}%
              </span>
              <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                Posesión
              </span>
              <span className="text-xs font-display font-bold text-red-400">
                {poss.awayPct}%
              </span>
            </div>
            <div className="flex h-2 rounded-full overflow-hidden gap-px">
              <div className="bg-blue-400" style={{ width: `${poss.homePct}%` }} />
              <div className="bg-muted" style={{ width: `${poss.contestedPct}%` }} />
              <div className="bg-red-400" style={{ width: `${poss.awayPct}%` }} />
            </div>
          </div>

          {/* Comparison Table */}
          <div className="space-y-0">
            <div className="flex items-center justify-between pb-1.5 mb-1 border-b border-border">
              <span className="text-[10px] font-display font-bold text-blue-400 uppercase">
                Local
              </span>
              <span className="text-[10px] font-display font-bold text-red-400 uppercase">
                Visitante
              </span>
            </div>
            <CompareRow
              label="Jugadores"
              homeVal={home.playerCount}
              awayVal={away.playerCount}
            />
            <CompareRow
              label="Vel. Prom"
              homeVal={`${(home.avgSpeedMs * 3.6).toFixed(1)} km/h`}
              awayVal={`${(away.avgSpeedMs * 3.6).toFixed(1)} km/h`}
              highlight={home.avgSpeedMs > away.avgSpeedMs ? "home" : "away"}
            />
            <CompareRow
              label="Compactación"
              homeVal={`${home.compactnessM}m`}
              awayVal={`${away.compactnessM}m`}
              highlight={home.compactnessM < away.compactnessM ? "home" : "away"}
            />
            <CompareRow
              label="Amplitud"
              homeVal={`${home.widthM}m`}
              awayVal={`${away.widthM}m`}
              highlight={home.widthM > away.widthM ? "home" : "away"}
            />
            <CompareRow
              label="Línea Def."
              homeVal={`${home.defensiveLineX}m`}
              awayVal={`${away.defensiveLineX}m`}
            />
            <CompareRow
              label="PPDA"
              homeVal={cumulative.pressing.home.ppda}
              awayVal={cumulative.pressing.away.ppda}
              highlight={
                cumulative.pressing.home.ppda < cumulative.pressing.away.ppda
                  ? "home"
                  : "away"
              }
            />
            <CompareRow
              label="Terr. Final"
              homeVal={`${poss.homeFinalThirdPct}%`}
              awayVal={`${poss.awayFinalThirdPct}%`}
              highlight={
                poss.homeFinalThirdPct > poss.awayFinalThirdPct ? "home" : "away"
              }
            />
          </div>
        </div>

        {/* Formations */}
        <div className="grid grid-cols-2 gap-3">
          <FormationViz
            formation={homeFormation?.formations[homeFormation.formations.length - 1] ?? null}
            label={`Local · ${homeFormation?.dominant ?? "?"}`}
            color="bg-blue-500/10 text-blue-400 border border-blue-500/20"
          />
          <FormationViz
            formation={awayFormation?.formations[awayFormation.formations.length - 1] ?? null}
            label={`Visitante · ${awayFormation?.dominant ?? "?"}`}
            color="bg-red-500/10 text-red-400 border border-red-500/20"
          />
        </div>

        {/* Pass Networks (summary) */}
        <div className="grid grid-cols-2 gap-3">
          <div className="glass rounded-lg p-3">
            <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">
              Red de Pases (Local)
            </p>
            <p className="text-sm font-display font-bold text-blue-400">
              {teamReport.homePassNetwork.totalPasses} pases
            </p>
            <p className="text-[9px] text-muted-foreground">
              {teamReport.homePassNetwork.completionPct}% completados
            </p>
          </div>
          <div className="glass rounded-lg p-3">
            <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">
              Red de Pases (Visitante)
            </p>
            <p className="text-sm font-display font-bold text-red-400">
              {teamReport.awayPassNetwork.totalPasses} pases
            </p>
            <p className="text-[9px] text-muted-foreground">
              {teamReport.awayPassNetwork.completionPct}% completados
            </p>
          </div>
        </div>
      </div>
    );
  }

  // ── Rival scouting mode ─────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <div className="glass rounded-xl p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
            Scouting Report — Rival
          </h3>
          {rivalReport && (
            <span className="text-[9px] font-display px-1.5 py-0.5 rounded-full bg-orange-500/10 text-orange-400 border border-orange-500/20">
              {Math.round(rivalReport.confidence * 100)}% confianza
            </span>
          )}
        </div>

        {!rivalReport ? (
          <p className="text-[11px] text-muted-foreground">
            Generando informe de scouting...
          </p>
        ) : (
          <div className="space-y-3">
            {/* Formation */}
            <FormationViz
              formation={rivalReport.formation}
              label={`Formación Rival · ${rivalReport.formation?.label ?? "?"}`}
              color="bg-red-500/10 text-red-400 border border-red-500/20"
            />

            {/* Key Stats */}
            <div className="grid grid-cols-3 gap-2">
              <StatCard
                label="PPDA"
                value={rivalReport.pressing?.ppda ?? "—"}
                color="text-orange-400"
                sub="Intensidad presión"
              />
              <StatCard
                label="Pases"
                value={rivalReport.passNetwork?.totalPasses ?? 0}
                color="text-blue-400"
                sub={`${rivalReport.passNetwork?.completionPct ?? 0}%`}
              />
              <StatCard
                label="Jugadores"
                value={rivalReport.metrics?.playerCount ?? 0}
                color="text-foreground"
                sub="Detectados"
              />
            </div>

            {/* Vulnerabilities */}
            {rivalReport.vulnerabilities.length > 0 && (
              <div>
                <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Vulnerabilidades
                </p>
                <div className="space-y-2">
                  {rivalReport.vulnerabilities.map((v, i) => (
                    <div
                      key={i}
                      className="glass rounded-lg px-3 py-2 border-l-2 border-orange-400"
                    >
                      <p className="text-[10px] font-display font-semibold text-foreground">
                        {v.description}
                      </p>
                      <p className="text-[9px] text-muted-foreground mt-0.5">
                        {v.recommendation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Key Players */}
            {rivalReport.keyPlayers.length > 0 && (
              <div>
                <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Jugadores Clave (Rival)
                </p>
                <div className="space-y-1.5">
                  {rivalReport.keyPlayers.map((kp) => (
                    <div
                      key={kp.trackId}
                      className="flex items-center justify-between glass rounded-lg px-3 py-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] font-display font-bold text-red-400">
                          #{kp.trackId}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 font-display">
                          {kp.role.replace("_", " ")}
                        </span>
                      </div>
                      <span className="text-[9px] text-muted-foreground font-display">
                        ({kp.avgPosition.fx.toFixed(0)}, {kp.avgPosition.fy.toFixed(0)})
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Build-up Patterns */}
            {rivalReport.buildUpPatterns.length > 0 && (
              <div>
                <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Patrones de Juego
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rivalReport.buildUpPatterns.map((p, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-2 py-1 rounded-lg bg-muted text-foreground font-display border border-border"
                    >
                      {p.name} ({Math.round(p.frequency * 100)}%)
                    </span>
                  ))}
                </div>
              </div>
            )}

            {/* Gaps */}
            {rivalReport.gaps.length > 0 && (
              <div>
                <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                  Zonas Descubiertas
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {rivalReport.gaps.map((g, i) => (
                    <span
                      key={i}
                      className="text-[9px] px-2 py-1 rounded-lg bg-yellow-500/10 text-yellow-400 font-display border border-yellow-500/20"
                    >
                      {g.zone} ({Math.round(g.frequency * 100)}%)
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default TeamDashboard;
