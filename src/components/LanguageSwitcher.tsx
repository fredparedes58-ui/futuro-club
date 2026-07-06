/**
 * VITAS · LanguageSwitcher (Sprint 4.1)
 *
 * Toggle ES/EN. i18next ya persiste el idioma elegido en localStorage
 * (LanguageDetector, clave i18nextLng). Antes NO existía forma de cambiar
 * idioma en la UI — este es el control que faltaba.
 */
import { useTranslation } from "react-i18next";

const LANGS = [
  { code: "es", label: "ES" },
  { code: "en", label: "EN" },
] as const;

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = (i18n.language || "es").slice(0, 2);

  return (
    <div
      className={`inline-flex items-center gap-0.5 rounded-lg border border-border p-0.5 ${className}`}
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
            aria-label={l.code === "es" ? t("languageSwitcher.spanish") : t("languageSwitcher.english")}
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
