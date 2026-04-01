/**
 * VITAS — Holographic Portal Login
 * Diseño: estadio real + bota neon izquierda + wireframe ball derecha + efectos épicos.
 */

import { useState, useEffect, useRef } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion, useAnimation, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap, Shield, Activity, TrendingUp } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import pitchField from "@/assets/pitch-field.jpg";
import player1 from "@/assets/player-1.png";

// ─── Wireframe Mesh Ball (derecha) ────────────────────────────────────────────

function WireframeBall({ size = 200, style, delay = 0 }: { size?: number; style?: React.CSSProperties; delay?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.44;

  // Latitude lines
  const latLines = [-0.6, -0.35, -0.1, 0.15, 0.4, 0.65].map((t, i) => {
    const y  = cy + r * t;
    const rr = Math.sqrt(Math.max(0, r * r - (r * t) * (r * t)));
    return <ellipse key={`lat-${i}`} cx={cx} cy={y} rx={rr} ry={rr * 0.28} fill="none" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.45" />;
  });

  // Longitude lines (vertical arcs approximated as ellipses)
  const lonLines = [0, 30, 60, 90, 120, 150].map((deg, i) => (
    <ellipse key={`lon-${i}`} cx={cx} cy={cy} rx={r * Math.abs(Math.cos((deg * Math.PI) / 180))} ry={r}
      fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.3"
      transform={`rotate(${deg} ${cx} ${cy})`} />
  ));

  // Nodes at intersections
  const nodes: { x: number; y: number }[] = [];
  [-0.6, -0.1, 0.4].forEach((t) => {
    const y  = cy + r * t;
    const rr = Math.sqrt(Math.max(0, r * r - (r * t) * (r * t)));
    [0, 60, 120, 180, 240, 300].forEach((deg) => {
      nodes.push({ x: cx + rr * Math.cos((deg * Math.PI) / 180), y: y });
    });
  });

  return (
    <motion.div
      style={{ position: "absolute", ...style }}
      animate={{ y: [0, -22, 0], rotate: [0, 5, -3, 0] }}
      transition={{ duration: 5 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {/* Outer glow */}
      <div style={{
        position: "absolute", inset: -20,
        background: `radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 70%)`,
        borderRadius: "50%",
        animation: "pulse-glow 3s ease-in-out infinite",
      }} />
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id="wfGrad" cx="45%" cy="38%" r="60%">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.18" />
            <stop offset="50%"  stopColor="#7c3aed" stopOpacity="0.12" />
            <stop offset="100%" stopColor="#0f172a" stopOpacity="0.55" />
          </radialGradient>
          <filter id="wfGlow">
            <feGaussianBlur stdDeviation="2" result="blur" />
            <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
          </filter>
        </defs>
        {/* Ball body */}
        <circle cx={cx} cy={cy} r={r} fill="url(#wfGrad)" />
        {/* Outer ring glow */}
        <circle cx={cx} cy={cy} r={r}     fill="none" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.6" filter="url(#wfGlow)" />
        <circle cx={cx} cy={cy} r={r + 6} fill="none" stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.2" />
        <circle cx={cx} cy={cy} r={r + 14} fill="none" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.15" />
        {/* Grid lines */}
        {latLines}
        {lonLines}
        {/* Nodes */}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r="2" fill="#22d3ee" fillOpacity="0.7" filter="url(#wfGlow)" />
        ))}
        {/* Connecting lines between nodes */}
        {nodes.slice(0, 6).map((n, i) => (
          <line key={`nl-${i}`} x1={cx} y1={cy} x2={n.x} y2={n.y} stroke="#22d3ee" strokeWidth="0.3" strokeOpacity="0.2" />
        ))}
        {/* Center dot */}
        <circle cx={cx} cy={cy} r="3" fill="#22d3ee" fillOpacity="0.9" filter="url(#wfGlow)" />
        {/* Highlight */}
        <ellipse cx={cx * 0.78} cy={cy * 0.65} rx={r * 0.22} ry={r * 0.12} fill="white" fillOpacity="0.12" transform={`rotate(-25 ${cx * 0.78} ${cy * 0.65})`} />
        {/* Orbit ring */}
        <ellipse cx={cx} cy={cy} rx={r + 20} ry={r * 0.18} fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.25" strokeDasharray="4 6" />
      </svg>
    </motion.div>
  );
}

// ─── Neon Football (izquierda, junto a la bota) ───────────────────────────────

function NeonBall({ size = 90 }: { size?: number }) {
  const cx = size / 2;
  const cy = size / 2;
  const r  = size * 0.45;

  // Pentagon pattern
  const pentagon = (cx2: number, cy2: number, r2: number, rotation = 0) => {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = ((i * 72 + rotation) * Math.PI) / 180;
      return `${cx2 + r2 * Math.cos(a)},${cy2 + r2 * Math.sin(a)}`;
    }).join(" ");
    return <polygon points={pts} fill="none" stroke="#22d3ee" strokeWidth="1" strokeOpacity="0.7" />;
  };

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <defs>
        <radialGradient id="neonBallGrad" cx="40%" cy="35%" r="65%">
          <stop offset="0%"   stopColor="#a5f3fc" stopOpacity="0.9" />
          <stop offset="35%"  stopColor="#22d3ee" stopOpacity="0.7" />
          <stop offset="70%"  stopColor="#7c3aed" stopOpacity="0.5" />
          <stop offset="100%" stopColor="#0a0f1e" stopOpacity="0.8" />
        </radialGradient>
        <filter id="neonGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="4" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
        <filter id="neonGlowStrong" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="8" result="blur" />
          <feMerge><feMergeNode in="blur" /><feMergeNode in="SourceGraphic" /></feMerge>
        </filter>
      </defs>
      {/* Outer glow rings */}
      <circle cx={cx} cy={cy} r={r + 14} fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.15" />
      <circle cx={cx} cy={cy} r={r + 8}  fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.25" />
      <circle cx={cx} cy={cy} r={r + 3}  fill="none" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.5" filter="url(#neonGlow)" />
      {/* Ball body */}
      <circle cx={cx} cy={cy} r={r} fill="url(#neonBallGrad)" filter="url(#neonGlow)" />
      {/* Pentagon patches */}
      {pentagon(cx, cy, r * 0.42, -90)}
      {[0, 72, 144, 216, 288].map((a) => {
        const px = cx + r * 0.55 * Math.cos((a * Math.PI) / 180);
        const py = cy + r * 0.55 * Math.sin((a * Math.PI) / 180);
        return pentagon(px, py, r * 0.22, a + 36);
      })}
      {/* Highlight */}
      <ellipse cx={cx * 0.78} cy={cy * 0.68} rx={r * 0.25} ry={r * 0.14} fill="white" fillOpacity="0.25" transform={`rotate(-25 ${cx * 0.78} ${cy * 0.68})`} />
      {/* Energy rays */}
      {[30, 90, 150, 210, 270, 330].map((a, i) => {
        const x1 = cx + (r + 3)  * Math.cos((a * Math.PI) / 180);
        const y1 = cy + (r + 3)  * Math.sin((a * Math.PI) / 180);
        const x2 = cx + (r + 18) * Math.cos((a * Math.PI) / 180);
        const y2 = cy + (r + 18) * Math.sin((a * Math.PI) / 180);
        return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.4" />;
      })}
    </svg>
  );
}

