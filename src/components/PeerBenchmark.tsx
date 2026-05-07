/**
 * VITAS · Peer Benchmark (Sprint B4 · día 3-4)
 *
 * Muestra cómo se compara el jugador vs el pool federado anonimizado.
 * Render selectivo según data quality:
 *   - high/medium/low → barras p25-p75 + dot del jugador + label percentil
 *   - insufficient    → mensaje motivacional + invitación a esperar
 */

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { Loader2, Users, Globe, AlertCircle } from "lucide-react";
import { getAuthHeaders } from "@/lib/apiAuth";

interface MetricStats {
  player: number;
  percentile: number | null;
  mean: number;
  p25: number;
  p50: number;
  p75: number;
  p90: number;
}

interface BenchmarkResponse {
  stratum: { position: string; ageMin: number; ageMax: number; phvCategory: string | null };
  peerCount: number;
  dataQuality: "high" | "medium" | "low" | "insufficient";
  vsi?: MetricStats | null;
  byMetric?: Record<string, MetricStats | null>;
  message?: string;
}

interface Props {
  playerId: string;
  variant?: "compact" | "full";
}

const METRIC_LABELS: Record<string, string> = {
  speed: "Velocidad",
  technique: "Técnica",
  vision: "Visión",
  stamina: "Resistencia",
  shooting: "Tiro",
  defending: "Defensa",
};

export default function PeerBenchmark({ playerId, variant = "full" }: Props) {
  const [data, setData] = useState<BenchmarkResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/benchmark/peer?playerId=${playerId}`, { headers });
        const json = await res.json();
        if (!mounted) return;
        if (!res.ok || !json.success) {
          setError(json?.error?.message ?? "Error");
        } else {
          setData(json.data as BenchmarkResponse);
        }
      } catch (err) {
        if (mounted) setError(err instanceof Error ? err.message : "Error");
      } finally {
        if (mounted) setLoading(false);
      }
    })();
    return () => { mounted = false; };
  }, [playerId]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 justify-center">
        <Loader2 size={12} className="animate-spin text-muted-foreground" />
        <span className="text-[11px] text-muted-foreground">Comparando vs red VITAS…</span>
      </div>
    );
  }

  if (error || !data) {
    return null; // silencioso · es info adicional
  }

  if (data.dataQuality === "insufficient") {
    return (
      <div className="rounded-lg bg-secondary/30 border border-border p-3 flex items-start gap-2">
        <Globe size={12} className="text-muted-foreground shrink-0 mt-0.5" />
        <div>
          <p className="text-[11px] font-display font-bold text-foreground">
            Benchmark cross-club
          </p>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {data.message ?? `Solo ${data.peerCount} jugadores comparables. Cuando más academias usen VITAS, más fiable será.`}
          </p>
        </div>
      </div>
    );
  }

  const qualityColor = data.dataQuality === "high" ? "text-green-400" : data.dataQuality === "medium" ? "text-electric" : "text-amber-400";
  const qualityDots = data.dataQuality === "high" ? "●●●" : data.dataQuality === "medium" ? "●●○" : "●○○";

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5">
          <Globe size={11} className="text-primary" />
          <span className="text-[10px] uppercase tracking-wider text-primary font-bold">
            Cross-club benchmark
          </span>
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          <Users size={10} />
          <span>{data.peerCount} peers</span>
          <span className={qualityColor} title={`Data quality: ${data.dataQuality}`}>{qualityDots}</span>
        </div>
      </div>

      <div className="text-[10px] text-muted-foreground">
        Estrato: <span className="text-foreground">{data.stratum.position}</span> ·
        edad <span className="text-foreground">{data.stratum.ageMin}-{data.stratum.ageMax}</span>
        {data.stratum.phvCategory && <> · PHV <span className="text-foreground">{data.stratum.phvCategory}</span></>}
      </div>

      {/* VSI principal */}
      {data.vsi && data.vsi.percentile !== null && (
        <div className="rounded-xl bg-primary/10 border border-primary/30 p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs font-display font-bold text-foreground">VSI vs peers</span>
            <span className="font-display font-bold text-2xl text-primary">P{data.vsi.percentile}</span>
          </div>
          <BenchmarkBar stats={data.vsi} max={100} />
          <div className="text-[9px] text-muted-foreground mt-1.5 flex justify-between">
            <span>P25: <span className="text-foreground">{data.vsi.p25}</span></span>
            <span>media: <span className="text-foreground">{data.vsi.mean}</span></span>
            <span>P75: <span className="text-foreground">{data.vsi.p75}</span></span>
            <span>P90: <span className="text-foreground">{data.vsi.p90}</span></span>
          </div>
        </div>
      )}

      {/* Por métrica · solo si full y datos */}
      {variant === "full" && data.byMetric && (
        <div className="space-y-1.5">
          {Object.entries(METRIC_LABELS).map(([key, label]) => {
            const m = data.byMetric?.[key];
            if (!m || m.percentile === null) return null;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="w-16 shrink-0 text-[10px] text-muted-foreground font-display font-bold uppercase tracking-wider">
                  {label}
                </span>
                <div className="flex-1 min-w-0">
                  <BenchmarkBar stats={m} max={100} small />
                </div>
                <span className={`shrink-0 text-[10px] font-display font-bold ${
                  m.percentile >= 75 ? "text-green-400"
                  : m.percentile >= 50 ? "text-electric"
                  : m.percentile >= 25 ? "text-amber-400"
                  : "text-muted-foreground"
                }`}>
                  P{m.percentile}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ─── BenchmarkBar ─────────────────────────────────────────────────

function BenchmarkBar({ stats, max, small }: { stats: MetricStats; max: number; small?: boolean }) {
  const pct = (v: number) => Math.max(0, Math.min(100, (v / max) * 100));
  return (
    <div className={`relative ${small ? "h-2" : "h-3"} rounded-full bg-secondary/40 overflow-hidden`}>
      {/* P25-P75 band */}
      <div
        className="absolute top-0 bottom-0 bg-primary/25"
        style={{ left: `${pct(stats.p25)}%`, width: `${pct(stats.p75) - pct(stats.p25)}%` }}
      />
      {/* P50 line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-primary/60"
        style={{ left: `${pct(stats.p50)}%` }}
      />
      {/* Player dot */}
      <motion.div
        initial={{ left: "0%" }}
        animate={{ left: `calc(${pct(stats.player)}% - ${small ? 4 : 6}px)` }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className={`absolute top-1/2 -translate-y-1/2 ${small ? "w-2 h-2" : "w-3 h-3"} rounded-full bg-primary ring-2 ring-background`}
        title={`Jugador: ${stats.player}`}
      />
    </div>
  );
}
