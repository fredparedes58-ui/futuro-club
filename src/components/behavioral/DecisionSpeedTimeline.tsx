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
import { useTranslation } from "react-i18next";

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
  const { t } = useTranslation();

  if (decisions.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        {t("decisionSpeedTimeline.noData")}
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
        {t("decisionSpeedTimeline.title")}
      </span>
      {/* "Indica de qué se trata": cómo leer la dispersión. */}
      <p className="text-[11px] text-muted-foreground/80 leading-snug">
        {t("decisionSpeedTimeline.description")}
      </p>
      <ResponsiveContainer width="100%" height={height}>
        {/* Colores theme-aware: antes eran blanco con opacidad → rejilla y ejes
            invisibles en modo claro ("la dispersión no dice nada"). */}
        <ScatterChart margin={{ top: 10, right: 10, bottom: 18, left: 12 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
          <XAxis
            type="number"
            dataKey="index"
            name={t("decisionSpeedTimeline.decision")}
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            label={{ value: t("decisionSpeedTimeline.decisionAxisLabel"), position: "insideBottom", offset: -8, fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <YAxis
            type="number"
            dataKey="time"
            name="ms"
            tick={{ fill: "hsl(var(--muted-foreground))", fontSize: 9 }}
            label={{ value: t("decisionSpeedTimeline.timeAxisLabel"), angle: -90, position: "insideLeft", fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
          />
          <ZAxis type="number" dataKey="pressure" range={[30, 200]} name={t("decisionSpeedTimeline.pressure")} />
          <Tooltip
            contentStyle={{
              background: "hsl(var(--popover))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 8,
              fontSize: 10,
              color: "hsl(var(--popover-foreground))",
            }}
            formatter={(value: number, name: string) => {
              if (name === "ms") return [`${value}ms`, t("decisionSpeedTimeline.time")];
              if (name === t("decisionSpeedTimeline.pressure")) return [`${value}/100`, t("decisionSpeedTimeline.pressure")];
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
              {k === "successful"
                ? t("decisionSpeedTimeline.success")
                : k === "failed"
                ? t("decisionSpeedTimeline.error")
                : t("decisionSpeedTimeline.neutral")}
            </span>
          </div>
        ))}
        <span className="text-[8px] text-muted-foreground">{t("decisionSpeedTimeline.sizePressure")}</span>
      </div>
    </div>
  );
}
