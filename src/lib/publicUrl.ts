/**
 * VITAS · Origen público de la app (una sola fuente — invariante #7).
 *
 * El dominio de producción NO se quema en el código: se deriva del origen desde
 * el que se sirve la app (`window.location.origin`), con override opcional por
 * `VITE_PUBLIC_URL` para contextos sin `window` o para forzar un canónico. Así,
 * al mover producción de dominio (p.ej. a app.krujens.eu), los enlaces, `og:url`
 * y la marca visible siguen al dominio automáticamente, sin tocar código.
 *
 * El fallback literal solo aplica fuera del navegador y sin override; en el
 * cliente real siempre gana `window.location.origin`.
 */

const FALLBACK_URL = "https://futuro-club.vercel.app";

function resolvePublicUrl(): string {
  const override = (import.meta.env.VITE_PUBLIC_URL as string | undefined)?.trim();
  if (override) return override.replace(/\/+$/, "");
  if (typeof window !== "undefined" && window.location?.origin) return window.location.origin;
  return FALLBACK_URL;
}

/** Origen absoluto con esquema, sin barra final. P.ej. `https://app.krujens.eu`. */
export const PUBLIC_URL = resolvePublicUrl();

/** Solo el host, para mostrar como marca. P.ej. `app.krujens.eu`. */
export const PUBLIC_HOST = ((): string => {
  try {
    return new URL(PUBLIC_URL).host;
  } catch {
    return PUBLIC_URL.replace(/^https?:\/\//, "").replace(/\/+$/, "");
  }
})();
