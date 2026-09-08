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
  es: { endonym: "español", englishName: "Spanish", label: "ES" },
  en: { endonym: "English", englishName: "English", label: "EN" },
  it: { endonym: "italiano", englishName: "Italian", label: "IT" },
  de: { endonym: "Deutsch", englishName: "German", label: "DE" },
  fr: { endonym: "français", englishName: "French", label: "FR" },
  nl: { endonym: "Nederlands", englishName: "Dutch", label: "NL" },
  // Español de Latinoamérica: código BCP-47 con región. normalizeLocale lo
  // conserva (no lo colapsa a "es").
  "es-419": { endonym: "español latinoamericano", englishName: "Latin American Spanish", label: "LAT" },
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

/**
 * Normaliza cualquier entrada (código, i18n.language, "en-US", "es-419"…) a un
 * locale soportado. Soporta códigos con región:
 *   1) coincidencia exacta con el registro ("es-419" → "es-419")
 *   2) si no, prefijo de 2 letras ("es-ES" → "es", "en-US" → "en", "de-AT" → "de")
 *   3) si nada casa, el idioma por defecto.
 * Las variantes regionales de español de Latinoamérica (es-MX, es-AR, es-CO…)
 * se mapean explícitamente a "es-419" para una detección natural.
 */
const LATAM_ES_REGIONS = new Set([
  "419", "ar", "bo", "cl", "co", "cr", "cu", "do", "ec", "gt", "hn",
  "mx", "ni", "pa", "pe", "pr", "py", "sv", "us", "uy", "ve",
]);

export function normalizeLocale(l: unknown): ReportLocale {
  const raw = String(l ?? "").toLowerCase().replace("_", "-");
  const supported = SUPPORTED_LOCALES as string[];
  // 1) coincidencia exacta (p. ej. "es-419")
  if (supported.includes(raw)) return raw as ReportLocale;
  const [base, region] = raw.split("-");
  // 2) español de Latinoamérica por región
  if (base === "es" && region && LATAM_ES_REGIONS.has(region) && supported.includes("es-419")) {
    return "es-419" as ReportLocale;
  }
  // 3) prefijo de 2 letras
  if (supported.includes(base)) return base as ReportLocale;
  return DEFAULT_LOCALE;
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
