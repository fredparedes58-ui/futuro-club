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
import { useTranslation } from "react-i18next";
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
  const { t } = useTranslation();
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
              <p className="text-[7px] text-gray-400">{t("publicLanding.pulseSubtitle")}</p>
            </div>

            {/* Stat cards */}
            <div className="grid grid-cols-3 gap-1.5 mb-3">
              {[
                { icon: BarChart3, label: "VSI AVG", value: "72.4", color: "text-primary" },
                { icon: Zap, label: t("publicLanding.statActive"), value: "342", color: "text-purple-600" },
                { icon: Shield, label: t("publicLanding.statAlerts"), value: "18", color: "text-amber-500" },
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
                  <span className="text-[8px] font-bold text-gray-700 uppercase tracking-wider">{t("publicLanding.rankingTop")}</span>
                </div>
                <span className="text-[7px] text-primary font-semibold">{t("publicLanding.seeAll")}</span>
              </div>
              {[
                { initials: "LR", name: "L. Rodríguez", pos: `CAM · ${t("publicLanding.years", { count: 16 })}`, score: 94, tags: ["SUB-17", "ELITE"], color: "bg-emerald-500" },
                { initials: "MF", name: "M. Fernández", pos: `ST · ${t("publicLanding.years", { count: 17 })}`, score: 91, tags: ["SUB-17"], color: "bg-blue-500" },
                { initials: "AG", name: "A. García", pos: `ST · ${t("publicLanding.years", { count: 15 })}`, score: 88, tags: ["PRO+"], color: "bg-emerald-500" },
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
                  <Activity size={7} /> {t("publicLanding.phvMaturation")}
                </span>
                <span className="text-[7px] text-primary font-semibold bg-primary/10 px-1.5 py-0.5 rounded-full">{t("publicLanding.lateMaturer")}</span>
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
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const { user, configured } = useAuth();
  const isLoggedIn = !!(user && configured);
  const shouldRedirect = isLoggedIn && location.pathname === "/";

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
            <a href="#features" className="hover:text-foreground transition-colors">{t("publicLanding.navFeatures")}</a>
            <a href="#phv" className="hover:text-foreground transition-colors">PHV</a>
            <a href="#pricing" className="hover:text-foreground transition-colors">{t("publicLanding.navPlans")}</a>
            <a href="#faq" className="hover:text-foreground transition-colors">FAQ</a>
          </nav>
          <nav className="flex items-center gap-3">
            {isLoggedIn ? (
              <Link
                to="/pulse"
                className="px-4 py-2 rounded-xl text-xs font-display font-bold text-white flex items-center gap-1.5"
                style={{ background: "linear-gradient(135deg, #0059B3, #A855F7)" }}
              >
                {t("publicLanding.dashboard")} <ArrowRight size={12} />
              </Link>
            ) : (
              <>
                <Link to="/login" className="text-xs font-display font-semibold text-muted-foreground hover:text-foreground transition-colors">
                  {t("publicLanding.login")}
                </Link>
                <Link
                  to="/register"
                  className="px-4 py-2 rounded-xl text-xs font-display font-bold text-white flex items-center gap-1.5 hover:opacity-90 transition-opacity"
                  style={{ background: "linear-gradient(135deg, #0059B3, #A855F7)" }}
                >
                  {t("publicLanding.startFree")} <ArrowRight size={12} />
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
              <Sparkles size={12} /> {t("publicLanding.heroBadge")}
            </div>
            <h1 className="font-display font-black text-4xl md:text-[3.5rem] text-foreground leading-[1.05]">
              {t("publicLanding.heroTitleStart")}{" "}
              <span style={{
                background: "linear-gradient(135deg, #3B82F6, #A855F7, #E6197A, #F59E0B)",
                WebkitBackgroundClip: "text",
                WebkitTextFillColor: "transparent",
              }}>
                {t("publicLanding.heroTitleAccent")}
              </span>
            </h1>
            <p className="text-base md:text-lg text-muted-foreground leading-relaxed max-w-lg">
              {t("publicLanding.heroDescription")}
            </p>
            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <Link
                to="/register"
                className="px-6 py-3.5 rounded-xl font-display font-bold text-sm text-white flex items-center justify-center gap-2 hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg"
                style={{ background: "linear-gradient(135deg, #E6197A, #A855F7)", boxShadow: "0 8px 30px rgba(230,25,122,0.3)" }}
              >
                <Play size={14} /> {t("publicLanding.watchDemo")}
              </Link>
              <Link
                to="/login"
                className="px-6 py-3.5 rounded-xl border border-border bg-white/80 font-display font-bold text-sm text-foreground flex items-center justify-center gap-2 hover:bg-white transition-colors"
              >
                {t("publicLanding.requestDemo")}
              </Link>
            </div>
            {/* Stats row */}
            <div className="flex gap-8 pt-4">
              <AnimatedStat value="12.847" label={t("publicLanding.statPlayers")} color="text-cyan-600" />
              <AnimatedStat value="342" label={t("publicLanding.statLiveSessions")} color="text-cyan-600" />
              <AnimatedStat value="1.893" label={t("publicLanding.statInsightsPerDay")} color="text-cyan-600" />
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
                {t("publicLanding.uniqueDifferentiator")}
              </div>
              <h2 className="font-display font-black text-2xl md:text-4xl text-foreground leading-tight">
                {t("publicLanding.phvHeadingStart")}{" "}
                <span style={{
                  background: "linear-gradient(135deg, #0059B3, #A855F7)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                }}>
                  {t("publicLanding.phvHeadingAccent")}
                </span>
              </h2>
              <p className="text-sm text-muted-foreground leading-relaxed">
                {t("publicLanding.phvParagraph")}
              </p>
              <ul className="space-y-2.5 text-sm">
                <FeatureLine text={t("publicLanding.phvFeature1")} />
                <FeatureLine text={t("publicLanding.phvFeature2")} />
                <FeatureLine text={t("publicLanding.phvFeature3")} />
              </ul>
            </div>
            <div className="rounded-2xl p-6 space-y-3 border"
              style={{ background: "linear-gradient(135deg, rgba(0,89,179,0.03), rgba(168,85,247,0.03))", borderColor: "rgba(0,89,179,0.15)" }}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{t("publicLanding.realExample")}</span>
                <span className="text-[10px] font-bold" style={{ color: "#0059B3" }}>Sub-12</span>
              </div>
              <ComparisonRow name="Pablo (Q1, 1.62m)" vsiClassic={78} vsiCorrected={62} />
              <ComparisonRow name="Hugo (Q4, 1.42m)" vsiClassic={64} vsiCorrected={81} highlight />
              <p className="text-[11px] text-muted-foreground border-t border-border pt-3 leading-relaxed">
                {t("publicLanding.exampleConclusion")}
              </p>
            </div>
          </motion.div>
        </div>
      </section>

      {/* ── 4 features ────────────────────────────────────────── */}
      <section id="features" className="max-w-7xl mx-auto px-4 py-14 md:py-20 relative z-10">
        <h2 className="font-display font-black text-2xl md:text-4xl text-center text-foreground mb-3">
          {t("publicLanding.featuresHeading")}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-12 max-w-2xl mx-auto">
          {t("publicLanding.featuresSubtitle")}
        </p>
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-5">
          <FeatureCard icon={Brain} title={t("publicLanding.featureAiTitle")} color="#A855F7"
            description={t("publicLanding.featureAiDesc")} />
          <FeatureCard icon={Activity} title="VSI + PHV" color="#0059B3"
            description={t("publicLanding.featureVsiDesc")} />
          <FeatureCard icon={Eye} title={t("publicLanding.featureScanTitle")} color="#158585"
            description={t("publicLanding.featureScanDesc")} />
          <FeatureCard icon={Send} title={t("publicLanding.featureTelegramTitle")} color="#E6197A"
            description={t("publicLanding.featureTelegramDesc")} />
        </div>
      </section>

      {/* ── Cómo funciona ─────────────────────────────────────── */}
      <section className="border-y border-border/50 relative">
        <div className="max-w-7xl mx-auto px-4 py-14 md:py-20">
          <h2 className="font-display font-black text-2xl md:text-4xl text-center text-foreground mb-12">
            {t("publicLanding.stepsHeading")}
          </h2>
          <div className="grid md:grid-cols-3 gap-6">
            <StepCard num={1} title={t("publicLanding.step1Title")} icon={Target} color="#0059B3"
              description={t("publicLanding.step1Desc")} />
            <StepCard num={2} title={t("publicLanding.step2Title")} icon={Zap} color="#A855F7"
              description={t("publicLanding.step2Desc")} />
            <StepCard num={3} title={t("publicLanding.step3Title")} icon={TrendingUp} color="#158585"
              description={t("publicLanding.step3Desc")} />
          </div>
        </div>
      </section>

      {/* ── Planes ────────────────────────────────────────────── */}
      <section id="pricing" className="max-w-7xl mx-auto px-4 py-14 md:py-20">
        <h2 className="font-display font-black text-2xl md:text-4xl text-center text-foreground mb-3">
          {t("publicLanding.pricingHeading")}
        </h2>
        <p className="text-sm text-muted-foreground text-center mb-12">
          {t("publicLanding.pricingSubtitle")}
        </p>
        <div className="grid md:grid-cols-3 gap-5 max-w-5xl mx-auto">
          <PlanTier name="Free" description={t("publicLanding.planFreeDesc")}
            features={[t("publicLanding.planFreeFeature1"), t("publicLanding.planFreeFeature2"), t("publicLanding.planFreeFeature3"), t("publicLanding.planFreeFeature4")]} />
          <PlanTier name="Pro" description={t("publicLanding.planProDesc")} highlight
            features={[t("publicLanding.planProFeature1"), t("publicLanding.planProFeature2"), t("publicLanding.planProFeature3"), t("publicLanding.planProFeature4"), t("publicLanding.planProFeature5"), t("publicLanding.planProFeature6"), t("publicLanding.planProFeature7")]} />
          <PlanTier name="Club" description={t("publicLanding.planClubDesc")}
            features={[t("publicLanding.planClubFeature1"), t("publicLanding.planClubFeature2"), t("publicLanding.planClubFeature3"), t("publicLanding.planClubFeature4"), t("publicLanding.planClubFeature5"), t("publicLanding.planClubFeature6"), t("publicLanding.planClubFeature7")]} />
        </div>
        <p className="text-xs text-muted-foreground text-center mt-8">
          {t("publicLanding.pricingNote")}
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
            {t("publicLanding.ctaHeading")}
          </h2>
          <p className="text-sm text-muted-foreground mb-8 max-w-xl mx-auto">
            {t("publicLanding.ctaParagraph")}
          </p>
          <Link
            to="/register"
            className="inline-flex items-center gap-2 px-8 py-4 rounded-xl font-display font-bold text-sm text-white hover:opacity-90 transition-all hover:scale-[1.02] shadow-lg"
            style={{ background: "linear-gradient(135deg, #E6197A, #A855F7)", boxShadow: "0 8px 30px rgba(230,25,122,0.3)" }}
          >
            {t("publicLanding.startFree")} <ArrowRight size={14} />
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
            <Link to="/terms" className="hover:text-foreground transition-colors">{t("publicLanding.footerTerms")}</Link>
            <Link to="/privacy" className="hover:text-foreground transition-colors">{t("publicLanding.footerPrivacy")}</Link>
            <Link to="/login" className="hover:text-foreground transition-colors">{t("publicLanding.footerAccess")}</Link>
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
  const { t } = useTranslation();
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
          <p className="text-[9px] uppercase text-muted-foreground">{t("publicLanding.vsiClassic")}</p>
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
  const { t } = useTranslation();
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
          {t("publicLanding.mostPopular")}
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
        {t("publicLanding.getStarted")}
      </Link>
    </motion.div>
  );
}