// ─── Boot + Leg SVG (izquierda) ───────────────────────────────────────────────

function BootScene() {
  const legCtrl  = useAnimation();
  const ballCtrl = useAnimation();
  const [show, setShow] = useState(true);

  useEffect(() => {
    let live = true;
    async function loop() {
      while (live) {
        await new Promise((r) => setTimeout(r, 3200));
        if (!live) break;
        setShow(true);
        await ballCtrl.set({ x: 0, y: 0, opacity: 1, scale: 1 });
        // Kick
        await legCtrl.start({ rotate: [-5, -32, 22, 0], transition: { duration: 0.52, ease: [0.23,1,0.32,1] } });
        // Ball flies
        ballCtrl.start({ x: [0,60,220], y: [0,-30,-120], scale: [1,0.9,0.25], opacity: [1,0.8,0], transition: { duration: 0.85, ease: "easeOut" } });
        await new Promise((r) => setTimeout(r, 300));
        setShow(false);
        await legCtrl.start({ rotate: 0, transition: { duration: 0.3 } });
      }
    }
    loop();
    return () => { live = false; };
  }, [legCtrl, ballCtrl]);

  return (
    <div className="absolute bottom-0 left-0 pointer-events-none select-none hidden lg:block" style={{ width: 360, height: 480, zIndex: 3 }}>
      {/* Ground glow */}
      <div style={{ position: "absolute", bottom: -4, left: 20, width: 240, height: 24, background: "radial-gradient(ellipse, rgba(34,211,238,0.35) 0%, transparent 70%)", borderRadius: "50%" }} />

      {/* Leg + Boot SVG */}
      <motion.div animate={legCtrl} style={{ transformOrigin: "55% 20%", position: "absolute", bottom: 0, left: 0 }}>
        <svg width="360" height="480" viewBox="0 0 360 480">
          <defs>
            <linearGradient id="thighG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="#1a3560" />
              <stop offset="100%" stopColor="#0d1f3c" />
            </linearGradient>
            <linearGradient id="sockG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%"   stopColor="#1a3560" />
              <stop offset="100%" stopColor="#0a1528" />
            </linearGradient>
            <linearGradient id="bootG" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%"   stopColor="#1c2940" />
              <stop offset="60%"  stopColor="#0d1a2e" />
              <stop offset="100%" stopColor="#090f1c" />
            </linearGradient>
            <linearGradient id="solG" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#e05a1a" />
              <stop offset="100%" stopColor="#b83a0a" />
            </linearGradient>
            <filter id="legGlow">
              <feGaussianBlur stdDeviation="3" result="blur"/>
              <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
            </filter>
          </defs>

          {/* Shorts bottom */}
          <path d="M100,60 C88,100 82,165 86,240 L168,244 C172,172 176,108 178,60 Z" fill="url(#thighG)" />
          {/* Thigh highlight */}
          <path d="M108,65 C100,100 96,155 98,210 L120,212 C118,158 117,104 120,65 Z" fill="white" fillOpacity="0.05" />

          {/* Shin */}
          <path d="M86,240 C82,285 79,335 82,400 L116,403 C122,340 128,290 130,248 L168,244 Z" fill="url(#thighG)" />
          {/* Shin guard hint */}
          <path d="M88,255 C86,295 85,330 87,370 L102,371 C103,332 104,295 104,258 Z" fill="white" fillOpacity="0.07" />

          {/* Sock */}
          <path d="M82,370 C78,400 76,425 82,445 L120,447 C126,426 128,400 128,375 Z" fill="url(#sockG)" />
          {/* Sock stripe */}
          <path d="M80,388 L122,385 L122,393 L80,396 Z" fill="white" fillOpacity="0.12" />
          <path d="M80,408 L122,405 L122,413 L80,416 Z" fill="white" fillOpacity="0.08" />

          {/* Boot upper */}
          <path d="M80,430 C74,448 70,468 76,478 L148,478 C158,470 162,455 158,438 L120,436 Z" fill="url(#bootG)" />
          {/* Boot toe box — rounder */}
          <path d="M76,470 C68,478 62,485 70,488 L155,488 C168,486 170,476 162,470 Z" fill="url(#bootG)" />
          {/* Boot sole (orange/red accent) */}
          <path d="M66,484 C60,490 62,496 72,498 L158,496 C170,494 172,488 164,484 Z" fill="url(#solG)" />
          {/* Lace area */}
          <path d="M84,435 L148,432 L150,442 L84,445 Z" fill="white" fillOpacity="0.06" />
          {/* Laces */}
          {[0,8,16,24].map((off) => (
            <line key={off} x1={88+off*2} y1={438+off*0.5} x2={88+off*2+20} y2={437+off*0.5} stroke="white" strokeWidth="1.2" strokeOpacity="0.35" />
          ))}
          {/* Brand swoosh hint */}
          <path d="M90,460 Q115,450 150,455" fill="none" stroke="white" strokeWidth="1.5" strokeOpacity="0.2" />
          {/* Boot glow edge */}
          <path d="M76,478 C68,488 64,498 72,500 L158,498 C170,496 172,486 162,470 C158,455 158,438 120,436 C82,436 80,430 80,430" fill="none" stroke="#22d3ee" strokeWidth="0.8" strokeOpacity="0.35" />

          {/* Cyan energy lines on leg */}
          <line x1="90" y1="270" x2="160" y2="268" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.2" />
          <line x1="87" y1="310" x2="158" y2="308" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.15" />
        </svg>
      </motion.div>

      {/* Neon ball at boot */}
      <AnimatePresence>
        {show && (
          <motion.div
            animate={ballCtrl}
            style={{ position: "absolute", bottom: 52, left: 130 }}
          >
            {/* Neon glow halo */}
            <div style={{ position: "absolute", inset: -20, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.45) 0%, transparent 70%)", filter: "blur(8px)" }} />
            <NeonBall size={96} />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Energy sparks near ball */}
      {[...Array(6)].map((_, i) => (
        <motion.div
          key={i}
          style={{
            position: "absolute",
            bottom: 70 + Math.sin(i * 60 * Math.PI / 180) * 30,
            left:  148 + Math.cos(i * 60 * Math.PI / 180) * 40,
            width: 3, height: 3,
            borderRadius: "50%",
            background: "#22d3ee",
          }}
          animate={{ opacity: [0, 1, 0], scale: [0, 1.5, 0] }}
          transition={{ duration: 1.5, repeat: Infinity, delay: i * 0.25, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}

// ─── Player Analytics Card (derecha) ─────────────────────────────────────────

function AnalyticsCard() {
  return (
    <motion.div
      animate={{ y: [0, -10, 0], rotate: [3, 1, 3] }}
      transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute", bottom: "12%", right: "4%",
        width: 130,
        background: "rgba(8,14,32,0.85)",
        border: "1px solid rgba(34,211,238,0.3)",
        borderRadius: 14,
        padding: "12px 14px",
        backdropFilter: "blur(12px)",
        boxShadow: "0 0 24px rgba(34,211,238,0.12), 0 0 50px rgba(124,58,237,0.08)",
        zIndex: 5,
      }}
    >
      {/* Player avatar */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <div style={{ width: 32, height: 32, borderRadius: "50%", overflow: "hidden", border: "1.5px solid rgba(34,211,238,0.5)", flexShrink: 0 }}>
          <img src={player1} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} />
        </div>
        <div>
          <div style={{ fontSize: 8, color: "rgba(255,255,255,0.5)", textTransform: "uppercase", letterSpacing: 1 }}>Scout ID</div>
          <div style={{ fontSize: 11, color: "#22d3ee", fontWeight: 800 }}>VSI 87</div>
        </div>
      </div>

      {/* Heatmap mini */}
      <div style={{ height: 36, background: "rgba(255,255,255,0.04)", borderRadius: 6, marginBottom: 8, overflow: "hidden", position: "relative" }}>
        {/* Heatmap blobs */}
        {[[40,18,20,"rgba(255,50,50,0.7)"],[65,12,16,"rgba(255,140,0,0.6)"],[55,24,12,"rgba(255,200,0,0.4)"],[30,10,14,"rgba(34,211,238,0.5)"]].map(([x,y,r,c],i) => (
          <div key={i} style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width:r as number, height:r as number, borderRadius:"50%", background: c as string, filter:"blur(5px)", transform:"translate(-50%,-50%)" }} />
        ))}
        <div style={{ position:"absolute", inset:0, display:"grid", gridTemplateColumns:"repeat(6,1fr)", gridTemplateRows:"repeat(3,1fr)", opacity:0.15 }}>
          {Array.from({length:18}).map((_,i)=>(
            <div key={i} style={{border:"0.5px solid rgba(34,211,238,0.3)"}} />
          ))}
        </div>
      </div>

      {/* Stats bars */}
      {[["Veloc.", 84, "#22d3ee"], ["Técnica", 91, "#a78bfa"], ["Defensa", 73, "#34d399"]].map(([label, val, color]) => (
        <div key={label as string} style={{ marginBottom: 5 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
            <span style={{ fontSize:7, color:"rgba(255,255,255,0.45)" }}>{label}</span>
            <span style={{ fontSize:7, color: color as string, fontWeight:700 }}>{val}</span>
          </div>
          <div style={{ height:2, background:"rgba(255,255,255,0.08)", borderRadius:1 }}>
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${val}%` }}
              transition={{ duration: 1.2, delay: 0.5, ease: "easeOut" }}
              style={{ height:"100%", background:`linear-gradient(90deg, ${color}, rgba(255,255,255,0.3))`, borderRadius:1 }}
            />
          </div>
        </div>
      ))}

      {/* Live indicator */}
      <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:8 }}>
        <motion.div
          animate={{ opacity:[1,0.3,1] }}
          transition={{ duration:1.2, repeat:Infinity }}
          style={{ width:5, height:5, borderRadius:"50%", background:"#22d3ee" }}
        />
        <span style={{ fontSize:7, color:"rgba(34,211,238,0.7)", letterSpacing:1, textTransform:"uppercase" }}>Live tracking</span>
      </div>
    </motion.div>
  );
}

// ─── Data Stream (fondo) ──────────────────────────────────────────────────────

function DataStream({ x, delay }: { x: string; delay: number }) {
  const chars = "01VITAS87ABCDEF0123456789".split("");
  return (
    <motion.div
      style={{ position:"absolute", left:x, top:"-5%", display:"flex", flexDirection:"column", gap:4, pointerEvents:"none" }}
      animate={{ y: ["0%","110%"] }}
      transition={{ duration: 8 + delay * 3, repeat:Infinity, ease:"linear", delay }}
    >
      {chars.slice(0, 12).map((c, i) => (
        <span key={i} style={{ fontSize: 9, color:"rgba(34,211,238,0.25)", fontFamily:"monospace", lineHeight:1.2 }}>{c}</span>
      ))}
    </motion.div>
  );
}

// ─── Scan Line ────────────────────────────────────────────────────────────────

function ScanLine() {
  return (
    <motion.div
      style={{ position:"fixed", left:0, right:0, height:1, background:"linear-gradient(90deg, transparent, rgba(34,211,238,0.4), transparent)", zIndex:1, pointerEvents:"none" }}
      animate={{ top:["0%","100%"] }}
      transition={{ duration:6, repeat:Infinity, ease:"linear" }}
    />
  );
}

// ─── Floating Particle ────────────────────────────────────────────────────────

function Dot({ x, y, size, delay }: { x:string; y:string; size:number; delay:number }) {
  return (
    <motion.div
      style={{ position:"absolute", left:x, top:y, width:size, height:size, borderRadius:"50%", background:"rgba(34,211,238,0.7)", pointerEvents:"none" }}
      animate={{ y:[0,-28,0], opacity:[0.3,1,0.3] }}
      transition={{ duration:3+delay, repeat:Infinity, ease:"easeInOut", delay }}
    />
  );
}

// ─── Pulse Ring ───────────────────────────────────────────────────────────────

function PulseRing({ style }: { style: React.CSSProperties }) {
  return (
    <motion.div
      style={{ position:"absolute", borderRadius:"50%", border:"1px solid rgba(34,211,238,0.5)", ...style }}
      animate={{ scale:[1,1.6,1], opacity:[0.5,0,0.5] }}
      transition={{ duration:2.5, repeat:Infinity, ease:"easeOut" }}
    />
  );
}

// ─── Main Page ─────────────────────────────────────────────────────────────────

export default function LoginPage() {
  const navigate   = useNavigate();
  const location   = useLocation();
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

      {/* ── Background ── */}
      <div className="absolute inset-0">
        <img src={pitchField} alt="" className="w-full h-full object-cover" style={{ objectPosition:"60% 40%", filter:"brightness(0.22) saturate(0.5) hue-rotate(180deg)" }} />
        <div className="absolute inset-0" style={{ background:"linear-gradient(160deg, rgba(4,8,20,0.95) 0%, rgba(6,12,28,0.80) 45%, rgba(4,8,20,0.95) 100%)" }} />
        {/* Radial glow spots */}
        <div className="absolute" style={{ left:"-8%", bottom:"0%",  width:500, height:500, background:"radial-gradient(circle, rgba(34,211,238,0.13) 0%, transparent 65%)", borderRadius:"50%" }} />
        <div className="absolute" style={{ right:"5%",  top:"10%",   width:420, height:420, background:"radial-gradient(circle, rgba(124,58,237,0.1) 0%, transparent 65%)", borderRadius:"50%" }} />
        <div className="absolute" style={{ left:"35%",  bottom:"5%", width:300, height:300, background:"radial-gradient(circle, rgba(34,211,238,0.06) 0%, transparent 70%)", borderRadius:"50%" }} />
      </div>

      {/* ── Scan line ── */}
      <ScanLine />

      {/* ── Grid ── */}
      <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage:"linear-gradient(rgba(34,211,238,0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(34,211,238,0.035) 1px, transparent 1px)", backgroundSize:"52px 52px" }} />

      {/* ── Data streams ── */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <DataStream x="5%"  delay={0}   />
        <DataStream x="92%" delay={1.5} />
        <DataStream x="18%" delay={3}   />
        <DataStream x="82%" delay={0.8} />
      </div>

      {/* ── Floating dots ── */}
      <Dot x="12%" y="18%" size={3} delay={0}   />
      <Dot x="22%" y="65%" size={2} delay={1.3} />
      <Dot x="78%" y="12%" size={3} delay={0.6} />
      <Dot x="86%" y="72%" size={2} delay={1.9} />
      <Dot x="94%" y="40%" size={2} delay={0.4} />
      <Dot x="6%"  y="82%" size={2} delay={2.2} />
      <Dot x="68%" y="88%" size={3} delay={1.1} />

      {/* ── Left: Boot + Neon Ball ── */}
      <BootScene />

      {/* ── Right: Wireframe balls ── */}
      <div className="absolute inset-0 pointer-events-none hidden md:block" style={{ zIndex:4 }}>
        <WireframeBall size={195} style={{ right:"5%",  top:"4%"  }} delay={0}   />
        <WireframeBall size={95}  style={{ right:"26%", top:"34%" }} delay={1.8} />
        <WireframeBall size={55}  style={{ right:"4%",  top:"50%" }} delay={0.9} />
        {/* Pulse rings around main ball */}
        <PulseRing style={{ right:"3%", top:"2%", width:220, height:220 }} />
        {/* Analytics card */}
        <AnalyticsCard />
        {/* Mini stat badges floating */}
        <motion.div
          animate={{ y:[0,-8,0], opacity:[0.7,1,0.7] }}
          transition={{ duration:3.5, repeat:Infinity, ease:"easeInOut", delay:0.5 }}
          style={{ position:"absolute", right:"30%", top:"20%",
            background:"rgba(8,14,32,0.8)", border:"1px solid rgba(34,211,238,0.3)",
            borderRadius:8, padding:"5px 10px", backdropFilter:"blur(8px)" }}
        >
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <Activity size={10} color="#22d3ee" />
            <span style={{ fontSize:9, color:"#22d3ee", fontWeight:700 }}>PHV +0.38</span>
          </div>
        </motion.div>
        <motion.div
          animate={{ y:[0,-12,0], opacity:[0.7,1,0.7] }}
          transition={{ duration:4, repeat:Infinity, ease:"easeInOut", delay:1.2 }}
          style={{ position:"absolute", right:"8%", top:"44%",
            background:"rgba(8,14,32,0.8)", border:"1px solid rgba(124,58,237,0.35)",
            borderRadius:8, padding:"5px 10px", backdropFilter:"blur(8px)" }}
        >
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <TrendingUp size={10} color="#a78bfa" />
            <span style={{ fontSize:9, color:"#a78bfa", fontWeight:700 }}>VAEP +0.142</span>
          </div>
        </motion.div>
        <motion.div
          animate={{ y:[0,-9,0], opacity:[0.6,1,0.6] }}
          transition={{ duration:3.8, repeat:Infinity, ease:"easeInOut", delay:0.3 }}
          style={{ position:"absolute", right:"22%", top:"56%",
            background:"rgba(8,14,32,0.8)", border:"1px solid rgba(52,211,153,0.35)",
            borderRadius:8, padding:"5px 10px", backdropFilter:"blur(8px)" }}
        >
          <div style={{ display:"flex", alignItems:"center", gap:5 }}>
            <Shield size={10} color="#34d399" />
            <span style={{ fontSize:9, color:"#34d399", fontWeight:700 }}>Elite Tier</span>
          </div>
        </motion.div>
      </div>

      {/* ── Login Card ── */}
      <motion.div
        initial={{ opacity:0, y:28 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.65, ease:"easeOut" }}
        className="relative z-10 w-full max-w-sm mx-4"
      >
        <div style={{
          background: "rgba(6,11,26,0.88)",
          border: "1px solid rgba(34,211,238,0.28)",
          borderRadius: 22,
          padding: "38px 34px",
          backdropFilter: "blur(24px)",
          boxShadow: "0 0 50px rgba(34,211,238,0.12), 0 0 100px rgba(124,58,237,0.07), inset 0 1px 0 rgba(255,255,255,0.07), inset 0 -1px 0 rgba(34,211,238,0.05)",
        }}>

          {/* Header corner accents */}
          <div style={{ position:"absolute", top:12, left:12,  width:14, height:14, borderTop:"2px solid rgba(34,211,238,0.6)", borderLeft:"2px solid rgba(34,211,238,0.6)", borderRadius:"2px 0 0 0" }} />
          <div style={{ position:"absolute", top:12, right:12, width:14, height:14, borderTop:"2px solid rgba(34,211,238,0.6)", borderRight:"2px solid rgba(34,211,238,0.6)", borderRadius:"0 2px 0 0" }} />
          <div style={{ position:"absolute", bottom:12, left:12,  width:14, height:14, borderBottom:"2px solid rgba(34,211,238,0.6)", borderLeft:"2px solid rgba(34,211,238,0.6)", borderRadius:"0 0 0 2px" }} />
          <div style={{ position:"absolute", bottom:12, right:12, width:14, height:14, borderBottom:"2px solid rgba(34,211,238,0.6)", borderRight:"2px solid rgba(34,211,238,0.6)", borderRadius:"0 0 2px 0" }} />

          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:24 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:9, marginBottom:12 }}>
              <motion.div
                animate={{ boxShadow:["0 0 8px rgba(34,211,238,0.4)","0 0 20px rgba(34,211,238,0.7)","0 0 8px rgba(34,211,238,0.4)"] }}
                transition={{ duration:2, repeat:Infinity }}
                style={{ width:38, height:38, borderRadius:11, background:"linear-gradient(135deg, rgba(34,211,238,0.25), rgba(124,58,237,0.25))", border:"1px solid rgba(34,211,238,0.5)", display:"flex", alignItems:"center", justifyContent:"center" }}
              >
                <Zap size={18} color="#22d3ee" />
              </motion.div>
              <span style={{ color:"#22d3ee", fontWeight:800, fontSize:17, letterSpacing:1 }}>Vitas</span>
            </div>

            <h1 style={{
              fontSize: 21, fontWeight:900, letterSpacing:2, textTransform:"uppercase",
              background:"linear-gradient(90deg, #22d3ee 0%, #a78bfa 50%, #22d3ee 100%)",
              backgroundSize:"200%",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              lineHeight:1.25, marginBottom:8,
              animation:"shimmer 3s linear infinite",
            }}>
              VITAS: HOLOGRAPHIC<br />PORTAL LOGIN
            </h1>
            <p style={{ color:"rgba(255,255,255,0.38)", fontSize:9.5, letterSpacing:2.5, textTransform:"uppercase" }}>
              Accede a tu academia de scouting
            </p>
          </div>

          {/* Divider line */}
          <div style={{ height:1, background:"linear-gradient(90deg, transparent, rgba(34,211,238,0.3), transparent)", marginBottom:22 }} />

          {/* Offline warning */}
          {!configured && (
            <div style={{ display:"flex", gap:8, padding:"10px 12px", borderRadius:10, background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.2)", marginBottom:16 }}>
              <AlertCircle size={12} color="#fbbf24" style={{ flexShrink:0, marginTop:1 }} />
              <p style={{ fontSize:10, color:"rgba(255,255,255,0.45)", margin:0 }}>Modo offline — configura Supabase en .env</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:9, color:"#22d3ee", letterSpacing:2, textTransform:"uppercase", fontWeight:800, display:"block", marginBottom:7 }}>Email</label>
              <input
                type="email" value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="usuario@vitas.ai"
                autoComplete="email"
                style={{ width:"100%", padding:"12px 14px", borderRadius:11, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(34,211,238,0.28)", color:"rgba(255,255,255,0.85)", fontSize:13, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                onFocus={(e) => { e.target.style.borderColor="rgba(34,211,238,0.75)"; e.target.style.boxShadow="0 0 16px rgba(34,211,238,0.15)"; }}
                onBlur={(e)  => { e.target.style.borderColor="rgba(34,211,238,0.28)"; e.target.style.boxShadow="none"; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom:6 }}>
              <label style={{ fontSize:9, color:"#22d3ee", letterSpacing:2, textTransform:"uppercase", fontWeight:800, display:"block", marginBottom:7 }}>Contraseña</label>
              <div style={{ position:"relative" }}>
                <input
                  type={showPw ? "text" : "password"} value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  style={{ width:"100%", padding:"12px 42px 12px 14px", borderRadius:11, background:"rgba(255,255,255,0.04)", border:"1px solid rgba(34,211,238,0.28)", color:"rgba(255,255,255,0.85)", fontSize:13, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                  onFocus={(e) => { e.target.style.borderColor="rgba(34,211,238,0.75)"; e.target.style.boxShadow="0 0 16px rgba(34,211,238,0.15)"; }}
                  onBlur={(e)  => { e.target.style.borderColor="rgba(34,211,238,0.28)"; e.target.style.boxShadow="none"; }}
                />
                <button type="button" onClick={() => setShowPw(!showPw)} style={{ position:"absolute", right:13, top:"50%", transform:"translateY(-50%)", color:"rgba(34,211,238,0.55)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  {showPw ? <EyeOff size={14}/> : <Eye size={14}/>}
                </button>
              </div>
              <div style={{ textAlign:"right", marginTop:7 }}>
                <Link to="/forgot-password" style={{ fontSize:10, color:"rgba(34,211,238,0.55)", textDecoration:"none" }}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            {/* Error */}
            <AnimatePresence>
              {error && (
                <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                  style={{ display:"flex", gap:8, padding:"9px 12px", borderRadius:10, background:"rgba(239,68,68,0.09)", border:"1px solid rgba(239,68,68,0.25)", marginBottom:12 }}>
                  <AlertCircle size={12} color="#ef4444" style={{ flexShrink:0 }} />
                  <p style={{ fontSize:11, color:"#ef4444", margin:0 }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Submit */}
            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale:1.025, boxShadow:"0 0 32px rgba(34,211,238,0.45)" }}
              whileTap={{ scale:0.975 }}
              style={{
                width:"100%", padding:"13px", marginTop:8, borderRadius:12,
                background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(90deg, #7c3aed 0%, #22d3ee 100%)",
                border:"none", color:"white", fontWeight:900, fontSize:13, letterSpacing:4,
                textTransform:"uppercase", cursor: loading ? "not-allowed" : "pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow: loading ? "none" : "0 0 24px rgba(34,211,238,0.28)",
                transition:"background 0.3s",
              }}
            >
              {loading ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }} />Entrando…</> : "ENTRAR"}
            </motion.button>
          </form>

          <p style={{ textAlign:"center", marginTop:20, fontSize:11, color:"rgba(255,255,255,0.35)" }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" style={{ color:"#22d3ee", textDecoration:"none", fontWeight:800 }}>Crear academia</Link>
          </p>
        </div>

        <p style={{ textAlign:"center", marginTop:14, fontSize:9, color:"rgba(34,211,238,0.32)", letterSpacing:3, textTransform:"uppercase" }}>
          VITAS V2.0 · Football Intelligence Platform
        </p>
      </motion.div>

      {/* ── Global CSS for shimmer & spin ── */}
      <style>{`
        @keyframes shimmer { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes spin { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        @keyframes pulse-glow { 0%,100%{opacity:0.6} 50%{opacity:1} }
        input::placeholder { color: rgba(255,255,255,0.22) !important; }
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
