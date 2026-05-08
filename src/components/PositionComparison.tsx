/**
 * VITAS · PositionComparison
 *
 * Para jugadores polivalentes: muestra cómo rinde en cada posición jugada,
 * destaca cuál es su mejor encaje y compara fortalezas/debilidades por posición.
 *
 * Reusa los datos del rollup pero los presenta en formato comparativo.
 */
import { TrendingUp, Trophy, BarChart3 } from "lucide-react";
import type { PositionRollupRow } from "./PositionRollup";

interface Props {
  rows: PositionRollupRow[];
}

export default function PositionComparison({ rows }: Props) {
  // Solo posiciones con al menos 1 video (rendimiento real)
  const withVideos = rows.filter((r) => r.videoCount > 0 && r.avgVsi !== null);
  if (withVideos.length < 2) return null; // Necesita al menos 2 para comparar

  const sorted = [...withVideos].sort((a, b) => (b.avgVsi ?? 0) - (a.avgVsi ?? 0));
  const best = sorted[0];
  const worst = sorted[sorted.length - 1];
  const spread = (best.avgVsi ?? 0) - (worst.avgVsi ?? 0);

  // Comparar respecto a la media global
  const overall = withVideos.reduce((s, r) => s + (r.avgVsi ?? 0), 0) / withVideos.length;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <BarChart3 size={13} className="text-primary" />
        <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-foreground">
          Comparativa por posición
        </h3>
      </div>

      {/* Ganador destacado */}
      <div className="rounded-lg p-3 bg-primary/5 border border-primary/30 flex items-center gap-3">
        <Trophy size={16} className="text-primary shrink-0" />
        <div className="flex-1">
          <p className="text-[10px] uppercase tracking-wider text-primary font-bold">Mejor encaje</p>
          <p className="text-sm font-display font-bold text-foreground">
            Rinde mejor como {best.positionName}
          </p>
          <p className="text-[11px] text-muted-foreground">
            VSI {best.avgVsi?.toFixed(0)} ({best.videoCount} video{best.videoCount > 1 ? "s" : ""})
            {spread >= 5 && ` · ${spread.toFixed(0)} pts por encima de su peor posición`}
          </p>
        </div>
      </div>

      {/* Barras comparativas */}
      <div className="space-y-2">
        {sorted.map((r) => {
          const vsi = r.avgVsi ?? 0;
          const diffFromAvg = vsi - overall;
          const isBest = r.positionName === best.positionName;
          return (
            <div key={r.positionName} className="space-y-1">
              <div className="flex items-center justify-between text-xs">
                <span className={`font-display ${isBest ? "font-bold text-primary" : "text-foreground"}`}>
                  {r.isPrimary && "⭐ "}{r.positionName}
                  {!r.isDeclared && (
                    <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-electric/20 text-electric font-bold ml-1">
                      descubierto
                    </span>
                  )}
                </span>
                <span className="font-mono text-foreground">
                  {vsi.toFixed(0)}
                  {diffFromAvg !== 0 && (
                    <span className={`ml-1 text-[9px] ${diffFromAvg > 0 ? "text-emerald-500" : "text-amber-500"}`}>
                      {diffFromAvg > 0 ? "+" : ""}{diffFromAvg.toFixed(0)}
                    </span>
                  )}
                </span>
              </div>
              <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                <div
                  className={`h-full rounded-full ${isBest ? "bg-primary" : "bg-muted-foreground/40"}`}
                  style={{ width: `${Math.min(100, vsi)}%` }}
                />
              </div>
              <p className="text-[9px] text-muted-foreground">
                {r.videoCount} video{r.videoCount > 1 ? "s" : ""}
                {r.lastVideoAt && ` · último ${new Date(r.lastVideoAt).toLocaleDateString("es-ES")}`}
              </p>
            </div>
          );
        })}
      </div>

      {/* Insight insightful */}
      {spread >= 8 && (
        <div className="flex items-start gap-2 text-[11px] text-muted-foreground border-t border-border pt-2.5">
          <TrendingUp size={11} className="text-emerald-500 shrink-0 mt-0.5" />
          <p>
            Diferencia significativa ({spread.toFixed(0)} pts VSI). Considera dar más minutos
            como <strong className="text-foreground">{best.positionName}</strong> si la disponibilidad táctica lo permite.
          </p>
        </div>
      )}
    </div>
  );
}
