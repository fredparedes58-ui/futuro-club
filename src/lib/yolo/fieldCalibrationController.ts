/**
 * VITAS · Controlador de auto-calibración (Paso 2 — el "cerebro" de la integración)
 *
 * Recibe un flujo de registros de campo (uno por cada N frames, de
 * registerFieldFromLandmarks) y decide QUÉ homografía debe usar el tracking, con
 * HISTÉRESIS para no cambiar en cada frame:
 *   - Adopta la auto-calibración solo tras `adoptAfter` frames buenos seguidos
 *     (high/medium) → evita saltar por un frame afortunado.
 *   - MANTIENE la última calibración buena durante frames malos transitorios
 *     (oclusión, blur). La cámara de academia es ~fija: la última buena sigue
 *     siendo válida un rato → `staleFrames` cuenta cuántos frames lleva sin
 *     confirmarse, para que el consumidor decida si sigue confiando.
 *   - Nunca inventa: si nunca hubo una calibración fiable, devuelve source "none".
 *
 * Pura y determinista (sin ONNX ni DOM) → totalmente testeable. El worker/hook solo
 * la alimenta con registros y usa la homografía que devuelve.
 */

import type { FieldRegistration, CalibrationConfidence } from "./fieldRegistration";
import { metricsTrustworthy } from "./fieldRegistration";

export interface CalibrationControllerState {
  /** Última calibración ADOPTADA (la que se está usando). null si aún ninguna. */
  active: FieldRegistration | null;
  /** Frames fiables consecutivos vistos (para la adopción inicial). */
  goodStreak: number;
  /** Frames transcurridos desde la última confirmación fiable de `active`. */
  staleFrames: number;
}

export interface CalibrationControllerOptions {
  /** Frames fiables seguidos antes de adoptar por primera vez (default 3). */
  adoptAfter?: number;
  /** Nº máx. de frames malos que aguanta manteniendo la última buena (default 90). */
  maxStaleFrames?: number;
}

export type CalibrationSource = "auto" | "holding" | "none";

export interface CalibrationDecision {
  Hpix2field: Float64Array | null;
  Hfield2pix: Float64Array | null;
  confidence: CalibrationConfidence;
  /**
   * "auto"   → calibración fiable recién confirmada (úsala con confianza).
   * "holding"→ frame malo, pero mantenemos la última buena (aún válida).
   * "none"   → sin calibración usable todavía (o caducada) → no reportar metros.
   */
  source: CalibrationSource;
  staleFrames: number;
}

export function createCalibrationController(): CalibrationControllerState {
  return { active: null, goodStreak: 0, staleFrames: 0 };
}

/**
 * Alimenta un nuevo registro y devuelve la decisión de calibración a usar.
 * Muta `state` (patrón acumulador, como FieldRegistrationAccumulator).
 */
export function updateCalibration(
  state: CalibrationControllerState,
  reg: FieldRegistration,
  options: CalibrationControllerOptions = {},
): CalibrationDecision {
  const adoptAfter = options.adoptAfter ?? 3;
  const maxStale = options.maxStaleFrames ?? 90;

  const reliable = metricsTrustworthy(reg.confidence) && reg.Hpix2field != null;

  if (reliable) {
    state.goodStreak += 1;
    // Adoptar si (a) aún no hay activa y llevamos suficientes frames buenos, o
    // (b) ya hay activa → refrescar siempre con la más reciente fiable.
    if (state.active == null) {
      if (state.goodStreak >= adoptAfter) {
        state.active = reg;
        state.staleFrames = 0;
        return decision(reg, "auto", 0);
      }
      // Todavía calentando: aún no adoptamos.
      return decision(null, "none", 0);
    }
    state.active = reg;
    state.staleFrames = 0;
    return decision(reg, "auto", 0);
  }

  // Frame no fiable.
  state.goodStreak = 0;
  if (state.active != null) {
    state.staleFrames += 1;
    if (state.staleFrames > maxStale) {
      // La última buena ya es demasiado vieja → caduca.
      state.active = null;
      return decision(null, "none", state.staleFrames);
    }
    return decision(state.active, "holding", state.staleFrames);
  }
  return decision(null, "none", 0);
}

function decision(
  reg: FieldRegistration | null,
  source: CalibrationSource,
  staleFrames: number,
): CalibrationDecision {
  return {
    Hpix2field: reg?.Hpix2field ?? null,
    Hfield2pix: reg?.Hfield2pix ?? null,
    confidence: reg?.confidence ?? "none",
    source,
    staleFrames,
  };
}
