/**
 * VITAS · Locale + PHV helpers para prompts de reportes LLM
 *
 * Compartido entre los agentes de api/ (edge) y los prompt-builders de src/lib/.
 *
 * DISEÑO MULTI-IDIOMA (sin hardcodeo binario es/en):
 *   El idioma de SALIDA de cada agente se controla con UNA directiva
 *   (`languageDirective`) generada a partir del REGISTRO de idiomas. Las
 *   instrucciones de los prompts se mantienen en un solo idioma a propósito
 *   (el modelo las lee y responde en el idioma pedido) → añadir un idioma NO
 *   exige duplicar prompts.
 *
 *   Añadir un idioma nuevo (p. ej. francés) = UNA entrada en `LANGUAGE_REGISTRY`
 *   (+ su fichero `src/i18n/<code>.json` para la UI). El tipo `ReportLocale`, la
 *   lista de soportados, la detección y el schema zod se derivan solos del registro.
 */

import { z } from "zod";

/**
 * Registro único de idiomas soportados. `endonym` = nombre del idioma EN ESE
 * idioma (lo que se le pide al modelo escribir). ÚNICO sitio a tocar para
 * añadir un idioma.
 */
export const LANGUAGE_REGISTRY = {
  es: { endonym: "español", englishName: "Spanish" },
  en: { endonym: "English", englishName: "English" },
  // Ejemplo de extensión futura (descomentar + añadir src/i18n/fr.json):
  // fr: { endonym: "français", englishName: "French" },
} as const;

/** Idioma de reporte soportado (derivado del registro — no listar a mano). */
export type ReportLocale = keyof typeof LANGUAGE_REGISTRY;

/** Lista de idiomas soportados (derivada del registro). */
export const SUPPORTED_LOCALES = Object.keys(LANGUAGE_REGISTRY) as ReportLocale[];

/** Idioma por defecto cuando la entrada no es reconocible. */
export const DEFAULT_LOCALE: ReportLocale = "es";

/**
 * Schema zod para el campo `locale` de los agentes/contratos. Derivado del
 * registro → acepta CUALQUIER idioma soportado sin ramas por idioma. Usar
 * `localeSchema.optional()` en los schemas. (Nunca `z.enum(["es","en"])` a mano:
 * eso rechazaría un idioma nuevo.)
 */
export const localeSchema = z.enum(
  SUPPORTED_LOCALES as [ReportLocale, ...ReportLocale[]],
);

/**
 * Elige el valor del idioma pedido de un mapa por idioma, cayendo al idioma por
 * defecto si ese idioma no está presente. Sustituye a los ternarios binarios
 * `locale === "en" ? … : …`: añadir un idioma = añadir su clave al mapa (y si se
 * omite, degrada al idioma por defecto en vez de romper).
 */
export function pickLocale<T>(locale: ReportLocale, byLocale: Partial<Record<ReportLocale, T>>): T {
  return (byLocale[locale] ?? byLocale[DEFAULT_LOCALE]) as T;
}

/** Normaliza cualquier entrada (código, i18n.language, "en-US"…) a un locale soportado. */
export function normalizeLocale(l: unknown): ReportLocale {
  const code = String(l ?? "").toLowerCase().slice(0, 2);
  return (SUPPORTED_LOCALES as string[]).includes(code) ? (code as ReportLocale) : DEFAULT_LOCALE;
}

/**
 * Directiva de idioma para el prompt (una línea). Genérica: sirve para CUALQUIER
 * idioma del registro sin ramas por idioma — el modelo redacta todo el JSON en el
 * endónimo indicado.
 */
export function languageDirective(locale: ReportLocale): string {
  const { endonym } = LANGUAGE_REGISTRY[locale];
  return `LANGUAGE: Write the ENTIRE response in natural ${endonym}. Every JSON string value must be written in ${endonym}, and only in ${endonym} — do not mix languages.`;
}

interface PhvDistribution {
  prePhv?: number;
  circaPhv?: number;
  postPhv?: number;
}

function hasPhv(phv?: PhvDistribution | null): phv is PhvDistribution {
  return !!phv && (phv.prePhv != null || phv.circaPhv != null || phv.postPhv != null);
}

/**
 * Línea de datos con la distribución PHV del equipo (vacía si no hay datos).
 *
 * Es una INSTRUCCIÓN del prompt (dato que el modelo reexpresa en el idioma de
 * salida), por eso su etiqueta va en un solo idioma base — no necesita ramas por
 * idioma. `locale` se acepta por compatibilidad pero ya no cambia el texto.
 */
export function phvDistributionLine(phv?: PhvDistribution | null, _locale: ReportLocale = DEFAULT_LOCALE): string {
  if (!hasPhv(phv)) return "";
  return `Team biological maturation (PHV): pre-PHV ${phv.prePhv ?? 0}%, circa-PHV ${phv.circaPhv ?? 0}%, post-PHV ${phv.postPhv ?? 0}%`;
}

/**
 * Instrucción de razonamiento PHV (diferenciador VITAS). Vacía si no hay datos PHV.
 *
 * Instrucción del prompt en un solo idioma base: el modelo la aplica y escribe la
 * salida en el idioma pedido por `languageDirective`. `locale` se acepta por
 * compatibilidad pero ya no cambia el texto.
 */
export function phvConsideration(phv?: PhvDistribution | null, _locale: ReportLocale = DEFAULT_LOCALE): string {
  if (!hasPhv(phv)) return "";
  return "PHV CONSIDERATION (VITAS differentiator): factor in the team's biological maturation. Pre-PHV / circa-PHV players may be physically outmatched WITHOUT lacking talent — never read physical immaturity as lack of ability, and flag late maturers who could break out. Temper physical conclusions accordingly.";
}
