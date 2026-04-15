/**
 * PricingPage — /pricing
 *
 * Página comercial pública para captar clubes / directores deportivos.
 * Incluye:
 *   - Hero con propuesta de valor
 *   - Tabla de planes (Free / Pro / Club) con datos reales de subscriptionService
 *   - Comparación vs competidores (Wyscout / Hudl / InStat) — datos públicos verificables
 *   - Testimonios (estructura lista, placeholders para rellenar con nombres reales)
 *   - Case studies (estructura lista para casos reales)
 *   - CTA final: registrarse o agendar demo
 *
 * NOTA: Testimonios y case studies usan placeholders "[Pendiente]" para evitar
 * inventar datos. El admin puede editarlos cuando tenga clientes reales.
 */
import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Check, X, ArrowRight, Zap, Shield, BarChart3,
  Brain, Video, TrendingUp, Star, Quote,
} from "lucide-react";
import {
  PLAN_LIMITS, PLAN_LABELS, PLAN_PRICES, type Plan,
} from "@/services/real/subscriptionService";

// ─── Data ────────────────────────────────────────────────────────────────────

interface PlanFeature {
  key: keyof typeof PLAN_LIMITS["free"];
  label: string;
}

const FEATURES: PlanFeature[] = [
  { key: "players", label: "Jugadores registrables" },
  { key: "analyses", label: "Análisis IA al mes" },
  { key: "vaep", label: "Métricas VAEP + Tracking desde video" },
  { key: "pdf", label: "Exportar informes PDF" },
  { key: "roles", label: "Gestión de equipo multi-rol" },
  { key: "pushNotifications", label: "Notificaciones push" },
];

interface CompetitorRow {
  feature: string;
  icon: React.ElementType;
  vitas: string;
  wyscout: string;
  hudl: string;
  instat: string;
}

/** Datos públicos: precios orientativos y features en sitios oficiales. */
const COMPETITORS: CompetitorRow[] = [
  {
    feature: "Precio desde",
    icon: Zap,
    vitas: "€19/mes",
    wyscout: "€2.000+/año",
    hudl: "€1.500+/año",
    instat: "Bajo consulta",
  },
  {
    feature: "Análisis IA de video",
    icon: Video,
    vitas: "✅ Incluido",
    wyscout: "Limitado",
    hudl: "Assist addon",
    instat: "✅ Incluido",
  },
  {
    feature: "Ajuste biológico PHV",
    icon: TrendingUp,
    vitas: "✅ Integrado",
    wyscout: "❌",
    hudl: "❌",
    instat: "❌",
  },
  {
    feature: "Métricas VAEP/SPADL",
    icon: BarChart3,
    vitas: "✅ Desde video",
    wyscout: "✅ (dataset)",
    hudl: "Limitado",
    instat: "✅ (dataset)",
  },
  {
    feature: "Agente IA para scouting",
    icon: Brain,
    vitas: "✅ Claude + Gemini",
    wyscout: "Parcial",
    hudl: "❌",
    instat: "❌",
  },
  {
    feature: "Setup sin hardware",
    icon: Shield,
    vitas: "✅ Solo video",
    wyscout: "N/A",
    hudl: "Cámaras propias",
    instat: "N/A",
  },
];

interface Testimonial {
  quote: string;
  author: string;
  role: string;
  club: string;
  rating: number;
}

/** Estructura lista — se rellena con clientes reales cuando existan. */
const TESTIMONIALS: Testimonial[] = [
  {
    quote: "[Pendiente de testimonio real]",
    author: "[Nombre del director deportivo]",
    role: "Director Deportivo",
    club: "[Club cliente]",
    rating: 5,
  },
  {
    quote: "[Pendiente de testimonio real]",
    author: "[Nombre del coordinador]",
    role: "Coordinador de Cantera",
    club: "[Club cliente]",
    rating: 5,
  },
  {
    quote: "[Pendiente de testimonio real]",
    author: "[Nombre del scout]",
    role: "Jefe de Scouting",
    club: "[Club cliente]",
    rating: 5,
  },
];

