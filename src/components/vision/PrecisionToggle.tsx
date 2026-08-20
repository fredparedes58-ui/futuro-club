/**
 * VITAS · PrecisionToggle
 *
 * Control VISIBLE del "Análisis de precisión" (tiling SAHI). Hasta ahora el tiling
 * solo se activaba por un override oculto en localStorage (`vitas_tiling`) o desde
 * Ajustes; este componente lo pone delante del usuario en el propio flujo de
 * análisis, con el tradeoff escrito con honestidad.
 *
 * NO duplica la lógica del tiling: reutiliza `get/setTilingConfig` (una sola
 * implementación de la malla, el solape y la persistencia — invariante #7). Aquí
 * solo se enciende/apaga y se muestra el coste.
 *
 * Por qué existe: sobre footage ancho de academia (cámara fija, jugadores de
 * ~30-50 px) la detección a plano completo recupera ~0 jugadores; el tiling 3×3
 * recupera al equipo (Benchmark #26, ver `src/lib/yolo/tiling.ts`). Pero 3×3 son
 * 9× inferencias por frame → NO es tiempo real. Por eso el aviso de lentitud es
 * visible y el default global sigue apagado (cambiarlo es decisión de producto
 * aparte, fuera de este control).
 *
 * Ciclo de vida (prop `phase`):
 *  - "before"   → configurar ANTES de analizar. Toggle + aviso de lentitud.
 *  - "running"  → hay una pasada en curso. Cambiar el toggle REINICIA la pasada
 *                 (el worker se re-INIT con la nueva config: no se puede aplicar a
 *                 mitad de pasada). Se avisa; el padre hace el reinicio real.
 *  - "complete" → pasada terminada. Si NO usó precisión, ofrece "Re-analizar con
 *                 precisión" — re-procesa el vídeo entero; NO añade datos al
 *                 análisis anterior (una pasada sin tiling no se puede retro-arreglar).
 */
import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { LayoutGrid, ToggleLeft, ToggleRight, RefreshCw, AlertTriangle } from "lucide-react";
import { getTilingConfig, setTilingConfig } from "@/lib/yolo/tiling";

/**
 * Malla del "Análisis de precisión": 3×3 recupera al equipo completo (Benchmark #26).
 * El solape 0.15 evita cortar jugadores en el borde entre tiles. No se exponen al
 * usuario: la elección fina de malla vive en Ajustes → Análisis de vídeo.
 */
const PRECISION_GRID = 3;
const PRECISION_OVERLAP = 0.15;

export type PrecisionPhase = "before" | "running" | "complete";

export interface PrecisionToggleProps {
  /** Contexto del ciclo de vida — decide el copy y las acciones (ver cabecera). */
  phase?: PrecisionPhase;
  /**
   * ¿La pasada activa/terminada usó precisión? Solo relevante en `phase="complete"`:
   * `false` ofrece re-analizar; `true` avisa de que ya se usó tiling.
   */
  activePrecision?: boolean;
  /**
   * Se dispara al cambiar el toggle con el NUEVO estado. La persistencia ya la hace
   * el componente (setTilingConfig); el padre solo reacciona (p.ej. reiniciar la
   * pasada en curso).
   */
  onToggle?: (enabled: boolean) => void;
  /** Acción del botón "Re-analizar con precisión" (phase="complete" sin precisión). */
  onReanalyze?: () => void;
  /** Muestra el aviso de lentitud (default true). Nunca prometemos directo fluido. */
  showLiveWarning?: boolean;
  /** Deshabilita el control (p.ej. sin vídeo seleccionado). */
  disabled?: boolean;
  className?: string;
}

export default function PrecisionToggle({
  phase = "before",
  activePrecision,
  onToggle,
  onReanalyze,
  showLiveWarning = true,
  disabled = false,
  className = "",
}: PrecisionToggleProps) {
  const { t } = useTranslation();
  const [enabled, setEnabled] = useState(() => getTilingConfig() !== null);

  // Re-sincroniza si otro control (Ajustes → Análisis de vídeo) tocó el tiling
  // mientras este componente estaba montado: una sola fuente de verdad (localStorage).
  useEffect(() => {
    setEnabled(getTilingConfig() !== null);
  }, [phase]);

  const toggle = () => {
    if (disabled) return;
    const next = !enabled;
    setTilingConfig(next ? { grid: PRECISION_GRID, overlap: PRECISION_OVERLAP } : null);
    setEnabled(next);
    onToggle?.(next);
  };

  const canReanalyze = phase === "complete" && !!onReanalyze && activePrecision === false;

  return (
    <div className={`space-y-2 ${className}`} data-testid="precision-toggle">
      {/* Toggle principal */}
      <button
        type="button"
        onClick={toggle}
        disabled={disabled}
        aria-pressed={enabled}
        className="w-full glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 border border-transparent transition-all text-left disabled:opacity-60 disabled:cursor-not-allowed"
      >
        <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center shrink-0">
          <LayoutGrid size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-display font-semibold text-sm text-foreground">
            {t("precision.title")}
          </p>
          <p className="text-[10px] text-muted-foreground leading-tight">
            {t("precision.subtitle")}
          </p>
        </div>
        {enabled ? (
          <ToggleRight size={28} className="text-primary shrink-0" />
        ) : (
          <ToggleLeft size={28} className="text-muted-foreground shrink-0" />
        )}
      </button>

      {/* Aviso de lentitud — SIEMPRE visible (nunca prometer directo fluido con tiling).
          Muted cuando está apagado (informa antes de decidir); ámbar cuando está
          activo (el coste ya se está pagando). */}
      {showLiveWarning && (
        <div
          className={`flex items-start gap-2 px-3 py-2 rounded-lg border ${
            enabled
              ? "bg-amber-500/10 border-amber-500/30"
              : "bg-secondary/40 border-border"
          }`}
        >
          <AlertTriangle
            size={13}
            className={`mt-0.5 shrink-0 ${enabled ? "text-amber-500" : "text-muted-foreground"}`}
          />
          <p
            className={`text-[9px] leading-relaxed ${
              enabled ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground"
            }`}
          >
            {t("precision.liveWarning")}
          </p>
        </div>
      )}

      {/* DURANTE: cambiar el toggle reinicia la pasada (no cambio instantáneo). */}
      {phase === "running" && (
        <p className="text-[9px] text-muted-foreground leading-relaxed px-1">
          {t("precision.runningNote")}
        </p>
      )}

      {/* DESPUÉS · sin precisión: re-analizar (re-procesa, no añade al anterior). */}
      {canReanalyze && (
        <>
          <button
            type="button"
            onClick={onReanalyze}
            disabled={disabled}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl border border-primary/40 text-primary text-xs font-display font-semibold hover:bg-primary/10 transition-colors disabled:opacity-50"
          >
            <RefreshCw size={13} />
            {t("precision.reanalyze")}
          </button>
          <p className="text-[9px] text-muted-foreground leading-relaxed px-1">
            {t("precision.reanalyzeNote")}
          </p>
        </>
      )}

      {/* DESPUÉS · ya usó precisión. */}
      {phase === "complete" && activePrecision === true && (
        <p className="text-[9px] text-muted-foreground leading-relaxed px-1">
          {t("precision.alreadyPrecise")}
        </p>
      )}
    </div>
  );
}
