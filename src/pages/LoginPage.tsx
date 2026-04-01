/**
 * VITAS — Holographic Portal Login
 * Fondo: bota neon (Bing Image Creator) + wireframe ball + card glassmorphism
 */

import { useState } from "react";
import { useNavigate, useLocation, Link } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Eye, EyeOff, Loader2, AlertCircle, Zap, Activity, TrendingUp, Shield } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";
import bootBg from "@/assets/login-boot-neon.jpg";
import player1  from "@/assets/player-1.png";

// ─── Wireframe Ball ────────────────────────────────────────────────────────────

function WireframeBall({ size = 180, style, delay = 0 }: {
  size?: number; style?: React.CSSProperties; delay?: number;
}) {
  const cx = size / 2, cy = size / 2, r = size * 0.43;
  const lats = [-0.55, -0.28, 0, 0.28, 0.55];
  const lons = [0, 30, 60, 90, 120, 150];

  const nodes: { x: number; y: number }[] = [];
  lats.forEach(t => {
    const ny = cy + r * t;
    const nr = Math.sqrt(Math.max(0, r * r - (r * t) ** 2));
    [0, 72, 144, 216, 288].forEach(deg => {
      nodes.push({ x: cx + nr * Math.cos(deg * Math.PI / 180), y: ny });
    });
  });

  return (
    <motion.div
      style={{ position: "absolute", ...style }}
      animate={{ y: [0, -20, 0], rotate: [0, 6, -4, 0] }}
      transition={{ duration: 5 + delay, repeat: Infinity, ease: "easeInOut", delay }}
    >
      {/* Outer pulse ring */}
      <motion.div
        style={{ position: "absolute", inset: -16, borderRadius: "50%", border: "1px solid rgba(34,211,238,0.4)" }}
        animate={{ scale: [1, 1.15, 1], opacity: [0.5, 0, 0.5] }}
        transition={{ duration: 2.8, repeat: Infinity, ease: "easeOut" }}
      />
      <div style={{ position: "absolute", inset: -8, borderRadius: "50%", background: "radial-gradient(circle, rgba(34,211,238,0.15) 0%, transparent 70%)", filter: "blur(6px)" }} />

      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <defs>
          <radialGradient id={`wg${delay}`} cx="42%" cy="36%" r="62%">
            <stop offset="0%"   stopColor="#22d3ee" stopOpacity="0.18" />
            <stop offset="55%"  stopColor="#7c3aed" stopOpacity="0.1"  />
            <stop offset="100%" stopColor="#060c1e" stopOpacity="0.6"  />
          </radialGradient>
          <filter id={`wf${delay}`}><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
        </defs>
        <circle cx={cx} cy={cy} r={r}    fill={`url(#wg${delay})`} />
        <circle cx={cx} cy={cy} r={r}    fill="none" stroke="#22d3ee" strokeWidth="1.2" strokeOpacity="0.65" filter={`url(#wf${delay})`} />
        <circle cx={cx} cy={cy} r={r+7}  fill="none" stroke="#22d3ee" strokeWidth="0.4" strokeOpacity="0.2" />
        <circle cx={cx} cy={cy} r={r+16} fill="none" stroke="#7c3aed" strokeWidth="0.3" strokeOpacity="0.15" />

        {/* Latitude ellipses */}
        {lats.map((t, i) => {
          const ny = cy + r * t;
          const nr = Math.sqrt(Math.max(0, r*r - (r*t)**2));
          return <ellipse key={i} cx={cx} cy={ny} rx={nr} ry={nr*0.26} fill="none" stroke="#22d3ee" strokeWidth="0.5" strokeOpacity="0.38" />;
        })}

        {/* Longitude ellipses */}
        {lons.map((deg, i) => (
          <ellipse key={i} cx={cx} cy={cy} rx={r * Math.abs(Math.cos(deg*Math.PI/180)) || r*0.05} ry={r}
            fill="none" stroke="#22d3ee" strokeWidth="0.45" strokeOpacity="0.28"
            transform={`rotate(${deg} ${cx} ${cy})`} />
        ))}

        {/* Nodes */}
        {nodes.map((n, i) => (
          <circle key={i} cx={n.x} cy={n.y} r="2.2" fill="#22d3ee" fillOpacity="0.75" filter={`url(#wf${delay})`} />
        ))}

        {/* Equatorial orbit ring */}
        <ellipse cx={cx} cy={cy} rx={r+22} ry={r*0.16} fill="none" stroke="#22d3ee" strokeWidth="0.6" strokeOpacity="0.3" strokeDasharray="5 7" />

        {/* Highlight */}
        <ellipse cx={cx*0.77} cy={cy*0.64} rx={r*0.2} ry={r*0.11} fill="white" fillOpacity="0.13" transform={`rotate(-22 ${cx*0.77} ${cy*0.64})`} />

        {/* Center cross */}
        <circle cx={cx} cy={cy} r="3" fill="#22d3ee" fillOpacity="0.9" filter={`url(#wf${delay})`} />
      </svg>
    </motion.div>
  );
}

