/**
 * VITAS · DecisionSpeedTimeline (Sprint 20)
 *
 * Recharts ScatterChart: each point = one decision.
 * Color = success/fail, size = pressure level.
 */
import {
  ResponsiveContainer, ScatterChart, Scatter, XAxis, YAxis,
  ZAxis, Tooltip, CartesianGrid, Cell,
} from "recharts";

interface DecisionPoint {
  decisionTimeMs: number;
  pressureLevel: number;
  outcome: "successful" | "failed" | "neutral";
  actionType: string;
}

interface Props {
  decisions: DecisionPoint[];
  height?: number;
}

const OUTCOME_COLORS: Record<string, string> = {
  successful: "#22c55e",
  failed: "#ef4444",
  neutral: "#6b7280",
};

export default function DecisionSpeedTimeline({ decisions, height = 220 }: Props) {
  if (decisions.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        Sin datos de decisiones disponibles
      </div>
    );
  }

  const data = decisions.map((d, i) => ({
    index: i + 1,
    time: d.decisionTimeMs,
    pressure: d.pressureLevel,
    outcome: d.outcome,
    action: d.actionType,
  }));

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Velocidad de Decisión
      </span>
      <ResponsiveContainer width="100%" height={height}>
        <ScatterChart margin={{ top: 10, right: 10, bottom: 10, left: 10 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" />
          <XAxis
            type="number"
            dataKey="index"
            name="Decisión"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
            label={{ value: "Decisión #", position: "insideBottom", offset: -5, fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
          />
          <YAxis
            type="number"
            dataKey="time"
            name="ms"
            tick={{ fill: "rgba(255,255,255,0.4)", fontSize: 9 }}
            label={{ value: "ms", angle: -90, position: "insideLeft", fontSize: 9, fill: "rgba(255,255,255,0.3)" }}
          />
          <ZAxis type="number" dataKey="pressure" range={[30, 200]} name="Presión" />
          <Tooltip
            contentStyle={{
              background: "rgba(0,0,0,0.85)",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 8,
              fontSize: 10,
            }}
            formatter={(value: number, name: string) => {
              if (name === "ms") return [`${value}ms`, "Tiempo"];
              if (name === "Presión") return [`${value}/100`, "Presión"];
              return [value, name];
            }}
          />
          <Scatter data={data}>
            {data.map((entry, i) => (
              <Cell key={i} fill={OUTCOME_COLORS[entry.outcome] ?? "#6b7280"} />
            ))}
          </Scatter>
        </ScatterChart>
      </ResponsiveContainer>

      {/* Legend */}
      <div className="flex items-center gap-3 justify-center">
        {Object.entries(OUTCOME_COLORS).map(([k, c]) => (
          <div key={k} className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: c }} />
            <span className="text-[8px] text-muted-foreground capitalize">
              {k === "successful" ? "Éxito" : k === "failed" ? "Error" : "Neutral"}
            </span>
          </div>
        ))}
        <span className="text-[8px] text-muted-foreground">Tamaño = presión</span>
      </div>
    </div>
  );
}
