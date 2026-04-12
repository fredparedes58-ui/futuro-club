/**
 * VITAS · Cloudflare Turnstile CAPTCHA Widget
 *
 * Widget invisible que verifica automáticamente al usuario.
 * Si VITE_TURNSTILE_SITE_KEY no está configurado, no renderiza nada (graceful degradation).
 *
 * Props:
 *   onVerify(token: string) — callback cuando el captcha es resuelto
 */

import { useEffect, useRef, useCallback } from "react";

const TURNSTILE_SCRIPT_URL = "https://challenges.cloudflare.com/turnstile/v0/api.js";
const SITE_KEY = import.meta.env.VITE_TURNSTILE_SITE_KEY as string | undefined;

// Track global script loading state
let scriptLoading = false;
let scriptLoaded = false;

function loadTurnstileScript(): Promise<void> {
  if (scriptLoaded) return Promise.resolve();
  if (scriptLoading) {
    return new Promise((resolve) => {
      const check = setInterval(() => {
        if (scriptLoaded) {
          clearInterval(check);
          resolve();
        }
      }, 100);
    });
  }

  scriptLoading = true;
  return new Promise((resolve, reject) => {
    const script = document.createElement("script");
    script.src = `${TURNSTILE_SCRIPT_URL}?render=explicit`;
    script.async = true;
    script.onload = () => {
      scriptLoaded = true;
      resolve();
    };
    script.onerror = () => {
      scriptLoading = false;
      reject(new Error("Failed to load Turnstile script"));
    };
    document.head.appendChild(script);
  });
}

interface TurnstileWidgetProps {
  onVerify: (token: string) => void;
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: HTMLElement,
        options: {
          sitekey: string;
          callback: (token: string) => void;
          appearance: string;
          size: string;
        },
      ) => string;
      remove: (widgetId: string) => void;
      reset: (widgetId: string) => void;
    };
  }
}

export default function TurnstileWidget({ onVerify }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);
  const onVerifyRef = useRef(onVerify);
  onVerifyRef.current = onVerify;

  const renderWidget = useCallback(async () => {
    if (!SITE_KEY || !containerRef.current) return;

    try {
      await loadTurnstileScript();
    } catch {
      console.warn("[turnstile] Could not load script");
      return;
    }

    if (!window.turnstile || !containerRef.current) return;

    // Remove previous widget if exists
    if (widgetIdRef.current) {
      try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
    }

    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: SITE_KEY,
      callback: (token: string) => onVerifyRef.current(token),
      appearance: "interaction-only",
      size: "compact",
    });
  }, []);

  useEffect(() => {
    renderWidget();

    return () => {
      if (widgetIdRef.current && window.turnstile) {
        try { window.turnstile.remove(widgetIdRef.current); } catch { /* noop */ }
        widgetIdRef.current = null;
      }
    };
  }, [renderWidget]);

  // No site key configured — render nothing
  if (!SITE_KEY) return null;

  return <div ref={containerRef} />;
}

/** Helper: verifica token con el backend. Retorna true si es válido o si captcha no está configurado. */
export async function verifyCaptchaToken(token: string | null): Promise<boolean> {
  // Si no hay site key, captcha está deshabilitado — skip
  if (!SITE_KEY) return true;

  // Si hay site key pero no hay token, falló la verificación
  if (!token) return false;

  try {
    const res = await fetch("/api/auth/verify-captcha", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });

    if (!res.ok) return false;

    const data = await res.json() as { ok: boolean; data?: { success: boolean } };
    return data.ok && data.data?.success === true;
  } catch {
    console.error("[turnstile] Verification request failed");
    return false;
  }
}
