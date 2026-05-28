/**
 * InjuryRiskGauge — Circular gauge showing injury risk 0-100
 *
 * Color-coded: green (low), yellow (moderate), orange (high), red (critical).
 * Used inside InjuryRiskCard and ParentDashboard.
 *
 * Sprint 10: Injury Risk Model & Data
 */

import { motion } from "framer-motion";

interface InjuryRiskGaugeProps {
  /** Risk value 0-100 */
  value: number;
  /** Risk category label */
  category: "low" | "moderate" | "high" | "critical" | string;
  /** Size in px (default 120) */
  size?: number;
  /** Show label below gauge */
  showLabel?: boolean;
  /** Compact mode for smaller spaces */
  compact?: boolean;
}

const CATEGORY_CONFIG: Record<string, { color: string; gradient: string; label: string; emoji: string }> = {
  low:      { color: "#22c55e", gradient: "from-emerald-500 to-green-400", label: "Bajo", emoji: "✅" },
  moderate: { color: "#eab308", gradient: "from-amber-500 to-yellow-400", label: "Moderado", emoji: "⚠️" },
  high:     { color: "#f97316", gradient: "from-orange-500 to-amber-400", label: "Alto", emoji: "🔶" },
  critical: { color: "#ef4444", gradient: "from-red-500 to-rose-400", label: "Critico", emoji: "🔴" },
};

export default function InjuryRiskGauge({
  value,
  category,
  size = 120,
  showLabel = true,
  compact = false,
}: InjuryRiskGaugeProps) {
  const config = CATEGORY_CONFIG[category] ?? CATEGORY_CONFIG.moderate;
  const clamped = Math.max(0, Math.min(100, value));

  // SVG arc math
  const strokeWidth = compact ? 6 : 8;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  if (compact) {
    return (
      <div className="flex items-center gap-2">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
          {/* Background circle */}
          <circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            className="text-muted/20"
          />
          {/* Value arc */}
          <motion.circle
            cx={center}
            cy={center}
            r={radius}
            fill="none"
            stroke={config.color}
            strokeWidth={strokeWidth}
            strokeLinecap="round"
            strokeDasharray={circumference}
            initial={{ strokeDashoffset: circumference }}
            animate={{ strokeDashoffset: dashOffset }}
            transition={{ duration: 1, ease: "easeOut" }}
            transform={`rotate(-90 ${center} ${center})`}
          />
          {/* Center value */}
          <text
            x={center}
            y={center}
            textAnchor="middle"
            dominantBaseline="central"
            className="fill-foreground font-display font-bold"
            fontSize={size * 0.3}
          >
            {clamped}
          </text>
        </svg>
        {showLabel && (
          <span className="text-[10px] font-medium" style={{ color: config.color }}>
            {config.label}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        {/* Background circle */}
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/20"
        />
        {/* Glow filter */}
        <defs>
          <filter id={`glow-${category}`}>
            <feGaussianBlur stdDeviation="3" result="blur" />
            <feMerge>
              <feMergeNode in="blur" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        {/* Value arc */}
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={config.color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          transform={`rotate(-90 ${center} ${center})`}
          filter={clamped >= 75 ? `url(#glow-${category})` : undefined}
        />
        {/* Center value */}
        <text
          x={center}
          y={center - 6}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-foreground font-display font-bold"
          fontSize={size * 0.28}
        >
          {clamped}
        </text>
        <text
          x={center}
          y={center + size * 0.14}
          textAnchor="middle"
          dominantBaseline="central"
          className="fill-muted-foreground"
          fontSize={size * 0.1}
        >
          /100
        </text>
      </svg>
      {showLabel && (
        <div className="text-center">
          <span
            className="text-xs font-display font-bold uppercase tracking-wide"
            style={{ color: config.color }}
          >
            {config.emoji} {config.label}
          </span>
        </div>
      )}
    </div>
  );
}

export { CATEGORY_CONFIG };
