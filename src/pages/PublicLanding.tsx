/**
 * VITAS · Public Landing Page — VIBRANT EDITION
 *
 * Diseño vibrante con gradientes (blue→purple→pink→orange),
 * mockup flotante del móvil, stats animados, elementos flotantes.
 *
 * Paleta: Primary #0059B3 → Electric #A855F7 → HotPink #E6197A → Gold #D4940A
 */
import { useEffect } from "react";
import { Link, useNavigate, useLocation } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Zap, Brain, Activity, Shield, Sparkles, Check,
  TrendingUp, Eye, Target, Send, Play, Star, BarChart3, Users,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

// ── Floating orbs (background decoration) ─────────────────────
function FloatingOrbs() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <motion.div
        className="absolute w-[500px] h-[500px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(210 100% 50% / 0.12) 0%, transparent 70%)", top: "-10%", left: "-5%" }}
        animate={{ x: [0, 40, 0], y: [0, 30, 0] }}
        transition={{ duration: 20, repeat: Infinity, ease: "easeInOut" }}
      />
      <motion.div
        className="absolute w-[400px] h-[400px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(290 70% 55% / 0.10) 0%, transparent 70%)", top: "20%", right: "-8%" }}
        animate={{ x: [0, -30, 0], y: [0, 40, 0] }}
        transition={{ duration: 18, repeat: Infinity, ease: "easeInOut", delay: 2 }}
      />
      <motion.div
        className="absolute w-[350px] h-[350px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(330 80% 55% / 0.08) 0%, transparent 70%)", bottom: "10%", left: "20%" }}
        animate={{ x: [0, 50, 0], y: [0, -20, 0] }}
        transition={{ duration: 22, repeat: Infinity, ease: "easeInOut", delay: 4 }}
      />
      <motion.div
        className="absolute w-[300px] h-[300px] rounded-full"
        style={{ background: "radial-gradient(circle, hsl(180 70% 40% / 0.08) 0%, transparent 70%)", top: "60%", right: "10%" }}
        animate={{ x: [0, -25, 0], y: [0, 35, 0] }}
        transition={{ duration: 16, repeat: Infinity, ease: "easeInOut", delay: 1 }}
      />
    </div>
  );
}

