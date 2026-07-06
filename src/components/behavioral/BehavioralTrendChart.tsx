/**
 * VITAS · BehavioralTrendChart (Sprint 20)
 *
 * Recharts LineChart of mentalCompositeScore over time.
 */
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis,
  CartesianGrid, Tooltip, ReferenceLine,
} from "recharts";
import { useTranslation } from "react-i18next";

interface TrendPoint {
  date: string;
  mentalComposite: number;
  videosAnalyzed?: number;
}

interface Props {
  data: TrendPoint[];
  height?: number;
}

export default function BehavioralTrendChart({ data, height = 180 }: Props) {
  const { t } = useTranslation();

  if (data.length < 2) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        {t("behavioralTrendChart.needMoreEvaluations")}
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        {t("behavioralTrendChart.mentalEvolution")}
      </span>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="mentalGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#8b5cf6" stopOpacity={0.3} />
              <stop offset="100%" stopColor="#8b5cf6" stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="date"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 10,
            }}
            formatter={(value: number) => [`${value}/100`, t("behavioralTrendChart.mentalComposite")]}
          />
          <ReferenceLine y={50} stroke="rgba(255,255,255,0.1)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="mentalComposite"
            stroke="#8b5cf6"
            strokeWidth={2}
            dot={{ r: 4, fill: "#8b5cf6", strokeWidth: 0 }}
            activeDot={{ r: 6, fill: "#8b5cf6", stroke: "#fff", strokeWidth: 2 }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
