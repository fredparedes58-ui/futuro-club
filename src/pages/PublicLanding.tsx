/**
 * VITAS · Public Landing Page
 *
 * Página marketing accesible sin login. SEO-friendly.
 * Si el usuario está logueado, redirige a /pulse.
 *
 * Estructura:
 *  - Hero con headline + sub + CTA registro/login
 *  - Diferenciador (PHV correction)
 *  - 4 features clave
 *  - Cómo funciona (3 pasos)
 *  - Pricing teaser
 *  - CTA final + footer
 */
import { useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  ArrowRight, Zap, Brain, Activity, Shield, Sparkles, Check,
  TrendingUp, Eye, Target, Send, Play,
} from "lucide-react";
import { useAuth } from "@/context/AuthContext";

export default function PublicLanding() {
  const navigate = useNavigate();
  const { user, configured } = useAuth();

  // Si ya está logueado, ir directo al dashboard
  useEffect(() => {
    if (user && configured) navigate("/pulse", { replace: true });
  }, [user, configured, navigate]);

  // SEO meta tags · actualiza dinámicamente
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
    <div className="min-h-screen bg-background">
      {/* ── Top nav ───────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary text-primary-foreground flex items-center justify-center font-display font-black text-sm">
              V
            </div>
            <span className="font-display font-bold text-foreground">VITAS</span>
            <span className="text-[9px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/20 text-primary border border-primary/30 ml-1">
              Beta
            </span>
          </div>
          <nav className="flex items-center gap-3">
            <Link to="/login" className="text-xs font-display font-semibold text-muted-foreground hover:text-foreground transition-colors">
              Iniciar sesión
            </Link>
            <Link
              to="/register"
              className="px-3 py-1.5 rounded-lg bg-primary text-primary-foreground text-xs font-display font-bold hover:bg-primary/90 transition-colors flex items-center gap-1"
            >
              Empezar gratis <ArrowRight size={11} />
            </Link>
          </nav>
        </div>
      </header>

      {/* ── Hero ──────────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12 md:py-20">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center max-w-3xl mx-auto space-y-5"
        >
          <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-primary/10 text-primary border border-primary/20 text-[11px] font-display font-bold uppercase tracking-wider">
            <Sparkles size={11} /> Único con corrección PHV
          </div>
          <h1 className="font-display font-black text-4xl md:text-6xl text-foreground leading-[1.1]">
            Detecta el talento que <span className="text-primary">otros pasan por alto</span>
          </h1>
          <p className="text-base md:text-lg text-muted-foreground leading-relaxed">
            VITAS es la primera plataforma de scouting juvenil que corrige la
            maduración biológica de cada jugador. Tu próximo crack quizá hoy
            esté tapado por compañeros que ya pegaron el estirón.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center pt-2">
            <Link
              to="/register"
              className="px-5 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
            >
              Empezar gratis <ArrowRight size={14} />
            </Link>
            <Link
              to="/login"
              className="px-5 py-3 rounded-xl bg-secondary border border-border font-display font-bold text-sm text-foreground hover:bg-secondary/70 transition-colors flex items-center justify-center gap-2"
            >
              <Play size={13} /> Probar demo
            </Link>
          </div>
          <p className="text-[11px] text-muted-foreground">
            Gratis · 1 jugador · sin tarjeta · cancela cuando quieras
          </p>
        </motion.div>
      </section>

      {/* ── Diferenciador PHV ─────────────────────────────────── */}
      <section className="bg-secondary/30 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 py-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true }}
            transition={{ duration: 0.5 }}
            className="grid md:grid-cols-2 gap-8 items-center"
          >
            <div className="space-y-4">
              <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-gold/10 text-gold border border-gold/20 text-[10px] font-display font-bold uppercase tracking-wider">
                Diferenciador único
              </div>
              <h2 className="font-display font-black text-2xl md:text-3xl text-foreground">
                Tu mejor jugador no es el más alto.<br/>Es el que <span className="text-primary">aún no ha crecido</span>.
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                El 70% de los seleccionados en academias juveniles nacen en el
                primer trimestre del año. Son más grandes, más fuertes, pero no
                necesariamente más talentosos. VITAS aplica la fórmula Mirwald
                de Peak Height Velocity (PHV) para corregir esa ventaja
                biológica y ver al jugador real debajo.
              </p>
              <ul className="space-y-2 text-sm">
                <FeatureLine text="Cálculo PHV con datos antropométricos · sin necesidad de radiografía" />
                <FeatureLine text="VSI corregido por edad biológica, no cronológica" />
                <FeatureLine text="Predicción ventana neuromotora · cuándo cargarle gym, cuándo no" />
              </ul>
            </div>
            <div className="glass rounded-2xl p-6 space-y-3 border border-primary/20">
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Ejemplo real</span>
                <span className="text-[10px] text-primary font-bold">Sub-12</span>
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
      <section className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <h2 className="font-display font-black text-2xl md:text-3xl text-center text-foreground mb-3">
          Todo lo que un coach moderno necesita
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-10 max-w-2xl mx-auto">
          Análisis automático de video con IA · escaneo · perfil de rol · drills
          personalizados por edad · copilot Telegram. Cero manual de instrucciones.
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <FeatureCard
            icon={Brain}
            title="Análisis IA"
            description="Sube un video · 5 min después tienes pases, duelos, recuperaciones, escaneo, mapa de calor y perfil de rol."
          />
          <FeatureCard
            icon={Activity}
            title="VSI + PHV"
            description="Score 0-100 corregido por madurez biológica. Detecta diamantes ocultos por la timing del nacimiento."
          />
          <FeatureCard
            icon={Eye}
            title="Escaneo + Voronoi"
            description="Cuántas veces gira la cabeza antes de recibir. Cuánto espacio controla. Métricas de élite con un móvil."
          />
          <FeatureCard
            icon={Send}
            title="Copilot Telegram"
            description="Pregúntale al bot 'cómo va Samu' o '/drill pase' y respuesta en 5s sin abrir la app."
          />
        </div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────────────── */}
      <section className="bg-secondary/30 border-y border-border">
        <div className="max-w-6xl mx-auto px-4 py-12 md:py-16">
          <h2 className="font-display font-black text-2xl md:text-3xl text-center text-foreground mb-10">
            En 3 pasos
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard
              num={1}
              title="Registra a tus jugadores"
              description="Antropometría básica (altura, peso, edad). El sistema calcula PHV automáticamente."
              icon={Target}
            />
            <StepCard
              num={2}
              title="Sube un video del partido"
              description="MP4 desde el móvil. La IA detecta jugadores, eventos y posiciones sin necesidad de cámara profesional."
              icon={Zap}
            />
            <StepCard
              num={3}
              title="Recibe insights accionables"
              description="VSI corregido, drills personalizados, comparativa con referentes pro y plan de carga adaptado a la fase PHV."
              icon={TrendingUp}
            />
          </div>
        </div>
      </section>

      {/* ── Pricing teaser ────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12 md:py-16">
        <h2 className="font-display font-black text-2xl md:text-3xl text-center text-foreground mb-3">
          Precios honestos
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-10">
          Free para probar · Pro cuando te enganches · Club para academias completas.
        </p>
        <div className="grid md:grid-cols-3 gap-4 max-w-4xl mx-auto">
          <PricingTier
            name="Free"
            price="0€"
            description="Para probar"
            features={["1 jugador", "1 análisis IA al mes", "Acceso a la base de 365+ jugadores Liga"]}
          />
          <PricingTier
            name="Pro"
            price="19€"
            period="/mes"
            description="Para coaches independientes"
            highlight
            features={["25 jugadores", "Análisis IA ilimitados", "Match-day Live", "Telegram copilot", "PHV plan personalizado"]}
          />
          <PricingTier
            name="Club"
            price="99€"
            period="/mes"
            description="Para academias"
            features={["Jugadores ilimitados", "Equipo (scouts + directores)", "Benchmark cross-club anónimo", "Compare-vs-rival", "Soporte prioritario"]}
          />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-6">
          Trial 14 días en cualquier plan · sin tarjeta · cancela cuando quieras
        </p>
      </section>

      {/* ── CTA final ─────────────────────────────────────────── */}
      <section className="max-w-6xl mx-auto px-4 py-12 md:py-16 text-center">
        <div className="glass rounded-3xl p-8 md:p-12 border border-primary/30 bg-primary/5 max-w-3xl mx-auto">
          <Shield size={32} className="mx-auto text-primary mb-4" />
          <h2 className="font-display font-black text-2xl md:text-3xl text-foreground mb-3">
            Empieza esta tarde con 1 video
          </h2>
          <p className="text-sm text-muted-foreground mb-6 max-w-xl mx-auto">
            Cero credenciales de tarjeta. Cero contrato. 5 minutos para subir tu primer
            video y ver de qué hablamos.
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 transition-colors"
          >
            Empezar gratis <ArrowRight size={14} />
          </Link>
        </div>
      </section>

      {/* ── Footer ────────────────────────────────────────────── */}
      <footer className="border-t border-border bg-secondary/30">
        <div className="max-w-6xl mx-auto px-4 py-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-primary text-primary-foreground flex items-center justify-center font-display font-black text-xs">
              V
            </div>
            <span className="text-xs text-muted-foreground">VITAS · Football Intelligence © 2026</span>
          </div>
          <nav className="flex items-center gap-4 text-xs text-muted-foreground">
            <Link to="/terms" className="hover:text-foreground transition-colors">Términos</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacidad</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">Acceso</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

