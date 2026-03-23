import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useState } from "react";
import {
  Activity, Compass, Crosshair, BarChart3, LayoutDashboard,
  Camera, GitCompareArrows, Settings, ArrowRight, Zap,
  Signal, Users, TrendingUp, FileText,
} from "lucide-react";
import { Floating3DCard } from "@/components/landing/Floating3DCard";
import {
  PulseScreen, MasterScreen, RankingsScreen, ScoutScreen,
} from "@/components/landing/MockupScreen";

const modules = [
  { path: "/pulse", icon: Activity, label: "Pulse", tag: "LIVE" },
  { path: "/master", icon: LayoutDashboard, label: "Master", tag: "AI" },
  { path: "/scout", icon: Compass, label: "Scout", tag: "NEW" },
  { path: "/drill", icon: Crosshair, label: "Solo Drill" },
  { path: "/rankings", icon: BarChart3, label: "Rankings" },
  { path: "/lab", icon: Camera, label: "VITAS.LAB", tag: "BETA" },
  { path: "/reports", icon: FileText, label: "Reports" },
  { path: "/compare", icon: GitCompareArrows, label: "Compare" },
  { path: "/settings", icon: Settings, label: "Settings" },
] as const;

function AnimatedStat({ value }: { value: number }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const controls = animate(count, value, { duration: 2.5, ease: "easeOut" });
    const unsub = rounded.on("change", setDisplay);
    return () => { controls.stop(); unsub(); };
  }, [value, count, rounded]);

  return <span>{display}</span>;
}

