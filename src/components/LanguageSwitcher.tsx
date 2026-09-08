/**
 * VITAS · LanguageSwitcher (Sprint 4.1)
 *
 * Toggle ES/EN. i18next ya persiste el idioma elegido en localStorage
 * (LanguageDetector, clave i18nextLng). Antes NO existía forma de cambiar
 * idioma en la UI — este es el control que faltaba.
 */
import { useTranslation } from "react-i18next";
import { SUPPORTED_LOCALES, LANGUAGE_REGISTRY, normalizeLocale } from "@/lib/shared/locale";

// Derivado del registro de idiomas → añadir un idioma (una entrada en
// LANGUAGE_REGISTRY) añade su botón automáticamente, sin tocar este componente.
const LANGS = SUPPORTED_LOCALES.map((code) => ({
  code,
  label: LANGUAGE_REGISTRY[code].label,
  name: LANGUAGE_REGISTRY[code].endonym,
}));

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = normalizeLocale(i18n.language);

  return (
    <div
      className={`inline-flex flex-wrap items-center gap-0.5 rounded-lg border border-border p-0.5 ${className}`}
      role="group"
      aria-label={t("languageSwitcher.groupLabel")}
    >
      {LANGS.map((l) => {
        const active = current === l.code;
        return (
          <button
            key={l.code}
            onClick={() => i18n.changeLanguage(l.code)}
            aria-pressed={active}
            aria-label={l.name}
            className={`px-2 py-0.5 rounded-md text-[11px] font-display font-bold transition-colors ${
              active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground"
            }`}
          >
            {l.label}
          </button>
        );
      })}
    </div>
  );
}

export default LanguageSwitcher;
