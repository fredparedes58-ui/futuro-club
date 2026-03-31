/**
 * VITAS — Login Page
 * Diseño oscuro/cyberpunk coherente con el resto de la app.
 */

import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

const item = {
  hidden: { opacity: 0, y: 16 },
  show: { opacity: 1, y: 0, transition: { duration: 0.4 } },
};
const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07 } },
};

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, configured } = useAuth();

  const from = (location.state as { from?: Location })?.from?.pathname ?? "/pulse";

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) {
      setError("Completa todos los campos");
      return;
    }
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    setLoading(false);
    if (authError) {
      setError(translateError(authError.message));
      return;
    }
    toast.success("Sesión iniciada");
    navigate(from, { replace: true });
  };

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      {/* Background grid */}
      <div className="fixed inset-0 bg-[linear-gradient(rgba(var(--primary-rgb),0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm space-y-6"
      >
        {/* Logo */}
        <motion.div variants={item} className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <Zap size={24} className="text-primary" />
          </div>
          <h1 className="font-display font-black text-3xl text-foreground tracking-tight">
            VITAS
          </h1>
          <p className="text-xs text-muted-foreground font-display tracking-widest uppercase">
            Football Intelligence
          </p>
        </motion.div>

        {/* Card */}
        <motion.div variants={item} className="glass rounded-2xl p-6 space-y-5">
          <div>
            <h2 className="font-display font-bold text-xl text-foreground">Iniciar sesión</h2>
            <p className="text-xs text-muted-foreground mt-0.5">Accede a tu academia de scouting</p>
          </div>

          {/* Aviso si Supabase no está configurado */}
          {!configured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-gold/10 border border-gold/20">
              <AlertCircle size={14} className="text-gold shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-display font-semibold text-gold">Modo offline</p>
                <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
                  Agrega <code className="text-gold">VITE_SUPABASE_URL</code> y{" "}
                  <code className="text-gold">VITE_SUPABASE_ANON_KEY</code> al archivo{" "}
                  <code className="text-gold">.env</code> para activar la autenticación real.
                </p>
              </div>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="scout@vitas.app"
                autoComplete="email"
                className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>

            {/* Password */}
            <div className="space-y-1.5">
              <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
                Contraseña
              </label>
              <div className="relative">
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  className="w-full px-3 py-2.5 pr-10 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div className="flex justify-end">
                <Link
                  to="/forgot-password"
                  className="text-[10px] text-muted-foreground hover:text-primary font-display transition-colors"
                >
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            {/* Error */}
            {error && (
              <motion.div
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 border border-destructive/20"
              >
                <AlertCircle size={13} className="text-destructive shrink-0" />
                <p className="text-xs text-destructive font-display">{error}</p>
              </motion.div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Entrando…
                </>
              ) : (
                "Entrar"
              )}
            </button>
          </form>
        </motion.div>

        {/* Register link */}
        <motion.p variants={item} className="text-center text-xs text-muted-foreground font-display">
          ¿No tienes cuenta?{" "}
          <Link
            to="/register"
            className="text-primary hover:underline font-semibold transition-colors"
          >
            Crear academia
          </Link>
        </motion.p>

        {/* Version */}
        <motion.p variants={item} className="text-center text-[9px] font-display text-muted-foreground/40 tracking-widest uppercase">
          VITAS v2.0 · Football Intelligence Platform
        </motion.p>
      </motion.div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email o contraseña incorrectos";
  if (msg.includes("Email not confirmed")) return "Confirma tu email antes de entrar";
  if (msg.includes("Too many requests")) return "Demasiados intentos. Espera un momento";
  if (msg.includes("User not found")) return "No existe una cuenta con ese email";
  if (msg.includes("no configurado")) return msg;
  return msg;
}