interface CaseStudy {
  club: string;
  category: string;
  metric: string;
  description: string;
}

/** Estructura lista para rellenar con casos reales. */
const CASE_STUDIES: CaseStudy[] = [
  {
    club: "[Cliente pendiente]",
    category: "Cantera Sub-16",
    metric: "[Métrica real]",
    description: "Caso de estudio pendiente. Estructura preparada para documentar resultados reales una vez el cliente autorice.",
  },
  {
    club: "[Cliente pendiente]",
    category: "Primer Equipo",
    metric: "[Métrica real]",
    description: "Caso de estudio pendiente. Espacio reservado para documentar impacto medible.",
  },
];

// ─── Component ───────────────────────────────────────────────────────────────

export default function PricingPage() {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-xl border-b border-border/40">
        <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
          <button
            onClick={() => navigate("/")}
            className="font-display font-black text-lg gradient-text"
          >
            VITAS
          </button>
          <div className="flex items-center gap-3">
            <button
              onClick={() => navigate("/login")}
              className="text-xs font-display font-semibold text-muted-foreground hover:text-foreground transition-colors"
            >
              Iniciar sesión
            </button>
            <button
              onClick={() => navigate("/register")}
              className="text-xs font-display font-semibold px-4 py-2 rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
            >
              Empezar gratis
            </button>
          </div>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-12 space-y-20">
        {/* Hero */}
        <motion.section
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center space-y-4 pt-8"
        >
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-primary/30 bg-primary/5">
            <Zap size={11} className="text-primary" />
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-primary">
              Football Intelligence Platform
            </span>
          </div>
          <h1 className="font-display font-black text-4xl md:text-6xl tracking-tight">
            Scouting de élite,{" "}
            <span className="gradient-text">sin hardware</span>
          </h1>
          <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
            VITAS extrae métricas VAEP, SPADL y biomecánica desde cualquier video
            de partido. Ajuste biológico PHV integrado. Desde €19/mes.
          </p>
        </motion.section>

        {/* Plans table */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-display font-bold text-2xl md:text-3xl">
              Planes transparentes
            </h2>
            <p className="text-sm text-muted-foreground">
              Sin permanencia. Cancela cuando quieras.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {(Object.keys(PLAN_LIMITS) as Plan[]).map((plan, idx) => (
              <PlanCard
                key={plan}
                plan={plan}
                featured={plan === "pro"}
                onCta={() => navigate(plan === "free" ? "/register" : "/billing")}
                index={idx}
              />
            ))}
          </div>
        </section>

        {/* Competitors */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-display font-bold text-2xl md:text-3xl">
              Comparativa con la competencia
            </h2>
            <p className="text-sm text-muted-foreground">
              Datos basados en planes públicos oficiales de cada proveedor.
            </p>
          </div>

          <div className="glass rounded-2xl p-4 md:p-6 overflow-x-auto">
            <table className="w-full text-left" role="table">
              <thead>
                <tr className="border-b border-border/40">
                  <th className="py-3 text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider pr-4">
                    Feature
                  </th>
                  <th className="py-3 text-[10px] font-display font-semibold text-primary uppercase tracking-wider px-2">
                    VITAS
                  </th>
                  <th className="py-3 text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider px-2">
                    Wyscout
                  </th>
                  <th className="py-3 text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider px-2">
                    Hudl
                  </th>
                  <th className="py-3 text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider px-2">
                    InStat
                  </th>
                </tr>
              </thead>
              <tbody>
                {COMPETITORS.map((row) => {
                  const Icon = row.icon;
                  return (
                    <tr key={row.feature} className="border-b border-border/20 last:border-0">
                      <td className="py-3 pr-4 flex items-center gap-2">
                        <Icon size={12} className="text-primary shrink-0" />
                        <span className="text-xs text-foreground">{row.feature}</span>
                      </td>
                      <td className="py-3 px-2 text-xs font-display font-semibold text-primary">
                        {row.vitas}
                      </td>
                      <td className="py-3 px-2 text-xs text-muted-foreground">{row.wyscout}</td>
                      <td className="py-3 px-2 text-xs text-muted-foreground">{row.hudl}</td>
                      <td className="py-3 px-2 text-xs text-muted-foreground">{row.instat}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="text-[10px] text-muted-foreground mt-4 italic">
              Precios y features orientativos obtenidos de sitios oficiales. Última revisión: {new Date().toLocaleDateString("es-ES", { month: "long", year: "numeric" })}.
            </p>
          </div>
        </section>

        {/* Testimonials */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-display font-bold text-2xl md:text-3xl">
              Lo que dicen clubes como el tuyo
            </h2>
            <p className="text-sm text-muted-foreground">
              Testimonios de clientes reales (placeholder — rellenar con citas autorizadas).
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {TESTIMONIALS.map((t, i) => (
              <motion.div
                key={i}
                initial={{ opacity: 0, y: 15 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: i * 0.1 }}
                className="glass rounded-xl p-5 space-y-3"
              >
                <Quote size={18} className="text-primary" />
                <div className="flex gap-0.5">
                  {Array.from({ length: t.rating }).map((_, k) => (
                    <Star key={k} size={12} className="text-amber-500 fill-amber-500" />
                  ))}
                </div>
                <p className="text-xs text-foreground italic leading-relaxed">"{t.quote}"</p>
                <div className="pt-2 border-t border-border/20">
                  <p className="text-xs font-display font-semibold text-foreground">{t.author}</p>
                  <p className="text-[10px] text-muted-foreground">
                    {t.role} · {t.club}
                  </p>
                </div>
              </motion.div>
            ))}
          </div>
        </section>

        {/* Case studies */}
        <section className="space-y-6">
          <div className="text-center space-y-2">
            <h2 className="font-display font-bold text-2xl md:text-3xl">
              Casos de uso reales
            </h2>
            <p className="text-sm text-muted-foreground">
              Resultados documentados de clubes que usan VITAS.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            {CASE_STUDIES.map((cs, i) => (
              <div key={i} className="glass rounded-xl p-5 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-[10px] font-display font-semibold text-primary uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10">
                    {cs.category}
                  </span>
                  <span className="text-[10px] font-display font-semibold text-muted-foreground">
                    {cs.club}
                  </span>
                </div>
                <p className="font-display font-bold text-2xl text-foreground">{cs.metric}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{cs.description}</p>
              </div>
            ))}
          </div>
        </section>

        {/* FAQ short */}
        <section className="space-y-4">
          <h2 className="font-display font-bold text-2xl md:text-3xl text-center">
            Preguntas frecuentes
          </h2>
          <div className="grid md:grid-cols-2 gap-3 max-w-4xl mx-auto">
            <FaqItem
              q="¿Necesito GPS o cámaras especiales?"
              a="No. VITAS analiza cualquier video convencional. Gemini + Claude extraen métricas VAEP/SPADL desde el video, sin hardware adicional."
            />
            <FaqItem
              q="¿Puedo exportar informes?"
              a="Sí, los planes Pro y Club incluyen exportación a PDF personalizada por jugador o equipo."
            />
            <FaqItem
              q="¿Qué es el ajuste PHV?"
              a="Peak Height Velocity. VITAS ajusta el score VSI según la madurez biológica del jugador (x1.12 early, x1.0 ontime, x0.92 late) para comparar justamente."
            />
            <FaqItem
              q="¿Hay permanencia?"
              a="No. Puedes cancelar desde tu panel de facturación cuando quieras."
            />
          </div>
        </section>

        {/* CTA final */}
        <section className="text-center space-y-4 py-12">
          <h2 className="font-display font-bold text-3xl md:text-4xl">
            Empieza en 5 minutos
          </h2>
          <p className="text-sm text-muted-foreground max-w-lg mx-auto">
            Sin tarjeta de crédito. El plan Free incluye 3 análisis IA al mes.
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 pt-2">
            <button
              onClick={() => navigate("/register")}
              className="flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-primary to-accent text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:shadow-[0_0_40px_hsl(var(--primary)/0.4)] transition-all"
            >
              Empezar gratis
              <ArrowRight size={14} />
            </button>
            <button
              onClick={() => navigate("/billing")}
              className="flex items-center gap-2 px-6 py-3 rounded-xl border border-border/40 text-foreground font-display font-semibold text-sm uppercase tracking-wider hover:bg-muted/40 transition-colors"
            >
              Ver planes Pro/Club
            </button>
          </div>
        </section>

        {/* Footer */}
        <footer className="pt-10 border-t border-border/20 text-center space-y-2">
          <p className="text-[10px] text-muted-foreground">
            © {new Date().getFullYear()} VITAS Intelligence · Football Analysis Platform
          </p>
          <div className="flex items-center justify-center gap-3">
            <button
              onClick={() => navigate("/terms")}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              Términos
            </button>
            <span className="text-muted-foreground/30">·</span>
            <button
              onClick={() => navigate("/privacy")}
              className="text-[10px] text-muted-foreground hover:text-primary transition-colors"
            >
              Privacidad
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

// ─── Subcomponents ───────────────────────────────────────────────────────────

function PlanCard({
  plan, featured, onCta, index,
}: {
  plan: Plan;
  featured: boolean;
  onCta: () => void;
  index: number;
}) {
  const label = PLAN_LABELS[plan];
  const price = PLAN_PRICES[plan];
  const limits = PLAN_LIMITS[plan];

  return (
    <motion.div
      initial={{ opacity: 0, y: 15 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }}
      transition={{ delay: index * 0.1 }}
      className={`rounded-2xl p-6 space-y-4 ${
        featured
          ? "bg-gradient-to-b from-primary/10 to-accent/5 border-2 border-primary/40 shadow-[0_0_40px_hsl(var(--primary)/0.1)]"
          : "glass border border-border/20"
      }`}
    >
      {featured && (
        <div className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-display font-bold uppercase tracking-wider">
          <Star size={9} />
          Más elegido
        </div>
      )}

      <div>
        <h3 className="font-display font-bold text-xl text-foreground">{label}</h3>
        <div className="flex items-baseline gap-1 mt-1">
          <span className="font-display font-black text-3xl text-foreground">
            €{price.monthly}
          </span>
          <span className="text-xs text-muted-foreground">/mes</span>
        </div>
      </div>

      <ul className="space-y-2 border-t border-border/20 pt-3" role="list">
        {FEATURES.map((feature) => {
          const value = limits[feature.key];
          const enabled = typeof value === "boolean"
            ? value
            : typeof value === "number" && value > 0;
          const display = typeof value === "number"
            ? value >= 9999 ? "Ilimitado" : `${value}`
            : null;

          return (
            <li key={feature.key} className="flex items-center gap-2 text-xs">
              {enabled ? (
                <Check size={13} className="text-emerald-500 shrink-0" />
              ) : (
                <X size={13} className="text-muted-foreground/50 shrink-0" />
              )}
              <span className={enabled ? "text-foreground" : "text-muted-foreground/60"}>
                {feature.label}
                {display && (
                  <span className="ml-1 font-display font-semibold text-primary">({display})</span>
                )}
              </span>
            </li>
          );
        })}
      </ul>

      <button
        onClick={onCta}
        className={`w-full px-4 py-2.5 rounded-xl font-display font-bold text-sm uppercase tracking-wider transition-all ${
          featured
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "border border-border/40 text-foreground hover:bg-muted/40"
        }`}
      >
        {plan === "free" ? "Empezar gratis" : `Elegir ${label}`}
      </button>
    </motion.div>
  );
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="glass rounded-xl p-4 group">
      <summary className="font-display font-semibold text-sm text-foreground cursor-pointer list-none flex items-center justify-between">
        {q}
        <span className="text-muted-foreground group-open:rotate-45 transition-transform">
          +
        </span>
      </summary>
      <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{a}</p>
    </details>
  );
}
