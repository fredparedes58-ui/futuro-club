/**
 * VITAS · AttendanceLogForm
 *
 * Input MANUAL del entrenador para registrar la asistencia de un jugador a una
 * sesión (presente/tarde/justificada/ausente en una fecha). Es la pieza que
 * faltaba del bienestar (docx #11): la infraestructura (useSaveAttendance →
 * /api/wellbeing/attendance → Supabase) ya existía, pero ningún UI la usaba, así
 * que la asistencia caía a datos de ejemplo. Con datos reales, el riesgo de
 * abandono y el engagement se recalculan (la mutación invalida esas queries).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Check, AlertCircle } from "lucide-react";
import { useSaveAttendance } from "@/hooks/useWellbeing";

type Status = "present" | "late" | "excused" | "absent";

const STATUSES: Array<{ key: Status; labelKey: string; cls: string }> = [
  { key: "present", labelKey: "attendanceLog.present", cls: "border-green-500/40 text-green-500 hover:bg-green-500/10" },
  { key: "late",    labelKey: "attendanceLog.late",    cls: "border-amber-500/40 text-amber-500 hover:bg-amber-500/10" },
  { key: "excused", labelKey: "attendanceLog.excused", cls: "border-blue-500/40 text-blue-500 hover:bg-blue-500/10" },
  { key: "absent",  labelKey: "attendanceLog.absent",  cls: "border-red-500/40 text-red-500 hover:bg-red-500/10" },
];

/** Fecha de hoy en formato YYYY-MM-DD (zona local). */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

export default function AttendanceLogForm({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const save = useSaveAttendance();
  const [date, setDate] = useState<string>(todayISO);
  const [pending, setPending] = useState<Status | null>(null);
  const [savedStatus, setSavedStatus] = useState<Status | null>(null);

  const mark = (status: Status) => {
    if (!date) return;
    setPending(status);
    setSavedStatus(null);
    save.mutate(
      { playerId, date, status, source: "manual" },
      {
        onSuccess: () => setSavedStatus(status),
        onSettled: () => setPending(null),
      },
    );
  };

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("attendanceLog.title")}
        </span>
        <p className="mt-1 text-[11px] text-muted-foreground/80 leading-snug">
          {t("attendanceLog.hint")}
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1">
          <span className="text-[9px] uppercase tracking-wider text-muted-foreground">{t("attendanceLog.dateLabel")}</span>
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => { setDate(e.target.value); setSavedStatus(null); }}
            className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display text-foreground focus:outline-none focus:border-primary/50"
          />
        </label>

        <div className="flex flex-wrap gap-1.5">
          {STATUSES.map(({ key, labelKey, cls }) => (
            <button
              key={key}
              type="button"
              onClick={() => mark(key)}
              disabled={!date || pending !== null}
              className={`inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border text-[11px] font-display font-semibold transition-colors disabled:opacity-50 ${cls} ${savedStatus === key ? "ring-1 ring-current" : ""}`}
            >
              {pending === key ? <Loader2 size={11} className="animate-spin" /> : savedStatus === key ? <Check size={11} /> : null}
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      {savedStatus && !save.isError && (
        <p className="flex items-center gap-1 text-[10px] text-green-500">
          <Check size={11} /> {t("attendanceLog.saved")}
        </p>
      )}
      {save.isError && (
        <p className="flex items-center gap-1 text-[10px] text-red-500">
          <AlertCircle size={11} /> {t("attendanceLog.error")}
        </p>
      )}
    </div>
  );
}
