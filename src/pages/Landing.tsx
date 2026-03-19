import { motion, useMotionValue, useTransform, animate } from "framer-motion";
import { useNavigate } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  Compass,
  Crosshair,
  BarChart3,
  LayoutDashboard,
  Camera,
  GitCompareArrows,
  Settings,
  ArrowUpRight,
  Zap,
  Signal,
  Users,
  TrendingUp,
} from "lucide-react";

/* ─── module registry ─── */
const modules = [
  { path: "/pulse", icon: Activity, label: "Pulse", desc: "Live Intelligence Center", tag: "LIVE", size: "large" },
  { path: "/master", icon: LayoutDashboard, label: "Master", desc: "Full Academy Intelligence", tag: "AI", size: "large" },
  { path: "/scout", icon: Compass, label: "Scout", desc: "Talent alerts & insights", tag: "NEW", size: "small" },
  { path: "/drill", icon: Crosshair, label: "Solo Drill", desc: "Individual evaluation", tag: null, size: "small" },
  { path: "/rankings", icon: BarChart3, label: "Rankings", desc: "Global VSI classification", tag: null, size: "small" },
  { path: "/lab", icon: Camera, label: "VITAS.LAB", desc: "Advanced video analysis", tag: "BETA", size: "small" },
  { path: "/compare", icon: GitCompareArrows, label: "Compare", desc: "Scout comparison tool", tag: null, size: "small" },
  { path: "/settings", icon: Settings, label: "Settings", desc: "System configuration", tag: null, size: "small" },
] as const;

/* ─── animated counter ─── */
function AnimatedStat({ value, suffix = "" }: { value: number; suffix?: string }) {
  const count = useMotionValue(0);
  const rounded = useTransform(count, (v) => Math.round(v).toLocaleString());
  const [display, setDisplay] = useState("0");

  useEffect(() => {
    const controls = animate(count, value, { duration: 2, ease: "easeOut" });
    const unsub = rounded.on("change", setDisplay);
    return () => { controls.stop(); unsub(); };
  }, [value, count, rounded]);

  return <span>{display}{suffix}</span>;
}

/* ─── grid background ─── */
function GridBg() {
  return (
    <div className="absolute inset-0 overflow-hidden pointer-events-none">
      <div className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `linear-gradient(hsl(var(--primary)) 1px, transparent 1px), linear-gradient(90deg, hsl(var(--primary)) 1px, transparent 1px)`,
          backgroundSize: "60px 60px",
        }}
      />
      {/* Radial fade */}
      <div className="absolute inset-0 bg-gradient-to-b from-background via-transparent to-background" />
      <div className="absolute inset-0 bg-gradient-to-r from-background via-transparent to-background" />
    </div>
  );
}

/* ─── floating orb ─── */
function Orb({ className }: { className: string }) {
  return (
    <motion.div
      className={`absolute rounded-full blur-[100px] pointer-events-none ${className}`}
      animate={{ scale: [1, 1.2, 1], opacity: [0.3, 0.5, 0.3] }}
      transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}
    />
  );
}

/* ─── module card ─── */
function ModuleCard({ mod, index }: { mod: typeof modules[number]; index: number }) {
  const navigate = useNavigate();
  const Icon = mod.icon;
  const isLarge = mod.size === "large";
  const ref = useRef<HTMLButtonElement>(null);

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!ref.current) return;
    const rect = ref.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    ref.current.style.setProperty("--mx", `${x}px`);
    ref.current.style.setProperty("--my", `${y}px`);
  };

  return (
    <motion.button
      ref={ref}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.4 + index * 0.06, duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
      onClick={() => navigate(mod.path)}
      onMouseMove={handleMouseMove}
      className={`group relative text-left rounded-2xl border border-border/50 bg-card/30 backdrop-blur-sm overflow-hidden transition-all duration-500 hover:border-primary/40 hover:bg-card/50 active:scale-[0.97] ${
        isLarge ? "sm:col-span-2 p-6" : "p-5"
      }`}
      style={{ "--mx": "50%", "--my": "50%" } as React.CSSProperties}
    >
      {/* Spotlight hover effect */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{
          background: "radial-gradient(300px circle at var(--mx) var(--my), hsl(var(--primary) / 0.06), transparent 60%)",
        }}
      />

      {/* Top row: icon + tag */}
      <div className="relative z-10 flex items-start justify-between mb-4">
        <div className={`${isLarge ? "p-3" : "p-2.5"} rounded-xl bg-primary/5 border border-primary/10 group-hover:bg-primary/10 group-hover:border-primary/20 transition-all duration-500`}>
          <Icon size={isLarge ? 22 : 18} className="text-primary group-hover:drop-shadow-[0_0_8px_hsl(var(--primary)/0.5)] transition-all duration-500" />
        </div>
        <div className="flex items-center gap-2">
          {mod.tag && (
            <span className="text-[9px] font-display font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
              {mod.tag}
            </span>
          )}
          <ArrowUpRight
            size={14}
            className="text-muted-foreground/30 group-hover:text-primary group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-all duration-300"
          />
        </div>
      </div>

      {/* Content */}
      <div className="relative z-10">
        <h3 className={`font-display font-bold text-foreground ${isLarge ? "text-xl" : "text-base"}`}>
          {mod.label}
        </h3>
        <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{mod.desc}</p>
      </div>

      {/* Bottom accent line */}
      <div className="absolute bottom-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-primary/0 to-transparent group-hover:via-primary/30 transition-all duration-700" />
    </motion.button>
  );
}

