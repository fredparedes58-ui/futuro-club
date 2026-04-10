import { ResponsiveContainer, RadarChart as ReRadar, PolarGrid, PolarAngleAxis, Radar, Legend } from "recharts";

interface RadarChartProps {
  stats: Record<string, number>;
  color?: string;
  compareStats?: Record<string, number>;
  compareColor?: string;
  compareLabel?: string;
  currentLabel?: string;
}

const labelMap: Record<string, string> = {
  speed: "VEL",
  technique: "TÉC",
  vision: "VIS",
  stamina: "RES",
  shooting: "DIS",
  defending: "DEF",
};

const RadarChartComponent = ({
  stats,
  color = "hsl(230, 70%, 58%)",
  compareStats,
  compareColor = "#F59E0B",
  currentLabel = "Actual",
  compareLabel = "Anterior",
}: RadarChartProps) => {
  const data = Object.entries(stats).map(([key, value]) => ({
    stat: labelMap[key] || key,
    value,
    ...(compareStats ? { compareValue: compareStats[key] ?? 0 } : {}),
    fullMark: 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ReRadar data={data}>
        <PolarGrid stroke="hsl(225, 18%, 22%)" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fill: "hsl(220, 12%, 55%)", fontSize: 11, fontFamily: "Rajdhani" }}
        />
        {compareStats && (
          <Radar
            name={compareLabel}
            dataKey="compareValue"
            stroke={compareColor}
            fill={compareColor}
            fillOpacity={0.08}
            strokeWidth={1.5}
            strokeDasharray="4 3"
          />
        )}
        <Radar
          name={currentLabel}
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={2}
        />
        {compareStats && (
          <Legend
            wrapperStyle={{ fontSize: 10, fontFamily: "Rajdhani" }}
          />
        )}
      </ReRadar>
    </ResponsiveContainer>
  );
};

export default RadarChartComponent;
