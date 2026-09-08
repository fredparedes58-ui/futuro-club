import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import { SUPPORTED_LOCALES, normalizeLocale } from "@/lib/shared/locale";

import es from "./es.json";
import en from "./en.json";
import it from "./it.json";
import de from "./de.json";
import fr from "./fr.json";
import nl from "./nl.json";
import es419 from "./es-419.json";

// Recursos por idioma. Las claves coinciden con LANGUAGE_REGISTRY (locale.ts) →
// añadir un idioma = añadir su JSON + una línea aquí.
const resources = {
  es: { translation: es },
  en: { translation: en },
  it: { translation: it },
  de: { translation: de },
  fr: { translation: fr },
  nl: { translation: nl },
  "es-419": { translation: es419 },
} as const;

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    // Idiomas servibles (incluye el código regional es-419).
    supportedLngs: SUPPORTED_LOCALES,
    // No cargar el idioma base ("es") para "es-419": es-419 tiene parity completa.
    load: "currentOnly",
    fallbackLng: "es",
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      order: ["localStorage", "navigator"],
      caches: ["localStorage"],
      lookupLocalStorage: "i18nextLng",
      // Todo idioma detectado (localStorage/navegador, p. ej. "es-MX", "en-US")
      // pasa por normalizeLocale → se resuelve a un idioma soportado (es-MX→es-419,
      // en-US→en, de-AT→de, desconocido→es). Mantiene coherencia con los agentes.
      convertDetectedLanguage: (lng: string) => normalizeLocale(lng),
    },
  });

export default i18n;
