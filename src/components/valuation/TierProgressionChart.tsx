/**
 * TierProgressionChart — Tier + VSI progression over time
 *
 * Shows VSI line with tier zone bands and injury event markers.
 * Uses Recharts for consistency with existing ACWR chart.
 *
 * Sprint 13: Valuation Dashboard & Integration
 */

import { useMemo } from "react";
import {
  ResponsiveContainer,
  ComposedChart,
  Line,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ReferenceArea,
  ReferenceLine,
} from "recharts";
import { motion } from "framer-motion";
import { TrendingUp } from "lucide-react";

interface DataPoint {
  date: string;
  vsi: number | null;
  tier?: string;
}

interface TierProgressionChartProps {
  data: DataPoint[];
  height?: number;
  compact?: boolean;
}

const TIER_ZONES = [
  { y1: 78, y2: 100, fill: "#FFD700", label: "Elite Prospect" },
  { y1: 60, y2: 78,  fill: "#22C55E", label: "High Potential" },
  { y1: 40, y2: 60,  fill: "#3B82F6", label: "Developing Talent" },
  { y1: 0,  y2: 40,  fill: "#8B5CF6", label: "Foundation" },
];

function CustomTooltip({ active, payload, label }: { active?: boolean; payload?: Array<{ value: number }>; label?: string }) {
  if (!active || !payload?.length) return null;
  const vsi = payload[0]?.value;
  const tier = vsi == null ? "—" :
    vsi >= 78 ? "Elite Prospect" :
    vsi >= 60 ? "High Potential" :
    vsi >= 40 ? "Developing Talent" :
    "Foundation";

  return (
    <div className="glass rounded-lg px-3 py-2 border border-border/50 shadow-md">
      <p className="text-[10px] text-muted-foreground">{label}</p>
      <p className="text-sm font-display font-bold text-foreground">VSI {vsi ?? "—"}</p>
      <p className="text-[10px] text-muted-foreground">{tier}</p>
    </div>
  );
}

export default function TierProgressionChart({
  data,
  height = 220,
  compact = false,
}: TierProgressionChartProps) {
  const chartData = useMemo(() =>
    data.map((d) => ({ ...d, dateLabel: d.date.slice(5) })),
    [data],
  );

  if (data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-center">
        <TrendingUp size={24} className="text-muted-foreground/40 mb-2" />
        <p className="text-xs text-muted-foreground">Sin datos de progresion. Analiza mas sesiones.</p>
      </div>
    );
  }

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="space-y-3">
      {!compact && (
        <div className="flex items-center gap-2">
          <TrendingUp size={16} className="text-primary" />
          <h4 className="font-display font-bold text-sm text-foreground">Progresion de Tier</h4>
        </div>
      )}

      {/* Legend */}
      {!compact && (
        <div className="flex flex-wrap gap-3">
          {TIER_ZONES.map((z) => (
            <div key={z.label} className="flex items-center gap-1">
              <div className="w-2 h-2 rounded-full" style={{ backgroundColor: z.fill }} />
              <span className="text-[9px] text-muted-foreground">{z.label}</span>
            </div>
          ))}
        </div>
      )}

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={chartData} margin={{ top: 5, right: 5, left: -15, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" opacity={0.3} />

          {TIER_ZONES.map((z) => (
            <ReferenceArea key={z.label} y1={z.y1} y2={z.y2} fill={z.fill} fillOpacity={0.06} />
          ))}

          <ReferenceLine y={78} stroke="#FFD700" strokeDasharray="4 4" strokeOpacity={0.4} />
          <ReferenceLine y={60} stroke="#22C55E" strokeDasharray="4 4" strokeOpacity={0.4} />
          <ReferenceLine y={40} stroke="#3B82F6" strokeDasharray="4 4" strokeOpacity={0.4} />

          <XAxis
            dataKey="dateLabel"
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
            tickLine={false}
            axisLine={false}
            ticks={[0, 20, 40, 60, 78, 100]}
          />
          <Tooltip content={<CustomTooltip />} />

          <Area
            type="monotone"
            dataKey="vsi"
            stroke="transparent"
            fill="hsl(var(--primary))"
            fillOpacity={0.1}
            connectNulls
          />
          <Line
            type="monotone"
            dataKey="vsi"
            stroke="hsl(var(--primary))"
            strokeWidth={2.5}
            dot={{ r: 4, fill: "hsl(var(--primary))", stroke: "white", strokeWidth: 2 }}
            connectNulls
          />
        </ComposedChart>
      </ResponsiveContainer>
    </motion.div>
  );
}
