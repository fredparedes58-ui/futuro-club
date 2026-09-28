/**
 * VITAS · Advertencia de identidad de un análisis por jugador (ÚNICA implementación)
 *
 * .claude/rules/identidad.md: «Dorsal asignado por debajo del umbral de confianza ⇒
 * confidence reducida en todas las métricas derivadas, y la UI lo indica.» La
 * identificación que devuelve Gemini (dorsal + color de equipación, NUNCA la cara) es
 * una ESTIMACIÓN de un modelo de visión generativo: no hay ground truth anotado
 * (fixtures/identidad) ni una precisión ≥ 98 % medida. Por eso TODO informe construido
 * sobre ella lleva:
 *   1. una advertencia determinista en la UI (AnalysisIdentityBadge), derivada SOLO de
 *      lo guardado en `analyses.biomechanics` (identity + gemini_observation.identificacion);
 *   2. un factor que REDUCE la confianza mostrada de lo derivado (ReportConfidenceChip,
 *      confianza del informe del Lab).
 *
 * Determinista: misma fila ⇒ misma advertencia. No llama a ningún modelo y no infiere
 * la identidad de ningún otro campo. La abstención (análisis `failed` por jugador no
 * identificado) nunca llega aquí: no genera informes.
 */

export type AnalysisIdentityKind =
  /** Gemini dice haber visto el dorsal + color de referencia (verificado contra la referencia enviada, no por humanos). */
  | "dorsal_llm"
  /** Un único jugador en plano: atribución por exclusión, sin dorsal de referencia. */
  | "single_player"
  /** Sin identificación guardada (análisis antiguo, pipeline de cliente, o datos inconsistentes). */
  | "unverified";

export type IdentityConfidenceLevel = "alta" | "media" | "baja";

export interface AnalysisIdentityCaveat {
  kind: AnalysisIdentityKind;
  /** Dorsal que Gemini dice haber VISTO (texto del modelo; null si no lo informó). */
  dorsal: string | null;
  /** Color de equipación que Gemini dice haber VISTO (texto del modelo; null si no lo informó). */
  color: string | null;
  /** Confianza que declara el propio modelo (no es una tasa de acierto medida). */
  confidence: IdentityConfidenceLevel | null;
  /** Multiplicador 0..1 que se aplica a la confianza de lo derivado de este análisis. */
  confidenceFactor: number;
}

/**
 * Factores de reducción de confianza por tipo de identificación.
 *
 * PROCEDENCIA: pendiente de validar. No existe ground truth humano de identidad
 * (fixtures/identidad) ni una precisión medida de la identificación de Gemini, así que
 * estos valores NO son una probabilidad de acierto: solo garantizan que ninguna cifra
 * derivada de una identidad no verificada por una persona se muestre con su confianza
 * completa, y que cuanto menos respaldo tenga la identidad, más se reduce. Cuando haya
 * fixtures anotados se sustituyen por la precisión medida (y el umbral ≥ 98 % de
 * identidad.md decide si se atribuye o no).
 */
export const IDENTITY_CONFIDENCE_FACTORS = {
  dorsal_llm: { alta: 0.8, media: 0.6 },
  single_player: { alta: 0.6, media: 0.5 },
  unverified: 0.5,
} as const;

function asRecord(v: unknown): Record<string, unknown> | null {
  return typeof v === "object" && v !== null && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
}

function norm(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const s = v.trim().toLowerCase().replace(/[\s-]+/g, "_");
  return s.length > 0 ? s : null;
}

function text(v: unknown): string | null {
  if (typeof v === "number" && Number.isFinite(v)) return String(v);
  if (typeof v !== "string") return null;
  const s = v.trim();
  return s.length > 0 ? s : null;
}

function level(v: unknown): IdentityConfidenceLevel | null {
  const s = norm(v);
  return s === "alta" || s === "media" || s === "baja" ? s : null;
}

const UNVERIFIED: AnalysisIdentityCaveat = {
  kind: "unverified",
  dorsal: null,
  color: null,
  confidence: null,
  confidenceFactor: IDENTITY_CONFIDENCE_FACTORS.unverified,
};

/**
 * Advertencia de identidad a partir de `analyses.biomechanics` tal y como lo guarda
 * api/_lib/geminiBiomechanics.ts (`identity` = decisión del servidor,
 * `gemini_observation.identificacion` = lo que reportó Gemini).
 *
 * Reglas (conservadoras): solo se muestra una identificación si la decisión del
 * servidor y la observación de Gemini COINCIDEN; si falta cualquiera de las dos, o se
 * contradicen, o la confianza es baja/ausente ⇒ «Identificación no verificada».
 */
export function resolveAnalysisIdentity(biomechanics: unknown): AnalysisIdentityCaveat {
  const bm = asRecord(biomechanics);
  const raw = asRecord(asRecord(bm?.gemini_observation)?.identificacion);
  const identity = asRecord(bm?.identity);
  if (!raw || !identity) return UNVERIFIED;

  const estado = norm(raw.estado);
  const status = norm(identity.status);
  const confidence = level(identity.confidence) ?? level(raw.confianza);
  const dorsal = text(raw.dorsalObservado);
  const color = text(raw.colorObservado);

  if (confidence !== "alta" && confidence !== "media") {
    return { ...UNVERIFIED, dorsal, color, confidence };
  }
  if (status === "identificado" && estado === "identificado" && identity.verifiedByDorsal === true) {
    return {
      kind: "dorsal_llm",
      dorsal,
      color,
      confidence,
      confidenceFactor: IDENTITY_CONFIDENCE_FACTORS.dorsal_llm[confidence],
    };
  }
  if (status === "unico_jugador" && estado === "unico_jugador") {
    return {
      kind: "single_player",
      dorsal,
      color,
      confidence,
      confidenceFactor: IDENTITY_CONFIDENCE_FACTORS.single_player[confidence],
    };
  }
  return { ...UNVERIFIED, dorsal, color, confidence };
}

/**
 * Aplica la reducción de identidad a una confianza en 0..1 (p. ej. la del informe del
 * Lab). null se queda en null: una confianza ausente no se convierte en un número.
 */
export function reduceConfidenceForIdentity(
  confidence01: number | null | undefined,
  caveat: AnalysisIdentityCaveat,
): number | null {
  if (typeof confidence01 !== "number" || !Number.isFinite(confidence01)) return null;
  const c = Math.max(0, Math.min(1, confidence01));
  return c * caveat.confidenceFactor;
}
