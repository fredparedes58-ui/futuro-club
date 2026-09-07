/**
 * VITAS · Categoría del jugador (multi-categoría · plan C1)
 *
 * VITAS evalúa todas las categorías hasta profesional, pero los prompts nacen
 * enmarcados en academia juvenil (padres, PHV, "potencial de desarrollo").
 * Este helper añade UNA dimensión de framing — no duplica agentes:
 *
 *   - "youth"  → en crecimiento: aplica PHV, audiencia incluye padres/coaches
 *                de academia, prohibido lenguaje contractual/económico.
 *   - "senior" → adulto/profesional: SIN PHV (no hay maturity offset),
 *                audiencia = cuerpo técnico/dirección deportiva, lenguaje de
 *                rendimiento (no "potencial de desarrollo" infantil).
 *
 * Diseño additive-safe: para "youth", categoryDirective devuelve "" → el
 * prompt queda BYTE-IDÉNTICO al actual (cero regresión). Solo "senior"
 * inyecta directiva.
 *
 * Resolución: override explícito > edad (<18 youth / ≥18 senior) > "youth"
 * (default conservador: es el framing más protegido). Un 16-17 en dinámica
 * profesional se resuelve pasando category explícito.
 *
 * Edge-safe: importable desde api/ (Vercel Edge) y src/.
 */

import type { ReportLocale } from "./locale";

export type PlayerCategory = "youth" | "senior";

export function resolveCategory(input: {
  age?: number | null;
  category?: unknown;
}): PlayerCategory {
  if (input.category === "senior" || input.category === "youth") return input.category;
  const age =
    typeof input.age === "number" && Number.isFinite(input.age) ? input.age : undefined;
  if (age !== undefined) return age >= 18 ? "senior" : "youth";
  return "youth";
}

/** ¿Aplica el razonamiento PHV/maduración biológica a esta categoría? */
export function phvApplies(category: PlayerCategory): boolean {
  return category === "youth";
}

/**
 * Directiva de framing para el prompt. "" en youth (prompt idéntico al actual);
 * en senior, bloque que ANULA el framing juvenil de los prompts existentes.
 *
 * Es una INSTRUCCIÓN del prompt (el idioma de SALIDA lo fija `languageDirective`),
 * por eso su texto va en un solo idioma base — sin ramas por idioma. `locale` se
 * acepta por compatibilidad pero ya no cambia el texto (multi-idioma sin hardcodeo).
 */
export function categoryDirective(
  category: PlayerCategory,
  _locale: ReportLocale = "es",
): string {
  if (category === "youth") return "";
  return `CATEGORY: SENIOR/PROFESSIONAL PLAYER — this overrides any youth-academy framing above.
- Audience: coaching staff and sporting direction (NOT parents; no notes for families).
- Do NOT mention biological maturation/PHV or growth spurts — they do not apply to adults.
- Use performance/form language ("current level", "role fit", "physical condition"), not youth-development language ("potential to develop", "long-term projection as a kid").
- Honesty rules still apply: no invented stats, no famous-player comparisons, calibrated confidence.`;
}
