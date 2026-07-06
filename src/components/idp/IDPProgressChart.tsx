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
import { useTranslation } from "react-i18next";
import type { IDPDimension, IDPProgressSummary } from "@/lib/idp/idpTypes";

interface Props {
  summary: IDPProgressSummary;
  height?: number;
  /** Si true, oculta los axis labels (variante compacta) */
  compact?: boolean;
}

const DIMENSION_LABEL_KEYS: Record<IDPDimension, string> = {
  technical: "idpProgressChart.dimensionTechnical",
  tactical: "idpProgressChart.dimensionTactical",
  physical: "idpProgressChart.dimensionPhysical",
  mental: "idpProgressChart.dimensionMental",
  maturation: "idpProgressChart.dimensionMaturation",
};

export function IDPProgressChart({ summary, height = 320, compact = false }: Props) {
  const { t } = useTranslation();
  const data = (Object.keys(summary.byDimension) as IDPDimension[])
    .filter((d) => summary.byDimension[d] > 0 || !compact)
    .map((d) => ({
      dimension: t(DIMENSION_LABEL_KEYS[d]),
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
            name={t("idpProgressChart.progress")}
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
            formatter={(v: number) => [`${v}%`, t("idpProgressChart.progress")]}
          />
        </RadarChart>
      </ResponsiveContainer>
    </div>
  );
}
