/**
 * VITAS — Holographic Portal Login v3
 * Bota animada (zoom + drift) + balones de fútbol flotantes + wireframe balls grandes
 */

import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap, Activity, TrendingUp, Shield, Star } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import bootBg  from "@/assets/login-boot-neon.jpg";
import player1 from "@/assets/player-1.png";

// ─── Soccer Ball (con pentagones reales + glow neon) ─────────────────────────

function SoccerBall({
  size = 100,
  style,
  delay = 0,
  floatY = 20,
  glowColor = "#22d3ee",
  spin = false,
}: {
  size?: number; style?: React.CSSProperties; delay?: number;
  floatY?: number; glowColor?: string; spin?: boolean;
}) {
  const cx = size / 2, cy = size / 2, r = size * 0.44;

  // Pentagon centrado + 5 pentagonos alrededor (patrón balón fútbol)
  function pentagon(px: number, py: number, pr: number, rot: number) {
    const pts = Array.from({ length: 5 }, (_, i) => {
      const a = ((i * 72 + rot) * Math.PI) / 180;
      return `${px + pr * Math.cos(a)},${py + pr * Math.sin(a)}`;
    }).join(" ");
    return pts;
  }

  const patches = [
    { px: cx,                          py: cy,                          pr: r * 0.28, rot: -90, dark: true  },
    ...([0, 72, 144, 216, 288].map(a => ({
      px: cx + r * 0.56 * Math.cos((a * Math.PI) / 180),
      py: cy + r * 0.56 * Math.sin((a * Math.PI) / 180),
      pr: r * 0.22, rot: a + 36, dark: true,
    }))),
    ...([36, 108, 180, 252, 324].map(a => ({
      px: cx + r * 0.88 * Math.cos((a * Math.PI) / 180),
      py: cy + r * 0.88 * Math.sin((a * Math.PI) / 180),
      pr: r * 0.16, rot: a, dark: false,
    }))),
  ];

  const id = `sb${delay}${size}`;

  return (
    <motion.div
      style={{ position: "absolute", ...style }}
      animate={{
        y:      [0, -floatY, 0],
        x:      [0, floatY * 0.25, 0],
        rotate: spin ? [0, 360] : [0, 8, -5, 0],
      }}
      transition={{
        duration:   spin ? 6 + delay : 5 + delay,
        repeat:     Infinity,
        ease:       spin ? "linear" : "easeInOut",
        delay,
      }}
    >
      {/* Outer glow halo */}
      <div style={{
        position: "absolute", inset: -size * 0.22, borderRadius: "50%",
        background: `radial-gradient(circle, ${glowColor}33 0%, transparent 70%)`,
        filter: "blur(8px)",
      }} />
      {/* Pulse ring */}
      <motion.div
        style={{ position: "absolute", inset: -8, borderRadius: "50%", border: `1px solid ${glowColor}55` }}
        animate={{ scale: [1, 1.25, 1], opacity: [0.6, 0, 0.6] }}
        transition={{ duration: 2.5, repeat: Infinity, ease: "easeOut", delay: delay + 0.5 }}
      />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`bg${id}`} cx="42%" cy="36%" r="65%">
            <stop offset="0%"   stopColor="#d0f8ff" stopOpacity="0.95" />
            <stop offset="40%"  stopColor="#7ee8fa" stopOpacity="0.75" />
            <stop offset="75%"  stopColor={glowColor} stopOpacity="0.5" />
            <stop offset="100%" stopColor="#060c1e"  stopOpacity="0.85" />
          </radialGradient>
          <radialGradient id={`pg${id}`} cx="40%" cy="35%" r="60%">
            <stop offset="0%"   stopColor="#0a1830" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#040c1e" stopOpacity="1"   />
          </radialGradient>
          <filter id={`gf${id}`}>
            <feGaussianBlur stdDeviation="2.5" result="b"/>
            <feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge>
          </filter>
        </defs>

        {/* Ball body */}
        <circle cx={cx} cy={cy} r={r}     fill={`url(#bg${id})`} />
        <circle cx={cx} cy={cy} r={r}     fill="none" stroke={glowColor} strokeWidth="1.5" strokeOpacity="0.8" filter={`url(#gf${id})`} />
        <circle cx={cx} cy={cy} r={r + 5} fill="none" stroke={glowColor} strokeWidth="0.5" strokeOpacity="0.25" />

        {/* Pentagon patches */}
        {patches.map((p, i) => (
          <polygon key={i}
            points={pentagon(p.px, p.py, p.pr, p.rot)}
            fill={p.dark ? `url(#pg${id})` : "none"}
            stroke={glowColor}
            strokeWidth={p.dark ? "0.8" : "0.5"}
            strokeOpacity={p.dark ? "0.7" : "0.35"}
          />
        ))}

        {/* Highlight */}
        <ellipse
          cx={cx * 0.74} cy={cy * 0.62} rx={r * 0.22} ry={r * 0.12}
          fill="white" fillOpacity="0.28"
          transform={`rotate(-28 ${cx * 0.74} ${cy * 0.62})`}
        />
        {/* Ground reflection dot */}
        <ellipse cx={cx} cy={cy + r * 0.72} rx={r * 0.18} ry={r * 0.06}
          fill={glowColor} fillOpacity="0.15" />
      </svg>
    </motion.div>
  );
}

