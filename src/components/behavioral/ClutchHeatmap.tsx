/**
 * VITAS · ClutchHeatmap (Sprint 20)
 *
 * Visual grid: X = match quarter, Y = metric.
 * Color = relative performance.
 */
import { motion } from "framer-motion";

interface QuarterData {
  quarter: 1 | 2 | 3 | 4;
  avgDecisionMs: number;
  successRate: number;
  eventCount: number;
  avgPressure: number;
}

interface Props {
  quarterPerformance: QuarterData[];
  clutchFactor: number;
}

const METRICS = [
  { key: "avgDecisionMs",  label: "Decisión (ms)", invert: true },
  { key: "successRate",    label: "Éxito (%)",     invert: false },
  { key: "avgPressure",    label: "Presión",       invert: false },
  { key: "eventCount",     label: "Eventos",       invert: false },
] as const;

function cellColor(value: number, max: number, invert: boolean): string {
  if (max === 0) return "bg-white/5";
  const ratio = value / max;
  const effective = invert ? 1 - ratio : ratio;
  if (effective >= 0.75) return "bg-emerald-500/70";
  if (effective >= 0.5) return "bg-emerald-500/30";
  if (effective >= 0.25) return "bg-amber-500/30";
  return "bg-red-500/30";
}

export default function ClutchHeatmap({ quarterPerformance, clutchFactor }: Props) {
  if (quarterPerformance.length === 0) {
    return (
      <div className="glass rounded-xl p-4 text-center text-muted-foreground text-xs">
        Sin datos de clutch disponibles
      </div>
    );
  }

  // Compute max per metric for color scaling
  const maxValues: Record<string, number> = {};
  for (const m of METRICS) {
    maxValues[m.key] = Math.max(
      ...quarterPerformance.map(q => {
        const v = q[m.key as keyof QuarterData] as number;
        return typeof v === "number" ? v : 0;
      }),
      1,
    );
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Rendimiento por Cuarto
        </span>
        <span className={`text-sm font-black font-mono ${clutchFactor >= 1.0 ? "text-emerald-400" : "text-amber-400"}`}>
          ×{clutchFactor.toFixed(2)}
        </span>
      </div>

      <div className="overflow-x-auto">
        <table className="min-w-full">
          <thead>
            <tr>
              <th className="text-[9px] text-muted-foreground font-normal text-left pr-2 pb-2">Métrica</th>
              {quarterPerformance.map(q => (
                <th key={q.quarter} className="text-[9px] text-muted-foreground font-normal text-center pb-2 min-w-[50px]">
                  Q{q.quarter}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {METRICS.map(({ key, label, invert }) => (
              <tr key={key}>
                <td className="text-[9px] text-foreground/70 pr-2 py-1">{label}</td>
                {quarterPerformance.map(q => {
                  const raw = q[key as keyof QuarterData] as number;
                  const value = typeof raw === "number" ? raw : 0;
                  const display = key === "successRate"
                    ? `${Math.round(value * 100)}%`
                    : Math.round(value).toString();

                  return (
                    <td key={q.quarter} className="px-1 py-1 text-center">
                      <motion.div
                        className={`rounded-md px-2 py-1.5 ${cellColor(value, maxValues[key], invert)}`}
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: q.quarter * 0.1 }}
                      >
                        <span className="text-[9px] font-mono font-bold text-white/90">
                          {display}
                        </span>
                      </motion.div>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
