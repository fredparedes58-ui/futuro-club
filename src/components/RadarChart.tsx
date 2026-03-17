import { ResponsiveContainer, RadarChart as ReRadar, PolarGrid, PolarAngleAxis, Radar } from "recharts";

interface RadarChartProps {
  stats: Record<string, number>;
  color?: string;
}

const labelMap: Record<string, string> = {
  speed: "VEL",
  technique: "TÉC",
  vision: "VIS",
  stamina: "RES",
  shooting: "DIS",
  defending: "DEF",
};

const RadarChartComponent = ({ stats, color = "hsl(140, 100%, 50%)" }: RadarChartProps) => {
  const data = Object.entries(stats).map(([key, value]) => ({
    stat: labelMap[key] || key,
    value,
    fullMark: 100,
  }));

  return (
    <ResponsiveContainer width="100%" height={220}>
      <ReRadar data={data}>
        <PolarGrid stroke="hsl(215, 20%, 18%)" />
        <PolarAngleAxis
          dataKey="stat"
          tick={{ fill: "hsl(215, 16%, 52%)", fontSize: 11, fontFamily: "Rajdhani" }}
        />
        <Radar
          dataKey="value"
          stroke={color}
          fill={color}
          fillOpacity={0.15}
          strokeWidth={2}
        />
      </ReRadar>
    </ResponsiveContainer>
  );
};

export default RadarChartComponent;
