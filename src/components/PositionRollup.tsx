/**
 * VITAS · PositionRollup
 *
 * Muestra el agregado de TODOS los videos analizados de un jugador,
 * separado por posición jugada. Permite identificar:
 *   - cuántos videos tiene en cada posición
 *   - rendimiento medio (VSI / fit) por posición
 *   - posiciones declaradas vs descubiertas
 */
import { Compass, TrendingUp, AlertCircle } from "lucide-react";
import type { Player } from "@/services/real/playerService";

export interface PositionRollupRow {
  positionName: string;        // "Lateral Izquierdo"
  positionCode?: string;       // "LB"
  videoCount: number;          // 5
  avgVsi: number | null;       // 78
  avgFit?: number | null;      // 78
  isDeclared: boolean;         // true si está en declaredPositions
  isPrimary: boolean;          // true si es la primaria
  lastVideoAt?: string;        // ISO
}

interface Props {
  player: Player;
  rows: PositionRollupRow[];
}

export default function PositionRollup({ player, rows }: Props) {
  if (!rows || rows.length === 0) {
    return null;
  }

  // Ordenar: primaria primero, luego declaradas, luego descubiertas. Dentro de cada grupo, por avgVsi desc.
  const sorted = [...rows].sort((a, b) => {
    if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
    if (a.isDeclared !== b.isDeclared) return a.isDeclared ? -1 : 1;
    return (b.avgVsi ?? 0) - (a.avgVsi ?? 0);
  });

  const totalVideos = rows.reduce((s, r) => s + r.videoCount, 0);
  const bestRow = [...rows].sort((a, b) => (b.avgVsi ?? 0) - (a.avgVsi ?? 0))[0];

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-foreground flex items-center gap-2">
          <Compass size={13} className="text-primary" /> Polivalencia observada
        </h3>
        <span className="text-[10px] text-muted-foreground">{totalVideos} video{totalVideos !== 1 ? "s" : ""}</span>
      </div>

      <div className="space-y-1.5">
        {sorted.map((r) => (
          <div
            key={r.positionName}
            className={`flex items-center gap-3 p-2.5 rounded-lg border transition-colors ${
              r.isPrimary
                ? "border-primary/40 bg-primary/5"
                : r.isDeclared
                  ? "border-border bg-secondary/30"
                  : "border-electric/30 bg-electric/5"
            }`}
          >
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-sm font-display font-bold text-foreground">
                  {r.isPrimary && "⭐ "}{r.positionName}
                </span>
                {r.positionCode && (
                  <span className="text-[9px] text-muted-foreground font-mono">{r.positionCode}</span>
                )}
                {!r.isDeclared && (
                  <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-electric/20 text-electric font-bold">
                    descubierto
                  </span>
                )}
                {r.isPrimary && (
                  <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded bg-primary/20 text-primary font-bold">
                    principal
                  </span>
                )}
              </div>
              <p className="text-[10px] text-muted-foreground">
                {r.videoCount} video{r.videoCount !== 1 ? "s" : ""}
                {r.avgVsi !== null && ` · VSI medio ${r.avgVsi.toFixed(0)}`}
                {r.avgFit !== null && r.avgFit !== undefined && ` · fit ${r.avgFit.toFixed(0)}%`}
                {r.lastVideoAt && ` · último ${new Date(r.lastVideoAt).toLocaleDateString("es-ES")}`}
              </p>
            </div>
            {bestRow && r.positionName === bestRow.positionName && r.videoCount > 0 && (
              <div className="flex items-center gap-1 text-[10px] text-emerald-500 font-display font-bold">
                <TrendingUp size={10} /> mejor
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Sugerencia si hay descubrimientos no añadidos */}
      {rows.some((r) => !r.isDeclared) && (
        <div className="flex items-start gap-2 text-[10px] text-muted-foreground border-t border-border pt-2.5">
          <AlertCircle size={11} className="shrink-0 mt-0.5 text-electric" />
          <p>
            Hay posiciones donde {player.name} ha rendido bien pero no están en su perfil.
            Edita el jugador para añadirlas como secundarias y mejorar futuros análisis.
          </p>
        </div>
      )}
    </div>
  );
}
