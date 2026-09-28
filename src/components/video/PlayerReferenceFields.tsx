/**
 * VITAS · PlayerReferenceFields — dorsal + color de equipación del jugador en el vídeo
 *
 * ÚNICO formulario de la referencia (invariante #7): lo usan el Lab (flujo 1-Click) y
 * el subidor de vídeo (VideoUploader). Los valores viajan a /api/videos/finalize →
 * fila `analyses` (mig 068) → video-observation, que SOLO puede dar al jugador por
 * identificado si recibe dorsal Y color (src/lib/shared/playerReference.ts).
 *
 * Copy honesto (identidad.md): son necesarios para analizar a un jugador en un clip con
 * varios jugadores; sin ellos solo se analizan clips con un único jugador en plano. La
 * identidad se busca solo por dorsal y color, nunca por la cara, y es una estimación de IA.
 */
import { useId } from "react";
import { useTranslation } from "react-i18next";
import { Shirt } from "lucide-react";
import { KIT_COLORS, findKitColor } from "@/lib/shared/playerReference";

interface Props {
  jerseyNumber: string;
  kitColor: string;
  onJerseyNumberChange: (value: string) => void;
  onKitColorChange: (value: string) => void;
  disabled?: boolean;
  /** "lab": sidebar compacta del Lab · "uploader": formulario del subidor de vídeo. */
  variant?: "lab" | "uploader";
}

const STYLES = {
  lab: {
    wrap: "p-3 rounded-xl bg-secondary/40 border border-border space-y-2",
    title: "text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5",
    label: "text-[9px] text-muted-foreground",
    input:
      "w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50 disabled:opacity-60",
    hint: "text-[9px] text-muted-foreground leading-relaxed",
    warn: "text-[9px] text-amber-600 leading-relaxed",
  },
  uploader: {
    wrap: "rounded-xl border border-slate-200 p-3 space-y-2",
    title: "text-sm font-semibold flex items-center gap-1.5",
    label: "block text-xs font-semibold text-slate-600",
    input:
      "w-full mt-1 px-3 py-2 rounded-xl border border-slate-200 text-sm focus:border-blue-500 focus:outline-none disabled:opacity-60",
    hint: "text-xs text-slate-500",
    warn: "text-xs text-amber-600",
  },
} as const;

export default function PlayerReferenceFields({
  jerseyNumber,
  kitColor,
  onJerseyNumberChange,
  onKitColorChange,
  disabled,
  variant = "lab",
}: Props) {
  const { t } = useTranslation();
  const id = useId();
  const s = STYLES[variant];
  const hasJersey = jerseyNumber.trim() !== "";
  const hasColor = kitColor.trim() !== "";
  const swatch = findKitColor(kitColor)?.swatch ?? null;

  return (
    <div className={s.wrap} data-testid="player-reference-fields">
      <p className={s.title}>
        <Shirt size={11} aria-hidden />
        {t("playerReference.title")}
      </p>
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label htmlFor={`${id}-jersey`} className={s.label}>
            {t("playerReference.jerseyLabel")}
          </label>
          <input
            id={`${id}-jersey`}
            type="text"
            inputMode="numeric"
            autoComplete="off"
            maxLength={3}
            value={jerseyNumber}
            disabled={disabled}
            // Solo dígitos (1-3): el dorsal es un identificador, nunca se «completa».
            onChange={(e) => onJerseyNumberChange(e.target.value.replace(/\D/g, "").slice(0, 3))}
            placeholder={t("playerReference.jerseyPlaceholder")}
            className={`${s.input} font-bold`}
          />
        </div>
        <div>
          <label htmlFor={`${id}-kit`} className={s.label}>
            {t("playerReference.kitColorLabel")}
          </label>
          <div className="relative">
            <select
              id={`${id}-kit`}
              value={kitColor}
              disabled={disabled}
              onChange={(e) => onKitColorChange(e.target.value)}
              className={`${s.input} ${swatch ? "pl-6" : ""}`}
            >
              <option value="">{t("playerReference.kitColorNone")}</option>
              {KIT_COLORS.map((c) => (
                <option key={c.key} value={c.value}>
                  {t(`playerReference.colors.${c.key}`)}
                </option>
              ))}
            </select>
            {swatch && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-2 top-1/2 mt-0.5 -translate-y-1/2 h-2.5 w-2.5 rounded-full border border-black/20"
                style={{ backgroundColor: swatch }}
              />
            )}
          </div>
        </div>
      </div>
      <p className={s.hint}>{t("playerReference.hint")}</p>
      {hasJersey && hasColor ? (
        <p className={s.hint} data-testid="player-reference-complete">
          {t("playerReference.completeHint")}
        </p>
      ) : hasJersey || hasColor ? (
        <p className={s.warn} data-testid="player-reference-incomplete">
          {t("playerReference.incompleteHint")}
        </p>
      ) : null}
    </div>
  );
}
