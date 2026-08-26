/**
 * VITAS · EngagementLogForm
 *
 * Entrada MANUAL del entrenador para registrar el engagement observado de un
 * jugador en una sesión (físico / social / emocional). Es la pieza que faltaba:
 * la infraestructura (WellbeingService.saveEngagement → engagement_snapshots +
 * heatmap + timeline) existía pero NINGÚN caller la alimentaba, así que la tabla
 * quedaba vacía y todo caía a datos de ejemplo.
 *
 * Por qué manual y no derivado del tracking: el engagement por tracking
 * (engagementCalculator/engagementTracker) se calcula sobre PISTAS ANÓNIMAS
 * (`pid_*`). La capa de identidad por dorsal que lo ataría a un jugador con
 * nombre NO está construida (el sistema abstiene, ver .claude/rules/identidad.md),
 * y una métrica sobre pista anónima "no puede renderizarse bajo el nombre de un
 * jugador". Hasta que exista esa identidad, la valoración del entrenador es la
 * única fuente honesta de engagement POR JUGADOR. Es una observación humana, no
 * una medición: se pide por ejes en una escala discreta (sin valor por defecto,
 * para no colar un "50" que nadie observó).
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { Loader2, Check, AlertCircle, Activity, Users, Heart } from "lucide-react";
import { useSaveEngagement } from "@/hooks/useWellbeing";
import { compositeEngagement } from "@/lib/coaching/engagementCalculator";

type AxisKey = "physical" | "social" | "emotional";

const AXES: Array<{ key: AxisKey; labelKey: string; icon: typeof Activity }> = [
  { key: "physical", labelKey: "engagementLog.axisPhysical", icon: Activity },
  { key: "social", labelKey: "engagementLog.axisSocial", icon: Users },
  { key: "emotional", labelKey: "engagementLog.axisEmotional", icon: Heart },
];

// Escala discreta 0-100 (mismo mapeo 1-5 → *20 que el cuestionario de bienestar).
// El mínimo es 20 (nunca 0): una valoración real siempre tiene señal, así que
// composite=0 queda reservado para "sin medir" y el heatmap lo trata como vacío.
const LEVELS: Array<{ value: number; labelKey: string }> = [
  { value: 20, labelKey: "engagementLog.levelVeryLow" },
  { value: 40, labelKey: "engagementLog.levelLow" },
  { value: 60, labelKey: "engagementLog.levelNormal" },
  { value: 80, labelKey: "engagementLog.levelHigh" },
  { value: 100, labelKey: "engagementLog.levelVeryHigh" },
];

/** Fecha de hoy en formato YYYY-MM-DD (zona local). */
function todayISO(): string {
  const d = new Date();
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60_000).toISOString().slice(0, 10);
}

type AxisState = Partial<Record<AxisKey, number>>;

export default function EngagementLogForm({ playerId }: { playerId: string }) {
  const { t } = useTranslation();
  const save = useSaveEngagement();
  const [date, setDate] = useState<string>(todayISO);
  const [axes, setAxes] = useState<AxisState>({});
  const [saved, setSaved] = useState(false);

  const allRated =
    axes.physical !== undefined &&
    axes.social !== undefined &&
    axes.emotional !== undefined;

  const composite = allRated
    ? compositeEngagement(axes.physical!, axes.social!, axes.emotional!)
    : null;

  const pick = (axis: AxisKey, value: number) => {
    setAxes((prev) => ({ ...prev, [axis]: value }));
    setSaved(false);
  };

  const submit = () => {
    if (!date || !allRated) return;
    setSaved(false);
    save.mutate(
      {
        playerId,
        date,
        physical: axes.physical!,
        social: axes.social!,
        emotional: axes.emotional!,
        composite: composite!,
      },
      { onSuccess: () => setSaved(true) },
    );
  };

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <div>
        <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
          {t("engagementLog.title")}
        </span>
        <p className="mt-1 text-[11px] text-muted-foreground/80 leading-snug">
          {t("engagementLog.hint")}
        </p>
      </div>

      <label className="flex flex-col gap-1 w-fit">
        <span className="text-[9px] uppercase tracking-wider text-muted-foreground">
          {t("engagementLog.dateLabel")}
        </span>
        <input
          type="date"
          value={date}
          max={todayISO()}
          onChange={(e) => {
            setDate(e.target.value);
            setSaved(false);
          }}
          className="px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display text-foreground focus:outline-none focus:border-primary/50"
        />
      </label>

      <div className="space-y-2.5">
        {AXES.map(({ key, labelKey, icon: Icon }) => (
          <div key={key} className="space-y-1">
            <div className="flex items-center gap-1.5">
              <Icon size={12} className="text-muted-foreground shrink-0" />
              <span className="text-[11px] text-muted-foreground">{t(labelKey)}</span>
            </div>
            <div className="flex flex-wrap gap-1">
              {LEVELS.map(({ value, labelKey: lk }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => pick(key, value)}
                  className={`px-2 py-1 rounded-lg border text-[10px] font-display font-semibold transition-colors ${
                    axes[key] === value
                      ? "border-primary/60 bg-primary/20 text-primary"
                      : "border-border text-muted-foreground hover:bg-white/5"
                  }`}
                >
                  {t(lk)}
                </button>
              ))}
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between gap-3 pt-1">
        <span className="text-[10px] text-muted-foreground">
          {composite !== null
            ? t("engagementLog.compositePreview", { score: composite })
            : t("engagementLog.rateAllHint")}
        </span>
        <button
          type="button"
          onClick={submit}
          disabled={!allRated || !date || save.isPending}
          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold bg-primary/20 text-primary border border-primary/30 hover:bg-primary/30 transition-colors disabled:opacity-50"
        >
          {save.isPending ? <Loader2 size={12} className="animate-spin" /> : saved ? <Check size={12} /> : null}
          {t("engagementLog.save")}
        </button>
      </div>

      {saved && !save.isError && (
        <p className="flex items-center gap-1 text-[10px] text-green-500">
          <Check size={11} /> {t("engagementLog.saved")}
        </p>
      )}
      {save.isError && (
        <p className="flex items-center gap-1 text-[10px] text-red-500">
          <AlertCircle size={11} /> {t("engagementLog.error")}
        </p>
      )}
    </div>
  );
}
