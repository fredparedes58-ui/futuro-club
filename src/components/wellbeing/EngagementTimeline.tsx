/**
 * VITAS · EngagementTimeline (Sprint 23)
 *
 * Recharts LineChart of engagement score per session.
 * Points colored: green=high, yellow=medium, red=low.
 */
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  ReferenceLine,
} from "recharts";

interface EngagementPoint {
  date: string;
  engagementScore: number;
  physicalEngagement: number;
  socialEngagement: number;
  emotionalEngagement: number;
}

interface Props {
  data: EngagementPoint[];
  height?: number;
}

function scoreColor(score: number): string {
  if (score >= 65) return "#22c55e";
  if (score >= 40) return "#f59e0b";
  return "#ef4444";
}

interface DotProps {
  cx?: number;
  cy?: number;
  payload?: EngagementPoint;
}

function CustomDot({ cx, cy, payload }: DotProps) {
  if (cx === undefined || cy === undefined || !payload) return null;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={4}
      fill={scoreColor(payload.engagementScore)}
      stroke="rgba(0,0,0,0.3)"
      strokeWidth={1}
    />
  );
}

interface TooltipPayload {
  payload?: EngagementPoint;
}

function CustomTooltip({ active, payload }: { active?: boolean; payload?: TooltipPayload[] }) {
  if (!active || !payload?.[0]?.payload) return null;
  const d = payload[0].payload;
  return (
    <div className="glass rounded-lg p-2 text-xs space-y-1 border border-border">
      <p className="font-bold text-foreground">{d.date}</p>
      <p className="text-muted-foreground">
        Engagement: <span className="font-mono font-bold" style={{ color: scoreColor(d.engagementScore) }}>
          {Math.round(d.engagementScore)}
        </span>
      </p>
      <div className="grid grid-cols-3 gap-2 text-[10px]">
        <span className="text-blue-400">Fís: {Math.round(d.physicalEngagement)}</span>
        <span className="text-violet-400">Soc: {Math.round(d.socialEngagement)}</span>
        <span className="text-rose-400">Emo: {Math.round(d.emotionalEngagement)}</span>
      </div>
    </div>
  );
}

export default function EngagementTimeline({ data, height = 200 }: Props) {
  if (data.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center">
        <p className="text-xs text-muted-foreground">Sin datos de engagement</p>
      </div>
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-2">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Engagement por Sesión
      </span>
      <ResponsiveContainer width="100%" height={height}>
        <LineChart data={data} margin={{ top: 5, right: 5, bottom: 5, left: -20 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
          <XAxis
            dataKey="date"
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 9, fill: "rgba(255,255,255,0.4)" }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip content={<CustomTooltip />} />
          <ReferenceLine y={65} stroke="rgba(34,197,94,0.3)" strokeDasharray="3 3" />
          <ReferenceLine y={40} stroke="rgba(245,158,11,0.3)" strokeDasharray="3 3" />
          <Line
            type="monotone"
            dataKey="engagementScore"
            stroke="rgba(139,92,246,0.7)"
            strokeWidth={2}
            dot={<CustomDot />}
            activeDot={{ r: 6, fill: "#8b5cf6" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
