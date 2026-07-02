/**
 * VITAS · ScanIQCard — Scan IQ como producto (Sprint 1.2)
 *
 * Card con el Scan IQ 0-100 calibrado por edad, percentil, edad-equivalente
 * ("escanea como un jugador de 16 años") y la base científica (Jordet).
 */
import { motion } from "framer-motion";
import { Eye, TrendingUp, FlaskConical } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import type { ScanIQResult } from "@/lib/dmscore";

interface Props {
  result: ScanIQResult;
  /** "real" cuando el análisis viene de MediaPipe sobre vídeo real. */
  source?: "real" | "mock" | null;
  /** Stats extra del análisis (opcional). */
  stats?: {
    receptionsAnalyzed?: number;
    successWithScan?: number;   // 0-1
    successWithoutScan?: number; // 0-1
  };
  compact?: boolean;
}

function ringColor(score: number): string {
  if (score >= 80) return "text-emerald-400";
  if (score >= 60) return "text-cyan-400";
  if (score >= 40) return "text-amber-400";
  return "text-rose-400";
}

export function ScanIQCard({ result, source, stats, compact = false }: Props) {
  const r = 34;
  const circ = 2 * Math.PI * r;
  const filled = (result.scanIQ / 100) * circ;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-gradient-to-br from-pink-500/5 via-transparent to-fuchsia-500/5 p-4"
    >
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="flex items-center gap-2">
          <div className="p-1.5 rounded-md bg-gradient-to-br from-pink-500 to-fuchsia-600">
            <Eye className="size-3.5 text-white" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground leading-tight">Scan IQ</h3>
            <p className="text-[10px] text-muted-foreground">
              Exploración visual pre-recepción · calibrado {result.ageBand}
            </p>
          </div>
        </div>
        {source && (
          <Badge
            variant="outline"
            className={cn(
              "text-[10px]",
              source === "real"
                ? "bg-emerald-500/10 text-emerald-300 border-emerald-500/30"
                : "bg-slate-500/10 text-slate-300 border-slate-500/30",
            )}
          >
            {source === "real" ? "Vídeo real" : "Estimado"}
          </Badge>
        )}
      </div>

      <div className="flex items-center gap-4">
        {/* Gauge circular */}
        <div className="relative shrink-0" style={{ width: 88, height: 88 }}>
          <svg width={88} height={88} viewBox="0 0 88 88">
            <circle cx={44} cy={44} r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth={8} />
            <circle
              cx={44} cy={44} r={r} fill="none"
              stroke="currentColor" strokeWidth={8} strokeLinecap="round"
              className={ringColor(result.scanIQ)}
              strokeDasharray={`${filled} ${circ - filled}`}
              transform="rotate(-90 44 44)"
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className={cn("text-2xl font-bold tabular-nums", ringColor(result.scanIQ))}>
              {result.scanIQ}
            </span>
            <span className="text-[9px] text-muted-foreground -mt-0.5">/100</span>
          </div>
        </div>

        <div className="min-w-0 flex-1 space-y-1.5">
          {result.ageDelta >= 1.5 && (
            <div className="flex items-center gap-1.5 text-xs font-medium text-emerald-300">
              <TrendingUp className="size-3.5 shrink-0" />
              Escanea como uno de ~{Math.round(result.ageEquivalent)} años (+{Math.round(result.ageDelta)})
            </div>
          )}
          <p className="text-[11px] text-muted-foreground leading-snug">
            Percentil <strong className="text-foreground">{result.percentile}</strong> de su edad ·{" "}
            {result.avgScansPreReception} scans/recepción
          </p>
          {stats?.successWithScan != null && stats?.successWithoutScan != null && (
            <p className="text-[11px] text-muted-foreground leading-snug">
              Éxito con scan{" "}
              <strong className="text-emerald-300">{Math.round(stats.successWithScan * 100)}%</strong>
              {" "}vs sin scan{" "}
              <strong className="text-rose-300">{Math.round(stats.successWithoutScan * 100)}%</strong>
              {stats.receptionsAnalyzed ? ` · ${stats.receptionsAnalyzed} recepciones` : ""}
            </p>
          )}
        </div>
      </div>

      {!compact && (
        <div className="mt-3 flex items-start gap-1.5 rounded-lg bg-white/[0.03] border border-white/5 p-2">
          <FlaskConical className="size-3 text-fuchsia-300 shrink-0 mt-0.5" />
          <p className="text-[10px] text-muted-foreground leading-snug">
            Investigación (Jordet, Premier League): los jugadores que llegan a profesional
            escaneaban <strong className="text-foreground">2× más a los 12-14 años</strong>. Es el
            indicador más temprano y estable de potencial élite.
          </p>
        </div>
      )}
    </motion.div>
  );
}
