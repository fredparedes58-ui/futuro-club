/**
 * VITAS · IDPProgressChart
 *
 * Radar de 5 dimensiones mostrando progreso del mes.
 * Usado en IDPDashboard (vista principal) y IDPParentView (versión light).
 */

import {
  ResponsiveContainer, RadarChart, Radar, PolarGrid,
  PolarAngleAxis, PolarRadiusAxis, Tooltip,
} from "recharts";
import type { IDPDimension, IDPProgressSummary } from "@/lib/idp/idpTypes";

interface Props {
  summary: IDPProgressSummary;
  height?: number;
  /** Si true, oculta los axis labels (variante compacta) */
  compact?: boolean;
}

const DIMENSION_LABELS: Record<IDPDimension, string> = {
  technical: "Técnico",
  tactical: "Táctico",
  physical: "Físico",
  mental: "Mental",
  maturation: "Maduración",
};

export function IDPProgressChart({ summary, height = 320, compact = false }: Props) {
  const data = (Object.keys(summary.byDimension) as IDPDimension[])
    .filter((d) => summary.byDimension[d] > 0 || !compact)
    .map((d) => ({
      dimension: DIMENSION_LABELS[d],
      progress: summary.byDimension[d],
    }));

  return (
    <div style={{ width: "100%", height }}>
      <ResponsiveContainer>
        <RadarChart data={data} margin={{ top: 16, right: 16, bottom: 16, left: 16 }}>
          <PolarGrid stroke="rgba(255,255,255,0.1)" />
          <PolarAngleAxis
            dataKey="dimension"
            tick={{ fill: compact ? "transparent" : "#94a3b8", fontSize: 11 }}
          />
          <PolarRadiusAxis
            angle={90}
            domain={[0, 100]}
            tick={{ fill: "#64748b", fontSize: 9 }}
            stroke="rgba(255,255,255,0.05)"
          />
          <Radar
            name="Progreso"
            dataKey="progress"
            stroke="#22d3ee"
            fill="#22d3ee"
            fillOpacity={0.3}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(15, 23, 42, 0.95)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 12,
            }}
            formatter={(v: number) => [`${v}%`, "Progreso"]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
