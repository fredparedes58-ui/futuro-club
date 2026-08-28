/**
 * VITAS · Schemas Zod de SALIDA de LLM (FASE 2 · report pipeline)
 *
 * Los 4 agentes que parseaban la respuesta del modelo con JSON.parse crudo
 * (team-report, rival-scout, coaching-assistant, valuation) validan ahora la
 * estructura antes de devolverla. Filosofía: LAXOS a propósito —
 *   - 1-2 campos núcleo requeridos (atrapan `{}`, `{raw:"..."}` y disculpas
 *     del modelo parseadas como objeto),
 *   - todo lo demás opcional + passthrough (no rechazar variaciones legítimas
 *     ni recortar campos que el prompt pueda añadir en el futuro).
 *
 * Derivados del bloque de estructura JSON del prompt de cada agente.
 */

import { z } from "zod";

// ── team-report (_team-report.ts) ────────────────────────────────────────────
export const teamReportOutputSchema = z
  .object({
    executive_summary: z.string().min(1),
    tactical_overview: z.record(z.unknown()).optional(),
    key_battles: z.array(z.unknown()).optional(),
    momentum_shifts: z.array(z.unknown()).optional(),
    recommendations: z.record(z.unknown()).optional(),
    overall_rating: z.record(z.unknown()).optional(),
    // Confianza (FASE 4) · opcionales; el prompt los emite, el chip los pinta
    confidence_score: z.number().optional(),
    data_completeness: z.number().optional(),
    not_evaluated: z.array(z.string()).optional(),
  })
  .passthrough();

// ── rival-scout (_rival-scout-report.ts) ─────────────────────────────────────
export const rivalScoutOutputSchema = z
  .object({
    rival_profile: z.string().min(1),
    threat_level: z.string().optional(),
    strengths: z.array(z.unknown()).optional(),
    weaknesses: z.array(z.unknown()).optional(),
    key_threats: z.array(z.unknown()).optional(),
    attack_plan: z.record(z.unknown()).optional(),
    defensive_plan: z.record(z.unknown()).optional(),
    game_management: z.record(z.unknown()).optional(),
    // Confianza (FASE 4) · opcionales; el prompt los emite, el chip los pinta
    confidence_score: z.number().optional(),
    data_completeness: z.number().optional(),
    not_evaluated: z.array(z.string()).optional(),
  })
  .passthrough();

// ── coaching-assistant (_coaching-assistant.ts) ──────────────────────────────
export const coachingAssistantOutputSchema = z
  .object({
    sessionSummary: z.string().min(1),
    whatWorkedWell: z.array(z.unknown()).optional(),
    whatToImprove: z.array(z.unknown()).optional(),
    nextSessionPlan: z.record(z.unknown()).optional(),
    playerSpotlight: z.array(z.unknown()).optional(),
    weeklyPlan: z.string().optional(),
    phvAlerts: z.array(z.unknown()).nullable().optional(),
    // Confianza (FASE 4) · opcionales; el prompt los emite, el chip los pinta
    confidence_score: z.number().optional(),
    data_completeness: z.number().optional(),
    not_evaluated: z.array(z.string()).optional(),
  })
  .passthrough();

// ── valuation (_valuation-report.ts) ─────────────────────────────────────────
export const valuationOutputSchema = z
  .object({
    evaluacionGeneral: z.string().min(1),
    tierAnalisis: z.string().optional(),
    // docx #14 P4: cada comparable exige `nombre` (los provee el módulo de similitud);
    // un array vacío es válido (abstención). Bloquea comparables sin identidad.
    comparablesProfesionales: z.array(z.object({ nombre: z.string().min(1) }).passthrough()).optional(),
    factoresClave: z.array(z.unknown()).optional(),
    proyeccion: z.record(z.unknown()).optional(),
    recomendacionesDesarrollo: z.array(z.unknown()).optional(),
    riesgosValoracion: z.array(z.unknown()).optional(),
    // Confianza (FASE 4) · opcionales; el prompt los emite, el chip los pinta
    confidence_score: z.number().optional(),
    data_completeness: z.number().optional(),
    not_evaluated: z.array(z.string()).optional(),
  })
  .passthrough();

// ── Helper ────────────────────────────────────────────────────────────────────

export type LLMValidation<T> =
  | { ok: true; report: T }
  | { ok: false; issues: string };

/**
 * Valida la salida parseada del LLM. Si falla, devuelve los issues compactos
 * para log — el agente debe caer a su fallback con source "fallback_schema_error"
 * (la app nunca rompe; el orchestrator propaga el flag y la UI avisa).
 */
export function validateLLMReport<T>(schema: z.ZodType<T>, parsed: unknown): LLMValidation<T> {
  const result = schema.safeParse(parsed);
  if (result.success) return { ok: true, report: result.data };
  const issues = result.error.issues
    .slice(0, 5)
    .map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`)
    .join("; ");
  return { ok: false, issues };
}
