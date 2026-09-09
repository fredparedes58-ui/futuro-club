/**
 * VITAS · LanguageSwitcher (Sprint 4.1 · rediseño compacto)
 *
 * Control de idioma compacto tipo "globo + desplegable", alineado con el control
 * de idioma del interior de la app (Settings → Globe). Sustituye a la antigua
 * fila de 7 pastillas (ES EN IT DE FR NL LAT) que en móvil ocupaba casi todo el
 * ancho y se solapaba con el fondo de las pantallas de entrada.
 *
 * i18next persiste el idioma elegido en localStorage (LanguageDetector, clave
 * i18nextLng). Derivado del registro de idiomas → añadir un idioma (una entrada
 * en LANGUAGE_REGISTRY) añade su opción automáticamente, sin tocar este archivo.
 */
import { useState, useRef, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { Globe, Check, ChevronDown } from "lucide-react";
import { SUPPORTED_LOCALES, LANGUAGE_REGISTRY, normalizeLocale } from "@/lib/shared/locale";

const LANGS = SUPPORTED_LOCALES.map((code) => ({
  code,
  label: LANGUAGE_REGISTRY[code].label,
  name: LANGUAGE_REGISTRY[code].endonym,
}));

export function LanguageSwitcher({ className = "" }: { className?: string }) {
  const { i18n, t } = useTranslation();
  const current = normalizeLocale(i18n.language);
  const active = LANGS.find((l) => l.code === current) ?? LANGS[0];

  const [open, setOpen] = useState(false);
  // Abre hacia arriba cuando el disparador está en la mitad inferior de la
  // pantalla (p. ej. el menú de usuario del BottomNav) → la lista no se sale
  // por abajo ni queda tapada por la barra de navegación.
  const [dropUp, setDropUp] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = () => {
    setOpen((v) => {
      const next = !v;
      if (next && btnRef.current) {
        const r = btnRef.current.getBoundingClientRect();
        setDropUp(window.innerHeight - r.bottom < 260);
      }
      return next;
    });
  };

  // Cerrar al hacer click fuera o con Escape
  useEffect(() => {
    if (!open) return;
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointer);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointer);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const choose = (code: string) => {
    i18n.changeLanguage(code);
    setOpen(false);
  };

  return (
    <div ref={ref} className={`relative inline-block ${className}`}>
      <button
        ref={btnRef}
        type="button"
        onClick={toggle}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={t("languageSwitcher.groupLabel")}
        className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-background/70 px-2.5 py-1.5 text-[11px] font-display font-bold text-foreground transition-colors hover:border-primary/40"
      >
        <Globe size={13} className="shrink-0 text-primary" />
        <span>{active.label}</span>
        <ChevronDown
          size={12}
          className={`text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      {open && (
        <ul
          role="listbox"
          aria-label={t("languageSwitcher.groupLabel")}
          className={`glass-strong absolute right-0 z-[60] max-h-[60vh] min-w-[160px] overflow-y-auto rounded-xl border border-border py-1 shadow-2xl ${
            dropUp ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {LANGS.map((l) => {
            const isActive = current === l.code;
            return (
              <li key={l.code} role="option" aria-selected={isActive}>
                <button
                  type="button"
                  onClick={() => choose(l.code)}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs transition-colors ${
                    isActive ? "font-bold text-primary" : "text-foreground hover:bg-primary/10"
                  }`}
                >
                  <span className="w-7 shrink-0 font-display font-bold">{l.label}</span>
                  <span className="flex-1 capitalize">{l.name}</span>
                  {isActive && <Check size={13} className="shrink-0 text-primary" />}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export default LanguageSwitcher;
