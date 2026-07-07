/**
 * VITAS · Config central de modelos LLM (Claude)
 *
 * Único lugar donde se mapea el tier lógico → model ID. Antes cada agente
 * hardcodeaba su modelo (inconsistente; varios en modelos 2024 YA retirados
 * que devolvían 404 → caían a mock silenciosamente en producción).
 *
 * ⚠️ BREAKING CHANGES de la API a respetar al usar estos modelos:
 * - `reasoning` (Opus 4.8) RECHAZA (400) `temperature`, `top_p`, `top_k` y
 *   `thinking:{type:"enabled",budget_tokens}`. NO pasar esos parámetros en
 *   requests que usen MODELS.reasoning. Tampoco prefill de assistant.
 * - Opus 4.8 sin campo `thinking` corre SIN thinking (no gasta max_tokens en
 *   pensar) → los agentes de JSON corto no truncan. Deja `thinking` fuera.
 * - `fast` (Haiku 4.5) SÍ acepta un sampling param (p.ej. `temperature`) y NO
 *   soporta `effort`. Se mantiene tal cual en los agentes deterministas.
 */
export const MODELS = {
  /** Deterministas / narrativos baratos · rápido y económico (Haiku 4.5) */
  fast: "claude-haiku-4-5",
  /** Razonamiento / análisis · máxima capacidad (Opus 4.8) */
  reasoning: "claude-opus-4-8",
} as const;

export type ModelTier = keyof typeof MODELS;
