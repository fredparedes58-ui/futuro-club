/**
 * VITAS — Register Page
 * Crea una nueva cuenta: academia, scout, entrenador, padre o jugador.
 */

import { useState } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap, CheckCircle2, Building2, Search, UserRound, Users, Dumbbell } from "lucide-react";
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

const pwRules = [
  { label: "Mínimo 8 caracteres", test: (p: string) => p.length >= 8 },
  { label: "Una letra mayúscula", test: (p: string) => /[A-Z]/.test(p) },
  { label: "Un número",           test: (p: string) => /\d/.test(p) },
];

type UserType = "academy" | "scout" | "coach" | "parent" | "player";

const USER_TYPES: { id: UserType; label: string; sublabel: string; Icon: React.ElementType }[] = [
  { id: "academy", label: "Academia / Club",  sublabel: "Gestiona un equipo",     Icon: Building2  },
  { id: "scout",   label: "Scout",            sublabel: "Descubre talento",        Icon: Search     },
  { id: "coach",   label: "Entrenador",       sublabel: "Dirige jugadores",        Icon: Dumbbell   },
  { id: "parent",  label: "Padre / Tutor",    sublabel: "Sigue el desarrollo",     Icon: Users      },
  { id: "player",  label: "Jugador",          sublabel: "Analiza tu rendimiento",  Icon: UserRound  },
];

const NAME_PLACEHOLDER: Record<UserType, string> = {
  academy: "Academia Fútbol Norte",
  scout:   "Carlos Ramírez",
  coach:   "Miguel Torres",
  parent:  "Ana González",
  player:  "Luis Hernández",
};

