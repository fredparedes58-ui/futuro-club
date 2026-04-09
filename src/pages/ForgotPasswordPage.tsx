/**
 * VITAS — Forgot Password Page
 */

import { useState } from "react";
import { Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Loader2, AlertCircle, CheckCircle2, Zap, ArrowLeft } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useTranslation } from "react-i18next";

const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.4 } } };
const container = { hidden: {}, show: { transition: { staggerChildren: 0.07 } } };

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuth();
  const { t } = useTranslation();
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email) { setError(t("auth.forgotPassword.enterEmail")); return; }
    setLoading(true);
    const { error: err } = await resetPassword(email);
    setLoading(false);
    if (err) { setError(err.message); return; }
    setSent(true);
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(var(--primary-rgb),0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />
      <motion.div variants={container} initial="hidden" animate="show" className="w-full max-w-sm space-y-5">
        <motion.div variants={item} className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <Zap size={24} className="text-primary" />
          </div>
          <h1 className="font-display font-black text-3xl text-foreground">VITAS</h1>
        </motion.div>

        <motion.div variants={item} className="glass rounded-2xl p-6 space-y-5">
          {sent ? (
            <div className="text-center space-y-3 py-4">
              <CheckCircle2 size={32} className="text-primary mx-auto" />
              <p className="font-display font-bold text-foreground">{t("auth.forgotPassword.sentTitle")}</p>
              <p className="text-sm text-muted-foreground">
                {t("auth.forgotPassword.sentDescription", { email })}
              </p>
              <Link to="/login" className="block text-xs text-primary font-display hover:underline">
                {t("auth.forgotPassword.backToLogin")}
              </Link>
            </div>
          ) : (
            <>
              <div>
                <h2 className="font-display font-bold text-xl text-foreground">{t("auth.forgotPassword.title")}</h2>
                <p className="text-xs text-muted-foreground mt-0.5">{t("auth.forgotPassword.subtitle")}</p>
              </div>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">{t("auth.forgotPassword.emailLabel")}</label>
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder={t("auth.forgotPassword.emailPlaceholder")}
                    className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30"
                  />
                </div>
                {error && (
                  <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
                    <AlertCircle size={13} className="text-destructive" />
                    <p className="text-xs text-destructive font-display">{error}</p>
                  </div>
                )}
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
                >
                  {loading ? <><Loader2 size={14} className="animate-spin" />{t("auth.forgotPassword.submitting")}</> : t("auth.forgotPassword.submit")}
                </button>
              </form>
              <Link to="/login" className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground font-display transition-colors">
                <ArrowLeft size={12} /> {t("auth.forgotPassword.backToLogin")}
              </Link>
            </>
          )}
        </motion.div>
      </motion.div>
    </div>
  );
}
