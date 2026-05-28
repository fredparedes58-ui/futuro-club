/**
 * InjuryRiskCard — Summary card for injury risk assessment
 *
 * Shows:
 * - Circular risk gauge (InjuryRiskGauge)
 * - Top risk factors with severity badges
 * - Key recommendations
 * - PHV alert (if applicable)
 * - Confidence level and cold-start warning
 *
 * Data source: injury-risk-calculator deterministic model output.
 *
 * Sprint 10: Injury Risk Model & Data
 */

import { motion } from "framer-motion";
import {
  Shield,
  AlertTriangle,
  TrendingUp,
  Activity,
  Bone,
  Dumbbell,
  Flame,
  Info,
  ChevronRight,
} from "lucide-react";
import InjuryRiskGauge, { CATEGORY_CONFIG } from "./InjuryRiskGauge";

// ── Types ───────────────────────────────────────────────────────────────────

export interface InjuryRiskData {
  playerId: string;
  overallRisk: number;
  riskCategory: "low" | "moderate" | "high" | "critical";
  riskFactors: Array<{
    factor: string;
    weight: number;
    score: number;
    description: string;
  }>;
  acuteChronicRatio: number | null;
  phvRiskMultiplier: number;
  recommendations: string[];
  returnToPlayReady: boolean;
  confidenceLevel: number;
  dataPointsUsed: number;
  coldStartWarning: boolean;
}

interface InjuryRiskCardProps {
  data: InjuryRiskData;
  /** Compact mode for embedding in other cards */
  compact?: boolean;
  /** Click handler to navigate to full injury dashboard */
  onViewDetails?: () => void;
}

// ── Factor icons ────────────────────────────────────────────────────────────

const FACTOR_ICONS: Record<string, React.ElementType> = {
  acwr: Activity,
  phvWindow: Bone,
  asymmetry: Dumbbell,
  injuryHistory: AlertTriangle,
  fatigue: Flame,
};

const FACTOR_LABELS: Record<string, string> = {
  acwr: "Carga Aguda/Cronica",
  phvWindow: "Ventana PHV",
  asymmetry: "Asimetria",
  injuryHistory: "Historial Lesiones",
  fatigue: "Fatiga",
};

function SeverityBadge({ score }: { score: number }) {
  const severity = score >= 70 ? "alta" : score >= 40 ? "media" : "baja";
  const colors =
    severity === "alta"
      ? "bg-red-500/15 text-red-500 border-red-500/20"
      : severity === "media"
        ? "bg-amber-500/15 text-amber-500 border-amber-500/20"
        : "bg-emerald-500/15 text-emerald-500 border-emerald-500/20";

  return (
    <span className={`text-[9px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded border ${colors}`}>
      {severity}
    </span>
  );
}

// ── Component ───────────────────────────────────────────────────────────────

