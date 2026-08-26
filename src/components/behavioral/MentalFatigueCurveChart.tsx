/**
 * VITAS · MentalFatigueCurveChart (Sprint 20)
 *
 * Recharts ComposedChart: two lines (physical=blue, cognitive=orange)
 * with colored area between them.
 */
import {
  ResponsiveContainer, ComposedChart, Line, Area,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend,
} from "recharts";
import { useTranslation } from "react-i18next";

interface SegmentData {
  segmentIndex: number;
  physicalPct: number;
  cognitivePct: number;
}

interface Props {
  segments: SegmentData[];
  mentalResistanceRatio: number;
  height?: number;
}

export default function MentalFatigueCurveChart({ segments, mentalResistanceRatio, height = 220 }: Props) {
  const { t } = useTranslation();

  if (segments.length < 2) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        {t("mentalFatigueCurveChart.insufficientData")}
      </div>
    );
  }

  const data = segments.map(s => ({
    segment: `S${s.segmentIndex + 1}`,
    physical: s.physicalPct,
    cognitive: s.cognitivePct,
  }));

  const ratioLabel =
    mentalResistanceRatio < 0.5 ? t("mentalFatigueCurveChart.ratioMentalStrength") :
    mentalResistanceRatio <= 1.5 ? t("mentalFatigueCurveChart.ratioBalanced") :
    t("mentalFatigueCurveChart.ratioMentalFragility");
  const ratioColor =
    mentalResistanceRatio < 0.5 ? "text-emerald-400" :
    mentalResistanceRatio <= 1.5 ? "text-blue-400" :
    "text-red-400";

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("mentalFatigueCurveChart.title")}
        </span>
        <span className={`text-[10px] font-bold ${ratioColor}`}>
          {ratioLabel} ({mentalResistanceRatio.toFixed(2)})
        </span>
      </div>

      {/* "Indica de qué se trata": cómo leer la curva. */}
      <p className="text-[11px] text-muted-foreground/80 leading-snug">
        {t("mentalFatigueCurveChart.description")}
      </p>

      <ResponsiveContainer width="100%" height={height}>
        {/* Colores theme-aware (antes blanco con opacidad → invisibles en claro). */}
        <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="gapArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            dataKey="segment"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
          />
          <YAxis
            domain={[0, 120]}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            label={{ value: t("mentalFatigueCurveChart.yAxisLabel"), angle: -90, position: "insideLeft", fontSize: 9, fill: "hsl(var(--muted-foreground))" }}
          />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 10,
              color: "hsl(var(--popover-foreground))",
            }}
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === "physical" ? t("mentalFatigueCurveChart.physical") : t("mentalFatigueCurveChart.cognitive"),
            ]}
          />
          <Legend
            iconType="line"
            iconSize={10}
            wrapperStyle={{ fontSize: 9, color: "hsl(var(--muted-foreground))" }}
            formatter={(name: string) => name === "physical" ? t("mentalFatigueCurveChart.physical") : t("mentalFatigueCurveChart.cognitive")}
          />
          <Area
            type="monotone"
            dataKey="cognitive"
            stroke="none"
            fill="url(#gapArea)"
          />
          <Line
            type="monotone"
            dataKey="physical"
            stroke="#3b82f6"
            strokeWidth={2}
            dot={{ r: 3, fill: "#3b82f6" }}
            name="physical"
          />
          <Line
            type="monotone"
            dataKey="cognitive"
            stroke="#f59e0b"
            strokeWidth={2}
            strokeDasharray="5 5"
            dot={{ r: 3, fill: "#f59e0b" }}
            name="cognitive"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
