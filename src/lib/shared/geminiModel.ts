/**
 * VITAS · Modelo Gemini — ÚNICA fuente de verdad (invariante #7).
 *
 * Único lugar donde vive el ID del modelo de Google Gemini. Antes estaba
 * hardcodeado en ~8 sitios (los 2 callers reales + labels de procedencia +
 * config de resiliencia + prompts) → cuando Google retiró `gemini-2.0-flash`
 * (2026-06-01) los callers apuntaban a un modelo muerto y degradaban en
 * silencio al fallback, sin que nadie se enterara.
 *
 * Vive en `src/lib/shared/` a propósito: lo importan TANTO `api/` (los callers
 * de Gemini y las etiquetas de procedencia) COMO `src/` (config de prompts y de
 * resiliencia). Migrar de modelo = cambiar SOLO esta línea.
 *
 * NOTA: el registro de métricas (`config/metrics.json`) y algún fixture de test
 * llevan el string literal porque son DATOS (JSON no puede importar constantes);
 * no son la llamada real, solo procedencia documental.
 *
 * Homólogo de Claude: `api/_lib/models.ts` (MODELS.fast / MODELS.reasoning).
 */
export const GEMINI_MODEL = "gemini-2.5-flash";