// ─── Analytics Card ────────────────────────────────────────────────────────────

function AnalyticsCard() {
  return (
    <motion.div
      animate={{ y: [0, -12, 0], rotate: [2.5, 0.5, 2.5] }}
      transition={{ duration: 5.5, repeat: Infinity, ease: "easeInOut" }}
      style={{
        position: "absolute", bottom: "10%", right: "2%",
        width: 128,
        background: "rgba(6,11,28,0.88)",
        border: "1px solid rgba(34,211,238,0.32)",
        borderRadius: 13,
        padding: "12px 13px",
        backdropFilter: "blur(14px)",
        boxShadow: "0 0 28px rgba(34,211,238,0.14)",
        zIndex: 6,
      }}
    >
      <div style={{ display:"flex", alignItems:"center", gap:7, marginBottom:9 }}>
        <div style={{ width:30, height:30, borderRadius:"50%", overflow:"hidden", border:"1.5px solid rgba(34,211,238,0.5)", flexShrink:0 }}>
          <img src={player1} alt="" style={{ width:"100%", height:"100%", objectFit:"cover", objectPosition:"top" }} />
        </div>
        <div>
          <div style={{ fontSize:7.5, color:"rgba(255,255,255,0.42)", textTransform:"uppercase", letterSpacing:1 }}>Scout ID</div>
          <div style={{ fontSize:12, color:"#22d3ee", fontWeight:900 }}>VSI 87</div>
        </div>
      </div>

      {/* Heatmap */}
      <div style={{ height:32, background:"rgba(255,255,255,0.03)", borderRadius:6, marginBottom:8, overflow:"hidden", position:"relative" }}>
        {([[42,16,18,"rgba(255,40,40,0.75)"],[62,10,15,"rgba(255,130,0,0.6)"],[52,22,11,"rgba(255,200,0,0.45)"],[28,10,13,"rgba(34,211,238,0.5)"]] as [number,number,number,string][]).map(([x,y,r,c],i)=>(
          <div key={i} style={{ position:"absolute", left:`${x}%`, top:`${y}%`, width:r, height:r, borderRadius:"50%", background:c, filter:"blur(4px)", transform:"translate(-50%,-50%)" }} />
        ))}
        <div style={{ position:"absolute", inset:0, display:"grid", gridTemplateColumns:"repeat(6,1fr)", gridTemplateRows:"repeat(3,1fr)", opacity:0.12 }}>
          {Array.from({length:18}).map((_,i)=><div key={i} style={{ border:"0.5px solid rgba(34,211,238,0.4)" }} />)}
        </div>
      </div>

      {[["Veloc.", 84,"#22d3ee"],["Técnica", 91,"#a78bfa"],["Defensa", 73,"#34d399"]].map(([lbl,val,clr])=>(
        <div key={lbl as string} style={{ marginBottom:4 }}>
          <div style={{ display:"flex", justifyContent:"space-between", marginBottom:2 }}>
            <span style={{ fontSize:7, color:"rgba(255,255,255,0.4)" }}>{lbl}</span>
            <span style={{ fontSize:7, color:clr as string, fontWeight:700 }}>{val}</span>
          </div>
          <div style={{ height:2, background:"rgba(255,255,255,0.07)", borderRadius:1 }}>
            <motion.div initial={{ width:0 }} animate={{ width:`${val}%` }} transition={{ duration:1.4, delay:0.6, ease:"easeOut" }}
              style={{ height:"100%", background:`linear-gradient(90deg,${clr},rgba(255,255,255,0.25))`, borderRadius:1 }} />
          </div>
        </div>
      ))}

      <div style={{ display:"flex", alignItems:"center", gap:4, marginTop:7 }}>
        <motion.div animate={{ opacity:[1,0.25,1] }} transition={{ duration:1.1, repeat:Infinity }}
          style={{ width:5, height:5, borderRadius:"50%", background:"#22d3ee" }} />
        <span style={{ fontSize:7, color:"rgba(34,211,238,0.7)", letterSpacing:1, textTransform:"uppercase" }}>Live tracking</span>
      </div>
    </motion.div>
  );
}

