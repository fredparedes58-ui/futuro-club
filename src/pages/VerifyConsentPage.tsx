/**
 * VITAS — Verify Parental Consent Page
 * Ruta pública /auth/verify-consent?token=... (a donde apunta el email de
 * sign-consent.ts). El PADRE llega aquí al hacer click en el enlace de
 * verificación. La página lee el token de la URL y hace POST a
 * /api/auth/verify-consent (que marca email_verified=true si el token es válido),
 * y muestra un mensaje amable. Sin esta página el enlace daba 404 y el flujo RGPD
 * de consentimiento de menores quedaba roto (no había ruta ni caller del API).
 */
import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, ShieldCheck } from "lucide-react";

type Status = "loading" | "success" | "error";

export default function VerifyConsentPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<Status>("loading");
  const [message, setMessage] = useState("");
  // El endpoint invalida el token al primer uso (verification_token=null): un segundo
  // POST (p.ej. el doble-invoke de useEffect en StrictMode) recibiría 404 y pisaría el
  // éxito. Este guard garantiza UNA sola verificación.
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return;
    started.current = true;

    const token = new URLSearchParams(window.location.search).get("token");
    // Quita el token de la URL/historial tras leerlo (hardening): es de un solo uso y se
    // invalida en el servidor, pero no conviene dejarlo en la barra ni en el historial.
    try { window.history.replaceState(null, "", "/auth/verify-consent"); } catch { /* noop */ }
    if (!token) {
      setStatus("error");
      setMessage("Enlace no válido: falta el token de verificación. Revisa el enlace del email.");
      return;
    }

    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/auth/verify-consent", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ token }),
        });
        // errorResponse emite { error: string, errorDetail: { message } } (no error.message):
        // se lee errorDetail.message o el string `error` para surfacear la causa real
        // (caducado / inválido), no un genérico. Mismo patrón que AnalysisDashboard.
        const json = (await res.json().catch(() => null)) as
          | { ok?: boolean; data?: { message?: string }; error?: string; errorDetail?: { message?: string } }
          | null;
        if (cancelled) return;
        if (res.ok && json?.ok) {
          setStatus("success");
          setMessage(json.data?.message ?? "Consentimiento verificado. El menor ya puede usar VITAS.");
        } else {
          setStatus("error");
          setMessage(
            json?.errorDetail?.message ??
              (typeof json?.error === "string" ? json.error : null) ??
              "No se pudo verificar el consentimiento. El enlace puede haber caducado (24h) o ya haberse usado.",
          );
        }
      } catch {
        if (!cancelled) {
          setStatus("error");
          setMessage("Error de conexión. Vuelve a intentarlo desde el enlace del email.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <motion.div
        initial={{ opacity: 0, y: 16 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="glass rounded-2xl p-8 max-w-md w-full text-center space-y-4"
      >
        <div className="flex justify-center">
          {status === "loading" && <Loader2 className="size-10 text-primary animate-spin" aria-hidden />}
          {status === "success" && <CheckCircle2 className="size-10 text-green-500" aria-hidden />}
          {status === "error" && <AlertCircle className="size-10 text-red-500" aria-hidden />}
        </div>

        <h1 className="text-lg font-display font-bold text-foreground flex items-center justify-center gap-2">
          <ShieldCheck size={18} className="text-primary" aria-hidden />
          Verificación de consentimiento
        </h1>

        <p className="text-sm text-muted-foreground leading-relaxed" role="status" aria-live="polite">
          {status === "loading" ? "Verificando el enlace…" : message}
        </p>

        {status !== "loading" && (
          <button
            onClick={() => navigate("/")}
            className="mt-2 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-sm font-display hover:opacity-90 transition-opacity"
          >
            Ir a VITAS
          </button>
        )}
      </motion.div>
    </div>
  );
}
