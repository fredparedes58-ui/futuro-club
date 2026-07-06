/**
 * VITAS · MaturityProjectionChart (Sprint 2.3)
 *
 * Curva "p40 hoy → p80 a los 21": convierte la corrección PHV en narrativa
 * de futuro. Recharts LineChart con el punto "hoy" destacado.
 */
import {
  ResponsiveContainer, LineChart, Line, XAxis, YAxis, Tooltip,
  ReferenceDot, CartesianGrid,
} from "recharts";
import { motion } from "framer-motion";
import { LineChart as LineIcon } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { MaturityProjection } from "@/lib/phv";

interface Props {
  projection: MaturityProjection;
  height?: number;
}

export function MaturityProjectionChart({ projection, height = 200 }: Props) {
  const { t } = useTranslation();
  const data = projection.curve.map((p) => ({ age: p.age, percentil: p.percentile, isNow: p.isNow }));
  const nowPoint = projection.curve.find((p) => p.isNow);
  const up = projection.delta >= 0;
  const lineColor = up ? "#34d399" : "#fbbf24";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="rounded-xl border border-white/10 bg-white/[0.02] p-4"
    >
      <div className="flex items-center gap-2 mb-1">
        <LineIcon className="size-3.5 text-cyan-400" />
        <h3 className="text-sm font-semibold text-foreground">{projection.headline}</h3>
      </div>
      <p className="text-[11px] text-muted-foreground mb-3 leading-snug">{projection.narrative}</p>

      <div style={{ width: "100%", height }}>
        <ResponsiveContainer>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 4, left: -8 }}>
            <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
            <XAxis
              dataKey="age"
              tick={{ fill: "#94a3b8", fontSize: 10 }}
              tickFormatter={(a) => t("maturityProjectionChart.ageTick", { age: a })}
              stroke="rgba(255,255,255,0.1)"
            />
            <YAxis
              domain={[0, 100]}
              tick={{ fill: "#64748b", fontSize: 9 }}
              stroke="rgba(255,255,255,0.1)"
              tickFormatter={(v) => `p${v}`}
              width={34}
            />
            <Tooltip
              contentStyle={{
                background: "rgba(15,23,42,0.95)",
                border: "1px solid rgba(255,255,255,0.1)",
                borderRadius: 8,
                fontSize: 12,
              }}
              formatter={(v: number) => [t("maturityProjectionChart.percentileValue", { value: v }), ""]}
              labelFormatter={(a) => t("maturityProjectionChart.ageLabel", { age: a })}
            />
            <Line
              type="monotone"
              dataKey="percentil"
              stroke={lineColor}
              strokeWidth={2.5}
              dot={{ r: 2, fill: lineColor }}
              strokeDasharray="0"
            />
            {nowPoint && (
              <ReferenceDot
                x={nowPoint.age}
                y={nowPoint.percentile}
                r={5}
                fill="#22d3ee"
                stroke="#fff"
                strokeWidth={1.5}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>
      <div className="flex justify-between text-[9px] text-muted-foreground mt-1">
        <span>● {t("maturityProjectionChart.today", { percentile: projection.currentPercentile })}</span>
        <span>{t("maturityProjectionChart.projectionAt", { age: projection.maturityAge, percentile: projection.projectedPercentile })}</span>
      </div>
    </motion.div>
  );
}
