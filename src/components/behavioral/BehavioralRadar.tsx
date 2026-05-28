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
  { key: "decisionSpeed",        label: "Decisión" },
  { key: "scanningIntelligence", label: "Escaneo" },
  { key: "resilience",           label: "Resiliencia" },
  { key: "clutchFactor",         label: "Clutch" },
  { key: "leadership",           label: "Liderazgo" },
  { key: "mentalFatigue",        label: "Res. Mental" },
  { key: "unpredictability",     label: "Creatividad" },
] as const;

export default function BehavioralRadar({ scores, height = 260 }: Props) {
  const data = DIMENSIONS.map(d => ({
    dimension: d.label,
    value: scores[d.key as keyof typeof scores] ?? 0,
    fullMark: 100,
  }));

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Perfil Conductual
      </span>
      <ResponsiveContainer width="100%" height={height}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="70%">
          <PolarGrid stroke="rgba(255,255,255,0.06)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 9 }}
          />
          <PolarRadiusAxis
            tick={false}
            axisLine={false}
            domain={[0, 100]}
          />
          <Radar
            name="Score"
            dataKey="value"
            stroke="#8b5cf6"
            fill="rgba(139,92,246,0.25)"
            strokeWidth={2}
            dot={{ r: 3, fill: "#8b5cf6" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 11,
            }}
            formatter={(value: number) => [`${value}/100`, "Score"]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