// ── Subcomponentes ─────────────────────────────────────────────

function FeatureLine({ text }: { text: string }) {
  return (
    <li className="flex items-start gap-2 text-muted-foreground">
      <Check size={14} className="text-primary shrink-0 mt-0.5" />
      <span>{text}</span>
    </li>
  );
}

function ComparisonRow({ name, vsiClassic, vsiCorrected, highlight }: {
  name: string; vsiClassic: number; vsiCorrected: number; highlight?: boolean;
}) {
  const diff = vsiCorrected - vsiClassic;
  return (
    <div className={`p-3 rounded-lg border ${highlight ? "border-primary/40 bg-primary/5" : "border-border bg-secondary/30"}`}>
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-xs font-display font-semibold text-foreground">{name}</span>
        {highlight && <span className="text-[9px] uppercase tracking-wider text-primary font-bold">Hidden gem</span>}
      </div>
      <div className="grid grid-cols-2 gap-3 text-xs">
        <div>
          <p className="text-[9px] uppercase text-muted-foreground">VSI clásico</p>
          <p className="font-mono text-foreground">{vsiClassic}</p>
        </div>
        <div>
          <p className="text-[9px] uppercase text-primary">VSI VITAS</p>
          <p className={`font-mono font-bold ${diff > 0 ? "text-primary" : "text-gold"}`}>
            {vsiCorrected} <span className="text-[10px]">({diff > 0 ? "+" : ""}{diff})</span>
          </p>
        </div>
      </div>
    </div>
  );
}

