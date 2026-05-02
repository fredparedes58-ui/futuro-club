/**
 * VITAS · Cookie Banner (RGPD-compliant)
 *
 * Reglas:
 *   - Decline by default (no pre-checks)
 *   - Solo cookies esenciales antes de aceptar
 *   - Persistencia de preferencias en localStorage
 *   - Posibilidad de revocar en cualquier momento desde /legal/cookies
 */

import { useEffect, useState } from "react";

type CookieCategory = "essential" | "analytics" | "marketing";

interface CookiePreferences {
  essential: true; // siempre true · necesarias para funcionamiento
  analytics: boolean;
  marketing: boolean;
  acceptedAt: string;
  version: string;
}

const STORAGE_KEY = "vitas_cookie_prefs_v1";
const CURRENT_VERSION = "v1.0";

function getStoredPrefs(): CookiePreferences | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed.version !== CURRENT_VERSION) return null;
    return parsed;
  } catch {
    return null;
  }
}

function savePrefs(prefs: Omit<CookiePreferences, "essential" | "acceptedAt" | "version">) {
  const full: CookiePreferences = {
    essential: true,
    analytics: prefs.analytics,
    marketing: prefs.marketing,
    acceptedAt: new Date().toISOString(),
    version: CURRENT_VERSION,
  };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(full));
  // Disparar evento para que analytics se active/desactive
  window.dispatchEvent(new CustomEvent("vitas-cookie-prefs-changed", { detail: full }));
}

export function CookieBanner() {
  const [show, setShow] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [marketing, setMarketing] = useState(false);

  useEffect(() => {
    const stored = getStoredPrefs();
    if (!stored) setShow(true);
  }, []);

  function handleAcceptAll() {
    savePrefs({ analytics: true, marketing: true });
    setShow(false);
  }

  function handleRejectAll() {
    savePrefs({ analytics: false, marketing: false });
    setShow(false);
  }

  function handleSaveCustom() {
    savePrefs({ analytics, marketing });
    setShow(false);
    setShowCustom(false);
  }

  if (!show) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-md z-[9999] animate-fade-in-up">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 p-6">
        {!showCustom ? (
          <>
            <h3 className="font-rajdhani font-bold text-lg mb-2">🍪 Cookies en VITAS</h3>
            <p className="text-sm text-slate-600 mb-4 leading-relaxed">
              Usamos cookies <strong>esenciales</strong> para que la app funcione. Otras
              (análisis, marketing) son opcionales y solo se activan si las aceptas.
            </p>

            <div className="flex flex-col sm:flex-row gap-2">
              <button
                onClick={handleRejectAll}
                className="flex-1 py-2.5 px-4 rounded-full border border-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Solo esenciales
              </button>
              <button
                onClick={() => setShowCustom(true)}
                className="flex-1 py-2.5 px-4 rounded-full border border-slate-300 text-sm font-semibold hover:bg-slate-50"
              >
                Personalizar
              </button>
              <button
                onClick={handleAcceptAll}
                className="flex-1 py-2.5 px-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold"
              >
                Aceptar todas
              </button>
            </div>

            <p className="text-xs text-slate-500 mt-3">
              Más info en nuestra{" "}
              <a href="/legal/cookies" className="underline">
                Política de Cookies
              </a>
              .
            </p>
          </>
        ) : (
          <>
            <h3 className="font-rajdhani font-bold text-lg mb-2">Personalizar cookies</h3>

            <div className="space-y-3 my-4">
              <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50">
                <input type="checkbox" checked disabled className="mt-1 w-4 h-4" />
                <div>
                  <div className="font-semibold text-sm">Esenciales · obligatorias</div>
                  <div className="text-xs text-slate-600">Sesión, autenticación, seguridad. Sin estas la app no funciona.</div>
                </div>
              </div>

              <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={analytics}
                  onChange={(e) => setAnalytics(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-purple-600"
                />
                <div>
                  <div className="font-semibold text-sm">Análisis</div>
                  <div className="text-xs text-slate-600">Nos ayuda a entender cómo usas VITAS para mejorar el producto.</div>
                </div>
              </label>

              <label className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 cursor-pointer">
                <input
                  type="checkbox"
                  checked={marketing}
                  onChange={(e) => setMarketing(e.target.checked)}
                  className="mt-1 w-4 h-4 accent-purple-600"
                />
                <div>
                  <div className="font-semibold text-sm">Marketing</div>
                  <div className="text-xs text-slate-600">Permite mostrar contenido relevante y medir campañas.</div>
                </div>
              </label>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => setShowCustom(false)}
                className="flex-1 py-2.5 px-4 rounded-full border border-slate-300 text-sm font-semibold"
              >
                Volver
              </button>
              <button
                onClick={handleSaveCustom}
                className="flex-1 py-2.5 px-4 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold"
              >
                Guardar preferencias
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// Helper para componentes que quieran consultar preferencias
export function useCookiePreferences() {
  const [prefs, setPrefs] = useState<CookiePreferences | null>(null);

  useEffect(() => {
    setPrefs(getStoredPrefs());
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<CookiePreferences>).detail;
      setPrefs(detail);
    };
    window.addEventListener("vitas-cookie-prefs-changed", onChange);
    return () => window.removeEventListener("vitas-cookie-prefs-changed", onChange);
  }, []);

  return prefs;
}
