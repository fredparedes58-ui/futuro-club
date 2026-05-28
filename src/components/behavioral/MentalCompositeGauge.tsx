/**
 * VITAS · MentalCompositeGauge (Sprint 20)
 *
 * Circular gauge 0-100 (pattern from InjuryRiskGauge.tsx)
 * with dimension breakdown below.
 */
import { motion } from "framer-motion";

interface Props {
  score: number;
  dimensions?: {
    decisionSpeed: number;
    scanningIntelligence: number;
    resilience: number;
    clutchFactor: number;
    leadership: number;
    mentalFatigue: number;
    unpredictability: number;
  };
}

const DIMENSION_META = [
  { key: "decisionSpeed",        label: "Decisión",    color: "bg-blue-500" },
  { key: "scanningIntelligence", label: "Escaneo",     color: "bg-violet-500" },
  { key: "resilience",           label: "Resiliencia",  color: "bg-emerald-500" },
  { key: "clutchFactor",         label: "Clutch",       color: "bg-red-500" },
  { key: "leadership",           label: "Liderazgo",    color: "bg-amber-500" },
  { key: "mentalFatigue",        label: "Res. Mental",  color: "bg-cyan-500" },
  { key: "unpredictability",     label: "Creatividad",  color: "bg-pink-500" },
] as const;

function scoreColor(score: number): string {
  if (score >= 75) return "#22c55e";
  if (score >= 55) return "#8b5cf6";
  if (score >= 35) return "#f59e0b";
  return "#ef4444";
}

export default function MentalCompositeGauge({ score, dimensions }: Props) {
  const radius = 50;
  const circumference = 2 * Math.PI * radius;
  const progress = (Math.min(100, Math.max(0, score)) / 100) * circumference;
  const color = scoreColor(score);

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Compuesto Mental
      </span>

      {/* Gauge */}
      <div className="flex justify-center">
        <div className="relative w-32 h-32">
          <svg viewBox="0 0 120 120" className="w-full h-full -rotate-90">
            {/* Background circle */}
            <circle
              cx="60" cy="60" r={radius}
              fill="none"
              stroke="rgba(255,255,255,0.05)"
              strokeWidth="8"
            />
            {/* Progress circle */}
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
              style={{
                filter: `drop-shadow(0 0 6px ${color}40)`,
              }}
            />
          </svg>
          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-3xl font-black font-mono" style={{ color }}>
              {Math.round(score)}
            </span>
            <span className="text-[8px] text-muted-foreground">/100</span>
          </div>
        </div>
      </div>

      {/* Dimension breakdown */}
      {dimensions && (
        <div className="space-y-1.5">
          {DIMENSION_META.map(({ key, label, color: barColor }) => {
            const value = dimensions[key as keyof typeof dimensions] ?? 0;
            return (
              <div key={key} className="flex items-center gap-2">
                <span className="text-[8px] text-muted-foreground w-16 truncate">{label}</span>
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
