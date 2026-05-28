/**
 * ProbabilityDisplay — Visual probability gauges by horizon
 *
 * Shows probability of reaching different levels at 1yr, 3yr, 5yr horizons.
 * Circular mini-gauges with percentage labels.
 *
 * Sprint 13: Valuation Dashboard & Integration
 */

import { motion } from "framer-motion";
import { Target, Trophy, Star } from "lucide-react";

interface Probabilities {
  prob1Year: number;
  prob3Year: number;
  prob5Year: number;
  probFirstDiv: number;
  probTop5League: number;
}

interface ProbabilityDisplayProps {
  probabilities: Probabilities;
  tierColor: string;
  compact?: boolean;
}

function MiniGauge({
  value,
  label,
  color,
  icon: Icon,
  delay = 0,
}: {
  value: number;
  label: string;
  color: string;
  icon: React.ElementType;
  delay?: number;
}) {
  const size = 56;
  const strokeWidth = 4;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - value / 100);
  const center = size / 2;

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      transition={{ delay }}
      className="flex flex-col items-center gap-1"
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-muted/15"
        />
        <motion.circle
          cx={center}
          cy={center}
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          initial={{ strokeDashoffset: circumference }}
          animate={{ strokeDashoffset: dashOffset }}
          transition={{ duration: 1, ease: "easeOut", delay }}
          transform={`rotate(-90 ${center} ${center})`}
        />
        <foreignObject x={center - 12} y={center - 12} width={24} height={24}>
          <div className="flex items-center justify-center w-full h-full">
            <Icon size={14} style={{ color }} />
          </div>
        </foreignObject>
      </svg>
      <span className="text-xs font-display font-bold" style={{ color }}>
        {value}%
      </span>
      <span className="text-[9px] text-muted-foreground text-center leading-tight">
        {label}
      </span>
    </motion.div>
  );
}

export default function ProbabilityDisplay({
  probabilities,
  tierColor,
  compact = false,
}: ProbabilityDisplayProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-4">
        <MiniGauge value={probabilities.probFirstDiv} label="1ra Div" color={tierColor} icon={Trophy} />
        <MiniGauge value={probabilities.probTop5League} label="Top-5" color="#FFD700" icon={Star} delay={0.1} />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <Target size={16} className="text-primary" />
        <h4 className="font-display font-bold text-sm text-foreground">Probabilidades</h4>
      </div>

      <div className="grid grid-cols-5 gap-2">
        <MiniGauge
          value={probabilities.prob1Year}
          label="Mejora 1a"
          color="#22C55E"
          icon={Target}
          delay={0}
        />
        <MiniGauge
          value={probabilities.prob3Year}
          label="Mejora 3a"
          color="#3B82F6"
          icon={Target}
          delay={0.05}
        />
        <MiniGauge
          value={probabilities.prob5Year}
          label="Mejora 5a"
          color="#8B5CF6"
          icon={Target}
          delay={0.1}
        />
        <MiniGauge
          value={probabilities.probFirstDiv}
          label="1ra Div"
          color={tierColor}
          icon={Trophy}
          delay={0.15}
        />
        <MiniGauge
          value={probabilities.probTop5League}
          label="Top-5"
          color="#FFD700"
          icon={Star}
          delay={0.2}
        />
      </div>

      <p className="text-[9px] text-muted-foreground text-center">
        Basado en tasas UEFA Youth League. Las probabilidades son estimaciones del modelo, no garantias.
      </p>
    </motion.div>
  );
}
