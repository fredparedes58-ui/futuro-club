/**
 * VITAS · BehavioralRadar (Sprint 20)
 *
 * Recharts RadarChart of 7 behavioral dimensions.
 * Interactive with tooltip per dimension.
 */
import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Tooltip,
} from "recharts";
import { useTranslation } from "react-i18next";

interface Props {
  scores: {
    decisionSpeed: number;
    scanningIntelligence: number;
    resilience: number;
    clutchFactor: number;
    leadership: number;
    mentalFatigue: number;
    unpredictability: number;
  };
  height?: number;
}

const DIMENSIONS = [
  { key: "decisionSpeed",        labelKey: "dimensionDecision" },
  { key: "scanningIntelligence", labelKey: "dimensionScanning" },
  { key: "resilience",           labelKey: "dimensionResilience" },
  { key: "clutchFactor",         labelKey: "dimensionClutch" },
  { key: "leadership",           labelKey: "dimensionLeadership" },
  { key: "mentalFatigue",        labelKey: "dimensionMentalResilience" },
  { key: "unpredictability",     labelKey: "dimensionCreativity" },
] as const;

export default function BehavioralRadar({ scores, height = 260 }: Props) {
  const { t } = useTranslation();
  const data = DIMENSIONS.map(d => ({
    dimension: t(`behavioralRadar.${d.labelKey}`),
    value: scores[d.key as keyof typeof scores] ?? 0,
    fullMark: 100,
  }));

  return (
    <div className="glass rounded-xl p-4 space-y-1">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        {t("behavioralRadar.title")}
      </span>
      {/* "Indica de qué se trata": una línea explicando cómo leer el radar. */}
      <p className="text-[11px] text-muted-foreground/80 leading-snug">
        {t("behavioralRadar.description")}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        {/* Colores theme-aware: antes eran blanco con opacidad (rgba(255,255,255,…))
            → invisibles en modo claro (la rejilla y las etiquetas no se veían: "el
            radar no dice nada"). Ahora usan variables de tema (visibles en claro/oscuro). */}
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 10 }}
          />
          <PolarRadiusAxis
            angle={90}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 8 }}
            tickCount={3}
            axisLine={false}
            domain={[0, 100]}
          />
          <Radar
            name={t("behavioralRadar.scoreLabel")}
            dataKey="value"
            stroke="#8b5cf6"
            fill="rgba(139,92,246,0.25)"
            strokeWidth={2}
            dot={{ r: 3, fill: "#8b5cf6" }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 11,
              color: "hsl(var(--popover-foreground))",
            }}
            formatter={(value: number) => [`${value}/100`, t("behavioralRadar.scoreLabel")]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