// ─── Floating Badge ────────────────────────────────────────────────────────────

function Badge({ icon, text, color, style, delay }: {
  icon: React.ReactNode; text: string; color: string;
  style: React.CSSProperties; delay: number;
}) {
  return (
    <motion.div
      animate={{ y:[0,-10,0], opacity:[0.75,1,0.75] }}
      transition={{ duration:3.8+delay, repeat:Infinity, ease:"easeInOut", delay }}
      style={{ position:"absolute", background:"rgba(6,11,28,0.82)", border:`1px solid ${color}55`,
        borderRadius:9, padding:"5px 10px", backdropFilter:"blur(10px)",
        display:"flex", alignItems:"center", gap:5, zIndex:6, ...style }}
    >
      {icon}
      <span style={{ fontSize:9, color, fontWeight:700 }}>{text}</span>
    </motion.div>
  );
}

// ─── Scan Line ─────────────────────────────────────────────────────────────────

function ScanLine() {
  return (
    <motion.div
      style={{ position:"fixed", left:0, right:0, height:1.5,
        background:"linear-gradient(90deg,transparent 0%,rgba(34,211,238,0.35) 30%,rgba(34,211,238,0.6) 50%,rgba(34,211,238,0.35) 70%,transparent 100%)",
        zIndex:2, pointerEvents:"none" }}
      animate={{ top:["-2%","102%"] }}
      transition={{ duration:7, repeat:Infinity, ease:"linear" }}
    />
  );
}

// ─── Data Stream ──────────────────────────────────────────────────────────────

