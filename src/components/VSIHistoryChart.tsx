/**
 * VITAS — VSI History Chart
 * Muestra la evolución del VSI del jugador usando Recharts LineChart.
 */
import { Area, AreaChart, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Props {
  vsiHistory: number[];
  currentVSI: number;
  trend: "up" | "down" | "stable";
}

export default function VSIHistoryChart({ vsiHistory, currentVSI, trend }: Props) {
  // Need at least 2 points to show a chart
  if (!vsiHistory || vsiHistory.length < 2) {
    return (
      <div className="flex items-center justify-center h-20 text-[10px] text-muted-foreground font-display">
        Se necesitan al menos 2 registros de VSI para mostrar evolución
      </div>
    );
  }

  const data = vsiHistory.map((vsi, i) => ({
    session: i === vsiHistory.length - 1 ? "Hoy" : `S${i + 1}`,
    vsi: Math.round(vsi * 10) / 10,
  }));

  const trendColor = trend === "up" ? "#7c3aed" : trend === "down" ? "#ef4444" : "#3b82f6";
  const minVal = Math.max(0, Math.min(...vsiHistory) - 5);
  const maxVal = Math.min(100, Math.max(...vsiHistory) + 5);

  // Custom tooltip
  const CustomTooltip = ({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) => {
    if (active && payload?.length) {
      return (
        <div className="glass rounded-lg px-2 py-1.5 text-[10px] font-display border border-border">
          <p className="text-muted-foreground">{label}</p>
          <p className="text-foreground font-bold">VSI {payload[0].value}</p>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={80}>
      <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
        <defs>
          <linearGradient id="vsiGradient" x1="0" y1="0" x2="0" y2="1">
            <stop offset="5%" stopColor={trendColor} stopOpacity={0.3} />
            <stop offset="95%" stopColor={trendColor} stopOpacity={0} />
          </linearGradient>
        </defs>
        <XAxis dataKey="session" tick={{ fontSize: 9, fill: "#6b7280", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
        <YAxis domain={[minVal, maxVal]} tick={{ fontSize: 9, fill: "#6b7280", fontFamily: "inherit" }} axisLine={false} tickLine={false} />
        <Tooltip content={<CustomTooltip />} />
        <ReferenceLine y={80} stroke="#7c3aed" strokeDasharray="3 3" strokeOpacity={0.3} />
        <Area type="monotone" dataKey="vsi" stroke={trendColor} strokeWidth={2} fill="url(#vsiGradient)" dot={{ fill: trendColor, r: 2 }} activeDot={{ r: 4 }} />
      </AreaChart>
    </ResponsiveContainer>
  );
}
