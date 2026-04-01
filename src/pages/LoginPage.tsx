/**
 * VITAS — Holographic Portal Login
 * Réplica fiel del mockup: card glass transparente, wireframe ball, player cards.
 * NOTA: para el fondo con botas/jugador se requiere imagen externa.
 */

import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import pitchField from "@/assets/pitch-field.jpg";
import player1 from "@/assets/player-1.png";
import player2 from "@/assets/player-2.png";

// ─── Wireframe Ball ────────────────────────────────────────────────────────────

function WireframeBall({ size = 180, delay = 0, style }: { size?: number; delay?: number; style?: React.CSSProperties }) {
  const cx = size / 2, cy = size / 2, r = size * 0.43;

  // Latitudes
  const lats = [-0.65, -0.4, -0.12, 0.18, 0.44, 0.68].map((t, i) => {
    const y = cy + r * t;
    const rr = Math.sqrt(Math.max(0, r * r - (r * t) ** 2));
    return <ellipse key={i} cx={cx} cy={y} rx={rr} ry={rr * 0.26} fill="none" stroke="#22d3ee" strokeWidth="0.65" strokeOpacity="0.5" />;
  });

  // Longitudes
  const lons = [0, 30, 60, 90, 120, 150].map((deg, i) => (
    <ellipse key={i} cx={cx} cy={cy} rx={r * Math.abs(Math.cos((deg * Math.PI) / 180))} ry={r}
      fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.3"
      transform={`rotate(${deg} ${cx} ${cy})`} />
  ));

  // Nodes
  const nodes: { x: number; y: number }[] = [];
  [-0.65, -0.12, 0.44].forEach(t => {
    const y = cy + r * t;
    const rr = Math.sqrt(Math.max(0, r * r - (r * t) ** 2));
    [0, 60, 120, 180, 240, 300].forEach(deg => {
      nodes.push({ x: cx + rr * Math.cos((deg * Math.PI) / 180), y });
    });
  });

  // Orbit ring (tilted)
  const oid = `orb-${delay}`;

  return (
    <motion.div style={{ position: "absolute", ...style }}
      animate={{ y: [0, -18, 0], rotate: [0, 4, -2, 0] }}
      transition={{ duration: 5 + delay, repeat: Infinity, ease: "easeInOut", delay }}>
      {/* Outer glow halo */}
      <div style={{ position: "absolute", inset: -30, borderRadius: "50%",
        background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 65%)", pointerEvents: "none" }} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`bg-${oid}`} cx="40%" cy="35%" r="65%">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.14" />
            <stop offset="55%"  stopColor="#7c3aed" stopOpacity="0.10" />
            <stop offset="100%" stopColor="#080c1a" stopOpacity="0.50" />
          </radialGradient>
          <filter id={`glow-${oid}`} x="-30%" y="-30%" width="160%" height="160%">
            <feGaussianBlur stdDeviation="2.5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r} fill={`url(#bg-${oid})`} />
        <circle cx={cx} cy={cy} r={r}     fill="none" stroke="#22d3ee" strokeWidth="1.3" strokeOpacity="0.65" filter={`url(#glow-${oid})`} />
        <circle cx={cx} cy={cy} r={r + 7} fill="none" stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.2" />
        <circle cx={cx} cy={cy} r={r + 16} fill="none" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.15" />
        {lats}{lons}
        {nodes.map((n, i) => <circle key={i} cx={n.x} cy={n.y} r="2.2" fill="#22d3ee" fillOpacity="0.75" filter={`url(#glow-${oid})`} />)}
        {/* Orbit ring */}
        <ellipse cx={cx} cy={cy} rx={r + 22} ry={r * 0.2} fill="none" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.3" strokeDasharray="5 7" />
        {/* Satellite dot on orbit */}
        <circle cx={cx + r + 22} cy={cy} r="3.5" fill="#22d3ee" fillOpacity="0.8" filter={`url(#glow-${oid})`} />
        {/* Highlight */}
        <ellipse cx={cx * 0.78} cy={cy * 0.66} rx={r * 0.2} ry={r * 0.11}
          fill="white" fillOpacity="0.12" transform={`rotate(-25 ${cx * 0.78} ${cy * 0.66})`} />
        <circle cx={cx} cy={cy} r="3.5" fill="#22d3ee" fillOpacity="0.9" />
      </svg>
    </motion.div>
  );
}

// ─── Neon Football left ────────────────────────────────────────────────────────

function NeonFootball() {
  const size = 200, cx = size / 2, cy = size / 2, r = size * 0.42;
  const penta = (px: number, py: number, pr: number, rot: number) => {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = ((i * 72 + rot) * Math.PI) / 180;
      return `${px + pr * Math.cos(a)},${py + pr * Math.sin(a)}`;
    }).join(" ");
    return <polygon points={pts} fill="rgba(34,211,238,0.06)" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.65" />;
  };
  return (
    <motion.div
      style={{ position: "absolute", bottom: "8%", left: "2%", pointerEvents: "none" }}
      animate={{ y: [0, -14, 0], scale: [1, 1.02, 1] }}
      transition={{ duration: 4, repeat: Infinity, ease: "easeInOut" }}
    >
      {/* Glow halo layers */}
      <div style={{ position: "absolute", inset: -50, borderRadius: "50%", background: "radial-gradient(circle, rgba(100,200,255,0.35) 0%, rgba(34,211,238,0.15) 35%, transparent 70%)", filter: "blur(12px)" }} />
      <div style={{ position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.5) 0%, transparent 65%)", filter: "blur(6px)" }} />
      {/* Energy lines */}
      {[20, 80, 140, 200, 260, 320].map((a, i) => {
        const x1 = cx + (r + 5)  * Math.cos((a * Math.PI) / 180);
        const y1 = cy + (r + 5)  * Math.sin((a * Math.PI) / 180);
        const x2 = cx + (r + 40) * Math.cos((a * Math.PI) / 180);
        const y2 = cy + (r + 40) * Math.sin((a * Math.PI) / 180);
        return (
          <motion.div key={i} style={{ position: "absolute", top: 0, left: 0, width: size, height: size }}>
            <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ position: "absolute", top: -40, left: -40, width: size + 80, height: size + 80, overflow: "visible" }}>
              <line x1={x1 + 40} y1={y1 + 40} x2={x2 + 40} y2={y2 + 40} stroke="#22d3ee" strokeWidth="1.5"
                strokeOpacity="0.5" strokeLinecap="round"
                strokeDasharray={`${15 + i * 5} ${30 + i * 3}`} />
            </svg>
          </motion.div>
        );
      })}
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="nfGrad" cx="38%" cy="32%" r="70%">
            <stop offset="0%"   stopColor="#a5f3fc" stopOpacity="0.85" />
            <stop offset="30%"  stopColor="#22d3ee" stopOpacity="0.65" />
            <stop offset="65%"  stopColor="#7c3aed" stopOpacity="0.45" />
            <stop offset="100%" stopColor="#0a0e1e" stopOpacity="0.7" />
          </radialGradient>
          <filter id="nfGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="5" result="b" />
            <feMerge><feMergeNode in="b" /><feMergeNode in="b" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        <circle cx={cx} cy={cy} r={r + 5}  fill="none" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.3" />
        <circle cx={cx} cy={cy} r={r}       fill="url(#nfGrad)" filter="url(#nfGlow)" />
        <circle cx={cx} cy={cy} r={r}       fill="none" stroke="#22d3ee" strokeWidth="1.5" strokeOpacity="0.8" />
        {penta(cx, cy, r * 0.38, -90)}
        {[0, 72, 144, 216, 288].map((a) => {
          const px = cx + r * 0.52 * Math.cos((a * Math.PI) / 180);
          const py = cy + r * 0.52 * Math.sin((a * Math.PI) / 180);
          return penta(px, py, r * 0.2, a + 36);
        })}
        <ellipse cx={cx * 0.76} cy={cy * 0.68} rx={r * 0.22} ry={r * 0.12}
          fill="white" fillOpacity="0.22" transform={`rotate(-28 ${cx * 0.76} ${cy * 0.68})`} />
      </svg>
    </motion.div>
  );
}