const Landing = () => {
  const navigate = useNavigate();

  const stats = [
    { icon: Users, label: "Jugadores", value: 12847 },
    { icon: Signal, label: "Sesiones live", value: 342 },
    { icon: TrendingUp, label: "Insights hoy", value: 1893 },
  ];

  return (
    <div className="min-h-screen relative overflow-hidden" style={{
      background: `
        radial-gradient(ellipse 80% 60% at 20% 10%, hsl(230 65% 55% / 0.06) 0%, transparent 60%),
        radial-gradient(ellipse 60% 50% at 80% 80%, hsl(270 50% 60% / 0.05) 0%, transparent 50%),
        radial-gradient(ellipse 50% 50% at 50% 50%, hsl(190 70% 48% / 0.03) 0%, transparent 40%),
        linear-gradient(160deg, hsl(220 30% 97%) 0%, hsl(220 28% 95%) 30%, hsl(225 26% 96%) 60%, hsl(220 30% 96%) 100%)
      `
    }}>
      {/* Subtle noise texture */}
      <div className="absolute inset-0 opacity-[0.02] pointer-events-none" style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg viewBox='0 0 256 256' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E")`,
        backgroundSize: "128px 128px",
      }} />

      {/* Dot grid */}
      <div className="absolute inset-0 opacity-[0.04] pointer-events-none" style={{
        backgroundImage: `radial-gradient(circle, hsl(220 20% 70%) 0.5px, transparent 0.5px)`,
        backgroundSize: "24px 24px",
      }} />

      <div className="relative z-10 max-w-7xl mx-auto px-6 md:px-10">
        {/* Topbar */}
        <motion.header
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.7 }}
          className="flex items-center justify-between pt-8 pb-6"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-muted-foreground">
              VITAS Intelligence
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/60 bg-card/30 backdrop-blur-md">
            <Zap size={10} className="text-primary" />
            <span className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
              Online
            </span>
          </div>
        </motion.header>

        {/* Hero + 3D showcase */}
        <div className="grid lg:grid-cols-2 gap-8 lg:gap-4 items-center min-h-[75vh]">
          {/* LEFT */}
          <div className="flex flex-col justify-center py-10 lg:py-0">
            <motion.div
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            >
              <h1 className="font-display font-black text-6xl md:text-8xl lg:text-[100px] text-foreground tracking-tighter leading-[0.85]">
                VITAS
                <span className="text-primary">.</span>
              </h1>
              <p className="text-sm md:text-base text-muted-foreground max-w-sm leading-relaxed mt-6">
                Plataforma de inteligencia deportiva para detección,
                evaluación y proyección de{" "}
                <span className="text-foreground font-medium">talento juvenil</span>.
              </p>
            </motion.div>

            {/* Stats */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.6, duration: 0.7 }}
              className="flex items-center gap-8 mt-10"
            >
              {stats.map((s) => (
                <div key={s.label} className="flex flex-col gap-1">
                  <div className="flex items-center gap-1.5 text-foreground">
                    <s.icon size={12} className="text-primary" />
                    <span className="font-display font-bold text-xl">
                      <AnimatedStat value={s.value} />
                    </span>
                  </div>
                  <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
                    {s.label}
                  </span>
                </div>
              ))}
            </motion.div>

            {/* CTA */}
            <motion.button
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: 0.8, duration: 0.6 }}
              onClick={() => navigate("/pulse")}
              className="group mt-10 flex items-center gap-3 px-6 py-3 w-fit rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:shadow-[0_0_30px_hsl(var(--primary)/0.5)] transition-all duration-500"
            >
              Entrar al sistema
              <ArrowRight size={16} className="group-hover:translate-x-1 transition-transform" />
            </motion.button>
          </div>

          {/* RIGHT: 3D floating mockups */}
          <div className="relative h-[500px] md:h-[600px] lg:h-[650px]" style={{ perspective: "1200px" }}>
            <Floating3DCard
              className="absolute top-[5%] left-[5%] w-[260px] h-[200px] md:w-[300px] md:h-[220px] z-30"
              delay={0.3} floatAmplitude={8} floatDuration={7} initialRotateX={6} initialRotateY={-10}
              onClick={() => navigate("/pulse")}
            >
              <PulseScreen />
            </Floating3DCard>

            <Floating3DCard
              className="absolute top-[30%] right-[0%] w-[240px] h-[190px] md:w-[280px] md:h-[210px] z-20"
              delay={0.5} floatAmplitude={12} floatDuration={8} initialRotateX={-4} initialRotateY={14}
              onClick={() => navigate("/master")}
            >
              <MasterScreen />
            </Floating3DCard>

            <Floating3DCard
              className="absolute bottom-[10%] left-[10%] w-[220px] h-[200px] md:w-[250px] md:h-[220px] z-20"
              delay={0.7} floatAmplitude={10} floatDuration={9} initialRotateX={10} initialRotateY={-6}
              onClick={() => navigate("/rankings")}
            >
              <RankingsScreen />
            </Floating3DCard>

            <Floating3DCard
              className="absolute bottom-[25%] right-[5%] w-[200px] h-[170px] md:w-[230px] md:h-[185px] z-10"
              delay={0.9} floatAmplitude={14} floatDuration={10} initialRotateX={-8} initialRotateY={-15}
              onClick={() => navigate("/scout")}
            >
              <ScoutScreen />
            </Floating3DCard>

            {/* Ambient glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[400px] h-[400px] rounded-full bg-primary/6 blur-[120px] pointer-events-none" />
            <div className="absolute top-1/4 right-0 w-[200px] h-[200px] rounded-full bg-accent/5 blur-[80px] pointer-events-none" />
          </div>
        </div>

        {/* Module strip */}
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 1, duration: 0.7 }}
          className="py-10"
        >
          <div className="flex items-center gap-2 mb-5">
            <div className="h-px flex-1 bg-gradient-to-r from-border/50 to-transparent" />
            <span className="text-[9px] font-display font-bold uppercase tracking-[0.25em] text-muted-foreground/60">
              Módulos
            </span>
            <div className="h-px flex-1 bg-gradient-to-l from-border/50 to-transparent" />
          </div>

          <div className="grid grid-cols-3 sm:grid-cols-9 gap-2">
            {modules.map((mod, i) => {
              const Icon = mod.icon;
              return (
                <motion.button
                  key={mod.path}
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  transition={{ delay: 1.1 + i * 0.05, duration: 0.4 }}
                  onClick={() => navigate(mod.path)}
                  className="group flex flex-col items-center gap-2 p-3 rounded-xl border border-border/20 bg-card/10 backdrop-blur-sm hover:bg-card/30 hover:border-primary/30 transition-all duration-400"
                >
                  <div className="relative">
                    <Icon size={18} className="text-muted-foreground group-hover:text-primary transition-colors duration-300" />
                    {"tag" in mod && mod.tag && (
                      <div className="absolute -top-1 -right-2 w-1.5 h-1.5 rounded-full bg-primary" />
                    )}
                  </div>
                  <span className="text-[8px] font-display font-semibold uppercase tracking-wider text-muted-foreground/70 group-hover:text-foreground/80 transition-colors">
                    {mod.label}
                  </span>
                </motion.button>
              );
            })}
          </div>
        </motion.div>

        {/* Footer */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.4 }}
          className="py-8 flex items-center justify-center gap-3"
        >
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-border/30" />
          <p className="text-[9px] font-display uppercase tracking-[0.3em] text-muted-foreground/30">
            © 2026 VITAS Intelligence
          </p>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-border/30" />
        </motion.div>
      </div>
    </div>
  );
};

export default Landing;
