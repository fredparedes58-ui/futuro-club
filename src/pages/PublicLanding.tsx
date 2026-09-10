/**
 * VITAS · Public Landing Page — LUMINOUS EDITION
 *
 * Rediseño cinematográfico en CLARO: fondo blanco con auroras de color de la
 * paleta VITAS, móvil flotante con glow enseñando la app, objetos orbitando
 * (balones, chips de telemetría), destellos y una secuencia de entrada
 * escalonada. Menos texto, más impacto. NADA de fondo oscuro (regla del cliente).
 *
 * Paleta: Blue #0059B3 · Azure #2f7cf6 · Violet #A855F7 · Magenta #E6197A · Gold #F59E0B
 */
import { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion, MotionConfig } from "framer-motion";
import { useTranslation } from "react-i18next";
import {
  ArrowRight, Zap, Brain, Activity, Sparkles, Check,
  TrendingUp, Eye, Target, Send, Play,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { IS_DEMO } from "@/lib/demoMode";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";

// En el DEMO no hay alta ni login reales (Supabase off): cualquier CTA de entrada
// lleva directo a la app con datos de ejemplo (un solo click). Fuera del demo,
// mantienen su destino de registro/login habitual.
const ENTRY_HREF = IS_DEMO ? "/pulse" : "/register";
const LOGIN_HREF = IS_DEMO ? "/pulse" : "/login";

// ── Estilos scoped (prefijo vl-) ──────────────────────────────────────────────
const STYLES = `
.vl-root{--paper:#f4f7ff;--card:#fff;--blue:#0059B3;--azure:#2f7cf6;--cyan:#0fb6d6;--violet:#a855f7;--magenta:#e6197a;--gold:#f59e0b;
  --ink:#0b1226;--ink2:#37425f;--muted:#6c7794;--glass:rgba(255,255,255,.74);--vline:rgba(0,89,179,.14);
  --dispf:'Rajdhani',system-ui,sans-serif;--monof:'Geist Mono',ui-monospace,monospace;
  background:var(--paper);color:var(--ink);position:relative;overflow:hidden}
.vl-bar{height:4px;background:linear-gradient(90deg,var(--gold),var(--magenta),var(--violet),var(--blue))}
.vl-bg{position:absolute;inset:0;overflow:hidden;pointer-events:none}
.vl-aurora{position:absolute;border-radius:50%;filter:blur(34px);animation:vl-drift 22s ease-in-out infinite}
.vl-grid{position:absolute;inset:0;opacity:.55;background-image:linear-gradient(rgba(11,18,38,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(11,18,38,.035) 1px,transparent 1px);background-size:58px 58px;-webkit-mask-image:radial-gradient(ellipse at 50% 20%,#000 30%,transparent 78%);mask-image:radial-gradient(ellipse at 50% 20%,#000 30%,transparent 78%)}
.vl-wrap{max-width:1200px;margin:0 auto;padding:0 40px;position:relative;z-index:5}
.vl-badge{display:inline-flex;align-items:center;gap:9px;padding:8px 15px;border-radius:999px;font-family:var(--monof);font-size:12px;letter-spacing:1px;color:var(--blue);background:rgba(0,89,179,.07);border:1px solid rgba(0,89,179,.18)}
.vl-dot{width:7px;height:7px;border-radius:50%;background:var(--blue);box-shadow:0 0 9px rgba(0,89,179,.6);animation:vl-blink 1.5s infinite}
.vl-h1{font-family:var(--dispf);font-weight:700;line-height:.98;letter-spacing:-.5px;margin:0;font-size:clamp(46px,6.4vw,92px)}
.vl-h1 .g{background:linear-gradient(100deg,var(--blue),var(--violet) 40%,var(--magenta) 74%,var(--gold));background-size:220%;-webkit-background-clip:text;background-clip:text;color:transparent;animation:vl-rise .9s cubic-bezier(.16,1,.3,1) both,vl-shimmer 7s linear infinite}
.vl-btn{font-family:var(--dispf);font-weight:700;letter-spacing:2.5px;text-transform:uppercase;font-size:15px;padding:16px 32px;border-radius:14px;color:#fff;display:inline-flex;align-items:center;gap:10px;background:linear-gradient(90deg,var(--magenta),var(--violet) 52%,var(--azure));box-shadow:0 16px 40px rgba(230,25,122,.28),0 6px 18px rgba(47,124,246,.2);transition:transform .2s}
.vl-btn:hover{transform:translateY(-2px) scale(1.02)}
.vl-ghost{font-family:var(--dispf);font-weight:600;letter-spacing:1.5px;text-transform:uppercase;font-size:14px;padding:15px 24px;border-radius:14px;color:var(--ink2);border:1px solid rgba(0,89,179,.2);background:rgba(255,255,255,.6)}
.vl-mini{display:flex;gap:34px;flex-wrap:wrap}
.vl-mini .v{font-family:var(--dispf);font-weight:700;font-size:34px;background:linear-gradient(90deg,var(--blue),var(--violet));-webkit-background-clip:text;background-clip:text;color:transparent}
.vl-mini .k{font-family:var(--monof);font-size:10px;letter-spacing:1px;text-transform:uppercase;color:var(--muted);margin-top:2px}
.vl-showcase{position:relative;min-height:520px;display:flex;align-items:center;justify-content:center}
.vl-phoneglow{position:absolute;width:340px;height:340px;border-radius:50%;background:radial-gradient(circle,rgba(168,85,247,.22),transparent 66%);filter:blur(12px)}
.vl-obj{position:absolute}
.vl-halo{position:absolute;inset:-30%;border-radius:50%;filter:blur(10px)}
.vl-chip{position:absolute;display:flex;align-items:center;gap:8px;padding:10px 13px;border-radius:13px;background:var(--glass);border:1px solid var(--vline);backdrop-filter:blur(14px);box-shadow:0 14px 34px rgba(20,40,120,.14);font-family:var(--monof);font-size:12.5px;font-weight:700;color:var(--ink);white-space:nowrap}
.vl-chip .d{width:8px;height:8px;border-radius:50%}
.vl-chip small{font-weight:600;font-size:9.5px;letter-spacing:.5px;text-transform:uppercase;color:var(--muted)}
.vl-spark{position:absolute;pointer-events:none;animation:vl-twinkle 3s ease-in-out infinite;filter:drop-shadow(0 0 5px rgba(168,85,247,.5))}
.vl-reveal{max-width:820px;margin:52px auto 0;padding:36px;border-radius:26px;position:relative;background:var(--card);border:1px solid var(--vline);box-shadow:0 40px 90px rgba(20,40,120,.16)}
.vl-rc{display:grid;grid-template-columns:1fr auto 1fr;gap:26px;align-items:center}
.vl-big{font-family:var(--dispf);font-weight:700;font-size:clamp(56px,8vw,78px);line-height:1}
.vl-gauge{width:150px;max-width:40vw;height:7px;border-radius:7px;background:#e6edf9;overflow:hidden}
.vl-gauge i{display:block;height:100%;border-radius:7px;background:linear-gradient(90deg,var(--blue),var(--violet),var(--magenta));width:81%;animation:vl-fillg 1.6s cubic-bezier(.16,1,.3,1) both}
.vl-delta{font-family:var(--dispf);font-weight:700;font-size:30px;color:var(--blue);text-shadow:0 6px 18px rgba(0,89,179,.24)}
.vl-in{opacity:0;animation:vl-rise .9s cubic-bezier(.16,1,.3,1) forwards}
.vl-pop{opacity:0;animation:vl-pop .7s cubic-bezier(.16,1,.3,1) forwards}
@keyframes vl-drift{0%,100%{transform:translate(0,0)}50%{transform:translate(30px,-22px)}}
@keyframes vl-float{0%,100%{transform:translateY(0)}50%{transform:translateY(-20px)}}
@keyframes vl-float2{0%,100%{transform:translateY(0) rotate(0)}50%{transform:translateY(-15px) rotate(7deg)}}
@keyframes vl-spin{to{transform:rotate(360deg)}}
@keyframes vl-twinkle{0%,100%{opacity:.15;transform:scale(.6)}50%{opacity:1;transform:scale(1)}}
@keyframes vl-blink{0%,100%{opacity:1}50%{opacity:.3}}
@keyframes vl-rise{from{opacity:0;transform:translateY(30px)}to{opacity:1;transform:translateY(0)}}
@keyframes vl-pop{0%{opacity:0;transform:scale(.82)}60%{transform:scale(1.05)}100%{opacity:1;transform:scale(1)}}
@keyframes vl-shimmer{0%{background-position:0%}100%{background-position:220%}}
@keyframes vl-fillg{from{width:0}to{width:81%}}
@keyframes vl-fadein{from{opacity:0}to{opacity:1}}
@media (max-width:860px){
  .vl-wrap{padding:0 22px}
  .vl-showcase{min-height:440px;transform:scale(.9)}
  .vl-mini{gap:22px}
  .vl-reveal{padding:24px}
  .vl-rc{gap:12px}
}
@media (max-width:520px){
  .vl-rc{grid-template-columns:1fr;gap:16px}
  .vl-gauge{max-width:70vw}
}
@media (prefers-reduced-motion:reduce){
  .vl-aurora,.vl-obj,.vl-spark,.vl-dot,.vl-h1 .g,.vl-gauge i{animation:none!important}
  .vl-in,.vl-pop{opacity:1!important;animation:none!important}
}
`;

// ── Aurora background field ───────────────────────────────────────────────────
function AuroraField() {
  return (
    <div className="vl-bg" aria-hidden="true">
      <div className="vl-aurora" style={{ width: 640, height: 640, left: -140, top: -160, background: "radial-gradient(circle,rgba(47,124,246,.26),transparent 62%)" }} />
      <div className="vl-aurora" style={{ width: 600, height: 600, right: -120, top: -120, background: "radial-gradient(circle,rgba(168,85,247,.22),transparent 62%)", animationDelay: "-6s" }} />
      <div className="vl-aurora" style={{ width: 560, height: 560, left: "38%", top: 540, background: "radial-gradient(circle,rgba(230,25,122,.16),transparent 64%)", animationDelay: "-11s" }} />
      <div className="vl-aurora" style={{ width: 420, height: 420, right: "22%", top: 360, background: "radial-gradient(circle,rgba(245,158,11,.16),transparent 64%)", animationDelay: "-3s" }} />
      <div className="vl-grid" />
    </div>
  );
}

// ── Destello (sparkle) ────────────────────────────────────────────────────────
function Spark({ size = 14, color, style }: { size?: number; color: string; style: React.CSSProperties }) {
  return (
    <div className="vl-spark" style={{ color, ...style }} aria-hidden="true">
      <svg width={size} height={size} viewBox="0 0 24 24"><path d="M12 2 13.6 10.4 22 12 13.6 13.6 12 22 10.4 13.6 2 12 10.4 10.4Z" fill="currentColor" /></svg>
    </div>
  );
}

// ── Balón (neón sobre claro) ──────────────────────────────────────────────────
function Ball({ size, stroke, halo, id, spin, style, className }: {
  size: number; stroke: string; halo: string; id: string; spin?: boolean; style: React.CSSProperties; className?: string;
}) {
  return (
    <div className={`vl-obj ${className ?? ""}`} style={style} aria-hidden="true">
      <div className="vl-halo" style={{ background: `radial-gradient(circle,${halo},transparent 70%)` }} />
      <svg width={size} height={size} viewBox="0 0 112 112" style={spin ? { animation: "vl-spin 30s linear infinite" } : undefined}>
        <defs><radialGradient id={id} cx="40%" cy="34%" r="70%"><stop offset="0%" stopColor="#ffffff" /><stop offset="100%" stopColor="#e9f0ff" /></radialGradient></defs>
        <circle cx="56" cy="56" r="46" fill={`url(#${id})`} stroke={stroke} strokeWidth="1.6" strokeOpacity=".6" />
        <polygon points="56,34 68,44 63,58 49,58 44,44" fill="none" stroke={stroke} strokeWidth="1.1" strokeOpacity=".7" />
        <path d="M56 10 56 34 M78 26 68 44 M34 26 44 44 M74 80 63 58 M38 80 49 58" stroke={stroke} strokeWidth=".9" strokeOpacity=".4" />
      </svg>
    </div>
  );
}

// ── Phone mockup (app real) ───────────────────────────────────────────────────
function PhoneMockup() {
  const { t } = useTranslation();
  return (
    <motion.div
      initial={{ opacity: 0, y: 30, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ duration: 0.8, delay: 0.4, ease: [0.16, 1, 0.3, 1] }}
      className="relative w-[260px] md:w-[288px]"
      style={{ zIndex: 3 }}
      aria-hidden="true"
    >
      <motion.div animate={{ y: [-8, 8, -8] }} transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}>
        <div className="rounded-[2.2rem] border-[7px] border-[#0b1226] bg-white overflow-hidden" style={{ boxShadow: "0 40px 90px rgba(20,40,120,.28)" }}>
          <div className="flex justify-center pt-2 pb-1 bg-white"><div className="w-20 h-4 bg-[#0b1226] rounded-b-xl" /></div>
          <div className="px-3 pb-4">
            <div className="flex items-center justify-between py-1.5">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0059B3,#A855F7)" }}>
                  <Zap size={10} className="text-white" />
                </div>
                <span className="text-[9px] font-display font-bold text-[#0b1226]">VITAS</span>
              </div>
              <span className="text-[9px] font-display font-bold" style={{ color: "#0059B3" }}>EN VIVO</span>
            </div>
            <h3 className="text-[12px] font-display font-bold tracking-wide" style={{ color: "#0059B3" }}>PULSE LIVE</h3>
            <p className="text-[7px] text-gray-400 mb-2">{t("publicLanding.pulseSubtitle")}</p>
            <div className="grid grid-cols-3 gap-1.5 mb-2.5">
              {[
                { label: "VSI AVG", value: "72.4", color: "#0059B3" },
                { label: t("publicLanding.statActive"), value: "342", color: "#A855F7" },
                { label: t("publicLanding.statAlerts"), value: "18", color: "#F59E0B" },
              ].map((s) => (
                <div key={s.label} className="rounded-lg p-1.5 text-center border" style={{ background: "#f4f7ff", borderColor: "#e6edf9" }}>
                  <p className="text-[6px] text-gray-400 uppercase">{s.label}</p>
                  <p className="text-[13px] font-display font-bold" style={{ color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
            {[
              { initials: "LR", name: "L. Rodríguez", pos: `CAM · ${t("publicLanding.years", { count: 16 })}`, score: 94, color: "#12b981" },
              { initials: "MF", name: "M. Fernández", pos: `ST · ${t("publicLanding.years", { count: 17 })}`, score: 91, color: "#2f7cf6" },
              { initials: "AG", name: "A. García", pos: `ST · ${t("publicLanding.years", { count: 15 })}`, score: 88, color: "#12b981" },
            ].map((p) => (
              <div key={p.initials} className="flex items-center gap-2 py-1.5 border-b" style={{ borderColor: "#eef2fb" }}>
                <div className="w-6 h-6 rounded-full text-white flex items-center justify-center text-[8px] font-display font-bold shrink-0" style={{ background: p.color }}>{p.initials}</div>
                <div className="flex-1 min-w-0">
                  <p className="text-[9px] font-bold text-[#0b1226] truncate">{p.name}</p>
                  <p className="text-[7px] text-gray-400">{p.pos}</p>
                </div>
                <span className="text-[15px] font-display font-bold" style={{ color: "#12b981" }}>{p.score}</span>
              </div>
            ))}
            <div className="rounded-lg p-2 border mt-2" style={{ background: "#f4f7ff", borderColor: "#e6edf9" }}>
              <div className="flex items-center justify-between mb-1">
                <span className="text-[7px] text-gray-500 flex items-center gap-1"><Activity size={7} /> {t("publicLanding.phvMaturation")}</span>
                <span className="text-[7px] font-semibold px-1.5 py-0.5 rounded-full" style={{ color: "#0059B3", background: "rgba(0,89,179,.1)" }}>{t("publicLanding.lateMaturer")}</span>
              </div>
              <div className="w-full h-2 rounded-full overflow-hidden" style={{ background: "#e6edf9" }}>
                <motion.div className="h-full rounded-full" style={{ background: "linear-gradient(90deg,#0059B3,#A855F7)" }} initial={{ width: 0 }} animate={{ width: "68%" }} transition={{ duration: 1.5, delay: 1, ease: "easeOut" }} />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PublicLanding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, configured } = useAuth();
  const isLoggedIn = !!(user && configured);
  // El demo SÍ enseña la landing completa; solo redirige a un usuario realmente
  // logueado FUERA del demo.
  const shouldRedirect = !IS_DEMO && isLoggedIn && location.pathname === "/";

  useEffect(() => {
    if (shouldRedirect) navigate("/pulse", { replace: true });
  }, [shouldRedirect, navigate]);

  useEffect(() => {
    document.title = t("publicLanding.pageTitle");
    const set = (name: string, content: string, property?: boolean) => {
      const sel = property ? `meta[property="${name}"]` : `meta[name="${name}"]`;
      let el = document.querySelector(sel) as HTMLMetaElement | null;
      if (!el) {
        el = document.createElement("meta");
        if (property) el.setAttribute("property", name);
        else el.setAttribute("name", name);
        document.head.appendChild(el);
      }
      el.setAttribute("content", content);
    };
    set("description", t("publicLanding.metaDescription"));
    set("og:title", "VITAS · Football Intelligence", true);
    set("og:description", t("publicLanding.ogDescription"), true);
    set("og:image", "/og-image.png", true);
    set("og:url", "https://futuro-club.vercel.app", true);
    set("twitter:card", "summary_large_image");
  }, [t]);

  const primaryLabel = IS_DEMO ? t("publicLanding.enterDemo", "Entrar a la demo") : t("publicLanding.watchDemo");

  return (
    <MotionConfig reducedMotion="user">
    <div className="vl-root min-h-screen">
      <style>{STYLES}</style>
      <div className="vl-bar" />

      {/* ── HERO ─────────────────────────────────────────────── */}
      <section className="relative">
        <AuroraField />
        <div className="vl-wrap">
          {/* nav */}
          <nav className="flex items-center justify-between py-6 relative z-20" style={{ animation: "vl-fadein .8s .05s both" }}>
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0059B3,#A855F7)", boxShadow: "0 8px 22px rgba(0,89,179,.32)" }}>
                <Zap size={19} className="text-white" />
              </div>
              <span className="font-display font-bold text-[22px]">V<span style={{ background: "linear-gradient(90deg,#0059B3,#A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>I</span>TAS</span>
              <span className="text-[10px] font-display text-[#6c7794] hidden sm:block ml-1">FOOTBALL INTELLIGENCE</span>
            </div>
            <div className="hidden md:flex items-center gap-6 text-sm font-display font-semibold text-[#37425f]">
              <a href="#features" className="hover:text-[#0059B3] transition-colors">{t("publicLanding.navFeatures")}</a>
              <a href="#phv" className="hover:text-[#0059B3] transition-colors">PHV</a>
              <a href="#pricing" className="hover:text-[#0059B3] transition-colors">{t("publicLanding.navPlans")}</a>
            </div>
            <div className="flex items-center gap-3">
              <LanguageSwitcher />
              {isLoggedIn || IS_DEMO ? (
                <Link to="/pulse" className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-display font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg,#0059B3,#A855F7)" }}>
                  {IS_DEMO ? t("publicLanding.enterDemo", "Entrar a la demo") : t("publicLanding.dashboard")} <ArrowRight size={12} />
                </Link>
              ) : (
                <>
                  <Link to="/login" className="text-xs font-display font-semibold text-[#37425f] hover:text-[#0059B3] transition-colors hidden sm:block">{t("publicLanding.login")}</Link>
                  <Link to="/register" className="min-h-[44px] px-4 py-2 rounded-xl text-xs font-display font-bold text-white flex items-center gap-1.5" style={{ background: "linear-gradient(135deg,#0059B3,#A855F7)" }}>
                    {t("publicLanding.startFree")} <ArrowRight size={12} />
                  </Link>
                </>
              )}
            </div>
          </nav>

          {/* hero grid */}
          <div className="grid md:grid-cols-2 gap-10 items-center pt-6 md:pt-2 pb-6">
            <div className="text-center md:text-left">
              <div className="vl-badge vl-pop" style={{ animationDelay: ".2s" }}><span className="vl-dot" />FOOTBALL INTELLIGENCE · PHV</div>
              <h1 className="vl-h1 mt-6">
                <span className="block vl-in" style={{ animationDelay: ".28s" }}>{t("publicLanding.heroTitleStart")}</span>
                <span className="block g vl-in" style={{ animationDelay: ".42s" }}>{t("publicLanding.heroTitleAccent")}</span>
              </h1>
              <p className="mt-6 text-lg leading-relaxed text-[#37425f] max-w-md mx-auto md:mx-0 vl-in" style={{ animationDelay: ".58s" }}>
                {t("publicLanding.heroTagline", "Corregimos la maduración biológica. Ves al jugador real — no su físico de hoy.")}
              </p>
              <div className="mt-8 flex gap-3.5 items-center flex-wrap justify-center md:justify-start vl-pop" style={{ animationDelay: ".8s" }}>
                <Link to={ENTRY_HREF} className="vl-btn"><Play size={16} className="fill-white" />{primaryLabel}</Link>
                <a href="#phv" className="vl-ghost">{t("publicLanding.howItWorks", "Cómo funciona")}</a>
              </div>
              <div className="vl-mini mt-10 justify-center md:justify-start" style={{ animation: "vl-fadein 1s 1s both" }}>
                <div><div className="v">148</div><div className="k">{t("publicLanding.statRefPlayers")}</div></div>
                <div><div className="v">5 min</div><div className="k">{t("publicLanding.statAnalysisTime")}</div></div>
                <div><div className="v">0€</div><div className="k">{t("publicLanding.statFreeStart")}</div></div>
              </div>
            </div>

            {/* showcase */}
            <div className="vl-showcase">
              <div className="vl-phoneglow" />
              <PhoneMockup />
              <Ball id="vlb1" size={104} stroke="#0059B3" halo="rgba(0,89,179,.28)" style={{ left: "-4%", top: "4%", animation: "vl-float 8s 1.4s ease-in-out infinite" }} />
              <Ball id="vlb2" size={80} stroke="#e6197a" halo="rgba(230,25,122,.26)" spin style={{ right: "-2%", bottom: "4%", animation: "vl-float2 7s 1.2s ease-in-out infinite" }} />
              <div className="vl-chip vl-pop" style={{ left: "-8%", top: "36%", animationDelay: "1s" }}><span className="d" style={{ background: "#0059B3", boxShadow: "0 0 8px rgba(0,89,179,.6)" }} />PHV +0.38 <small>maduración</small></div>
              <div className="vl-chip vl-pop" style={{ right: "-6%", top: "18%", animationDelay: "1.15s" }}><span className="d" style={{ background: "#a855f7", boxShadow: "0 0 8px rgba(168,85,247,.6)" }} />VAEP +0.142</div>
              <div className="vl-chip vl-pop" style={{ left: "2%", bottom: "2%", animationDelay: "1.3s" }}><span className="d" style={{ background: "#12b981", boxShadow: "0 0 8px rgba(18,185,129,.6)" }} />Elite tier</div>
              <Spark size={18} color="#0059B3" style={{ left: "12%", top: "2%", animationDelay: ".3s" }} />
              <Spark size={13} color="#f59e0b" style={{ right: "16%", top: "12%", animationDelay: "1.1s" }} />
              <Spark size={15} color="#e6197a" style={{ right: "6%", bottom: "24%", animationDelay: "1.9s" }} />
              <Spark size={12} color="#a855f7" style={{ left: "6%", bottom: "18%", animationDelay: ".7s" }} />
            </div>
          </div>
        </div>
      </section>

      {/* ── REVELADO (PHV) ────────────────────────────────────── */}
      <section id="phv" className="relative border-y" style={{ borderColor: "rgba(0,89,179,.1)" }}>
        <div className="vl-bg" aria-hidden="true">
          <div className="vl-aurora" style={{ width: 520, height: 520, left: "8%", top: 40, background: "radial-gradient(circle,rgba(47,124,246,.16),transparent 64%)" }} />
          <div className="vl-aurora" style={{ width: 480, height: 480, right: "10%", top: 60, background: "radial-gradient(circle,rgba(168,85,247,.16),transparent 64%)", animationDelay: "-8s" }} />
        </div>
        <div className="vl-wrap py-20 text-center">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="inline-block text-[11px] font-display font-bold uppercase tracking-wider px-3.5 py-1.5 rounded-full" style={{ color: "#D4940A", background: "rgba(245,158,11,.1)", border: "1px solid rgba(245,158,11,.28)" }}>
              {t("publicLanding.uniqueDifferentiator")}
            </span>
            <h2 className="font-display font-bold leading-tight mt-6 mx-auto max-w-3xl" style={{ fontSize: "clamp(34px,4.6vw,64px)" }}>
              {t("publicLanding.phvHeadingStart")}{" "}
              <span style={{ background: "linear-gradient(90deg,#0059B3,#A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>{t("publicLanding.phvHeadingAccent")}</span>
            </h2>

            <div className="vl-reveal">
              <Spark size={16} color="#0059B3" style={{ left: -6, top: -8, animationDelay: ".3s" }} />
              <Spark size={13} color="#a855f7" style={{ right: 14, bottom: 10, animationDelay: "1.2s" }} />
              <div className="vl-rc">
                <div className="text-center">
                  <div className="font-bold text-sm text-[#0b1226] mb-3.5">Hugo · Q4 · 1.42 m</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[#6c7794]">{t("publicLanding.vsiClassic")}</div>
                  <div className="vl-big" style={{ color: "#aeb8cf" }}>64</div>
                </div>
                <div className="flex flex-col items-center gap-2.5">
                  <svg width="46" height="24" viewBox="0 0 46 24" fill="none"><path d="M2 12h34m0 0-8-7m8 7-8 7" stroke="#0059B3" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
                  <div className="vl-delta">+17</div>
                  <div className="vl-gauge"><i /></div>
                </div>
                <div className="text-center">
                  <div className="font-bold text-sm text-[#0b1226] mb-3.5">{t("publicLanding.phvCorrectedLabel")}</div>
                  <div className="font-mono text-[10px] uppercase tracking-wider text-[#6c7794]">VSI VITAS</div>
                  <div className="vl-big" style={{ background: "linear-gradient(90deg,#0059B3,#A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>81</div>
                  <div className="inline-flex items-center gap-1.5 mt-2 font-mono text-[10px] uppercase tracking-wider px-2.5 py-1 rounded-full" style={{ color: "#A855F7", background: "rgba(168,85,247,.12)", border: "1px solid rgba(168,85,247,.3)" }}>
                    <Sparkles size={11} /> Hidden gem
                  </div>
                </div>
              </div>
              <p className="mt-6 text-sm text-[#37425f] leading-relaxed">{t("publicLanding.exampleConclusion")}</p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── FEATURES ──────────────────────────────────────────── */}
      <section id="features" className="relative">
        <div className="vl-wrap py-16 md:py-20">
          <h2 className="font-display font-bold text-center mb-3" style={{ fontSize: "clamp(30px,4vw,48px)" }}>{t("publicLanding.featuresHeading")}</h2>
          <p className="text-sm text-[#37425f] text-center mb-12 max-w-2xl mx-auto">{t("publicLanding.featuresSubtitle")}</p>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <FeatureCard icon={Brain} title={t("publicLanding.featureAiTitle")} color="#A855F7" description={t("publicLanding.featureAiDesc")} />
            <FeatureCard icon={Activity} title="VSI + PHV" color="#0059B3" description={t("publicLanding.featureVsiDesc")} />
            <FeatureCard icon={Eye} title={t("publicLanding.featureScanTitle")} color="#0fb6d6" description={t("publicLanding.featureScanDesc")} />
            <FeatureCard icon={Send} title={t("publicLanding.featureTelegramTitle")} color="#E6197A" description={t("publicLanding.featureTelegramDesc")} />
          </div>
        </div>
      </section>

      {/* ── STEPS ─────────────────────────────────────────────── */}
      <section className="relative border-y" style={{ borderColor: "rgba(0,89,179,.1)" }}>
        <div className="vl-wrap py-16 md:py-20">
          <h2 className="font-display font-bold text-center mb-12" style={{ fontSize: "clamp(30px,4vw,48px)" }}>{t("publicLanding.stepsHeading")}</h2>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard num={1} title={t("publicLanding.step1Title")} icon={Target} color="#0059B3" description={t("publicLanding.step1Desc")} />
            <StepCard num={2} title={t("publicLanding.step2Title")} icon={Zap} color="#A855F7" description={t("publicLanding.step2Desc")} />
            <StepCard num={3} title={t("publicLanding.step3Title")} icon={TrendingUp} color="#0fb6d6" description={t("publicLanding.step3Desc")} />
          </div>
        </div>
      </section>

      {/* ── PRICING ───────────────────────────────────────────── */}
      <section id="pricing" className="relative">
        <div className="vl-wrap py-16 md:py-20">
          <h2 className="font-display font-bold text-center mb-3" style={{ fontSize: "clamp(30px,4vw,48px)" }}>{t("publicLanding.pricingHeading")}</h2>
          <p className="text-sm text-[#37425f] text-center mb-12">{t("publicLanding.pricingSubtitle")}</p>
          <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
            <PlanTier name="Free" description={t("publicLanding.planFreeDesc")} features={[t("publicLanding.planFreeFeature1"), t("publicLanding.planFreeFeature2"), t("publicLanding.planFreeFeature3"), t("publicLanding.planFreeFeature4")]} />
            <PlanTier name="Pro" description={t("publicLanding.planProDesc")} highlight features={[t("publicLanding.planProFeature1"), t("publicLanding.planProFeature2"), t("publicLanding.planProFeature3"), t("publicLanding.planProFeature4"), t("publicLanding.planProFeature5"), t("publicLanding.planProFeature6"), t("publicLanding.planProFeature7")]} />
            <PlanTier name="Club" description={t("publicLanding.planClubDesc")} features={[t("publicLanding.planClubFeature1"), t("publicLanding.planClubFeature2"), t("publicLanding.planClubFeature3"), t("publicLanding.planClubFeature4"), t("publicLanding.planClubFeature5"), t("publicLanding.planClubFeature6"), t("publicLanding.planClubFeature7")]} />
          </div>
          <p className="text-xs text-[#6c7794] text-center mt-8">{t("publicLanding.pricingNote")}</p>
        </div>
      </section>

      {/* ── FINAL CTA ─────────────────────────────────────────── */}
      <section className="relative">
        <div className="vl-bg" aria-hidden="true">
          <div className="vl-aurora" style={{ width: 560, height: 560, left: "22%", top: -40, background: "radial-gradient(circle,rgba(168,85,247,.16),transparent 64%)" }} />
          <div className="vl-aurora" style={{ width: 420, height: 420, right: "20%", top: -20, background: "radial-gradient(circle,rgba(245,158,11,.16),transparent 64%)", animationDelay: "-4s" }} />
        </div>
        <div className="vl-wrap py-20 text-center relative">
          <Spark size={16} color="#f59e0b" style={{ left: "24%", top: -8, animationDelay: ".4s" }} />
          <Spark size={13} color="#0059B3" style={{ right: "24%", top: 24, animationDelay: "1.4s" }} />
          <h3 className="font-display font-bold leading-tight" style={{ fontSize: "clamp(32px,4.4vw,56px)" }}>
            {t("publicLanding.ctaHeading")}
          </h3>
          <p className="text-sm text-[#37425f] mt-4 mb-8 max-w-xl mx-auto">{t("publicLanding.ctaParagraph")}</p>
          <Link to={ENTRY_HREF} className="vl-btn"><Play size={16} className="fill-white" />{primaryLabel}</Link>
        </div>
      </section>

      {/* ── FOOTER ────────────────────────────────────────────── */}
      <footer className="border-t" style={{ borderColor: "rgba(0,89,179,.1)" }}>
        <div className="vl-wrap py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ background: "linear-gradient(135deg,#0059B3,#A855F7)" }}><Zap size={13} className="text-white" /></div>
            <span className="text-xs text-[#6c7794]">VITAS · Football Intelligence © 2026</span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-[#6c7794]">
            <Link to="/terms" className="hover:text-[#0059B3] transition-colors">{t("publicLanding.footerTerms")}</Link>
            <Link to="/privacy" className="hover:text-[#0059B3] transition-colors">{t("publicLanding.footerPrivacy")}</Link>
            <Link to={LOGIN_HREF} className="hover:text-[#0059B3] transition-colors">{t("publicLanding.footerAccess")}</Link>
          </nav>
        </div>
        <div className="vl-bar" />
      </footer>
    </div>
    </MotionConfig>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────────────────────
function FeatureCard({ icon: Icon, title, description, color }: {
  icon: React.ElementType; title: string; description: string; color: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="rounded-2xl p-6 space-y-3 border bg-white"
      style={{ borderColor: "rgba(0,89,179,.12)", boxShadow: "0 18px 44px rgba(20,40,120,.08)" }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}><Icon size={20} style={{ color }} /></div>
      <h3 className="font-display font-bold text-base text-[#0b1226]">{title}</h3>
      <p className="text-xs text-[#37425f] leading-relaxed">{description}</p>
    </motion.div>
  );
}

function StepCard({ num, title, description, icon: Icon, color }: {
  num: number; title: string; description: string; icon: React.ElementType; color: string;
}) {
  return (
    <motion.div whileHover={{ y: -4 }} className="rounded-2xl p-6 space-y-3 border bg-white" style={{ borderColor: "rgba(0,89,179,.12)", boxShadow: "0 18px 44px rgba(20,40,120,.08)" }}>
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-display font-bold text-white" style={{ background: `linear-gradient(135deg,${color},${color}cc)` }}>{num}</span>
        <Icon size={20} style={{ color }} />
      </div>
      <h3 className="font-display font-bold text-base text-[#0b1226]">{title}</h3>
      <p className="text-sm text-[#37425f] leading-relaxed">{description}</p>
    </motion.div>
  );
}

function PlanTier({ name, description, features, highlight }: {
  name: string; description: string; features: string[]; highlight?: boolean;
}) {
  const { t } = useTranslation();
  return (
    <div className={highlight ? "md:scale-105" : ""}>
    <motion.div
      whileHover={{ y: -4 }}
      className={`rounded-2xl p-6 space-y-5 border ${highlight ? "text-white" : "bg-white"}`}
      style={highlight
        ? { background: "linear-gradient(135deg,#0059B3,#A855F7)", borderColor: "#A855F7", boxShadow: "0 24px 60px rgba(168,85,247,.28)" }
        : { borderColor: "rgba(0,89,179,.12)", boxShadow: "0 18px 44px rgba(20,40,120,.08)" }}
    >
      {highlight && <span className="inline-block text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white font-bold border border-white/30">{t("publicLanding.mostPopular")}</span>}
      <div>
        <h3 className="font-display font-bold text-xl">{name}</h3>
        <p className={`text-xs ${highlight ? "opacity-80" : "text-[#37425f]"}`}>{description}</p>
      </div>
      <ul className="space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check size={13} className={`shrink-0 mt-0.5 ${highlight ? "text-white/90" : ""}`} style={!highlight ? { color: "#A855F7" } : undefined} />
            <span className={highlight ? "" : "text-[#37425f]"}>{f}</span>
          </li>
        ))}
      </ul>
      <Link to={ENTRY_HREF} className={`block w-full text-center px-4 py-2.5 rounded-xl text-xs font-display font-bold transition-transform hover:scale-[1.02] ${highlight ? "bg-white" : "text-white"}`}
        style={highlight ? { color: "#0059B3" } : { background: "linear-gradient(135deg,#0059B3,#A855F7)" }}>
        {IS_DEMO ? t("publicLanding.enterDemo", "Entrar a la demo") : t("publicLanding.getStarted")}
      </Link>
    </motion.div>
    </div>
  );
}