// ── Phone mockup with app screens ─────────────────────────────
function PhoneMockup() {
  return (
    <motion.div
      initial={{ opacity: 0, y: 40, rotateY: -5 }}
      animate={{ opacity: 1, y: 0, rotateY: 0 }}
      transition={{ duration: 0.8, delay: 0.3, ease: [0.16, 1, 0.3, 1] }}
      className="relative"
      style={{ perspective: 1200 }}
    >
      <motion.div
        animate={{ y: [-8, 8, -8] }}
        transition={{ duration: 6, repeat: Infinity, ease: "easeInOut" }}
        className="relative w-[280px] md:w-[320px]"
      >
        {/* Phone frame */}
        <div className="rounded-[2.5rem] border-[6px] border-gray-800 bg-white shadow-2xl shadow-primary/20 overflow-hidden">
          {/* Notch */}
          <div className="flex justify-center pt-2 pb-1 bg-white">
            <div className="w-24 h-5 bg-gray-800 rounded-full" />
          </div>
          {/* Screen content */}
          <div className="px-3 pb-4">
            {/* App header */}
            <div className="flex items-center justify-between py-2">
              <div className="flex items-center gap-1.5">
                <div className="w-5 h-5 rounded-md bg-primary flex items-center justify-center">
                  <span className="text-[7px] font-bold text-white">V.</span>
                </div>
                <span className="text-[9px] font-bold text-gray-800">VITAS</span>
              </div>
              <div className="flex gap-1.5">
                <div className="w-5 h-5 rounded-full bg-amber-100 flex items-center justify-center">
                  <Star size={8} className="text-amber-500" />
                </div>
                <div className="w-5 h-5 rounded-full bg-purple-100 flex items-center justify-center">
                  <Users size={8} className="text-purple-500" />
                </div>
              </div>
            </div>

            {/* PULSE LIVE */}
            <div className="mb-3">
              <h3 className="text-[11px] font-bold text-primary tracking-wide">PULSE LIVE</h3>
              <p className="text-[7px] text-gray-400">Inteligencia futbolística en tiempo real</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { icon: BarChart3, label: "VSI AVG", value: "72.4", color: "text-primary" },
                { icon: Zap, label: "ACTIVOS", value: "342", color: "text-purple-600" },
                { icon: Shield, label: "ALERTAS", value: "18", color: "text-amber-500" },
              ].map((s) => (
                <div key={s.label} className="bg-gray-50 rounded-lg p-2 text-center border border-gray-100">
                  <s.icon size={10} className={`${s.color} mx-auto mb-0.5`} />
                  <p className="text-[6px] text-gray-400 uppercase">{s.label}</p>
                  <p className={`text-[13px] font-bold ${s.color}`}>{s.value}</p>
                </div>
              ))}
            </div>

            {/* Ranking */}
            <div className="mb-2">
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1">
                  <Star size={8} className="text-amber-500" />
                  <span className="text-[8px] font-bold text-gray-700 uppercase tracking-wider">Ranking Top</span>
                </div>
                <span className="text-[7px] text-primary font-semibold">Ver todos →</span>
              </div>
              {[
                { initials: "LR", name: "L. Rodríguez", pos: "CAM · 16 años", score: 94, tags: ["SUB-17", "ELITE"], color: "bg-emerald-500" },
                { initials: "MF", name: "M. Fernández", pos: "ST · 17 años", score: 91, tags: ["SUB-17"], color: "bg-blue-500" },
                { initials: "AG", name: "A. García", pos: "ST · 15 años", score: 88, tags: ["PRO+"], color: "bg-emerald-500" },
              ].map((p) => (
                <div key={p.initials} className="flex items-center gap-2 py-1.5 border-b border-gray-50 last:border-0">
                  <div className={`w-7 h-7 rounded-full ${p.color} text-white flex items-center justify-center text-[8px] font-bold shrink-0`}>
                    {p.initials}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-[9px] font-semibold text-gray-800 truncate">{p.name}</p>
                    <p className="text-[7px] text-gray-400">{p.pos}</p>
                    <div className="flex gap-0.5 mt-0.5">
                      {p.tags.map((t) => (
                        <span key={t} className="text-[5px] px-1 py-0.5 rounded-full bg-emerald-50 text-emerald-600 font-bold uppercase">{t}</span>
                      ))}
                    </div>
                  </div>
                  <span className="text-[16px] font-bold text-emerald-500">{p.score}</span>
                </div>
              ))}
            </div>

            {/* PHV bar */}
            <div className="bg-gray-50 rounded-lg p-2 border border-gray-100">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[7px] text-gray-500 flex items-center gap-1">
                  <Activity size={7} /> Maduración PHV
                </span>
                <span className="text-[7px] text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded-full">Madurador tardío</span>
              </div>
              <div className="w-full h-2 bg-gray-200 rounded-full overflow-hidden">
                <motion.div
                  className="h-full rounded-full"
                  style={{ background: "linear-gradient(90deg, #0059B3, #A855F7)" }}
                  initial={{ width: 0 }}
                  animate={{ width: "68%" }}
                  transition={{ duration: 1.5, delay: 1, ease: "easeOut" }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ── Animated stat counter ─────────────────────────────────────
function AnimatedStat({ value, label, color }: { value: string; label: string; color: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      className="text-center"
    >
      <p className={`text-3xl md:text-4xl font-display font-black ${color}`}>{value}</p>
      <p className="text-[10px] uppercase tracking-[0.15em] text-muted-foreground mt-1">{label}</p>
    </motion.div>
  );
}

// ── Main component ────────────────────────────────────────────
export default function PublicLanding() {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, configured } = useAuth();
  const isLoggedIn = !!(user && configured);
  const shouldRedirect = isLoggedIn && location.pathname === "/";

  useEffect(() => {
    if (shouldRedirect) navigate("/pulse", { replace: true });
  }, [shouldRedirect, navigate]);

  useEffect(() => {
    document.title = "VITAS · Inteligencia futbolística con corrección PHV";
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
    set("description", "Detecta talento oculto en academias juveniles con IA. Único modelo del mercado con corrección de maduración biológica (PHV).");
    set("og:title", "VITAS · Football Intelligence", true);
    set("og:description", "Análisis IA para academias juveniles · corrección PHV · VAEP · escaneo · drills personalizados.", true);
    set("og:image", "/og-image.png", true);
    set("og:url", "https://futuro-club.vercel.app", true);
    set("twitter:card", "summary_large_image");
  }, []);

  return (
    <div className="min-h-screen relative overflow-hidden bg-background">
      <FloatingOrbs />

      {/* ── Gradient top bar ─────────────────────────────────── */}
      <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #F59E0B, #E6197A, #A855F7, #0059B3)" }} />

      {/* ── Navbar ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-7xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-9 h-9 rounded-xl flex items-center justify-center" style={{ background: "linear-gradient(135deg, #0059B3, #A855F7)" }}>
              <span className="text-white font-display font-black text-sm">V</span>
            </div>
            <span className="font-display font-bold text-lg text-foreground">
              V<span style={{ background: "linear-gradient(90deg, #0059B3, #A855F7)", WebkitBackgroundClip: "text", WebkitTextFillColor: "transparent" }}>I</span>TAS.
            </span>
            <span className="text-[10px] font-display text-muted-foreground hidden sm:block">FOOTBALL INTELLIGENCE</span>
          </div>
          <nav className="hidden md:flex items-center gap-5 text-xs font-display font-semibold text-muted-foreground">
            <a href="#features" className="hover:text-foreground transition-colors">Funciones</a>
            <a href="#phv" className="hover:text-foreground transition-colors">PHV</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">Planes</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <nav className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                to="/pulse"
                className="px-4 py-2 rounded-xl text-xs font-display font-bold text-white flex items-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #0059B3, #A855F7)" }}
              >
                Dashboard <ArrowRight size={12} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-xs font-display font-semibold text-muted-foreground hover:text-foreground transition-colors">
                  Iniciar sesión
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-xl text-xs font-display font-bold text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #0059B3, #A855F7)" }}
                >
                  Empezar gratis <ArrowRight size={12} />
                </Link>
              </>
            )}
          </nav>
        </div>
      </header>

      {/* ── Hero ─────────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 py-12 md:py-20 relative z-10">
        <div className="grid md:grid-cols-2 gap-8 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.6 }}
            className="space-y-6"
          >
            <div className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[11px] font-display font-bold uppercase tracking-wider"
              style={{ background: "linear-gradient(90deg, rgba(0,89,179,0.1), rgba(168,85,247,0.1))", borderColor: "rgba(0,89,179,0.2)", color: "#0059B3" }}
            >
              <Sparkles size={12} /> V1.0 · Software · App Nativa · Web · iOS · Android
            </div>
            <h1 className="font-display font-black text-4xl md:text-[3.5rem] text-foreground leading-[1.05]">
              Detecta el talento que{" "}
              <span style={{
                background: "linear-gradient(135deg, #3B82F6, #A855F7, #E6197A, #F59E0B)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                los demás no ven.
              </span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-lg">
              VITAS es la primera plataforma de Football Intelligence con corrección
              de maduración biológica (PHV). Detecta talento oculto en academias
              juveniles que sistemas tradicionales clasifican erróneamente por su
              físico actual. Scouting, análisis táctico con IA y gestión integral.
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                to="/register"
                className="px-6 py-3.5 rounded-xl font-display font-bold text-sm text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg"
                style={{ background: "linear-gradient(135deg, #E6197A, #A855F7)", boxShadow: "0 8px 30px rgba(230,25,122,0.3)" }}
              >
                <Play size={14} /> VER DEMO
              </Link>
              <Link
                to="/login"
                className="px-6 py-3.5 rounded-xl border border-border bg-white/80 font-display font-bold text-sm text-foreground flex items-center justify-center gap-2 hover:bg-white transition-colors"
              >
                Solicitar demo
              </Link>
            </div>
            {/* Stats row */}
            <div className="flex gap-8 pt-4">
              <AnimatedStat value="12.847" label="Jugadores" color="text-cyan-600" />
              <AnimatedStat value="342" label="Sesiones Live" color="text-cyan-600" />
              <AnimatedStat value="1.893" label="Insights/Día" color="text-cyan-600" />
            </div>
          </motion.div>

          {/* Phone mockup */}
          <div className="flex justify-center md:justify-end relative">
            {/* Floating dot decorations */}
            <motion.div
              className="absolute w-3 h-3 rounded-full bg-primary/30"
              style={{ top: "5%", left: "15%" }}
              animate={{ y: [0, -15, 0], opacity: [0.3, 0.7, 0.3] }}
              transition={{ duration: 4, repeat: Infinity }}
            />
            <motion.div
              className="absolute w-2 h-2 rounded-full bg-purple-400/40"
              style={{ top: "15%", right: "20%" }}
              animate={{ y: [0, -10, 0], opacity: [0.4, 0.8, 0.4] }}
              transition={{ duration: 3, repeat: Infinity, delay: 1 }}
            />
            <PhoneMockup />
          </div>
        </div>
      </section>

      {/* ── Diferenciador PHV ─────────────────────────────────── */}
      <section id="phv" className="border-y border-border/50 relative">
        <div className="max-w-7xl mx-auto px-4 py-14">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid md:grid-cols-2 gap-10 items-center"
          >
            <div className="space-y-5">
              <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[10px] font-display font-bold uppercase tracking-wider"
                style={{ background: "rgba(212,148,10,0.1)", color: "#D4940A", border: "1px solid rgba(212,148,10,0.2)" }}>
                Diferenciador único
              </div>
              <h2 className="font-display font-black text-2xl md:text-4xl text-foreground leading-tight">
                Tu mejor jugador no es el más alto.{" "}
                <span style={{
                  background: "linear-gradient(135deg, #0059B3, #A855F7)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  Es el que aún no ha crecido.
                </span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                El 70% de los seleccionados en academias juveniles nacen en el
                primer trimestre del año. Son más grandes, más fuertes, pero no
                necesariamente más talentosos. VITAS aplica la fórmula Mirwald
                de Peak Height Velocity (PHV) para corregir esa ventaja
                biológica y ver al jugador real debajo.
              </p>
              <ul className="space-y-2.5 text-sm">
                <FeatureLine text="Cálculo PHV con datos antropométricos · sin necesidad de radiografía" />
                <FeatureLine text="VSI corregido por edad biológica, no cronológica" />
                <FeatureLine text="Predicción ventana neuromotora · cuándo cargarle gym, cuándo no" />
              </ul>
            </div>
            <div className="rounded-2xl p-6 space-y-3 border"
              style={{ background: "linear-gradient(135deg, rgba(0,89,179,0.03), rgba(168,85,247,0.03))", borderColor: "rgba(0,89,179,0.15)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ejemplo real</span>
                <span className="text-[10px] font-bold" style={{ color: "#0059B3" }}>Sub-12</span>
              </div>
              <ComparisonRow name="Pablo (Q1, 1.62m)" vsiClassic={78} vsiCorrected={62} />
              <ComparisonRow name="Hugo (Q4, 1.42m)" vsiClassic={64} vsiCorrected={81} highlight />
              <p className="text-[11px] text-muted-foreground border-t border-border pt-3 leading-relaxed">
                Sin VITAS, Pablo se queda en el equipo y Hugo se queda en casa.
                Con VITAS, ves que Hugo es 19 puntos mejor cuando crezca.
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 4 features ────────────────────────────────────────── */}
      <section id="features" className="max-w-7xl mx-auto px-4 py-14 md:py-20 relative z-10">
        <h2 className="font-display font-black text-2xl md:text-4xl text-center text-foreground mb-3">
          Todo lo que un coach moderno necesita
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          Análisis automático de video con IA · escaneo · perfil de rol · drills
          personalizados por edad · copilot Telegram. Cero manual de instrucciones.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <FeatureCard icon={Brain} title="Análisis IA" color="#A855F7"
            description="Sube un video · 5 min después tienes pases, duelos, recuperaciones, escaneo, mapa de calor y perfil de rol." />
          <FeatureCard icon={Activity} title="VSI + PHV" color="#0059B3"
            description="Score 0-100 corregido por madurez biológica. Detecta diamantes ocultos por la timing del nacimiento." />
          <FeatureCard icon={Eye} title="Escaneo + Voronoi" color="#158585"
            description="Cuántas veces gira la cabeza antes de recibir. Cuánto espacio controla. Métricas de élite con un móvil." />
          <FeatureCard icon={Send} title="Copilot Telegram" color="#E6197A"
            description="Pregúntale al bot 'cómo va Samu' o '/drill pase' y respuesta en 5s sin abrir la app." />
        </div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────────────── */}
      <section className="border-y border-border/50 relative">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20">
          <h2 className="font-display font-black text-2xl md:text-4xl text-center text-foreground mb-12">
            En 3 pasos
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard num={1} title="Registra a tus jugadores" icon={Target} color="#0059B3"
              description="Antropometría básica (altura, peso, edad). El sistema calcula PHV automáticamente." />
            <StepCard num={2} title="Sube un video del partido" icon={Zap} color="#A855F7"
              description="MP4 desde el móvil. La IA detecta jugadores, eventos y posiciones sin necesidad de cámara profesional." />
            <StepCard num={3} title="Recibe insights accionables" icon={TrendingUp} color="#158585"
              description="VSI corregido, drills personalizados, comparativa con referentes pro y plan de carga adaptado a la fase PHV." />
          </div>
        </div>
      </section>

      {/* ── Planes ────────────────────────────────────────────── */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 py-14 md:py-20">
        <h2 className="font-display font-black text-2xl md:text-4xl text-center text-foreground mb-3">
          Tres planes para tres momentos
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-12">
          Free para probar · Pro para coaches independientes · Club para academias completas.
        </p>
        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          <PlanTier name="Free" description="Para probar la plataforma"
            features={["1 jugador", "1 análisis IA al mes", "Acceso a la base de +365 jugadores de La Liga", "VSI corregido por PHV"]} />
          <PlanTier name="Pro" description="Para coaches independientes" highlight
            features={["Hasta 25 jugadores", "Análisis IA ilimitados", "Match-day Live (etiqueta eventos en directo)", "Telegram Copilot personal", "PHV plan personalizado", "Drills personalizados por edad", "Mapa de calor + escaneo + Voronoi"]} />
          <PlanTier name="Club" description="Para academias completas"
            features={["Jugadores ilimitados", "Equipo: scouts + directores invitables", "Benchmark cross-club anónimo", "Compare-vs-rival con plan táctico", "Dashboard de padres", "API + integraciones (white-label)", "Soporte prioritario"]} />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-8">
          Empieza gratis sin tarjeta · cambia de plan o cancela cuando quieras
        </p>
      </section>

      {/* ── CTA final ─────────────────────────────────────────── */}
      <section className="max-w-7xl mx-auto px-4 py-14 md:py-20 text-center relative z-10">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="rounded-3xl p-8 md:p-14 max-w-3xl mx-auto border"
          style={{
            background: "linear-gradient(135deg, rgba(0,89,179,0.05), rgba(168,85,247,0.05))",
            borderColor: "rgba(0,89,179,0.2)",
          }}
        >
          <Shield size={36} className="mx-auto mb-4" style={{ color: "#A855F7" }} />
          <h2 className="font-display font-black text-2xl md:text-4xl text-foreground mb-4">
            Empieza esta tarde con 1 video
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-xl mx-auto">
            Cero credenciales de tarjeta. Cero contrato. 5 minutos para subir tu primer
            video y ver de qué hablamos.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-display font-bold text-sm text-white hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg"
            style={{ background: "linear-gradient(135deg, #E6197A, #A855F7)", boxShadow: "0 8px 30px rgba(230,25,122,0.3)" }}
          >
            Empezar gratis <ArrowRight size={14} />
          </Link>
        </motion.div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-border/50">
        <div className="max-w-7xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: "linear-gradient(135deg, #0059B3, #A855F7)" }}>
              <span className="text-white font-display font-black text-[10px]">V</span>
            </div>
            <span className="text-xs text-muted-foreground">VITAS · Football Intelligence © 2026</span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">Términos</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacidad</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">Acceso</Link>
          </nav>
        </div>
        {/* Bottom gradient bar */}
        <div className="h-1 w-full" style={{ background: "linear-gradient(90deg, #0059B3, #A855F7, #E6197A, #F59E0B)" }} />
      </footer>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────

function FeatureLine({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <Check size={14} className="shrink-0 mt-0.5" style={{ color: "#A855F7" }} />
      <span>{text}</span>
    </li>
  );
}

function ComparisonRow({ name, vsiClassic, vsiCorrected, highlight }: {
  name: string; vsiClassic: number; vsiCorrected: number; highlight?: boolean;
}) {
  const diff = vsiCorrected - vsiClassic;
  return (
    <div className={`p-3.5 rounded-xl border ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-white/50"}`}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-display font-semibold text-foreground">{name}</span>
        {highlight && (
          <span className="text-[9px] uppercase tracking-wider font-bold px-1.5 py-0.5 rounded-full"
            style={{ background: "rgba(168,85,247,0.1)", color: "#A855F7" }}>Hidden gem</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">VSI clásico</p>
          <p className="font-mono text-foreground">{vsiClassic}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase" style={{ color: "#0059B3" }}>VSI VITAS</p>
          <p className="font-mono font-bold" style={{ color: diff > 0 ? "#0059B3" : "#D4940A" }}>
            {vsiCorrected} <span className="text-[10px]">({diff > 0 ? "+" : ""}{diff})</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description, color }: {
  icon: React.ElementType; title: string; description: string; color: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -6, scale: 1.02 }}
      transition={{ type: "spring", stiffness: 300, damping: 20 }}
      className="glass rounded-xl p-6 border border-border hover:border-opacity-50 transition-all space-y-3 group"
      style={{ ["--card-color" as string]: color }}
    >
      <div className="w-11 h-11 rounded-xl flex items-center justify-center" style={{ background: `${color}15` }}>
        <Icon size={20} style={{ color }} />
      </div>
      <h3 className="font-display font-bold text-sm text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}

function StepCard({ num, title, description, icon: Icon, color }: {
  num: number; title: string; description: string; icon: React.ElementType; color: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="glass rounded-xl p-6 space-y-3 border border-border hover:border-opacity-50 transition-all"
    >
      <div className="flex items-center gap-3">
        <span className="w-9 h-9 rounded-full flex items-center justify-center text-sm font-display font-black text-white"
          style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          {num}
        </span>
        <Icon size={20} style={{ color }} />
      </div>
      <h3 className="font-display font-bold text-base text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}

function PlanTier({ name, description, features, highlight }: {
  name: string; description: string; features: string[]; highlight?: boolean;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className={`rounded-2xl p-6 space-y-5 transition-all ${
        highlight
          ? "text-white border-2 md:scale-105 shadow-xl"
          : "glass border border-border hover:border-primary/30"
      }`}
      style={highlight ? {
        background: "linear-gradient(135deg, #0059B3, #A855F7)",
        borderColor: "#A855F7",
        boxShadow: "0 20px 60px rgba(168,85,247,0.25)",
      } : undefined}
    >
      {highlight && (
        <span className="inline-block text-[9px] uppercase tracking-wider px-2.5 py-1 rounded-full bg-white/20 text-white font-bold border border-white/30">
          Más popular
        </span>
      )}
      <div>
        <h3 className="font-display font-black text-xl">{name}</h3>
        <p className={`text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{description}</p>
      </div>
      <ul className="space-y-2.5 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check size={13} className={`shrink-0 mt-0.5 ${highlight ? "text-white/90" : ""}`} style={!highlight ? { color: "#A855F7" } : undefined} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/register"
        className={`block w-full text-center px-4 py-2.5 rounded-xl text-xs font-display font-bold transition-all hover:scale-[1.02] ${
          highlight
            ? "bg-white text-primary hover:bg-white/90"
            : "text-white hover:opacity-90"
        }`}
        style={!highlight ? { background: "linear-gradient(135deg, #0059B3, #A855F7)" } : undefined}
      >
        Empezar
      </Link>
    </motion.div>
  );
}