function DataStream({ x, delay }: { x:string; delay:number }) {
  return (
    <motion.div
      style={{ position:"absolute", left:x, top:"-5%", display:"flex", flexDirection:"column", gap:5, pointerEvents:"none", zIndex:1 }}
      animate={{ y:["0%","108%"] }}
      transition={{ duration:9+delay*2.5, repeat:Infinity, ease:"linear", delay }}
    >
      {"01VITAS87ABCDEF9".split("").slice(0,14).map((c,i)=>(
        <span key={i} style={{ fontSize:9, color:"rgba(34,211,238,0.2)", fontFamily:"monospace" }}>{c}</span>
      ))}
    </motion.div>
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

      {/* ── Background: boot neon image ── */}
      <div className="absolute inset-0">
        <img src={bootBg} alt="" style={{
          width: "100%", height: "100%",
          objectFit: "cover",
          objectPosition: "30% center",
          filter: "brightness(0.55) saturate(1.1)",
        }} />
        {/* Dark gradient: right side darker so card is legible */}
        <div className="absolute inset-0" style={{ background: "linear-gradient(105deg, rgba(4,9,22,0.25) 0%, rgba(4,9,22,0.45) 38%, rgba(4,9,22,0.72) 55%, rgba(4,9,22,0.88) 100%)" }} />
        {/* Cyan glow halo bottom-left (where the boot is) */}
        <div className="absolute" style={{ left:"-5%", bottom:"-5%", width:520, height:520, background:"radial-gradient(circle, rgba(34,211,238,0.18) 0%, transparent 65%)", borderRadius:"50%", pointerEvents:"none" }} />
        {/* Purple glow top-right */}
        <div className="absolute" style={{ right:"5%", top:"5%", width:380, height:380, background:"radial-gradient(circle, rgba(124,58,237,0.12) 0%, transparent 65%)", borderRadius:"50%", pointerEvents:"none" }} />
      </div>

      {/* ── Grid overlay ── */}
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage:"linear-gradient(rgba(34,211,238,0.03) 1px,transparent 1px),linear-gradient(90deg,rgba(34,211,238,0.03) 1px,transparent 1px)",
        backgroundSize:"52px 52px",
      }} />

      {/* ── Scan line ── */}
      <ScanLine />

      {/* ── Data streams ── */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <DataStream x="3%"  delay={0}   />
        <DataStream x="94%" delay={1.8} />
        <DataStream x="87%" delay={3.5} />
      </div>

      {/* ── Right side: wireframe balls + badges (hidden on mobile) ── */}
      <div className="absolute inset-0 pointer-events-none hidden md:block" style={{ zIndex:5 }}>
        <WireframeBall size={185} style={{ right:"4%",  top:"5%"  }} delay={0}   />
        <WireframeBall size={88}  style={{ right:"24%", top:"33%" }} delay={1.6} />
        <WireframeBall size={52}  style={{ right:"3%",  top:"52%" }} delay={0.9} />
        <AnalyticsCard />
        <Badge icon={<Activity  size={10} color="#22d3ee"/>} text="PHV +0.38"   color="#22d3ee" delay={0.5} style={{ right:"27%", top:"21%" }} />
        <Badge icon={<TrendingUp size={10} color="#a78bfa"/>} text="VAEP +0.142" color="#a78bfa" delay={1.3} style={{ right:"6%",  top:"46%" }} />
        <Badge icon={<Shield    size={10} color="#34d399"/>} text="Elite Tier"  color="#34d399" delay={0.2} style={{ right:"20%", top:"58%" }} />
      </div>

      {/* ── Login card ── */}
      <motion.div
        initial={{ opacity:0, y:26 }}
        animate={{ opacity:1, y:0 }}
        transition={{ duration:0.6, ease:"easeOut" }}
        className="relative z-10 w-full"
        style={{ maxWidth:358, margin:"0 auto", padding:"0 16px" }}
      >
        <div style={{
          background: "rgba(4,9,24,0.78)",
          border: "1.5px solid rgba(34,211,238,0.28)",
          borderRadius: 20,
          padding: "38px 32px 30px",
          backdropFilter: "blur(22px)",
          boxShadow: "0 8px 64px rgba(0,0,0,0.6), 0 0 44px rgba(34,211,238,0.1), inset 0 1px 0 rgba(255,255,255,0.06)",
          position: "relative",
        }}>

          {/* Corner brackets */}
          {[["top","left"],["top","right"],["bottom","left"],["bottom","right"]].map(([v,h])=>(
            <div key={`${v}${h}`} style={{ position:"absolute", [v]:11, [h]:11, width:13, height:13,
              [`border${v.charAt(0).toUpperCase()+v.slice(1)}`]:"2px solid rgba(34,211,238,0.55)",
              [`border${h.charAt(0).toUpperCase()+h.slice(1)}`]:"2px solid rgba(34,211,238,0.55)",
              borderRadius: v==="top"&&h==="left"?"2px 0 0 0":v==="top"&&h==="right"?"0 2px 0 0":v==="bottom"&&h==="left"?"0 0 0 2px":"0 0 2px 0",
            }} />
          ))}

          {/* Logo */}
          <div style={{ textAlign:"center", marginBottom:20 }}>
            <div style={{ display:"inline-flex", alignItems:"center", gap:9, marginBottom:13 }}>
              <motion.div
                animate={{ boxShadow:["0 0 8px rgba(34,211,238,0.4)","0 0 24px rgba(34,211,238,0.8)","0 0 8px rgba(34,211,238,0.4)"] }}
                transition={{ duration:2.2, repeat:Infinity }}
                style={{ width:37, height:37, borderRadius:11,
                  background:"linear-gradient(135deg,rgba(34,211,238,0.2),rgba(124,58,237,0.2))",
                  border:"1.5px solid rgba(34,211,238,0.55)",
                  display:"flex", alignItems:"center", justifyContent:"center" }}
              >
                <Zap size={18} color="#22d3ee" />
              </motion.div>
              <span style={{ color:"rgba(255,255,255,0.92)", fontWeight:800, fontSize:17, letterSpacing:0.5 }}>Vitas</span>
            </div>

            <h1 style={{
              fontSize:20, fontWeight:900, letterSpacing:1.8, textTransform:"uppercase",
              background:"linear-gradient(90deg,#22d3ee 0%,#818cf8 45%,#c084fc 75%,#22d3ee 100%)",
              backgroundSize:"200%",
              WebkitBackgroundClip:"text", WebkitTextFillColor:"transparent", backgroundClip:"text",
              lineHeight:1.22, marginBottom:7,
              animation:"shimmer 3.5s linear infinite",
            }}>
              VITAS: HOLOGRAPHIC<br/>PORTAL LOGIN
            </h1>
            <p style={{ color:"rgba(255,255,255,0.38)", fontSize:9.5, letterSpacing:2.5, textTransform:"uppercase", whiteSpace:"nowrap" }}>
              Accede a tu academia de scouting
            </p>
          </div>

          {/* Divider */}
          <div style={{ height:1, background:"linear-gradient(90deg,transparent,rgba(34,211,238,0.35),transparent)", marginBottom:20 }} />

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
              <label style={{ fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:2, textTransform:"uppercase", fontWeight:700, display:"block", marginBottom:7 }}>Email</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="usuario@vitas.ai" autoComplete="email"
                style={{ width:"100%", padding:"11px 14px", borderRadius:10,
                  background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(34,211,238,0.35)",
                  color:"white", fontSize:13, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                onFocus={e=>{ e.target.style.borderColor="rgba(34,211,238,0.85)"; e.target.style.boxShadow="0 0 18px rgba(34,211,238,0.18)"; }}
                onBlur={e=> { e.target.style.borderColor="rgba(34,211,238,0.35)"; e.target.style.boxShadow="none"; }}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom:6 }}>
              <label style={{ fontSize:9, color:"rgba(255,255,255,0.5)", letterSpacing:2, textTransform:"uppercase", fontWeight:700, display:"block", marginBottom:7 }}>Contraseña</label>
              <div style={{ position:"relative" }}>
                <input
                  type={showPw?"text":"password"} value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="••••••" autoComplete="current-password"
                  style={{ width:"100%", padding:"11px 40px 11px 14px", borderRadius:10,
                    background:"rgba(255,255,255,0.04)", border:"1.5px solid rgba(34,211,238,0.35)",
                    color:"white", fontSize:13, outline:"none", boxSizing:"border-box", transition:"all 0.2s" }}
                  onFocus={e=>{ e.target.style.borderColor="rgba(34,211,238,0.85)"; e.target.style.boxShadow="0 0 18px rgba(34,211,238,0.18)"; }}
                  onBlur={e=> { e.target.style.borderColor="rgba(34,211,238,0.35)"; e.target.style.boxShadow="none"; }}
                />
                <button type="button" onClick={()=>setShowPw(!showPw)}
                  style={{ position:"absolute", right:12, top:"50%", transform:"translateY(-50%)",
                    color:"rgba(34,211,238,0.6)", background:"none", border:"none", cursor:"pointer", padding:0 }}>
                  {showPw ? <EyeOff size={15}/> : <Eye size={15}/>}
                </button>
              </div>
              <div style={{ textAlign:"right", marginTop:7 }}>
                <Link to="/forgot-password" style={{ fontSize:11, color:"rgba(34,211,238,0.58)", textDecoration:"none" }}>
                  ¿Olvidaste tu contraseña?
                </Link>
              </div>
            </div>

            {/* Error */}
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

            {/* ENTRAR */}
            <motion.button
              type="submit" disabled={loading}
              whileHover={{ scale:1.03, boxShadow:"0 0 42px rgba(192,38,211,0.55), 0 0 70px rgba(34,211,238,0.2)" }}
              whileTap={{ scale:0.97 }}
              style={{
                width:"100%", padding:"13px", marginTop:10, borderRadius:12,
                background: loading ? "rgba(124,58,237,0.4)" : "linear-gradient(90deg, #c026d3 0%, #7c3aed 50%, #22d3ee 100%)",
                border:"none", color:"white", fontWeight:900, fontSize:14,
                letterSpacing:5, textTransform:"uppercase",
                cursor: loading ? "not-allowed" : "pointer",
                display:"flex", alignItems:"center", justifyContent:"center", gap:8,
                boxShadow:"0 0 30px rgba(192,38,211,0.45), 0 0 55px rgba(34,211,238,0.15)",
                transition:"background 0.3s",
              }}
            >
              {loading
                ? <><Loader2 size={14} style={{ animation:"spin 1s linear infinite" }}/>Entrando…</>
                : "ENTRAR"}
            </motion.button>
          </form>

          <p style={{ textAlign:"center", marginTop:18, fontSize:12, color:"rgba(255,255,255,0.35)" }}>
            ¿No tienes cuenta?{" "}
            <Link to="/register" style={{ color:"#22d3ee", textDecoration:"none", fontWeight:800 }}>Crear academia</Link>
          </p>
        </div>

        <p style={{ textAlign:"center", marginTop:13, fontSize:9, color:"rgba(34,211,238,0.32)", letterSpacing:3, textTransform:"uppercase" }}>
          VITAS V2.0 · Football Intelligence Platform
        </p>
      </motion.div>

      <style>{`
        @keyframes shimmer { 0%{background-position:0%} 100%{background-position:200%} }
        @keyframes spin    { 0%{transform:rotate(0deg)} 100%{transform:rotate(360deg)} }
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