export default function InjuryRiskCard({
  data,
  compact = false,
  onViewDetails,
}: InjuryRiskCardProps) {
  const topFactors = data.riskFactors.slice(0, compact ? 3 : 5);
  const config = CATEGORY_CONFIG[data.riskCategory] ?? CATEGORY_CONFIG.moderate;

  // ── Compact mode ─────────────────────────────────────────────
  if (compact) {
    return (
      <motion.div
        initial={{ opacity: 0, y: 8 }}
        animate={{ opacity: 1, y: 0 }}
        className="glass rounded-xl p-4 space-y-3 border border-border/50 cursor-pointer hover:border-primary/30 transition-colors"
        onClick={onViewDetails}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield size={16} className="text-primary" />
            <span className="text-sm font-display font-bold text-foreground">Riesgo Lesion</span>
          </div>
          <InjuryRiskGauge
            value={data.overallRisk}
            category={data.riskCategory}
            size={44}
            showLabel={false}
            compact
          />
        </div>
        <div className="flex items-center justify-between">
          <span
            className="text-xs font-display font-bold uppercase tracking-wide"
            style={{ color: config.color }}
          >
            {config.emoji} {config.label}
          </span>
          {data.coldStartWarning && (
            <span className="text-[9px] text-muted-foreground flex items-center gap-1">
              <Info size={9} /> Datos limitados
            </span>
          )}
        </div>
        {onViewDetails && (
          <button className="flex items-center gap-1 text-[10px] text-primary font-medium">
            Ver detalles <ChevronRight size={10} />
          </button>
        )}
      </motion.div>
    );
  }

  // ── Full mode ────────────────────────────────────────────────
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl p-5 space-y-5 border border-border/50"
    >
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <Shield size={18} className="text-primary" />
            <h3 className="font-display font-bold text-base text-foreground">
              Riesgo de Lesion
            </h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Modelo deterministico VITAS · {data.dataPointsUsed} datos
          </p>
        </div>
        <InjuryRiskGauge
          value={data.overallRisk}
          category={data.riskCategory}
          size={100}
        />
      </div>

      {/* Cold-start warning */}
      {data.coldStartWarning && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2">
          <Info size={14} className="text-amber-500 shrink-0" />
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Menos de 4 sesiones registradas. La prediccion mejorara con mas datos.
          </p>
        </div>
      )}

      {/* Risk factors */}
      <div className="space-y-2">
        <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
          Factores de riesgo
        </h4>
        <div className="space-y-1.5">
          {topFactors.map((factor) => {
            const Icon = FACTOR_ICONS[factor.factor] ?? TrendingUp;
            return (
              <div
                key={factor.factor}
                className="flex items-center gap-2 rounded-lg bg-card/50 px-3 py-2"
              >
                <Icon size={13} className="text-muted-foreground shrink-0" />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[11px] font-medium text-foreground truncate">
                      {FACTOR_LABELS[factor.factor] ?? factor.factor}
                    </span>
                    <SeverityBadge score={factor.score} />
                  </div>
                  <p className="text-[10px] text-muted-foreground truncate">
                    {factor.description}
                  </p>
                </div>
                {/* Mini bar */}
                <div className="w-12 h-1.5 rounded-full bg-secondary overflow-hidden shrink-0">
                  <motion.div
                    className="h-full rounded-full"
                    style={{ backgroundColor: config.color }}
                    initial={{ width: 0 }}
                    animate={{ width: `${factor.score}%` }}
                    transition={{ duration: 0.8, ease: "easeOut" }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Recommendations */}
      {data.recommendations.length > 0 && (
        <div className="space-y-2">
          <h4 className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
            Recomendaciones
          </h4>
          <ul className="space-y-1.5">
            {data.recommendations.map((rec, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-foreground">
                <span className="shrink-0 mt-0.5 w-4 h-4 rounded-full bg-primary/10 text-primary flex items-center justify-center text-[9px] font-bold">
                  {i + 1}
                </span>
                {rec}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* PHV alert */}
      {data.phvRiskMultiplier > 1.2 && (
        <div className="flex items-start gap-2 rounded-lg bg-orange-500/10 border border-orange-500/20 px-3 py-2">
          <Bone size={14} className="text-orange-500 shrink-0 mt-0.5" />
          <div>
            <p className="text-[11px] font-medium text-orange-600 dark:text-orange-400">
              Ventana de crecimiento activa
            </p>
            <p className="text-[10px] text-orange-500/80">
              Riesgo elevado de lesion osea (Osgood-Schlatter, Sever). Limitar impactos.
            </p>
          </div>
        </div>
      )}

      {/* Return to play badge */}
      {data.returnToPlayReady && (
        <div className="flex items-center gap-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 px-3 py-2">
          <Shield size={14} className="text-emerald-500" />
          <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
            Apto para actividad completa
          </span>
        </div>
      )}

      {/* Confidence footer */}
      <div className="flex items-center justify-between pt-2 border-t border-border/30">
        <div className="flex items-center gap-1.5">
          <span className="text-[10px] text-muted-foreground">Confianza:</span>
          <div className="w-16 h-1 rounded-full bg-secondary overflow-hidden">
            <div
              className="h-full rounded-full bg-primary/60"
              style={{ width: `${data.confidenceLevel}%` }}
            />
          </div>
          <span className="text-[10px] text-muted-foreground tabular-nums">
            {data.confidenceLevel}%
          </span>
        </div>
        {onViewDetails && (
          <button
            onClick={onViewDetails}
            className="flex items-center gap-1 text-[10px] text-primary font-display font-medium hover:underline"
          >
            Dashboard completo <ChevronRight size={10} />
          </button>
        )}
      </div>
    </motion.div>
  );
}
