/**
 * VITAS — Holographic Portal Login
 * Rediseño: fondo de estadio, bola flotante con red, patada animada + bola que desaparece.
 */

import { useState, useEffect } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import pitchField from "@/assets/pitch-field.jpg";

// ─── Holographic Ball ──────────────────────────────────────────────────────────

function HoloBall({
  size = 120,
  style,
  delay = 0,
  floatY = 18,
}: {
  size?: number;
  style?: React.CSSProperties;
  delay?: number;
  floatY?: number;
}) {
  const id = `grad-${delay}-${size}`;
  const lines = Array.from({ length: 8 }, (_, i) => i);

  return (
    <motion.div
      style={{ position: "absolute", ...style }}
      animate={{ y: [0, -floatY, 0], rotate: [0, 8, -4, 0] }}
      transition={{ duration: 4 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <svg width={size} height={size} viewBox="0 0 100 100" style={{ filter: "drop-shadow(0 0 16px #22d3ee88)" }}>
        <defs>
          <radialGradient id={id} cx="40%" cy="35%" r="65%">
            <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.55" />
            <stop offset="50%" stopColor="#7c3aed" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.6" />
          </radialGradient>
        </defs>
        {/* Outer glow ring */}
        <circle cx="50" cy="50" r="47" fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.4" />
        <circle cx="50" cy="50" r="44" fill="none" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.3" />
        {/* Ball fill */}
        <circle cx="50" cy="50" r="43" fill={`url(#${id})`} />
        {/* Network lines */}
        {lines.map((i) => {
          const angle = (i / lines.length) * Math.PI * 2;
          const x2 = 50 + Math.cos(angle) * 43;
          const y2 = 50 + Math.sin(angle) * 43;
          return (
            <line key={i} x1="50" y1="50" x2={x2} y2={y2}
              stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.3" />
          );
        })}
        {/* Horizontal & vertical grid lines */}
        {[-24, -12, 0, 12, 24].map((offset) => (
          <g key={offset}>
            <line x1="7" y1={50 + offset} x2="93" y2={50 + offset}
              stroke="#22d3ee" strokeWidth="0.3" strokeOpacity="0.2" />
            <line x1={50 + offset} y1="7" x2={50 + offset} y2="93"
              stroke="#22d3ee" strokeWidth="0.3" strokeOpacity="0.2" />
          </g>
        ))}
        {/* Center dot */}
        <circle cx="50" cy="50" r="2.5" fill="#22d3ee" fillOpacity="0.8" />
        {/* Highlight */}
        <ellipse cx="38" cy="34" rx="10" ry="6" fill="white" fillOpacity="0.12" transform="rotate(-20 38 34)" />
      </svg>
    </motion.div>
  );
}

// ─── Kick + Ball Shoot Animation ──────────────────────────────────────────────

function KickScene() {
  const legControls = useAnimation();
  const ballControls = useAnimation();
  const [ballVisible, setBallVisible] = useState(true);

  useEffect(() => {
    let running = true;

    async function loop() {
      while (running) {
        // Wait before kick
        await new Promise((r) => setTimeout(r, 2800));
        if (!running) break;

        setBallVisible(true);
        await ballControls.set({ x: 0, y: 0, opacity: 1, scale: 1 });

        // Leg kick swing
        await legControls.start({
          rotate: [0, -28, 18, 0],
          transition: { duration: 0.55, ease: "easeOut" },
        });

        // Ball shoots right+up and fades
        await Promise.all([
          ballControls.start({
            x: [0, 80, 260],
            y: [0, -40, -110],
            scale: [1, 0.85, 0.3],
            opacity: [1, 0.7, 0],
            transition: { duration: 0.9, ease: "easeOut" },
          }),
        ]);
        setBallVisible(false);

        // Leg returns
        await legControls.start({
          rotate: 0,
          transition: { duration: 0.3, ease: "easeInOut" },
        });
      }
    }

    loop();
    return () => { running = false; };
  }, [legControls, ballControls]);

  return (
    <div
      className="absolute bottom-0 left-0 select-none pointer-events-none"
      style={{ width: 340, height: 420 }}
    >
      {/* Leg silhouette (SVG) */}
      <motion.div
        animate={legControls}
        style={{ transformOrigin: "70% 30%", position: "absolute", bottom: 0, left: 0 }}
      >
        <svg width="340" height="420" viewBox="0 0 340 420" style={{ filter: "drop-shadow(0 0 24px #22d3ee55)" }}>
          <defs>
            <linearGradient id="legGrad" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor="#1e3a5f" />
              <stop offset="100%" stopColor="#0a1628" />
            </linearGradient>
            <linearGradient id="sockGrad" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#1e3a5f" />
              <stop offset="100%" stopColor="#0d2040" />
            </linearGradient>
          </defs>
          {/* Upper leg (thigh) */}
          <path
            d="M90,80 C75,120 68,190 72,260 L145,265 C148,200 152,130 155,80 Z"
            fill="url(#legGrad)"
            stroke="#22d3ee"
            strokeWidth="1"
            strokeOpacity="0.3"
          />
          {/* Lower leg (shin) */}
          <path
            d="M72,260 C68,300 65,340 70,390 L100,395 C110,360 118,320 120,280 L145,265 Z"
            fill="url(#legGrad)"
            stroke="#22d3ee"
            strokeWidth="1"
            strokeOpacity="0.3"
          />
          {/* Sock */}
          <path
            d="M70,340 C65,365 64,385 70,400 L108,402 C112,388 114,368 112,345 Z"
            fill="url(#sockGrad)"
            stroke="#22d3ee"
            strokeWidth="0.8"
            strokeOpacity="0.4"
          />
          {/* Boot */}
          <path
            d="M68,390 C62,405 58,416 72,420 L125,420 C140,418 145,408 138,395 L108,393 Z"
            fill="#0a1525"
            stroke="#22d3ee"
            strokeWidth="1"
            strokeOpacity="0.5"
          />
          {/* Boot laces highlight */}
          <line x1="82" y1="396" x2="120" y2="394" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.5" />
          <line x1="84" y1="402" x2="118" y2="401" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.4" />
          {/* Glow outline on leg */}
          <path
            d="M90,80 C75,120 68,190 72,260 C68,300 65,340 70,390 C62,405 58,416 72,420 L125,420 C140,418 145,408 138,395 L112,345 C118,320 120,280 145,265 C148,200 152,130 155,80 Z"
            fill="none"
            stroke="#22d3ee"
            strokeWidth="0.5"
            strokeOpacity="0.15"
          />
        </svg>
      </motion.div>

      {/* Ball at foot */}
      <AnimatePresence>
        {ballVisible && (
          <motion.div
            animate={ballControls}
            style={{
              position: "absolute",
              bottom: 28,
              left: 118,
            }}
          >
            <svg width="56" height="56" viewBox="0 0 56 56" style={{ filter: "drop-shadow(0 0 12px #22d3eecc)" }}>
              <defs>
                <radialGradient id="shootBallGrad" cx="40%" cy="35%" r="65%">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity="0.9" />
                  <stop offset="60%" stopColor="#7c3aed" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#0f172a" stopOpacity="0.8" />
                </radialGradient>
              </defs>
              <circle cx="28" cy="28" r="26" fill="url(#shootBallGrad)" />
              <circle cx="28" cy="28" r="26" fill="none" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.8" />
              {/* Pentagon-like patches */}
              <path d="M28,8 L36,14 L33,24 L23,24 L20,14 Z" fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.5" />
              <path d="M28,48 L36,42 L33,32 L23,32 L20,42 Z" fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.5" />
              <ellipse cx="20" cy="22" rx="5" ry="3" fill="white" fillOpacity="0.15" transform="rotate(-20 20 22)" />
            </svg>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Ground glow */}
      <div
        style={{
          position: "absolute",
          bottom: 0,
          left: 20,
          width: 200,
          height: 20,
          background: "radial-gradient(ellipse, rgba(34,211,238,0.3) 0%, transparent 70%)",
          borderRadius: "50%",
        }}
      />
    </div>
  );
}

// ─── Floating Particles ────────────────────────────────────────────────────────

function Particle({ x, y, size, delay }: { x: string; y: string; size: number; delay: number }) {
  return (
    <motion.div
      className="absolute rounded-full"
      style={{ left: x, top: y, width: size, height: size, background: "rgba(34,211,238,0.6)" }}
      animate={{ y: [0, -30, 0], opacity: [0.4, 1, 0.4] }}
      transition={{ duration: 3 + delay, repeat: Infinity, delay, ease: "easeInOut" }}
    />
  );
}

// ─── Player Card decoration ────────────────────────────────────────────────────

function HoloCard() {
  return (
    <motion.div
      animate={{ y: [0, -12, 0], rotate: [2, -1, 2] }}
      transition={{ duration: 5, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute",
        bottom: "18%",
        right: "6%",
        width: 110,
        background: "rgba(13,20,40,0.75)",
        border: "1px solid rgba(34,211,238,0.35)",
        borderRadius: 12,
        padding: "10px 12px",
        backdropFilter: "blur(8px)",
        boxShadow: "0 0 20px rgba(34,211,238,0.15)",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
        <div style={{ width: 28, height: 28, borderRadius: "50%", background: "linear-gradient(135deg,#22d3ee,#7c3aed)", display: "flex", alignItems: "center", justifyContent: "center" }}>
          <span style={{ fontSize: 12, color: "white", fontWeight: "bold" }}>⚡</span>
        </div>
        <div>
          <div style={{ fontSize: 9, color: "#22d3ee", fontWeight: "bold", letterSpacing: 1 }}>VSI</div>
          <div style={{ fontSize: 14, color: "white", fontWeight: "900", lineHeight: 1 }}>87</div>
        </div>
      </div>
      {["Veloc.", "Técnica", "Visión"].map((label, i) => (
        <div key={label} style={{ marginBottom: 4 }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
            <span style={{ fontSize: 7, color: "rgba(255,255,255,0.5)" }}>{label}</span>
            <span style={{ fontSize: 7, color: "#22d3ee" }}>{[84, 91, 79][i]}</span>
          </div>
          <div style={{ height: 2, background: "rgba(255,255,255,0.1)", borderRadius: 1 }}>
            <div style={{ height: "100%", width: `${[84, 91, 79][i]}%`, background: "linear-gradient(90deg,#7c3aed,#22d3ee)", borderRadius: 1 }} />
          </div>
        </div>
      ))}
    </motion.div>
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { signIn, configured } = useAuth();

  const from = (location.state as { from?: Location })?.from?.pathname ?? "/pulse";

  const [email, setEmail]       = useState("");
  const [password, setPassword] = useState("");
  const [showPw, setShowPw]     = useState(false);
  const [loading, setLoading]   = useState(false);
  const [error, setError]       = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!email || !password) { setError("Completa todos los campos"); return; }
    setLoading(true);
    const { error: authError } = await signIn(email, password);
    setLoading(false);
    if (authError) { setError(translateError(authError.message)); return; }
    toast.success("Sesión iniciada");
    navigate(from, { replace: true });
  };

  return (
    <div className="relative min-h-screen overflow-hidden flex items-center justify-center">

      {/* ── Background: stadium image + dark overlay ── */}
      <div className="absolute inset-0">
        <img
          src={pitchField}
          alt=""
          className="w-full h-full object-cover object-center"
          style={{ filter: "brightness(0.25) saturate(0.6)" }}
        />
        {/* Gradient overlays */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(135deg, rgba(7,11,22,0.92) 0%, rgba(12,18,38,0.75) 50%, rgba(7,11,22,0.92) 100%)" }} />
        <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse at 50% 50%, rgba(124,58,237,0.08) 0%, transparent 70%)" }} />
        {/* Cyan glow left */}
        <div className="absolute" style={{ left: "-5%", bottom: "5%", width: 400, height: 400, background: "radial-gradient(circle, rgba(34,211,238,0.12) 0%, transparent 70%)", borderRadius: "50%" }} />
        {/* Purple glow right */}
        <div className="absolute" style={{ right: "5%", top: "20%", width: 350, height: 350, background: "radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 70%)", borderRadius: "50%" }} />
      </div>

      {/* ── Grid overlay ── */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          backgroundImage: "linear-gradient(rgba(34,211,238,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.04) 1px, transparent 1px)",
          backgroundSize: "48px 48px",
        }}
      />

      {/* ── Particles ── */}
      <Particle x="15%" y="20%" size={3} delay={0} />
      <Particle x="25%" y="60%" size={2} delay={1.2} />
      <Particle x="80%" y="15%" size={3} delay={0.7} />
      <Particle x="75%" y="70%" size={2} delay={1.8} />
      <Particle x="90%" y="45%" size={2} delay={0.4} />
      <Particle x="10%" y="80%" size={2} delay={2.1} />

      {/* ── Left: kick scene (hidden on small screens) ── */}
      <div className="absolute bottom-0 left-0 hidden lg:block" style={{ zIndex: 2 }}>
        <KickScene />
      </div>

      {/* ── Right: holographic balls ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
        {/* Large main ball top right */}
        <HoloBall size={160} style={{ right: "8%", top: "6%" }} delay={0} floatY={20} />
        {/* Medium ball */}
        <HoloBall size={90}  style={{ right: "22%", top: "30%" }} delay={1.5} floatY={14} />
        {/* Small ball */}
        <HoloBall size={55}  style={{ right: "5%", top: "48%" }} delay={0.8} floatY={10} />
        {/* Player analytics card */}
        <HoloCard />
      </div>

      {/* ── Center: Login card ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        {/* Card */}
        <div
          style={{
            background: "rgba(8,14,30,0.82)",
            border: "1px solid rgba(34,211,238,0.25)",
            borderRadius: 20,
            padding: "36px 32px",
            backdropFilter: "blur(20px)",
            boxShadow: "0 0 40px rgba(34,211,238,0.1), 0 0 80px rgba(124,58,237,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
          }}
        >
          {/* Header */}
          <div className="text-center mb-7">
            <div className="inline-flex items-center gap-2 mb-3">
              <div
                style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: "linear-gradient(135deg, rgba(34,211,238,0.2), rgba(124,58,237,0.2))",
                  border: "1px solid rgba(34,211,238,0.4)",
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <Zap size={16} style={{ color: "#22d3ee" }} />
              </div>
              <span style={{ color: "#22d3ee", fontWeight: "bold", fontSize: 15, letterSpacing: 1 }}>Vitas</span>
            </div>
            <h1
              style={{
                fontSize: 20,
                fontWeight: 900,
                letterSpacing: 2,
                textTransform: "uppercase",
                background: "linear-gradient(90deg, #22d3ee, #a78bfa)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
                backgroundClip: "text",
                lineHeight: 1.2,
                marginBottom: 6,
              }}
            >
              VITAS: HOLOGRAPHIC<br />PORTAL LOGIN
            </h1>
            <p style={{ color: "rgba(255,255,255,0.45)", fontSize: 10, letterSpacing: 2, textTransform: "uppercase" }}>
              Accede a tu academia de scouting
            </p>
          </div>

          {/* Offline warning */}
          {!configured && (
            <div className="flex items-start gap-2 p-3 rounded-lg mb-4" style={{ background: "rgba(251,191,36,0.08)", border: "1px solid rgba(251,191,36,0.2)" }}>
              <AlertCircle size={13} style={{ color: "#fbbf24", flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.5)" }}>
                Modo offline — configura Supabase para activar autenticación real.
              </p>
            </div>
          )}

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Email */}
            <div>
              <label style={{ fontSize: 9, color: "#22d3ee", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 }}>
                Email
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@vitas.ai"
                autoComplete="email"
                style={{
                  width: "100%",
                  padding: "11px 14px",
                  borderRadius: 10,
                  background: "rgba(255,255,255,0.04)",
                  border: "1px solid rgba(34,211,238,0.25)",
                  color: "white",
                  fontSize: 13,
                  outline: "none",
                  transition: "border-color 0.2s",
                  boxSizing: "border-box",
                }}
                onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.7)")}
                onBlur={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.25)")}
              />
            </div>

            {/* Password */}
            <div>
              <label style={{ fontSize: 9, color: "#22d3ee", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 6 }}>
                Contraseña
              </label>
              <div style={{ position: "relative" }}>
                <input
                  type={showPw ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{
                    width: "100%",
                    padding: "11px 40px 11px 14px",
                    borderRadius: 10,
                    background: "rgba(255,255,255,0.04)",
                    border: "1px solid rgba(34,211,238,0.25)",
                    color: "white",
                    fontSize: 13,
                    outline: "none",
                    transition: "border-color 0.2s",
                    boxSizing: "border-box",
                  }}
                  onFocus={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.7)")}
                  onBlur={(e) => (e.target.style.borderColor = "rgba(34,211,238,0.25)")}
                />
                <button
                  type="button"
                  onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(34,211,238,0.6)", background: "none", border: "none", cursor: "pointer" }}
                >
                  {showPw ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
              <div style={{ textAlign: "right", marginTop: 6 }}>
                <Link to="/forgot-password" style={{ fontSize: 10, color: "rgba(34,211,238,0.6)", textDecoration: "none" }}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0 }}
                  className="flex items-center gap-2 p-3 rounded-lg"
                  style={{ background: "rgba(239,68,68,0.1)", border: "1px solid rgba(239,68,68,0.25)" }}
                >
                  <AlertCircle size={13} style={{ color: "#ef4444", flexShrink: 0 }} />
                  <p style={{ fontSize: 11, color: "#ef4444" }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit button */}
            <motion.button
              type="submit"
              disabled={loading}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              style={{
                width: "100%",
                padding: "13px",
                borderRadius: 12,
                background: loading
                  ? "rgba(124,58,237,0.5)"
                  : "linear-gradient(90deg, #7c3aed, #22d3ee)",
                border: "none",
                color: "white",
                fontWeight: 900,
                fontSize: 13,
                letterSpacing: 3,
                textTransform: "uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 8,
                boxShadow: loading ? "none" : "0 0 24px rgba(34,211,238,0.3)",
                transition: "background 0.2s, box-shadow 0.2s",
              }}
            >
              {loading ? (
                <>
                  <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />
                  Entrando…
                </>
              ) : (
                "ENTRAR"
              )}
            </motion.button>
          </form>

          {/* Register link */}
          <p style={{ textAlign: "center", marginTop: 20, fontSize: 11, color: "rgba(255,255,255,0.4)" }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" style={{ color: "#22d3ee", textDecoration: "none", fontWeight: 700 }}>
              Crear academia
            </Link>
          </p>
        </div>

        {/* Version tag */}
        <p style={{ textAlign: "center", marginTop: 16, fontSize: 9, color: "rgba(34,211,238,0.35)", letterSpacing: 3, textTransform: "uppercase" }}>
          VITAS V2.0 · Football Intelligence Platform
        </p>
      </motion.div>
    </div>
  );
}

function translateError(msg: string): string {
  if (msg.includes("Invalid login credentials")) return "Email o contraseña incorrectos";
  if (msg.includes("Email not confirmed"))        return "Confirma tu email antes de entrar";
  if (msg.includes("Too many requests"))          return "Demasiados intentos. Espera un momento";
  if (msg.includes("User not found"))             return "No existe una cuenta con ese email";
  if (msg.includes("no configurado"))             return msg;
  return msg;
}