/* ─── main landing ─── */
const Landing = () => {
  const stats = [
    { icon: Users, label: "Players tracked", value: 12847 },
    { icon: Signal, label: "Live sessions", value: 342 },
    { icon: TrendingUp, label: "Insights today", value: 1893 },
  ];

  return (
    <div className="min-h-screen bg-background relative">
      <GridBg />

      {/* Ambient orbs */}
      <Orb className="w-[500px] h-[500px] bg-primary/20 -top-40 -left-40" />
      <Orb className="w-[400px] h-[400px] bg-electric/15 top-1/3 -right-32" />
      <Orb className="w-[300px] h-[300px] bg-gold/10 bottom-20 left-1/4" />

      <div className="relative z-10 max-w-5xl mx-auto px-5">
        {/* ─── Top bar ─── */}
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="flex items-center justify-between pt-8 pb-16"
        >
          <div className="flex items-center gap-3">
            <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
            <span className="text-[10px] font-display font-bold uppercase tracking-[0.3em] text-muted-foreground">
              Prophet Horizon V2.4
            </span>
          </div>
          <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/50 bg-card/30 backdrop-blur-sm">
            <Zap size={10} className="text-primary" />
            <span className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
              Online
            </span>
          </div>
        </motion.div>

        {/* ─── Hero section ─── */}
        <div className="text-center mb-16">
          <motion.div
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1] }}
          >
            <h1 className="font-display font-black text-7xl md:text-[120px] text-foreground tracking-tighter leading-[0.85] mb-1">
              VITAS
              <span className="text-primary">.</span>
            </h1>
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3, duration: 0.6 }}
            className="text-sm md:text-base text-muted-foreground max-w-md mx-auto leading-relaxed mt-6"
          >
            Plataforma de inteligencia deportiva para detección,
            <br className="hidden sm:block" />
            evaluación y proyección de{" "}
            <span className="text-foreground font-medium">talento juvenil</span>.
          </motion.p>

          {/* Stats ticker */}
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5, duration: 0.6 }}
            className="flex items-center justify-center gap-8 mt-10"
          >
            {stats.map((s) => (
              <div key={s.label} className="flex flex-col items-center gap-1">
                <div className="flex items-center gap-1.5 text-foreground">
                  <s.icon size={12} className="text-primary" />
                  <span className="font-display font-bold text-lg md:text-xl">
                    <AnimatedStat value={s.value} />
                  </span>
                </div>
                <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
                  {s.label}
                </span>
              </div>
            ))}
          </motion.div>
        </div>

        {/* ─── Bento grid ─── */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 pb-8">
          {modules.map((mod, i) => (
            <ModuleCard key={mod.path} mod={mod} index={i} />
          ))}
        </div>

        {/* ─── Footer ─── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1.2 }}
          className="py-10 flex items-center justify-center gap-3"
        >
          <div className="h-px w-12 bg-gradient-to-r from-transparent to-border" />
          <p className="text-[9px] font-display uppercase tracking-[0.3em] text-muted-foreground/40">
            © 2026 VITAS Intelligence
          </p>
          <div className="h-px w-12 bg-gradient-to-l from-transparent to-border" />
        </motion.div>
      </div>
    </div>
  );
};

export default Landing;
