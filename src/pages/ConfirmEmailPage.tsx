/**
 * VITAS — Confirm Email Page  (/auth/confirm)
 *
 * Aterrizaje del enlace de confirmación de email (Rama A: scout / padre).
 * Supabase Auth (detectSessionInUrl, activo por defecto) procesa el token del
 * hash de la URL al cargar y establece la sesión → el email queda confirmado.
 * Esta página solo REACCIONA: espera a que la sesión aparezca y redirige a la
 * app; si el enlace es inválido/expirado, lo dice con honestidad (nunca finge
 * éxito). Misma forma que ResetPasswordPage (que también confía en el hash).
 */

import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, CheckCircle2, AlertCircle, Zap } from "lucide-react";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useTranslation } from "react-i18next";

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

type Status = "verifying" | "success" | "error";

export default function ConfirmEmailPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [status, setStatus] = useState<Status>("verifying");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const ranRef = useRef(false);

  useEffect(() => {
    if (ranRef.current) return; // StrictMode monta dos veces; corre una sola
    ranRef.current = true;

    if (!SUPABASE_CONFIGURED) {
      setStatus("error");
      setErrorMsg(t("auth.confirmEmail.supabaseNotConfigured"));
      return;
    }

    // 1. Si el enlace trae un error (expirado / ya usado), Supabase lo devuelve
    //    en el hash como error_description → lo mostramos tal cual, sin fingir.
    const rawHash = window.location.hash.startsWith("#")
      ? window.location.hash.slice(1)
      : window.location.hash;
    const hashParams = new URLSearchParams(rawHash);
    const errDesc = hashParams.get("error_description");
    if (errDesc) {
      window.history.replaceState(null, "", window.location.pathname); // limpia el hash
      setStatus("error");
      setErrorMsg(errDesc);
      return;
    }

    let done = false;
    const succeed = () => {
      if (done) return;
      done = true;
      window.history.replaceState(null, "", window.location.pathname); // scrub token
      setStatus("success");
      // /home: ProtectedRoute enruta a /onboarding a los nuevos y deja pasar al resto
      setTimeout(() => navigate("/home", { replace: true }), 1500);
    };
    const fail = () => {
      if (done) return;
      done = true;
      setStatus("error");
      setErrorMsg(t("auth.confirmEmail.linkInvalid"));
    };

    // 2. detectSessionInUrl procesa el hash de forma asíncrona → puede fijar la
    //    sesión antes o después de que montemos. Cubrimos ambos: escuchamos el
    //    evento SIGNED_IN y además consultamos getSession de inmediato.
    const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) succeed();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) succeed();
    });

    // 3. Respaldo: si en 6s no hay sesión ni error, el enlace no era válido.
    const timeout = setTimeout(async () => {
      const { data } = await supabase.auth.getSession();
      if (data.session) succeed();
      else fail();
    }, 6000);

    return () => {
      sub.subscription.unsubscribe();
      clearTimeout(timeout);
    };
  }, [navigate, t]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm space-y-6"
      >
        <motion.div variants={item} className="text-center space-y-2">
          <div className="flex items-center justify-center gap-2">
            <Zap size={24} className="text-primary" />
            <h1 className="font-display font-black text-2xl tracking-tight text-foreground">VITAS.</h1>
          </div>
        </motion.div>

        {status === "verifying" && (
          <motion.div variants={item} className="glass rounded-xl p-6 text-center space-y-3">
            <Loader2 size={40} className="text-primary mx-auto animate-spin" />
            <p className="text-sm text-muted-foreground">{t("auth.confirmEmail.verifying")}</p>
          </motion.div>
        )}

        {status === "success" && (
          <motion.div variants={item} className="glass rounded-xl p-6 text-center space-y-3">
            <CheckCircle2 size={40} className="text-green-500 mx-auto" />
            <p className="font-display font-bold text-foreground">{t("auth.confirmEmail.successTitle")}</p>
            <p className="text-sm text-muted-foreground">{t("auth.confirmEmail.successDescription")}</p>
          </motion.div>
        )}

        {status === "error" && (
          <motion.div variants={item} className="glass rounded-xl p-6 text-center space-y-4">
            <AlertCircle size={40} className="text-destructive mx-auto" />
            <p className="font-display font-bold text-foreground">{t("auth.confirmEmail.errorTitle")}</p>
            <p className="text-sm text-muted-foreground break-words">
              {errorMsg ?? t("auth.confirmEmail.linkInvalid")}
            </p>
            <button
              onClick={() => navigate("/login", { replace: true })}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors"
            >
              {t("auth.confirmEmail.goToLogin")}
            </button>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}
