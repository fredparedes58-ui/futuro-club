/**
 * VITAS · VsiGauge
 *
 * Gauge premium tipo Apple Activity Ring + ticks profesionales.
 * - Animación spring del progreso
 * - Tier color dinámico con gradient
 * - Ticks discretos cada 10 unidades
 * - Tabular numbers + tracking ajustado
 * - Glow sutil dependiente del tier
 */
import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useEffect, useState } from "react";

interface VsiGaugeProps {
  value: number;
  size?: "sm" | "md" | "lg" | "xl";
  label?: string;
  showTier?: boolean;
}

const TIER_THRESHOLDS = [
  { min: 85, label: "Élite",   colorFrom: "hsl(210 100% 50%)", colorTo: "hsl(220 100% 60%)", glow: "hsl(210 100% 50% / 0.4)" },
  { min: 70, label: "Pro",     colorFrom: "hsl(270 70% 55%)",  colorTo: "hsl(290 70% 60%)",  glow: "hsl(280 70% 55% / 0.35)" },
  { min: 50, label: "Talento", colorFrom: "hsl(38 95% 55%)",   colorTo: "hsl(28 95% 55%)",   glow: "hsl(38 95% 55% / 0.3)" },
  { min: 0,  label: "Desarrollo", colorFrom: "hsl(0 80% 58%)", colorTo: "hsl(15 80% 60%)",   glow: "hsl(0 80% 58% / 0.3)" },
];

function getTier(v: number) {
  return TIER_THRESHOLDS.find((t) => v >= t.min)!;
}

const VsiGauge = ({ value, size = "md", label = "VSI", showTier = false }: VsiGaugeProps) => {
  const sizes = {
    sm: { w: 56,  stroke: 4, text: "text-base", labelText: "text-[8px]" },
    md: { w: 88,  stroke: 6, text: "text-2xl",  labelText: "text-[9px]" },
    lg: { w: 128, stroke: 8, text: "text-4xl",  labelText: "text-[10px]" },
    xl: { w: 180, stroke: 10, text: "text-6xl", labelText: "text-xs" },
  };
  const s = sizes[size];
  const r = (s.w - s.stroke) / 2;
  const circ = 2 * Math.PI * r;
  const tier = getTier(value);
  const gradientId = `vsi-gradient-${size}-${value}`;

  // Animación del valor numérico
  const count = useMotionValue(0);
  const displayed = useTransform(count, (v) => Math.round(v));
  const [n, setN] = useState(0);
  useEffect(() => {
    const ctrl = animate(count, value, { duration: 1.2, ease: [0.16, 1, 0.3, 1] });
    const unsub = displayed.on("change", setN);
    return () => { ctrl.stop(); unsub(); };
  }, [value, count, displayed]);

  // Ticks cada 10 unidades · 11 ticks total (0..100)
  const ticks = Array.from({ length: 11 }, (_, i) => i * 10);

  return (
    <div className="relative flex flex-col items-center" style={{ width: s.w, height: s.w }}>
      <svg width={s.w} height={s.w} className="absolute inset-0">
        <defs>
          <linearGradient id={gradientId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor={tier.colorFrom} />
            <stop offset="100%" stopColor={tier.colorTo} />
          </linearGradient>
        </defs>

        {/* Track */}
        <circle
          cx={s.w / 2}
          cy={s.w / 2}
          r={r}
          fill="none"
          stroke="hsl(var(--border))"
          strokeWidth={s.stroke}
          opacity="0.4"
        />

        {/* Ticks pequeños cada 10 */}
        {size !== "sm" && ticks.map((t) => {
          const angle = (t / 100) * 360 - 90;
          const rad = (angle * Math.PI) / 180;
          const innerR = r - s.stroke / 2 - 1;
          const outerR = r - s.stroke / 2 + 3;
          const x1 = s.w / 2 + Math.cos(rad) * innerR;
          const y1 = s.w / 2 + Math.sin(rad) * innerR;
          const x2 = s.w / 2 + Math.cos(rad) * outerR;
          const y2 = s.w / 2 + Math.sin(rad) * outerR;
          const isMajor = t % 25 === 0;
          return (
            <line
              key={t}
              x1={x1} y1={y1} x2={x2} y2={y2}
              stroke="hsl(var(--muted-foreground))"
              strokeWidth={isMajor ? 1.5 : 0.8}
              opacity={isMajor ? 0.5 : 0.3}
            />
          );
        })}

        {/* Progress arc · animado */}
        <motion.circle
          cx={s.w / 2}
          cy={s.w / 2}
          r={r}
          fill="none"
          stroke={`url(#${gradientId})`}
          strokeWidth={s.stroke}
          strokeLinecap="round"
          strokeDasharray={circ}
          transform={`rotate(-90 ${s.w / 2} ${s.w / 2})`}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: circ - (value / 100) * circ }}
          transition={{ duration: 1.4, ease: [0.16, 1, 0.3, 1] }}
          style={{ filter: `drop-shadow(0 0 8px ${tier.glow})` }}
        />
      </svg>

      {/* Texto centrado */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className={`font-display font-black ${s.text} text-foreground tabular-nums leading-none tracking-tight`}>
          {n}
        </span>
        {size !== "sm" && (
          <span className={`${s.labelText} uppercase tracking-[0.18em] text-muted-foreground font-bold mt-0.5`}>
            {label}
          </span>
        )}
        {showTier && size === "xl" && (
          <span className="mt-1 text-[10px] uppercase tracking-[0.18em] font-bold" style={{ color: tier.colorFrom }}>
            {tier.label}
          </span>
        )}
      </div>
    </div>
  );
};

export default VsiGauge;
