/**
 * VITAS · BestMatchProByPosition
 *
 * Para cada posición declarada del jugador, muestra el referente pro
 * con el que más se parece. Útil para coaches que quieren explicar
 * a un padre/jugador "se parece a Modric en su rol como CAM".
 *
 * Datos: usa el endpoint /api/players/search para encontrar pros con
 * la misma posición + métricas similares.
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { Trophy, ExternalLink } from "lucide-react";
import type { Player } from "@/services/real/playerService";

interface IndexedProPlayer {
  id:    string;
  name:  string;
  short_name: string;
  position: string;
  club:  string | null;
  league: string;
  vsi_estimated: number;
  metric_speed: number;
  metric_shooting: number;
  metric_vision: number;
  metric_technique: number;
  metric_defending: number;
  metric_stamina: number;
}

interface Props {
  player: Player;
}

// Mapeo Spanish → códigos cortos para coincidir con la base
const POS_TO_CODE: Record<string, string> = {
  "Portero": "GK",
  "Defensa Central": "CB",
  "Lateral Derecho": "RB",
  "Lateral Izquierdo": "LB",
  "Pivote": "CDM",
  "Mediocentro": "CM",
  "Mediapunta": "CAM",
  "Extremo Derecho": "RW",
  "Extremo Izquierdo": "LW",
  "Delantero": "ST",
};

export default function BestMatchProByPosition({ player }: Props) {
  const { t } = useTranslation();
  const declared = [player.position, ...(player.secondaryPositions ?? [])].filter(Boolean);
  const [matches, setMatches] = useState<Record<string, IndexedProPlayer | null>>({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function run() {
      setLoading(true);
      const results: Record<string, IndexedProPlayer | null> = {};
      for (const pos of declared) {
        const code = POS_TO_CODE[pos];
        if (!code) { results[pos] = null; continue; }
        try {
          const res = await fetch(`/api/players/search?position=${code}&limit=20`);
          const json = await res.json();
          const pool = (json?.data?.players ?? json?.players ?? []) as IndexedProPlayer[];

          // Encontrar el pro con menor distancia métrica al jugador
          const scored = pool.map((pro) => {
            const dist =
              Math.abs(pro.metric_speed     - player.metrics.speed) +
              Math.abs(pro.metric_technique - player.metrics.technique) +
              Math.abs(pro.metric_vision    - player.metrics.vision) +
              Math.abs(pro.metric_stamina   - player.metrics.stamina) +
              Math.abs(pro.metric_shooting  - player.metrics.shooting) +
              Math.abs(pro.metric_defending - player.metrics.defending);
            return { pro, dist };
          }).sort((a, b) => a.dist - b.dist);

          results[pos] = scored[0]?.pro ?? null;
        } catch {
          results[pos] = null;
        }
      }
      if (!cancelled) {
        setMatches(results);
        setLoading(false);
      }
    }
    if (declared.length > 0) run();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [player.id]);

  if (declared.length === 0) return null;
  if (loading) {
    return (
      <div className="glass rounded-xl p-4 text-center text-xs text-muted-foreground">
        {t("bestMatchProByPosition.searching")}
      </div>
    );
  }

  const validMatches = Object.entries(matches).filter(([, p]) => p !== null);
  if (validMatches.length === 0) return null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <h3 className="font-display font-semibold text-sm uppercase tracking-wider text-foreground flex items-center gap-2">
        <Trophy size={13} className="text-gold" /> {t("bestMatchProByPosition.title")}
      </h3>
      <div className="space-y-2">
        {validMatches.map(([pos, pro]) => {
          if (!pro) return null;
          const isPrimary = pos === player.position;
          // Similarity simple: 100 - avg distance / 6 metrics
          const distSum =
            Math.abs(pro.metric_speed     - player.metrics.speed) +
            Math.abs(pro.metric_technique - player.metrics.technique) +
            Math.abs(pro.metric_vision    - player.metrics.vision) +
            Math.abs(pro.metric_stamina   - player.metrics.stamina) +
            Math.abs(pro.metric_shooting  - player.metrics.shooting) +
            Math.abs(pro.metric_defending - player.metrics.defending);
          const similarity = Math.max(0, Math.round(100 - distSum / 6));
          return (
            <div key={pos} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-secondary/20">
              <div className="flex-1 min-w-0">
                <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                  {isPrimary && "⭐ "}{t("bestMatchProByPosition.asPosition", { position: pos })}
                </p>
                <p className="text-sm font-display font-bold text-foreground truncate">
                  {t("bestMatchProByPosition.resembles", { name: pro.short_name || pro.name })}
                </p>
                <p className="text-[10px] text-muted-foreground">
                  {pro.club ?? "—"} · {pro.league} · VSI pro {pro.vsi_estimated.toFixed(0)}
                </p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-base font-display font-black text-primary">{similarity}%</p>
                <p className="text-[9px] text-muted-foreground">{t("bestMatchProByPosition.similarity")}</p>
              </div>
            </div>
          );
        })}
      </div>
      <p className="text-[10px] text-muted-foreground border-t border-border pt-2 flex items-start gap-1.5">
        <ExternalLink size={10} className="shrink-0 mt-0.5" />
        {t("bestMatchProByPosition.footnote")}
      </p>
    </div>
  );
}