// ─── Player Analytics Cards (derecha) ─────────────────────────────────────────

function PlayerCards() {
  const cardStyle: React.CSSProperties = {
    background: "rgba(6,12,28,0.78)",
    border: "1px solid rgba(34,211,238,0.28)",
    borderRadius: 12,
    backdropFilter: "blur(14px)",
    boxShadow: "0 0 20px rgba(34,211,238,0.1)",
    overflow: "hidden",
  };

  return (
    <motion.div
      animate={{ y: [0, -12, 0], rotate: [2, 0.5, 2] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      style={{ position: "absolute", bottom: "8%", right: "4%", display: "flex", flexDirection: "column", gap: 8, zIndex: 5 }}
    >
      {/* Main card */}
      <div style={{ ...cardStyle, width: 145, padding: "10px 12px" }}>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          {/* Avatar */}
          <div style={{ width: 38, height: 38, borderRadius: 8, overflow: "hidden", border: "1.5px solid rgba(34,211,238,0.45)", flexShrink: 0 }}>
            <img src={player1} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,0.4)", textTransform: "uppercase", letterSpacing: 1 }}>VSI Score</div>
            <div style={{ fontSize: 18, color: "#22d3ee", fontWeight: 900, lineHeight: 1.1 }}>87</div>
            <div style={{ display: "flex", alignItems: "center", gap: 3 }}>
              <motion.div animate={{ opacity: [1, 0.2, 1] }} transition={{ duration: 1, repeat: Infinity }}
                style={{ width: 4, height: 4, borderRadius: "50%", background: "#22d3ee" }} />
              <span style={{ fontSize: 7, color: "rgba(34,211,238,0.6)", letterSpacing: 1 }}>LIVE</span>
            </div>
          </div>
        </div>
        {/* Heatmap */}
        <div style={{ height: 40, borderRadius: 6, background: "rgba(255,255,255,0.03)", border: "1px solid rgba(255,255,255,0.06)", marginBottom: 8, overflow: "hidden", position: "relative" }}>
          {[[38, 50, 22, "rgba(239,68,68,0.75)"], [62, 30, 18, "rgba(251,146,60,0.65)"], [55, 65, 14, "rgba(250,204,21,0.5)"], [28, 35, 16, "rgba(34,211,238,0.5)"], [75, 55, 12, "rgba(167,139,250,0.55)"]].map(([x, y, r, c], i) => (
            <div key={i} style={{ position: "absolute", left: `${x}%`, top: `${y}%`, width: r as number, height: r as number, borderRadius: "50%", background: c as string, filter: "blur(6px)", transform: "translate(-50%,-50%)" }} />
          ))}
          {/* Grid overlay */}
          <div style={{ position: "absolute", inset: 0, display: "grid", gridTemplateColumns: "repeat(8,1fr)", gridTemplateRows: "repeat(3,1fr)", opacity: 0.12 }}>
            {Array.from({ length: 24 }).map((_, i) => <div key={i} style={{ border: "0.5px solid rgba(34,211,238,0.5)" }} />)}
          </div>
        </div>
        {/* Stats */}
        {[["Veloc.", 84, "#22d3ee"], ["Técnica", 91, "#a78bfa"], ["Visión", 78, "#34d399"]].map(([label, val, color]) => (
          <div key={label as string} style={{ marginBottom: 4 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
              <span style={{ fontSize: 7, color: "rgba(255,255,255,0.4)" }}>{label}</span>
              <span style={{ fontSize: 7, color: color as string, fontWeight: 700 }}>{val}</span>
            </div>
            <div style={{ height: 2, background: "rgba(255,255,255,0.08)", borderRadius: 1 }}>
              <motion.div initial={{ width: 0 }} animate={{ width: `${val}%` }} transition={{ duration: 1.4, delay: 0.6, ease: "easeOut" }}
                style={{ height: "100%", background: `linear-gradient(90deg,${color},rgba(255,255,255,0.3))`, borderRadius: 1 }} />
            </div>
          </div>
        ))}
      </div>

      {/* Second card slightly offset */}
      <motion.div
        animate={{ y: [0, -8, 0], rotate: [-1, 1, -1] }}
        transition={{ duration: 4.5, repeat: Infinity, ease: "easeInOut", delay: 0.8 }}
        style={{ ...cardStyle, width: 120, padding: "8px 10px", alignSelf: "flex-end", marginTop: -20 }}
      >
        <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 6 }}>
          <div style={{ width: 28, height: 28, borderRadius: 6, overflow: "hidden", border: "1px solid rgba(124,58,237,0.5)" }}>
            <img src={player2} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
          </div>
          <div>
            <div style={{ fontSize: 7, color: "rgba(255,255,255,0.35)" }}>PHV Score</div>
            <div style={{ fontSize: 14, color: "#a78bfa", fontWeight: 900 }}>+0.42</div>
          </div>
        </div>
        {[["VAEP", 72, "#34d399"], ["Disparo", 88, "#f87171"]].map(([l, v, c]) => (
          <div key={l as string} style={{ marginBottom: 3 }}>
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 1 }}>
              <span style={{ fontSize: 6.5, color: "rgba(255,255,255,0.35)" }}>{l}</span>
              <span style={{ fontSize: 6.5, color: c as string }}>{v}</span>
            </div>
            <div style={{ height: 1.5, background: "rgba(255,255,255,0.07)", borderRadius: 1 }}>
              <div style={{ height: "100%", width: `${v}%`, background: c as string, borderRadius: 1 }} />
            </div>
          </div>
        ))}
      </motion.div>
    </motion.div>
  );
}

