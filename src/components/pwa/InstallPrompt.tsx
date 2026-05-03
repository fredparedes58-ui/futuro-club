/**
 * VITAS · Install PWA Prompt
 *
 * Banner que aparece automáticamente cuando el usuario PUEDE instalar la PWA.
 *
 * Comportamiento:
 *   - Chrome/Edge/Brave Android: el navegador dispara `beforeinstallprompt`,
 *     mostramos botón "Instalar" que dispara prompt nativo.
 *   - iOS Safari: NO dispara el evento (Apple no lo soporta), pero sí permite
 *     instalación manual via "Compartir → Añadir a pantalla de inicio".
 *     Mostramos instrucciones específicas para iOS.
 *   - Si ya está instalada: NO se muestra nada.
 *
 * UX:
 *   - Aparece como banner inferior (no bloquea contenido)
 *   - Usuario puede cerrar (se recuerda en localStorage 7 días)
 *   - Se reactiva cada 7 días si no instalada
 */

import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

const DISMISS_KEY = "vitas_install_prompt_dismissed_at";
const REPROMPT_DAYS = 7;

function isIOS(): boolean {
  if (typeof window === "undefined") return false;
  return /iPhone|iPad|iPod/.test(navigator.userAgent) && !("MSStream" in window);
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  // iOS Safari Standalone
  if ("standalone" in navigator && (navigator as { standalone?: boolean }).standalone) {
    return true;
  }
  // PWA installed (Chrome/Edge)
  return window.matchMedia("(display-mode: standalone)").matches;
}

function wasRecentlyDismissed(): boolean {
  if (typeof localStorage === "undefined") return false;
  const lastDismiss = localStorage.getItem(DISMISS_KEY);
  if (!lastDismiss) return false;
  const elapsed = Date.now() - Number(lastDismiss);
  return elapsed < REPROMPT_DAYS * 24 * 60 * 60 * 1000;
}

export function InstallPrompt() {
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosInstructions, setShowIosInstructions] = useState(false);
  const [dismissed, setDismissed] = useState(wasRecentlyDismissed());

  useEffect(() => {
    if (isStandalone()) return; // ya instalada, no mostrar

    // Android/Chrome flow
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setInstallEvent(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstall);

    // iOS flow: mostrar instrucciones tras 30 seg si no es ya standalone
    if (isIOS() && !wasRecentlyDismissed()) {
      const timeout = setTimeout(() => {
        setShowIosInstructions(true);
      }, 30000); // 30 seg de uso antes de mostrar
      return () => {
        clearTimeout(timeout);
        window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
      };
    }

    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstall);
  }, []);

  function handleDismiss() {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    setInstallEvent(null);
    setShowIosInstructions(false);
  }

  async function handleInstall() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    if (choice.outcome === "accepted") {
      setInstallEvent(null);
    } else {
      handleDismiss();
    }
  }

  // No mostrar si ya cerrado recientemente
  if (dismissed) return null;

  // ── Banner Android/Chrome (botón nativo) ───────────────────
  if (installEvent) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[9998] animate-fade-in-up">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-2xl">
              🏆
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-rajdhani font-bold text-base mb-1">
                Instalar VITAS
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                Acceso rápido desde tu pantalla de inicio · funciona offline · sin notificaciones intrusivas
              </p>
            </div>
            <button
              onClick={handleDismiss}
              aria-label="Cerrar"
              className="flex-shrink-0 w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
            >
              ✕
            </button>
          </div>
          <div className="flex gap-2 mt-3">
            <button
              onClick={handleDismiss}
              className="flex-1 py-2 px-3 rounded-full border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-50 dark:hover:bg-slate-800"
            >
              Ahora no
            </button>
            <button
              onClick={handleInstall}
              className="flex-1 py-2 px-3 rounded-full bg-gradient-to-r from-blue-600 to-purple-600 text-white text-sm font-semibold"
            >
              Instalar
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── Banner iOS Safari (instrucciones manuales) ─────────────
  if (showIosInstructions) {
    return (
      <div className="fixed bottom-4 left-4 right-4 sm:left-auto sm:right-4 sm:max-w-sm z-[9998] animate-fade-in-up">
        <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 w-12 h-12 rounded-xl bg-gradient-to-br from-blue-600 to-purple-600 flex items-center justify-center text-2xl">
              🏆
            </div>
            <div className="flex-1 min-w-0">
              <h3 className="font-rajdhani font-bold text-base mb-1">
                Instalar VITAS en tu iPhone
              </h3>
              <ol className="text-xs text-slate-600 dark:text-slate-400 space-y-1 mt-2">
                <li className="flex gap-2">
                  <span className="font-bold text-blue-600">1.</span>
                  <span>Toca el botón compartir <span className="inline-block px-1 py-0.5 bg-slate-100 dark:bg-slate-800 rounded text-xs">⎙</span> abajo</span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-blue-600">2.</span>
                  <span>Selecciona <strong>"Añadir a pantalla de inicio"</strong></span>
                </li>
                <li className="flex gap-2">
                  <span className="font-bold text-blue-600">3.</span>
                  <span>Toca <strong>"Añadir"</strong> arriba a la derecha</span>
                </li>
              </ol>
            </div>
            <button
              onClick={handleDismiss}
              aria-label="Cerrar"
              className="flex-shrink-0 w-7 h-7 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex items-center justify-center text-slate-500"
            >
              ✕
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
