import { motion } from "framer-motion";

interface VsiGaugeProps {
  value: number;
  size?: "sm" | "md" | "lg";
  label?: string;
}

const VsiGauge = ({ value, size = "md", label = "VSI" }: VsiGaugeProps) => {
  const sizes = {
    sm: { w: 48, stroke: 4, text: "text-lg" },
    md: { w: 72, stroke: 5, text: "text-2xl" },
    lg: { w: 100, stroke: 6, text: "text-4xl" },
  };
  const s = sizes[size];
  const r = (s.w - s.stroke) / 2;
  const circ = 2 * Math.PI * r;
  const progress = (value / 100) * circ;

  const getColor = (v: number) => {
    if (v >= 85) return "hsl(140, 100%, 50%)";
    if (v >= 70) return "hsl(217, 91%, 60%)";
    if (v >= 50) return "hsl(45, 90%, 55%)";
    return "hsl(0, 80%, 60%)";
  };

  return (
    <div className="relative flex flex-col items-center">
      <svg width={s.w} height={s.w} className="-rotate-90">
        <circle
          cx={s.w / 2}
          cy={s.w / 2}
          r={r}
          fill="none"
          stroke="hsl(215, 20%, 14%)"
          strokeWidth={s.stroke}
        />
        <motion.circle
          cx={s.w / 2}
          cy={s.w / 2}
          r={r}
          fill="none"
          stroke={getColor(value)}
          strokeWidth={s.stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - progress }}
          transition={{ duration: 1.2, ease: "easeOut" }}
          style={{
            filter: `drop-shadow(0 0 6px ${getColor(value)})`,
          }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display font-bold ${s.text} text-foreground`}>
          {value}
        </span>
        {size !== "sm" && (
          <span className="text-[9px] uppercase tracking-widest text-muted-foreground font-display">
            {label}
          </span>
        )}
      </div>
    </div>
  );
};

export default VsiGauge;