export default function RegisterPage() {
  const navigate = useNavigate();
  const { signUp, configured } = useAuth();

  const [userType, setUserType]     = useState<UserType>("scout");
  const [displayName, setDisplayName] = useState("");
  const [email, setEmail]           = useState("");
  const [password, setPassword]     = useState("");
  const [showPw, setShowPw]         = useState(false);
  const [loading, setLoading]       = useState(false);
  const [error, setError]           = useState<string | null>(null);
  const [success, setSuccess]       = useState(false);

  const pwStrength = pwRules.filter((r) => r.test(password)).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!displayName || !email || !password) {
      setError("Completa todos los campos");
      return;
    }
    if (pwStrength < 3) {
      setError("La contraseña no cumple los requisitos");
      return;
    }
    setLoading(true);
    const { error: authError } = await signUp(email, password, displayName, userType);
    setLoading(false);
    if (authError) {
      setError(translateError(authError.message));
      return;
    }
    setSuccess(true);
    toast.success("¡Cuenta creada! Revisa tu email para confirmar.");
  };

  if (success) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-sm glass rounded-2xl p-8 text-center space-y-4"
        >
          <div className="w-16 h-16 rounded-full bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto">
            <CheckCircle2 size={28} className="text-primary" />
          </div>
          <h2 className="font-display font-bold text-xl text-foreground">¡Cuenta creada!</h2>
          <p className="text-sm text-muted-foreground leading-relaxed">
            Hemos enviado un email de confirmación a{" "}
            <span className="text-primary font-semibold">{email}</span>.
            Confirma tu cuenta para comenzar.
          </p>
          <button
            onClick={() => navigate("/login")}
            className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors"
          >
            Ir al login
          </button>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4 overflow-y-auto">
      <div className="fixed inset-0 bg-[linear-gradient(rgba(var(--primary-rgb),0.03)_1px,transparent_1px),linear-gradient(90deg,rgba(var(--primary-rgb),0.03)_1px,transparent_1px)] bg-[size:40px_40px] pointer-events-none" />

      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="w-full max-w-sm space-y-5 py-8"
      >
        {/* Logo */}
        <motion.div variants={item} className="text-center space-y-1">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-primary/10 border border-primary/20 mb-2">
            <Zap size={24} className="text-primary" />
          </div>
          <h1 className="font-display font-black text-3xl text-foreground tracking-tight">VITAS</h1>
          <p className="text-xs text-muted-foreground font-display tracking-widest uppercase">
            Football Intelligence
          </p>
        </motion.div>

        {/* Card */}
        <motion.div variants={item} className="glass rounded-2xl p-6 space-y-4">
          <div>
            <h2 className="font-display font-bold text-xl text-foreground">Nueva cuenta</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              ¿Cómo vas a usar VITAS?
            </p>
          </div>

          {!configured && (
            <div className="flex items-start gap-2 p-3 rounded-lg bg-gold/10 border border-gold/20">
              <AlertCircle size={14} className="text-gold shrink-0 mt-0.5" />
              <p className="text-[10px] text-muted-foreground leading-relaxed">
                Supabase no configurado. El registro requiere{" "}
                <code className="text-gold">VITE_SUPABASE_URL</code>.
              </p>
            </div>
          )}

          {/* Tipo de usuario */}
          <div className="grid grid-cols-2 gap-2">
            {USER_TYPES.map(({ id, label, sublabel, Icon }) => (
              <button
                key={id}
                type="button"
                onClick={() => setUserType(id)}
                className={`flex flex-col items-start gap-1 p-3 rounded-xl border text-left transition-all ${
                  userType === id
                    ? "border-primary/60 bg-primary/10 text-foreground"
                    : "border-border bg-secondary/50 text-muted-foreground hover:border-border/80"
                } ${id === "player" ? "col-span-2" : ""}`}
              >
                <Icon size={14} className={userType === id ? "text-primary" : ""} />
                <span className="text-xs font-display font-semibold leading-tight">{label}</span>
                <span className="text-[10px] opacity-70">{sublabel}</span>
              </button>
            ))}
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Nombre */}
            <div className="space-y-1.5">
              <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
                {userType === "academy" ? "Nombre de la academia / club" : "Tu nombre"}
              </label>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder={NAME_PLACEHOLDER[userType]}
                autoComplete="name"
                className="w-full px-3 py-2.5 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 focus:ring-1 focus:ring-primary/30 transition-colors"
              />
            </div>

            {/* Email */}
            <div className="space-y-1.5">
              <label className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider">
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="tu@email.com"
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
                  autoComplete="new-password"
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

              {password.length > 0 && (
                <div className="space-y-2 pt-1">
                  <div className="flex gap-1">
                    {[0, 1, 2].map((i) => (
                      <div
                        key={i}
                        className={`flex-1 h-1 rounded-full transition-colors ${
                          i < pwStrength
                            ? pwStrength === 1 ? "bg-destructive" : pwStrength === 2 ? "bg-gold" : "bg-primary"
                            : "bg-muted"
                        }`}
                      />
                    ))}
                  </div>
                  <div className="space-y-1">
                    {pwRules.map((rule) => {
                      const ok = rule.test(password);
                      return (
                        <div key={rule.label} className="flex items-center gap-1.5">
                          <div className={`w-1 h-1 rounded-full ${ok ? "bg-primary" : "bg-muted-foreground/40"}`} />
                          <span className={`text-[10px] font-display ${ok ? "text-primary" : "text-muted-foreground"}`}>
                            {rule.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <Loader2 size={14} className="animate-spin" />
                  Creando cuenta…
                </>
              ) : (
                "Crear cuenta"
              )}
            </button>
          </form>
        </motion.div>

        <motion.p variants={item} className="text-center text-xs text-muted-foreground font-display">
          ¿Ya tienes cuenta?{" "}
          <Link to="/login" className="text-primary hover:underline font-semibold">
            Iniciar sesión
          </Link>
        </motion.p>
      </motion.div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("already registered") || msg.includes("User already registered"))
    return "Ya existe una cuenta con ese email";
  if (msg.includes("Password should be"))
    return "La contraseña debe tener al menos 6 caracteres";
  if (msg.includes("Invalid API key") || msg.includes("invalid api key"))
    return "Error de configuración. Contacta al administrador.";
  if (msg.includes("Invalid login credentials"))
    return "Email o contraseña incorrectos";
  if (msg.includes("Email not confirmed"))
    return "Confirma tu email antes de iniciar sesión";
  if (msg.includes("no configurado"))
    return msg;
  return msg;
}
