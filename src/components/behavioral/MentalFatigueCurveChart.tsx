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
  if (segments.length < 2) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        Datos insuficientes para curva de fatiga
      </div>
    );
  }

  const data = segments.map(s => ({
    segment: `S${s.segmentIndex + 1}`,
    physical: s.physicalPct,
    cognitive: s.cognitivePct,
  }));

  const ratioLabel =
    mentalResistanceRatio < 0.5 ? "Fortaleza Mental" :
    mentalResistanceRatio <= 1.5 ? "Equilibrado" :
    "Fragilidad Mental";
  const ratioColor =
    mentalResistanceRatio < 0.5 ? "text-emerald-400" :
    mentalResistanceRatio <= 1.5 ? "text-blue-400" :
    "text-red-400";

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Curva de Fatiga Mental
        </span>
        <span className={`text-[10px] font-bold ${ratioColor}`}>
          {ratioLabel} ({mentalResistanceRatio.toFixed(2)})
        </span>
      </div>

      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={data} margin={{ top: 5, right: 10, bottom: 5, left: 10 }}>
          <defs>
            <linearGradient id="gapArea" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.15} />
              <stop offset="100%" stopColor="#3b82f6" stopOpacity={0.05} />
            </linearGradient>
          </defs>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            dataKey="segment"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
          />
          <YAxis
            domain={[0, 120]}
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
            label={{ value: "% del inicio", angle: -90, position: "insideLeft", fontSize: 8, fill: "rgba(255,255,255,0.3)" }}
          />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 10,
            }}
            formatter={(value: number, name: string) => [
              `${value}%`,
              name === "physical" ? "Físico" : "Cognitivo",
            ]}
          />
          <Legend
            iconType="line"
            iconSize={10}
            wrapperStyle={{ fontSize: 9, color: "rgba(255,255,255,0.5)" }}
            formatter={(name: string) => name === "physical" ? "Físico" : "Cognitivo"}
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