function FeatureCard({ icon: Icon, title, description }: {
  icon: React.ElementType; title: string; description: string;
}) {
  return (
    <motion.div
      whileHover={{ y: -4 }}
      className="glass rounded-xl p-5 border border-border hover:border-primary/30 transition-colors space-y-2"
    >
      <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
        <Icon size={18} className="text-primary" />
      </div>
      <h3 className="font-display font-bold text-sm text-foreground">{title}</h3>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </motion.div>
  );
}

function StepCard({ num, title, description, icon: Icon }: {
  num: number; title: string; description: string; icon: React.ElementType;
}) {
  return (
    <div className="glass rounded-xl p-5 space-y-3">
      <div className="flex items-center gap-3">
        <span className="w-8 h-8 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-sm font-display font-black">
          {num}
        </span>
        <Icon size={18} className="text-primary" />
      </div>
      <h3 className="font-display font-bold text-base text-foreground">{title}</h3>
      <p className="text-sm text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function PricingTier({ name, price, period, description, features, highlight }: {
  name: string; price: string; period?: string; description: string; features: string[]; highlight?: boolean;
}) {
  return (
    <div className={`rounded-2xl p-6 space-y-4 ${
      highlight
        ? "bg-primary text-primary-foreground border-2 border-primary scale-105 shadow-xl"
        : "glass border border-border"
    }`}>
      {highlight && (
        <span className="inline-block text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary-foreground text-primary font-bold">
          Más popular
        </span>
      )}
      <div>
        <h3 className="font-display font-black text-lg">{name}</h3>
        <p className={`text-xs ${highlight ? "opacity-90" : "text-muted-foreground"}`}>{description}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="font-display font-black text-3xl">{price}</span>
        {period && <span className={`text-xs ${highlight ? "opacity-80" : "text-muted-foreground"}`}>{period}</span>}
      </div>
      <ul className="space-y-2 text-sm">
        {features.map((f) => (
          <li key={f} className="flex items-start gap-2">
            <Check size={13} className={`shrink-0 mt-0.5 ${highlight ? "" : "text-primary"}`} />
            <span>{f}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/register"
        className={`block w-full text-center px-4 py-2 rounded-lg text-xs font-display font-bold transition-colors ${
          highlight
            ? "bg-primary-foreground text-primary hover:bg-primary-foreground/90"
            : "bg-primary text-primary-foreground hover:bg-primary/90"
        }`}
      >
        Empezar
      </Link>
    </div>
  );
}
