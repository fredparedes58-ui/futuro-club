/**
 * VITAS · SessionBalanceChart (Sprint 16)
 *
 * PieChart showing session balance (técnica/táctica/física/juego)
 * with ideal balance overlay from LTAD.
 */
import {
  ResponsiveContainer, PieChart, Pie, Cell, Legend, Tooltip,
  RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from "recharts";
import { useTranslation } from "react-i18next";
import type { SessionBalance } from "@/lib/shared/sessionTypes";

interface Props {
  balance: SessionBalance;
  showRadar?: boolean;
}

const CATEGORIES = ["technical", "tactical", "physical", "game"] as const;
const COLORS = {
  technical: "#3b82f6",
  tactical: "#8b5cf6",
  physical: "#ef4444",
  game: "#22c55e",
  warmupCooldown: "#f59e0b",
};

export default function SessionBalanceChart({ balance, showRadar }: Props) {
  const { t } = useTranslation();

  const LABELS: Record<string, string> = {
    technical: t("sessionBalanceChart.technical"),
    tactical: t("sessionBalanceChart.tactical"),
    physical: t("sessionBalanceChart.physical"),
    game: t("sessionBalanceChart.game"),
    warmupCooldown: t("sessionBalanceChart.warmupCooldown"),
  };

  // Pie data
  const pieData = [...CATEGORIES, "warmupCooldown" as const].map(key => ({
    name: LABELS[key],
    value: Math.round(balance.actual[key]),
    color: COLORS[key as keyof typeof COLORS],
  })).filter(d => d.value > 0);

  // Radar data (actual vs ideal)
  const radarData = CATEGORIES.map(key => ({
    category: LABELS[key],
    actual: Math.round(balance.actual[key]),
    ideal: Math.round(balance.ideal[key]),
  }));

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("sessionBalanceChart.title")}
        </span>
        <span className="text-lg font-black font-mono text-foreground">
          {balance.overallScore}<span className="text-xs text-muted-foreground font-normal">/100</span>
        </span>
      </div>

      {showRadar ? (
        /* Radar view — actual vs ideal */
        <ResponsiveContainer width="100%" height={220}>
          <RadarChart data={radarData} cx="50%" cy="50%" outerRadius="70%">
            <PolarGrid stroke="rgba(255,255,255,0.06)" />
            <PolarAngleAxis
              dataKey="category"
              tick={{ fill: "rgba(255,255,255,0.5)", fontSize: 10 }}
            />
            <PolarRadiusAxis tick={false} axisLine={false} domain={[0, 60]} />
            <Radar
              name="Ideal"
              dataKey="ideal"
              stroke="rgba(255,255,255,0.3)"
              fill="rgba(255,255,255,0.05)"
              strokeDasharray="4 4"
            />
            <Radar
              name="Actual"
              dataKey="actual"
              stroke="#8b5cf6"
              fill="rgba(139,92,246,0.2)"
              strokeWidth={2}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(0,0,0,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
          </RadarChart>
        </ResponsiveContainer>
      ) : (
        /* Pie view */
        <ResponsiveContainer width="100%" height={200}>
          <PieChart>
            <Pie
              data={pieData}
              cx="50%"
              cy="50%"
              innerRadius={50}
              outerRadius={80}
              dataKey="value"
              paddingAngle={2}
              strokeWidth={0}
            >
              {pieData.map((entry, i) => (
                <Cell key={i} fill={entry.color} />
              ))}
            </Pie>
            <Tooltip
              contentStyle={{
                background: "rgba(0,0,0,0.8)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 11,
              }}
              formatter={(value: number) => `${value}%`}
            />
            <Legend
              iconType="circle"
              iconSize={6}
              wrapperStyle={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}
            />
          </PieChart>
        </ResponsiveContainer>
      )}

      {/* Ideal balance label */}
      <div className="text-[10px] text-muted-foreground text-center">
        {t("sessionBalanceChart.idealBalance", { label: balance.ideal.label })}: {CATEGORIES.map(k =>
          `${LABELS[k]} ${balance.ideal[k]}%`
        ).join(" · ")}
      </div>
    </div>
  );
}