// ─── Wireframe Ball (grande, tipo holograma) ──────────────────────────────────

function WireframeBall({ size = 200, style, delay = 0 }: {
  size?: number; style?: React.CSSProperties; delay?: number;
}) {
  const cx = size / 2, cy = size / 2, r = size * 0.43;
  const lats = [-0.6, -0.35, -0.1, 0.18, 0.45, 0.68];
  const lons = [0, 25, 50, 75, 100, 125, 150, 175];

  const nodes: { x: number; y: number }[] = [];
  [-0.55, 0, 0.55].forEach(t => {
    const ny = cy + r * t;
    const nr = Math.sqrt(Math.max(0, r * r - (r * t) ** 2));
    [0, 60, 120, 180, 240, 300].forEach(deg =>
      nodes.push({ x: cx + nr * Math.cos(deg * Math.PI / 180), y: ny })
    );
  });

  const id = `wf${delay}${size}`;

  return (
    <motion.div
      style={{ position: "absolute", ...style }}
      animate={{ y: [0, -24, 0], rotate: [0, 7, -4, 0] }}
      transition={{ duration: 6 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      <motion.div
        style={{ position: "absolute", inset: -20, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.35)" }}
        animate={{ scale: [1, 1.18, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 3, repeat: Infinity, ease: "easeOut" }}
      />
      <div style={{ position: "absolute", inset: -12, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.14) 0%, transparent 70%)", filter: "blur(8px)" }} />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={id} cx="42%" cy="36%" r="62%">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.2"  />
            <stop offset="55%"  stopColor="#7c3aed" stopOpacity="0.1"  />
            <stop offset="100%" stopColor="#040c1e" stopOpacity="0.65" />
          </radialGradient>
          <filter id={`f${id}`}><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx={cx} cy={cy} r={r}    fill={`url(#${id})`} />
        <circle cx={cx} cy={cy} r={r}    fill="none" stroke="#22d3ee" strokeWidth="1.3" strokeOpacity="0.7" filter={`url(#f${id})`} />
        <circle cx={cx} cy={cy} r={r+7}  fill="none" stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.18" />
        <circle cx={cx} cy={cy} r={r+18} fill="none" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.12" />

        {lats.map((t, i) => {
          const ny = cy + r * t;
          const nr = Math.sqrt(Math.max(0, r*r - (r*t)**2));
          return <ellipse key={i} cx={cx} cy={ny} rx={nr} ry={nr*0.26}
            fill="none" stroke="#22d3ee" strokeWidth="0.55" strokeOpacity="0.38" />;
        })}
        {lons.map((deg, i) => (
          <ellipse key={i} cx={cx} cy={cy}
            rx={r * Math.abs(Math.cos(deg*Math.PI/180)) || r*0.04} ry={r}
            fill="none" stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.25"
            transform={`rotate(${deg} ${cx} ${cy})`} />
        ))}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r="2.5" fill="#22d3ee" fillOpacity="0.8" filter={`url(#f${id})`} />
        ))}
        <ellipse cx={cx} cy={cy} rx={r+26} ry={r*0.15}
          fill="none" stroke="#22d3ee" strokeWidth="0.7" strokeOpacity="0.3" strokeDasharray="5 8" />
        <ellipse cx={cx*0.76} cy={cy*0.63} rx={r*0.19} ry={r*0.1}
          fill="white" fillOpacity="0.12" transform={`rotate(-22 ${cx*0.76} ${cy*0.63})`} />
        <circle cx={cx} cy={cy} r="3.5" fill="#22d3ee" fillOpacity="0.9" filter={`url(#f${id})`} />
      </svg>
    </motion.div>
  );
}

// ─── Analytics Card ───────────────────────────────────────────────────────────

function AnalyticsCard() {
  return (
    <motion.div
      animate={{ y: [0, -14, 0], rotate: [2.5, 0.5, 2.5] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute", bottom: "8%", right: "2.5%",
        width: 138, background: "rgba(5,10,26,0.9)",
        border: "1px solid rgba(34,211,238,0.35)", borderRadius: 14,
        padding: "13px 14px", backdropFilter: "blur(16px)",
        boxShadow: "0 0 32px rgba(34,211,238,0.16)", zIndex: 6,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:8, marginBottom:10 }}>
        <div style={{ width:33, height:33, borderRadius:"50%", overflow:"hidden", border:"1.5px solid rgba(34,211,238,0.55)", flexShrink:0 }}>
          <img src={player1} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top" }} />
        </div>
        <div>
          <div style={{ fontSize:7.5, color:"rgba(255,255,255,0.38)", textTransform:"uppercase", letterSpacing:1 }}>Scout ID</div>
          <div style={{ fontSize:13, color:"#22d3ee", fontWeight:900 }}>VSI 87</div>
        </div>
      </div>
      <div style={{ height:34, background:"rgba(255,255,255,0.03)", borderRadius:7, marginBottom:9, overflow:"hidden", position:"relative" }}>
        {([[42,16,20,"rgba(255,40,40,0.75)"],[63,10,16,"rgba(255,130,0,0.65)"],[52,22,12,"rgba(255,200,0,0.45)"],[28,10,14,"rgba(34,211,238,0.55)"]] as [number,number,number,string][]).map(([x,y,r,c],i)=>(
          <div key={i} style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width:r, height:r, borderRadius:"50%", background:c, filter:"blur(4px)", transform:"translate(-50%,-50%)" }} />
        ))}
        <div style={{ position:"absolute", inset:0, display:"grid", gridTemplateColumns:"repeat(6,1fr)", gridTemplateRows:"repeat(3,1fr)", opacity:0.12 }}>
          {Array.from({length:18}).map((_,i)=><div key={i} style={{ border:"0.5px solid rgba(34,211,238,0.4)" }} />)}
        </div>
      </div>
      {[["Veloc.", 84,"#22d3ee"],["Técnica", 91,"#a78bfa"],["Defensa", 73,"#34d399"]].map(([l,v,c])=>(
        <div key={l as string} style={{ marginBottom:5 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
            <span style={{ fontSize:7.5, color:"rgba(255,255,255,0.38)" }}>{l}</span>
            <span style={{ fontSize:7.5, color:c as string, fontWeight:700 }}>{v}</span>
          </div>
          <div style={{ height:2.5, background:"rgba(255,255,255,0.07)", borderRadius:2 }}>
            <motion.div initial={{ width:0 }} animate={{ width:`${v}%` }} transition={{ duration:1.5, delay:0.7, ease:"easeOut" }}
              style={{ height:"100%", background:`linear-gradient(90deg,${c},rgba(255,255,255,0.3))`, borderRadius:2 }} />
          </div>
        </div>
      ))}
      <div style={{ display:"flex", alignItems:"center", gap:5, marginTop:8 }}>
        <motion.div animate={{ opacity:[1,0.2,1] }} transition={{ duration:1.1, repeat:Infinity }}
          style={{ width:6, height:6, borderRadius:"50%", background:"#22d3ee" }} />
        <span style={{ fontSize:7.5, color:"rgba(34,211,238,0.7)", letterSpacing:1, textTransform:"uppercase" }}>Live tracking</span>
      </div>
    </motion.div>
  );
}

// ─── Floating Badge ───────────────────────────────────────────────────────────

function Badge({ icon, text, color, style, delay }: {
  icon: React.ReactNode; text: string; color: string;
  style: React.CSSProperties; delay: number;
}) {
  return (
    <motion.div
      animate={{ y:[0,-12,0], opacity:[0.7,1,0.7] }}
      transition={{ duration:4+delay, repeat:Infinity, ease:"easeInOut", delay }}
      style={{ position:"absolute", background:"rgba(5,10,26,0.85)",
        border:`1px solid ${color}44`, borderRadius:10, padding:"6px 11px",
        backdropFilter:"blur(12px)", display:"flex", alignItems:"center",
        gap:6, zIndex:6, ...style }}
    >
      {icon}
      <span style={{ fontSize:9.5, color, fontWeight:700 }}>{text}</span>
    </motion.div>
  );
}

// ─── Scan Line ────────────────────────────────────────────────────────────────

function ScanLine() {
  return (
    <motion.div
      style={{ position:"fixed", left:0, right:0, height:2,
        background:"linear-gradient(90deg,transparent 0%,rgba(34,211,238,0.3) 25%,rgba(34,211,238,0.65) 50%,rgba(34,211,238,0.3) 75%,transparent 100%)",
        zIndex:2, pointerEvents:"none" }}
      animate={{ top:["-2%","102%"] }}
      transition={{ duration:7.5, repeat:Infinity, ease:"linear" }}
    />
  );
}

// ─── Data Stream ──────────────────────────────────────────────────────────────

function DataStream({ x, delay }: { x: string; delay: number }) {
  return (
    <motion.div
      style={{ position:"absolute", left:x, top:"-5%", display:"flex",
        flexDirection:"column", gap:5, pointerEvents:"none", zIndex:1 }}
      animate={{ y:["0%","108%"] }}
      transition={{ duration:10+delay*3, repeat:Infinity, ease:"linear", delay }}
    >
      {"01VITAS87ABCDEF9".split("").slice(0,14).map((c,i)=>(
        <span key={i} style={{ fontSize:9, color:"rgba(34,211,238,0.22)", fontFamily:"monospace" }}>{c}</span>
      ))}
    </motion.div>
  );
}

// ─── Main ─────────────────────────────────────────────────────────────────────

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

      {/* ── Background: bota neon ANIMADA (zoom + drift lento) ── */}
      <div className="absolute inset-0">
        <motion.img
          src={bootBg}
          alt=""
          style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"30% center", filter:"brightness(0.5) saturate(1.15)" }}
          animate={{
            scale:  [1, 1.06, 1.02, 1],
            x:      [0, -12, 6, 0],
            y:      [0, -6, 4, 0],
          }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
        />
        {/* Gradiente oscuro derecha */}
        <div className="absolute inset-0" style={{ background:"linear-gradient(108deg, rgba(4,9,22,0.2) 0%, rgba(4,9,22,0.42) 35%, rgba(4,9,22,0.78) 58%, rgba(4,9,22,0.93) 100%)" }} />
        {/* Cyan glow izquierda (bota) */}
        <div className="absolute" style={{ left:"-8%", bottom:"-8%", width:580, height:580, background:"radial-gradient(circle, rgba(34,211,238,0.2) 0%, transparent 65%)", borderRadius:"50%", pointerEvents:"none" }} />
        {/* Purple glow top-right */}
        <div className="absolute" style={{ right:"3%", top:"3%", width:420, height:420, background:"radial-gradient(circle, rgba(124,58,237,0.14) 0%, transparent 65%)", borderRadius:"50%", pointerEvents:"none" }} />
      </div>

      {/* ── Grid overlay ── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:"linear-gradient(rgba(34,211,238,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.03) 1px,transparent 1px)",
        backgroundSize:"54px 54px",
      }} />

      {/* ── Scan line ── */}
      <ScanLine />

      {/* ── Data streams ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <DataStream x="2.5%" delay={0}   />
        <DataStream x="95%"  delay={2.2} />
        <DataStream x="88%"  delay={4.1} />
      </div>

      {/* ── Balones de fútbol flotantes (visibles en toda la pantalla) ── */}
      {/* Izquierda arriba */}
      <SoccerBall size={90}  style={{ left:"4%",  top:"8%"  }} delay={0}   floatY={18} glowColor="#22d3ee" />
      {/* Izquierda centro */}
      <SoccerBall size={130} style={{ left:"2%",  top:"42%" }} delay={1.4} floatY={22} glowColor="#7c3aed" spin />
      {/* Izquierda abajo */}
      <SoccerBall size={70}  style={{ left:"8%",  bottom:"6%" }} delay={2.8} floatY={14} glowColor="#34d399" />
      {/* Derecha arriba (pequeño, detrás de wireframe) */}
      <SoccerBall size={80}  style={{ right:"28%", top:"6%"  }} delay={0.7} floatY={16} glowColor="#f472b6" />
      {/* Centro arriba */}
      <SoccerBall size={55}  style={{ left:"44%", top:"4%"  }} delay={3.2} floatY={12} glowColor="#22d3ee" />
      {/* Derecha abajo */}
      <SoccerBall size={65}  style={{ right:"16%", bottom:"4%" }} delay={1.9} floatY={15} glowColor="#a78bfa" spin />

      {/* ── Wireframe holographic balls (derecha, más grandes) ── */}
      <div className="absolute inset-0 pointer-events-none hidden md:block" style={{ zIndex:5 }}>
        <WireframeBall size={230} style={{ right:"3%",  top:"3%"  }} delay={0}   />
        <WireframeBall size={115} style={{ right:"26%", top:"30%" }} delay={1.6} />
        <WireframeBall size={72}  style={{ right:"2%",  top:"50%" }} delay={0.9} />
        <AnalyticsCard />
        <Badge icon={<Activity   size={11} color="#22d3ee"/>} text="PHV +0.38"   color="#22d3ee" delay={0.6} style={{ right:"28%", top:"20%" }} />
        <Badge icon={<TrendingUp size={11} color="#a78bfa"/>} text="VAEP +0.142" color="#a78bfa" delay={1.4} style={{ right:"5%",  top:"45%" }} />
        <Badge icon={<Shield     size={11} color="#34d399"/>} text="Elite Tier"  color="#34d399" delay={0.3} style={{ right:"20%", top:"59%" }} />
        <Badge icon={<Star       size={11} color="#f472b6"/>} text="Scout Pro"   color="#f472b6" delay={2.1} style={{ right:"32%", top:"70%" }} />
      </div>

      {/* ── Login card ── */}
      <motion.div
        initial={{ opacity:0, y:28 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.65, ease:"easeOut" }}
        className="relative z-10 w-full"
        style={{ maxWidth:356, margin:"0 auto", padding:"0 16px" }}
      >
        <div style={{
          background: "rgba(4,9,24,0.82)",
          border: "1.5px solid rgba(34,211,238,0.3)",
          borderRadius: 20, padding: "38px 32px 30px",
          backdropFilter: "blur(24px)",
          boxShadow: "0 10px 70px rgba(0,0,0,0.65), 0 0 50px rgba(34,211,238,0.1), inset 0 1px 0 rgba(255,255,255,0.07)",
          position: "relative",
        }}>

          {/* Corner brackets */}
          {(["tl","tr","bl","br"] as const).map(k => {
            const t = k[0]==="t", l = k[1]==="l";
            return (
              <div key={k} style={{ position:"absolute",
                top:    t ? 11 : undefined, bottom: t ? undefined : 11,
                left:   l ? 11 : undefined, right:  l ? undefined  : 11,
                width:14, height:14,
                borderTop:    t ? "2px solid rgba(34,211,238,0.6)" : undefined,
                borderBottom: t ? undefined : "2px solid rgba(34,211,238,0.6)",
                borderLeft:   l ? "2px solid rgba(34,211,238,0.6)" : undefined,
                borderRight:  l ? undefined  : "2px solid rgba(34,211,238,0.6)",
              }} />
            );
          })}

          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:9, marginBottom:13 }}>
              <motion.div
                animate={{ boxShadow:["0 0 8px rgba(34,211,238,0.4)","0 0 26px rgba(34,211,238,0.85)","0 0 8px rgba(34,211,238,0.4)"] }}
                transition={{ duration:2.2, repeat:Infinity }}
                style={{ width:38, height:38, borderRadius:11,
                  background:"linear-gradient(135deg,rgba(34,211,238,0.22),rgba(124,58,237,0.22))",
                  border:"1.5px solid rgba(34,211,238,0.58)",
                  display:"flex", alignItems:"center", justifyContent:"center" }}
              >
                <Zap size={19} color="#22d3ee" />
              </motion.div>
              <span style={{ color:"rgba(255,255,255,0.93)", fontWeight:800, fontSize:17.5, letterSpacing:0.5 }}>Vitas</span>
            </div>

            <h1 style={{
              fontSize:20.5, fontWeight:900, letterSpacing:1.8, textTransform:"uppercase",
              background:"linear-gradient(90deg,#22d3ee 0%,#818cf8 40%,#c084fc 70%,#22d3ee 100%)",
              backgroundSize:"200%",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              lineHeight:1.22, marginBottom:7, animation:"shimmer 3.5s linear infinite",
            }}>
              VITAS: HOLOGRAPHIC<br/>PORTAL LOGIN
            </h1>
            <p style={{ color:"rgba(255,255,255,0.36)", fontSize:9.5, letterSpacing:2.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>
              Accede a tu academia de scouting
            </p>
          </div>

          {/* Divider */}
          <div style={{ height:1, background:"linear-gradient(90deg,transparent,rgba(34,211,238,0.38),transparent)", marginBottom:20 }} />

          {/* Offline warning */}
          {!configured && (
            <div style={{ display:"flex", gap:8, padding:"9px 12px", borderRadius:10,
              background:"rgba(251,191,36,0.07)", border:"1px solid rgba(251,191,36,0.22)", marginBottom:16 }}>
              <AlertCircle size={12} color="#fbbf24" style={{ flexShrink:0, marginTop:1 }} />
              <p style={{ fontSize:10, color:"rgba(255,255,255,0.42)", margin:0 }}>Modo offline — configura Supabase en .env</p>
            </div>
          )}

          <form onSubmit={handleSubmit}>
            {/* Email */}
            <div style={{ marginBottom:14 }}>
              <label style={{ fontSize:9, color:"rgba(255,255,255,0.48)", letterSpacing:2, textTransform:"uppercase", fontWeight:700, display:"block", marginBottom:7 }}>Email</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="usuario@vitas.ai" autoComplete="email"
                style={{ width:"100%", padding:"11px 14px", borderRadius:10,
                  background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(34,211,238,0.35)",
                  color:"white", fontSize:13, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                onFocus={e=>{ e.target.style.borderColor="rgba(34,211,238,0.88)"; e.target.style.boxShadow="0 0 20px rgba(34,211,238,0.2)"; }}
                onBlur={e=> { e.target.style.borderColor="rgba(34,211,238,0.35)"; e.target.style.boxShadow="none"; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom:6 }}>
              <label style={{ fontSize:9, color:"rgba(255,255,255,0.48)", letterSpacing:2, textTransform:"uppercase", fontWeight:700, display:"block", marginBottom:7 }}>Contraseña</label>
              <div style={{ position:"relative" }}>
                <input
                  type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••" autoComplete="current-password"
                  style={{ width:"100%", padding:"11px 40px 11px 14px", borderRadius:10,
                    background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(34,211,238,0.35)",
                    color:"white", fontSize:13, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                  onFocus={e=>{ e.target.style.borderColor="rgba(34,211,238,0.88)"; e.target.style.boxShadow="0 0 20px rgba(34,211,238,0.2)"; }}
                  onBlur={e=> { e.target.style.borderColor="rgba(34,211,238,0.35)"; e.target.style.boxShadow="none"; }}
                />
                <button type="button" onClick={()=>setShowPw(!showPw)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    color:"rgba(34,211,238,0.62)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              <div style={{ textAlign:"right", marginTop:7 }}>
                <Link to="/forgot-password" style={{ fontSize:11, color:"rgba(34,211,238,0.58)", textDecoration:"none" }}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            <AnimatePresence>
              {error && (
                <motion.div initial={{opacity:0,y:-4}} animate={{opacity:1,y:0}} exit={{opacity:0}}
                  style={{ display:"flex", gap:8, padding:"9px 12px", borderRadius:10,
                    background:"rgba(239,68,68,0.09)", border:"1px solid rgba(239,68,68,0.28)", marginBottom:12 }}>
                  <AlertCircle size={12} color="#ef4444" style={{ flexShrink:0 }}/>
                  <p style={{ fontSize:11, color:"#ef4444", margin:0 }}>{error}</p>
                </motion.div>
              )}
            </AnimatePresence>

            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale:1.03, boxShadow:"0 0 45px rgba(192,38,211,0.6), 0 0 75px rgba(34,211,238,0.22)" }}
              whileTap={{ scale:0.97 }}
              style={{
                width:"100%", padding:"13px", marginTop:10, borderRadius:12,
                background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(90deg,#c026d3 0%,#7c3aed 50%,#22d3ee 100%)",
                border:"none", color:"white", fontWeight:900, fontSize:14,
                letterSpacing:5, textTransform:"uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow:"0 0 32px rgba(192,38,211,0.48), 0 0 60px rgba(34,211,238,0.18)",
                transition:"background 0.3s",
              }}
            >
              {loading
                ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/>Entrando…</>
                : "ENTRAR"}
            </motion.button>
          </form>

          <p style={{ textAlign:"center", marginTop:18, fontSize:12, color:"rgba(255,255,255,0.34)" }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" style={{ color:"#22d3ee", textDecoration:"none", fontWeight:800 }}>Crear academia</Link>
          </p>
        </div>

        <p style={{ textAlign:"center", marginTop:13, fontSize:9, color:"rgba(34,211,238,0.3)", letterSpacing:3, textTransform:"uppercase" }}>
          VITAS V2.0 · Football Intelligence Platform
        </p>
      </motion.div>

      <style>{`
        @keyframes shimmer { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes spin    { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
        input::placeholder { color:rgba(255,255,255,0.18) !important; }
        input { font-family:system-ui,sans-serif; }
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
