/**
 * VITAS · Config central de modelos LLM (Claude)
 *
 * Único lugar donde se mapea el tier lógico → model ID. Antes cada agente
 * hardcodeaba su modelo (inconsistente; varios en modelos 2024 YA retirados
 * que devolvían 404 → caían a mock silenciosamente en producción).
 *
 * ⚠️ BREAKING CHANGES de la API a respetar al usar estos modelos:
 * - `reasoning` (Opus 5.5) RECHAZA (400) `temperature`, `top_p`, `top_k`,
 *   `thinking:{type:"disabled"}`, `thinking:{type:"enabled",budget_tokens}`,
 *   `tool_choice` any/tool y el prefill de assistant. NO pasar nada de eso.
 * - Opus 5.5 SIEMPRE piensa (no se puede desactivar). El control es
 *   `output_config.effort` y el thinking CUENTA contra `max_tokens` →
 *   construir los requests con `modelParams()` (añade effort + margen).
 * - La respuesta puede empezar por bloques `thinking` (texto vacío): leer el
 *   texto con `responseText()` de `./anthropic`, NUNCA `content[0].text`.
 * - `fast` (Haiku 4.5) SÍ acepta un sampling param (p.ej. `temperature`) y NO
 *   soporta `effort`. Se mantiene tal cual en los agentes deterministas.
 */
export const MODELS = {
  /** Deterministas / narrativos baratos · rápido y económico (Haiku 4.5) */
  fast: "claude-haiku-4-5",
  /** Razonamiento / análisis · máxima capacidad (Opus 5.5) */
  reasoning: "claude-opus-5-5",
} as const;

export type ModelTier = keyof typeof MODELS;

/**
 * Reintento del tier reasoning si Opus 5.5 no está disponible para la cuenta
 * (404) o sus clasificadores declinan (stop_reason "refusal"). Sin esto, esos
 * casos caían a mock/determinista en silencio. Lo usa `fetchMessages()`.
 */
export const REASONING_FALLBACK_MODEL = "claude-opus-4-8";

/**
 * Esfuerzo del tier reasoning. Los agentes venían de Opus 4.8 SIN thinking;
 * "low" es el punto de partida documentado para esas rutas (latencia y coste
 * cercanos a los previos). Subir a "medium" solo si se mide pérdida de calidad.
 */
export const REASONING_EFFORT = "low";

/** Margen de `max_tokens` para el thinking de Opus 5.5, además de la respuesta. */
export const REASONING_THINKING_HEADROOM = 8000;

/**
 * `model` + `max_tokens` (+ `output_config` en reasoning) para un request.
 * `replyTokens` es el tamaño de la RESPUESTA visible; en reasoning se suma el
 * margen de thinking. Haiku 4.5 rechaza `effort`, así que solo va en reasoning.
 */
export function modelParams(model: string, replyTokens: number) {
  return model === MODELS.reasoning
    ? {
        model,
        max_tokens: replyTokens + REASONING_THINKING_HEADROOM,
        output_config: { effort: REASONING_EFFORT },
      }
    : { model, max_tokens: replyTokens };
}
