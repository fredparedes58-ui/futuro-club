/**
 * VITAS · AttendanceCalendar (Sprint 23)
 *
 * Calendar with colored days: green=present, red=absent, yellow=late, gray=excused.
 * Shows last 30 days in a grid.
 */
import { motion } from "framer-motion";

interface AttendanceDay {
  date: string; // YYYY-MM-DD
  status: "present" | "absent" | "late" | "excused";
}

interface Props {
  records: AttendanceDay[];
  rate?: number;
}

const STATUS_COLORS: Record<string, string> = {
  present: "bg-emerald-500/60",
  absent: "bg-red-500/60",
  late: "bg-amber-500/60",
  excused: "bg-gray-500/40",
};

const STATUS_LABELS: Record<string, string> = {
  present: "Presente",
  absent: "Ausente",
  late: "Tarde",
  excused: "Justificado",
};

const DAY_NAMES = ["L", "M", "X", "J", "V", "S", "D"];

export default function AttendanceCalendar({ records, rate }: Props) {
  // Build a map for quick lookup
  const recordMap = new Map(records.map(r => [r.date, r.status]));

  // Generate last 35 days grid
  const today = new Date();
  const days: Array<{ date: string; dayOfWeek: number; status: string | null }> = [];

  for (let i = 34; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const dateStr = d.toISOString().split("T")[0];
    const dow = d.getDay(); // 0=Sun
    days.push({
      date: dateStr,
      dayOfWeek: dow,
      status: recordMap.get(dateStr) ?? null,
    });
  }

  // Group into weeks (Mon-Sun)
  const weeks: Array<Array<typeof days[0] | null>> = [];
  let currentWeek: Array<typeof days[0] | null> = new Array(7).fill(null);

  for (const day of days) {
    const idx = day.dayOfWeek === 0 ? 6 : day.dayOfWeek - 1; // Mon=0
    currentWeek[idx] = day;
    if (idx === 6) {
      weeks.push(currentWeek);
      currentWeek = new Array(7).fill(null);
    }
  }
  if (currentWeek.some(d => d !== null)) {
    weeks.push(currentWeek);
  }

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          Asistencia
        </span>
        {rate !== undefined && (
          <span className={`text-sm font-black font-mono ${rate >= 80 ? "text-emerald-400" : rate >= 60 ? "text-amber-400" : "text-red-400"}`}>
            {Math.round(rate)}%
          </span>
        )}
      </div>

      {/* Day names header */}
      <div className="grid grid-cols-7 gap-1">
        {DAY_NAMES.map(d => (
          <div key={d} className="text-center text-[8px] text-muted-foreground font-bold">
            {d}
          </div>
        ))}
      </div>

      {/* Calendar grid */}
      <div className="space-y-1">
        {weeks.map((week, wi) => (
          <div key={wi} className="grid grid-cols-7 gap-1">
            {week.map((day, di) => {
              if (!day) return <div key={di} className="w-full aspect-square" />;
              const status = day.status;
              const isToday = day.date === today.toISOString().split("T")[0];

              return (
                <motion.div
                  key={di}
                  className={`w-full aspect-square rounded-md flex items-center justify-center relative group cursor-default ${
                    status ? STATUS_COLORS[status] : "bg-white/5"
                  } ${isToday ? "ring-1 ring-white/40" : ""}`}
                  whileHover={{ scale: 1.15 }}
                >
                  <span className="text-[8px] font-mono text-white/70">
                    {new Date(day.date).getDate()}
                  </span>
                  {/* Tooltip */}
                  <div className="absolute -top-8 left-1/2 -translate-x-1/2 hidden group-hover:block z-20">
                    <div className="bg-gray-900 border border-border rounded px-2 py-0.5 whitespace-nowrap">
                      <span className="text-[8px] text-white">
                        {day.date}: {status ? STATUS_LABELS[status] : "Sin registro"}
                      </span>
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </div>
        ))}
      </div>

      {/* Legend */}
      <div className="flex items-center justify-center gap-3 flex-wrap">
        {Object.entries(STATUS_LABELS).map(([key, label]) => (
          <div key={key} className="flex items-center gap-1">
            <div className={`w-3 h-3 rounded-sm ${STATUS_COLORS[key]}`} />
            <span className="text-[8px] text-muted-foreground">{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
