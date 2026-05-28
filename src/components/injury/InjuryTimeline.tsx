/**
 * InjuryTimeline — Visual timeline of injuries with severity colors
 *
 * Shows injury events on a horizontal/vertical timeline with:
 * - Color-coded severity markers (green/yellow/red)
 * - Recovery duration bars
 * - Body part and type labels
 *
 * Sprint 11: Injury Dashboard & Alerts
 */

import { motion } from "framer-motion";
import { Calendar, Activity, AlertTriangle, CheckCircle } from "lucide-react";
import type { InjuryEntry } from "./InjuryLogForm";

interface InjuryTimelineProps {
  injuries: InjuryEntry[];
  compact?: boolean;
  maxVisible?: number;
}

const SEVERITY_STYLES = {
  mild:     { color: "#22c55e", bg: "bg-emerald-500/15", border: "border-emerald-500/30", label: "Leve" },
  moderate: { color: "#f97316", bg: "bg-orange-500/15", border: "border-orange-500/30", label: "Moderada" },
  severe:   { color: "#ef4444", bg: "bg-red-500/15", border: "border-red-500/30", label: "Grave" },
};

function formatDate(dateStr: string): string {
  try {
    const d = new Date(dateStr);
    return d.toLocaleDateString("es-ES", { day: "numeric", month: "short", year: "2-digit" });
  } catch {
    return dateStr;
  }
}

function daysBetween(date1: string, date2: string): number {
  const d1 = new Date(date1);
  const d2 = new Date(date2);
  return Math.round((d2.getTime() - d1.getTime()) / (1000 * 60 * 60 * 24));
}

export default function InjuryTimeline({
  injuries,
  compact = false,
  maxVisible = 8,
}: InjuryTimelineProps) {
  const sorted = [...injuries].sort((a, b) => b.date.localeCompare(a.date));
  const visible = sorted.slice(0, maxVisible);

  if (visible.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-6 text-center">
        <CheckCircle size={20} className="text-emerald-500 mb-2" />
        <p className="text-xs text-muted-foreground">Sin lesiones registradas</p>
      </div>
    );
  }

  // ── Compact ──────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="space-y-1.5">
        {visible.slice(0, 3).map((inj, i) => {
          const style = SEVERITY_STYLES[inj.severity];
          return (
            <div key={inj.id ?? i} className="flex items-center gap-2 text-xs">
              <div className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: style.color }} />
              <span className="text-foreground">{inj.type}</span>
              <span className="text-muted-foreground">· {inj.bodyPart}</span>
              <span className="ml-auto text-[10px] text-muted-foreground">{formatDate(inj.date)}</span>
            </div>
          );
        })}
        {sorted.length > 3 && (
          <p className="text-[10px] text-muted-foreground text-center">+{sorted.length - 3} mas</p>
        )}
      </div>
    );
  }

  // ── Full timeline ────────────────────────────────────────────
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <Calendar size={16} className="text-primary" />
        <h4 className="font-display font-bold text-sm text-foreground">Historial de Lesiones</h4>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {injuries.length} registrada{injuries.length !== 1 ? "s" : ""}
        </span>
      </div>

      <div className="relative">
        {/* Vertical line */}
        <div className="absolute left-[11px] top-2 bottom-2 w-px bg-border/50" />

        <div className="space-y-3">
          {visible.map((inj, i) => {
            const style = SEVERITY_STYLES[inj.severity];
            const nextInjury = visible[i + 1];
            const gapDays = nextInjury ? daysBetween(nextInjury.date, inj.date) : null;

            return (
              <motion.div
                key={inj.id ?? i}
                initial={{ opacity: 0, x: -8 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ delay: i * 0.05 }}
              >
                <div className="flex items-start gap-3">
                  {/* Timeline dot */}
                  <div className="relative z-10 mt-1.5">
                    <div
                      className="w-[22px] h-[22px] rounded-full border-2 flex items-center justify-center"
                      style={{ borderColor: style.color, backgroundColor: `${style.color}20` }}
                    >
                      {inj.severity === "severe" ? (
                        <AlertTriangle size={10} style={{ color: style.color }} />
                      ) : (
                        <Activity size={10} style={{ color: style.color }} />
                      )}
                    </div>
                  </div>

                  {/* Content card */}
                  <div className={`flex-1 rounded-lg ${style.bg} ${style.border} border px-3 py-2`}>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-medium text-foreground">{inj.type}</span>
                      <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded"
                        style={{ color: style.color, backgroundColor: `${style.color}15` }}>
                        {style.label}
                      </span>
                      {inj.isRecurrent && (
                        <span className="text-[8px] font-bold uppercase px-1 py-0.5 rounded bg-red-500/10 text-red-500">
                          Recurrente
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 mt-1 text-[10px] text-muted-foreground">
                      <span>{inj.bodyPart}</span>
                      <span>·</span>
                      <span>{formatDate(inj.date)}</span>
                      {inj.daysOut != null && (
                        <>
                          <span>·</span>
                          <span>{inj.daysOut}d baja</span>
                        </>
                      )}
                    </div>
                    {inj.mechanism && (
                      <p className="text-[10px] text-muted-foreground/70 mt-0.5">
                        Mecanismo: {inj.mechanism}
                      </p>
                    )}
                  </div>
                </div>

                {/* Gap indicator */}
                {gapDays != null && gapDays > 0 && (
                  <div className="flex items-center gap-2 ml-[11px] pl-3 py-1">
                    <div className="h-px flex-1 bg-border/30" />
                    <span className="text-[9px] text-muted-foreground/50 shrink-0">
                      {gapDays}d entre lesiones
                    </span>
                    <div className="h-px flex-1 bg-border/30" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>
      </div>

      {sorted.length > maxVisible && (
        <p className="text-[10px] text-muted-foreground text-center">
          +{sorted.length - maxVisible} lesiones anteriores
        </p>
      )}
    </div>
  );
}