// ─── Floating Particle ─────────────────────────────────────────────────────────

function Dot({ x, y, s, delay }: { x: string; y: string; s: number; delay: number }) {
  return (
    <motion.div style={{ position: "absolute", left: x, top: y, width: s, height: s, borderRadius: "50%", background: "rgba(34,211,238,0.65)", pointerEvents: "none" }}
      animate={{ y: [0, -24, 0], opacity: [0.3, 0.9, 0.3] }}
      transition={{ duration: 3 + delay, repeat: Infinity, ease: "easeInOut", delay }} />
  );
}

// ─── Main ──────────────────────────────────────────────────────────────────────

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

      {/* ── Background photo ── */}
      <div className="absolute inset-0">
        <img src={pitchField} alt="" className="w-full h-full object-cover"
          style={{ objectPosition: "50% 60%", filter: "brightness(0.35) saturate(0.7)" }} />
        <div className="absolute inset-0" style={{ background: "linear-gradient(105deg, rgba(2,6,18,0.88) 0%, rgba(5,10,24,0.65) 40%, rgba(2,6,18,0.80) 100%)" }} />
        {/* Cyan glow bottom-left */}
        <div className="absolute" style={{ left: "-10%", bottom: "-5%", width: 600, height: 600, background: "radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 60%)", borderRadius: "50%" }} />
        {/* Purple glow top-right */}
        <div className="absolute" style={{ right: "5%", top: "5%", width: 450, height: 450, background: "radial-gradient(circle, rgba(124,58,237,0.13) 0%, transparent 65%)", borderRadius: "50%" }} />
      </div>

      {/* ── Grid ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: "linear-gradient(rgba(34,211,238,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.03) 1px,transparent 1px)", backgroundSize: "52px 52px" }} />

      {/* ── Floating dots ── */}
      <Dot x="8%"  y="20%" s={3} delay={0}   />
      <Dot x="18%" y="70%" s={2} delay={1.4} />
      <Dot x="80%" y="15%" s={3} delay={0.7} />
      <Dot x="88%" y="75%" s={2} delay={2.0} />
      <Dot x="6%"  y="85%" s={2} delay={1.0} />

      {/* ── LEFT: neon football ── */}
      <div className="absolute inset-0 pointer-events-none hidden lg:block">
        <NeonFootball />
      </div>

      {/* ── RIGHT: wireframe balls + player cards ── */}
      <div className="absolute inset-0 pointer-events-none hidden md:block" style={{ zIndex: 4 }}>
        <WireframeBall size={185} style={{ right: "5%",  top: "5%"  }} delay={0}   />
        <WireframeBall size={80}  style={{ right: "25%", top: "35%" }} delay={1.8} />
        {/* Orbit ring glow */}
        <motion.div
          animate={{ opacity: [0.4, 0.8, 0.4] }}
          transition={{ duration: 2.5, repeat: Infinity }}
          style={{ position: "absolute", right: "3%", top: "3%", width: 220, height: 220, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.25)" }}
        />
        <PlayerCards />
      </div>

      {/* ── LOGIN CARD ── */}
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: "easeOut" }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div style={{
          background: "rgba(10,16,38,0.72)",
          border: "1px solid rgba(34,211,238,0.22)",
          borderRadius: 20,
          padding: "36px 32px 32px",
          backdropFilter: "blur(22px)",
          boxShadow: "0 8px 64px rgba(0,0,0,0.5), 0 0 40px rgba(34,211,238,0.08), inset 0 1px 0 rgba(255,255,255,0.06)",
        }}>

          {/* Logo */}
          <div style={{ textAlign: "center", marginBottom: 20 }}>
            <div style={{ display: "inline-flex", alignItems: "center", gap: 8, marginBottom: 14 }}>
              <div style={{ width: 34, height: 34, borderRadius: 9, background: "rgba(34,211,238,0.15)", border: "1.5px solid rgba(34,211,238,0.45)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <Zap size={17} color="#22d3ee" />
              </div>
              <span style={{ color: "rgba(255,255,255,0.92)", fontWeight: 800, fontSize: 16, letterSpacing: 0.5 }}>Vitas</span>
            </div>

            <h1 style={{
              fontSize: 22, fontWeight: 900, letterSpacing: 1.5, textTransform: "uppercase",
              background: "linear-gradient(90deg, #22d3ee 0%, #818cf8 45%, #22d3ee 100%)",
              backgroundSize: "200%", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent",
              backgroundClip: "text", lineHeight: 1.22, marginBottom: 8,
              animation: "shimmer 3.5s linear infinite",
            }}>
              VITAS: HOLOGRAPHIC<br />PORTAL LOGIN
            </h1>
            <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: 2.5, textTransform: "uppercase" }}>
              Accede a tu academia de scouting
            </p>
          </div>

          {/* Offline warning */}
          {!configured && (
            <div style={{ display: "flex", gap: 8, padding: "9px 12px", borderRadius: 10, background: "rgba(251,191,36,0.07)", border: "1px solid rgba(251,191,36,0.2)", marginBottom: 16 }}>
              <AlertCircle size={12} color="#fbbf24" style={{ flexShrink: 0, marginTop: 1 }} />
              <p style={{ fontSize: 10, color: "rgba(255,255,255,0.4)", margin: 0 }}>Modo offline — configura Supabase en .env</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 7 }}>Email</label>
              <input type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@vitas.ai" autoComplete="email"
                style={{ width: "100%", padding: "11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(34,211,238,0.35)", color: "white", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "all 0.2s" }}
                onFocus={(e) => { e.target.style.borderColor = "rgba(34,211,238,0.8)"; e.target.style.boxShadow = "0 0 18px rgba(34,211,238,0.18)"; }}
                onBlur={(e)  => { e.target.style.borderColor = "rgba(34,211,238,0.35)"; e.target.style.boxShadow = "none"; }} />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 6 }}>
              <label style={{ fontSize: 9, color: "rgba(255,255,255,0.55)", letterSpacing: 2, textTransform: "uppercase", fontWeight: 700, display: "block", marginBottom: 7 }}>Contraseña</label>
              <div style={{ position: "relative" }}>
                <input type={showPw ? "text" : "password"} value={password} onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••"  autoComplete="current-password"
                  style={{ width: "100%", padding: "11px 40px 11px 14px", borderRadius: 10, background: "rgba(255,255,255,0.04)", border: "1.5px solid rgba(34,211,238,0.35)", color: "white", fontSize: 13, outline: "none", boxSizing: "border-box", transition: "all 0.2s" }}
                  onFocus={(e) => { e.target.style.borderColor = "rgba(34,211,238,0.8)"; e.target.style.boxShadow = "0 0 18px rgba(34,211,238,0.18)"; }}
                  onBlur={(e)  => { e.target.style.borderColor = "rgba(34,211,238,0.35)"; e.target.style.boxShadow = "none"; }} />
                <button type="button" onClick={() => setShowPw(!showPw)}
                  style={{ position: "absolute", right: 12, top: "50%", transform: "translateY(-50%)", color: "rgba(34,211,238,0.6)", background: "none", border: "none", cursor: "pointer", padding: 0 }}>
                  {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                </button>
              </div>
              <div style={{ textAlign: "right", marginTop: 8 }}>
                <Link to="/forgot-password" style={{ fontSize: 11, color: "rgba(34,211,238,0.6)", textDecoration: "none" }}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
                  style={{ display: "flex", gap: 8, padding: "9px 12px", borderRadius: 10, background: "rgba(239,68,68,0.09)", border: "1px solid rgba(239,68,68,0.25)", marginBottom: 12 }}>
                  <AlertCircle size={12} color="#ef4444" style={{ flexShrink: 0 }} />
                  <p style={{ fontSize: 11, color: "#ef4444", margin: 0 }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* ENTRAR button */}
            <motion.button type="submit" disabled={loading}
              whileHover={{ scale: 1.025 }}
              whileTap={{ scale: 0.975 }}
              style={{
                width: "100%", padding: "13px", marginTop: 10, borderRadius: 12,
                background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(90deg, #c026d3 0%, #7c3aed 45%, #22d3ee 100%)",
                border: "none", color: "white", fontWeight: 900, fontSize: 14, letterSpacing: 5,
                textTransform: "uppercase", cursor: loading ? "not-allowed" : "pointer",
                display: "flex", alignItems: "center", justifyContent: "center", gap: 8,
                boxShadow: loading ? "none" : "0 0 28px rgba(192,38,211,0.4), 0 0 50px rgba(34,211,238,0.15)",
                transition: "box-shadow 0.3s",
              }}>
              {loading
                ? <><Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} />Entrando…</>
                : "ENTRAR"}
            </motion.button>
          </form>

          <p style={{ textAlign: "center", marginTop: 18, fontSize: 12, color: "rgba(255,255,255,0.35)" }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" style={{ color: "#22d3ee", textDecoration: "none", fontWeight: 800 }}>
              Crear academia
            </Link>
          </p>
        </div>

        <p style={{ textAlign: "center", marginTop: 14, fontSize: 9, color: "rgba(34,211,238,0.32)", letterSpacing: 3, textTransform: "uppercase" }}>
          VITAS V2.0 · Football Intelligence Platform
        </p>
      </motion.div>

      <style>{`
        @keyframes shimmer { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        input::placeholder { color: rgba(255,255,255,0.2) !important; }
        input { font-family: system-ui, sans-serif; }
      `}</style>
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
