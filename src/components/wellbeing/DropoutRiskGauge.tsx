/**
 * VITAS · DropoutRiskGauge (Sprint 23)
 *
 * Circular gauge 0-100 (pattern from MentalCompositeGauge / InjuryRiskGauge)
 * with factor breakdown bars below.
 * Color scale: green=low, amber=moderate, orange=high, red=critical.
 */
import { motion } from "framer-motion";

interface FactorBreakdown {
  engagementDecline?: { score: number; weight: number } | null;
  motivationType?: { score: number; weight: number } | null;
  overtrainingRisk?: { score: number; weight: number } | null;
  vsiStagnation?: { score: number; weight: number } | null;
  attendanceDecline?: { score: number; weight: number } | null;
  injuryRecurrence?: { score: number; weight: number } | null;
  growthSpurtStress?: { score: number; weight: number } | null;
  lowResilience?: { score: number; weight: number } | null;
}

interface Props {
  score: number;
  riskLevel: "low" | "moderate" | "high" | "critical";
  primaryFactor: string;
  factors?: FactorBreakdown;
}

const FACTOR_META = [
  { key: "engagementDecline", label: "Engagement",     color: "bg-blue-500" },
  { key: "motivationType",    label: "Motivación",     color: "bg-violet-500" },
  { key: "overtrainingRisk",  label: "Sobreentren.",   color: "bg-orange-500" },
  { key: "vsiStagnation",     label: "VSI Estanc.",    color: "bg-amber-500" },
  { key: "attendanceDecline", label: "Asistencia",     color: "bg-cyan-500" },
  { key: "injuryRecurrence",  label: "Lesiones",       color: "bg-red-500" },
  { key: "growthSpurtStress", label: "Estirón",        color: "bg-emerald-500" },
  { key: "lowResilience",     label: "Resiliencia",    color: "bg-pink-500" },
] as const;

const LEVEL_LABELS: Record<string, string> = {
  low: "Bajo",
  moderate: "Moderado",
  high: "Alto",
  critical: "Crítico",
};

function riskColor(score: number): string {
  if (score >= 75) return "#ef4444";
  if (score >= 50) return "#f97316";
  if (score >= 25) return "#f59e0b";
  return "#22c55e";
}

export default function DropoutRiskGauge({ score, riskLevel, primaryFactor, factors }: Props) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const color = riskColor(score);

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Riesgo de Abandono
        </span>
        <span
          className="text-[10px] font-bold px-2 py-0.5 rounded-full"
          style={{ backgroundColor: `${color}20`, color }}
        >
          {LEVEL_LABELS[riskLevel] ?? riskLevel}
        </span>
      </div>

      {/* Gauge */}
      <div className="flex justify-center">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="8"
            />
            <motion.circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke={color}
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              initial={{ strokeDashoffset: circumference }}
              animate={{ strokeDashoffset: circumference - progress }}
              transition={{ duration: 1, ease: "easeOut" }}
              style={{ filter: `drop-shadow(0 0 6px ${color}40)` }}
            />
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black font-mono" style={{ color }}>
              {Math.round(score)}
            </span>
            <span className="text-[8px] text-muted-foreground">/100</span>
          </div>
        </div>
      </div>

      {/* Primary factor callout */}
      <div className="text-center">
        <span className="text-[10px] text-muted-foreground">Factor principal: </span>
        <span className="text-[10px] font-bold text-foreground">
          {FACTOR_META.find(f => f.key === primaryFactor)?.label ?? primaryFactor}
        </span>
      </div>

      {/* Factor breakdown */}
      {factors && (
        <div className="space-y-1.5">
          {FACTOR_META.map(({ key, label, color: barColor }) => {
            const factor = factors[key as keyof FactorBreakdown];
            if (!factor) return null;
            const value = factor.score;
            const isPrimary = key === primaryFactor;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className={`text-[8px] w-16 truncate ${isPrimary ? "text-foreground font-bold" : "text-muted-foreground"}`}>
                  {label}
                </span>
                <div className="flex-1 h-1 rounded-full bg-white/5 overflow-hidden">
                  <motion.div
                    className={`h-full rounded-full ${barColor}`}
                    initial={{ width: 0 }}
                    animate={{ width: `${Math.min(100, value)}%` }}
                    transition={{ duration: 0.6 }}
                  />
                </div>
                <span className="text-[8px] font-mono font-bold text-foreground w-6 text-right">
                  {Math.round(value)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
