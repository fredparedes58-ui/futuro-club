/**
 * AdvancedMetricsPanel — Muestra VAEP / SPADL / Tracking / Biomechanics
 * calculadas desde el análisis de video de un jugador.
 *
 * Props:
 *   metrics — AdvancedPlayerMetrics (de advancedMetricsService)
 *   qualityScore — 0-1 (opcional) de videoAdvancedMetricsService.assessPacketQuality
 */
import { motion } from "framer-motion";
import {
  TrendingUp, Activity, MapPin, Zap, AlertCircle, CheckCircle2,
} from "lucide-react";
import type { AdvancedPlayerMetrics } from "@/services/real/advancedMetricsService";

interface Props {
  metrics: AdvancedPlayerMetrics;
  qualityScore?: number;
  qualityIssues?: string[];
}

export function AdvancedMetricsPanel({ metrics, qualityScore, qualityIssues }: Props) {
  const { vaep, tracking, biomechanics } = metrics;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold text-sm text-foreground uppercase tracking-wider">
          Métricas Avanzadas (desde video)
        </h3>
        {qualityScore !== undefined && (
          <QualityBadge score={qualityScore} />
        )}
      </div>

      {/* VAEP */}
      <MetricCard
        icon={TrendingUp}
        label="VAEP"
        description="Valor generado por cada acción (xG chain)"
        status={vaep.status}
        value={vaep.vaep90 !== null ? vaep.vaep90.toFixed(2) : null}
        unit="por 90'"
        detail={vaep.status === "calculated"
          ? `${vaep.topActions.length} acciones de alto impacto`
          : vaep.message}
        topActions={vaep.status === "calculated" ? vaep.topActions : undefined}
      />

      {/* Tracking (desde video) */}
      <MetricCard
        icon={MapPin}
        label="Cobertura de campo"
        description="Zonas recorridas por el jugador"
        status={tracking.status}
        value={tracking.fieldCoveragePct !== null ? `${tracking.fieldCoveragePct}%` : null}
        detail={tracking.status === "calculated"
          ? `${tracking.sprintCount ?? 0} sprints · ${tracking.totalDistanceM ?? 0}m totales`
          : tracking.message}
        extra={tracking.status === "calculated" && tracking.maxSpeedMs !== null ? (
          <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
            <Zap size={10} className="text-primary" />
            <span>Velocidad máx: {tracking.maxSpeedMs.toFixed(1)} m/s</span>
          </div>
        ) : null}
      />

      {/* Biomechanics */}
      <MetricCard
        icon={Activity}
        label="DrillScore"
        description="Eficiencia biomecánica observada"
        status={biomechanics.status}
        value={biomechanics.drillScore !== null ? `${biomechanics.drillScore}` : null}
        unit="/100"
        detail={biomechanics.status === "calculated"
          ? biomechanics.asymmetryPct !== null
            ? `Asimetría bilateral: ${biomechanics.asymmetryPct.toFixed(1)}%`
            : "DrillScore calculado"
          : biomechanics.message}
      />

      {/* Issues de calidad */}
      {qualityIssues && qualityIssues.length > 0 && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/5 p-3 space-y-1.5">
          <div className="flex items-center gap-2">
            <AlertCircle size={13} className="text-amber-500 shrink-0" />
            <p className="text-[11px] font-display font-semibold text-amber-500 uppercase tracking-wider">
              Limitaciones del análisis
            </p>
          </div>
          <ul className="space-y-0.5 ml-5">
            {qualityIssues.map((issue, i) => (
              <li key={i} className="text-[10px] text-muted-foreground list-disc">
                {issue}
              </li>
            ))}
          </ul>
        </div>
      )}
    </motion.div>
  );
}

// ─── Subcomponentes ──────────────────────────────────────────────────────────

function MetricCard({
  icon: Icon, label, description, status, value, unit, detail, topActions, extra,
}: {
  icon: React.ElementType;
  label: string;
  description: string;
  status: "calculated" | "stub_no_data" | "insufficient_data";
  value: string | null;
  unit?: string;
  detail: string;
  topActions?: Array<{ actionId: string; impact: number }>;
  extra?: React.ReactNode;
}) {
  const hasValue = status === "calculated" && value !== null;

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-start gap-3">
        <div className="w-9 h-9 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
          <Icon size={16} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-baseline justify-between gap-2">
            <p className="font-display font-semibold text-sm text-foreground">{label}</p>
            {hasValue && (
              <p className="font-display font-bold text-lg text-primary">
                {value}
                {unit && <span className="text-[10px] text-muted-foreground ml-1">{unit}</span>}
              </p>
            )}
          </div>
          <p className="text-[10px] text-muted-foreground">{description}</p>
        </div>
      </div>

      <div className="pl-12 space-y-1.5">
        <p className="text-[10px] text-muted-foreground">{detail}</p>
        {extra}
        {topActions && topActions.length > 0 && (
          <div className="space-y-0.5 pt-1">
            {topActions.slice(0, 3).map((a, i) => (
              <div key={a.actionId} className="flex items-center justify-between text-[10px]">
                <span className="text-muted-foreground">
                  {i + 1}. {formatActionId(a.actionId)}
                </span>
                <span className={`font-display font-semibold ${a.impact > 0 ? "text-emerald-500" : "text-red-500"}`}>
                  {a.impact > 0 ? "+" : ""}{a.impact.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function QualityBadge({ score }: { score: number }) {
  const status =
    score >= 0.8 ? { label: "Excelente", color: "text-emerald-500", icon: CheckCircle2 } :
    score >= 0.5 ? { label: "Aceptable", color: "text-amber-500", icon: AlertCircle } :
    { label: "Limitada", color: "text-red-500", icon: AlertCircle };

  const Icon = status.icon;
  return (
    <div className={`flex items-center gap-1 text-[10px] font-display font-semibold uppercase tracking-wider ${status.color}`}>
      <Icon size={11} />
      <span>Calidad: {status.label}</span>
      <span className="text-muted-foreground">({Math.round(score * 100)}%)</span>
    </div>
  );
}

function formatActionId(id: string): string {
  // v_10000_pass → "10s pase"
  const parts = id.split("_");
  if (parts.length < 3) return id;
  const ms = parseInt(parts[1] ?? "0", 10);
  const type = parts[2] ?? "";
  const sec = Math.round(ms / 1000);
  const labels: Record<string, string> = {
    pass: "pase", dribble: "regate", shot: "tiro", cross: "centro",
    tackle: "entrada", interception: "intercepción", clearance: "despeje", foul: "falta",
  };
  return `${sec}s · ${labels[type] ?? type}`;
}
