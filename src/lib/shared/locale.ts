/**
 * VITAS · Locale + PHV helpers para prompts de reportes LLM (FASE 5)
 *
 * Compartido entre los agentes de api/ (edge) y los prompt-builders de src/lib/.
 * Objetivo doble:
 *   1) `locale` opcional (default "es") → reportes bilingües ES/EN sin duplicar
 *      prompts: se inyecta una única directiva de idioma.
 *   2) Contexto PHV (maduración biológica) reutilizable → el diferenciador VITAS
 *      entra en team-intelligence / tactical-pattern / rival-scout de forma
 *      consistente.
 *
 * Todo es additive-safe: sin datos PHV el bloque queda vacío; sin locale se
 * comporta como antes (español).
 */

export type ReportLocale = "es" | "en";

/** Normaliza cualquier entrada a un locale soportado (default "es"). */
export function normalizeLocale(l: unknown): ReportLocale {
  return l === "en" || l === "en-US" || l === "en-GB" ? "en" : "es";
}

/** Directiva de idioma para el prompt (una línea; el modelo redacta todo el JSON en ese idioma). */
export function languageDirective(locale: ReportLocale): string {
  return locale === "en"
    ? "LANGUAGE: Write the ENTIRE response in natural English — every JSON string value must be in English."
    : "IDIOMA: Redacta TODA la respuesta en español natural — todos los valores string del JSON en español.";
}

interface PhvDistribution {
  prePhv?: number;
  circaPhv?: number;
  postPhv?: number;
}

function hasPhv(phv?: PhvDistribution | null): phv is PhvDistribution {
  return !!phv && (phv.prePhv != null || phv.circaPhv != null || phv.postPhv != null);
}

/** Línea de datos con la distribución PHV del equipo (vacía si no hay datos). */
export function phvDistributionLine(phv?: PhvDistribution | null, locale: ReportLocale = "es"): string {
  if (!hasPhv(phv)) return "";
  const label = locale === "en" ? "Team biological maturation (PHV)" : "Maduración biológica del equipo (PHV)";
  return `${label}: pre-PHV ${phv.prePhv ?? 0}%, circa-PHV ${phv.circaPhv ?? 0}%, post-PHV ${phv.postPhv ?? 0}%`;
}

/** Instrucción de razonamiento PHV (diferenciador VITAS). Vacía si no hay datos PHV. */
export function phvConsideration(phv?: PhvDistribution | null, locale: ReportLocale = "es"): string {
  if (!hasPhv(phv)) return "";
  return locale === "en"
    ? "PHV CONSIDERATION (VITAS differentiator): factor in the team's biological maturation. Pre-PHV / circa-PHV players may be physically outmatched WITHOUT lacking talent — never read physical immaturity as lack of ability, and flag late maturers who could break out. Temper physical conclusions accordingly."
    : "CONSIDERACIÓN PHV (diferenciador VITAS): ten en cuenta la maduración biológica del equipo. Los jugadores pre-PHV / circa-PHV pueden verse superados físicamente SIN que les falte talento — nunca interpretes la inmadurez física como falta de nivel, y señala a los madurados tardíos que podrían dar un salto. Matiza las conclusiones físicas en consecuencia.";
}
