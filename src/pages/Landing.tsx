import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  Activity,
  Compass,
  Crosshair,
  BarChart3,
  LayoutDashboard,
  Camera,
  GitCompareArrows,
  Settings,
  ChevronRight,
  Zap,
} from "lucide-react";

const modules = [
  {
    path: "/pulse",
    icon: Activity,
    label: "Pulse",
    desc: "Centro de Inteligencia en vivo",
    accent: "from-primary/20 to-primary/5 border-primary/30",
    iconColor: "text-primary",
  },
  {
    path: "/master",
    icon: LayoutDashboard,
    label: "Master Dashboard",
    desc: "Academy Intelligence completa",
    accent: "from-electric/20 to-electric/5 border-electric/30",
    iconColor: "text-electric",
  },
  {
    path: "/scout",
    icon: Compass,
    label: "Scout Feed",
    desc: "Insights y alertas de talento",
    accent: "from-gold/20 to-gold/5 border-gold/30",
    iconColor: "text-gold",
  },
  {
    path: "/drill",
    icon: Crosshair,
    label: "Solo Drill",
    desc: "Evaluación técnica individual",
    accent: "from-accent/20 to-accent/5 border-accent/30",
    iconColor: "text-accent",
  },
  {
    path: "/rankings",
    icon: BarChart3,
    label: "Rankings",
    desc: "Clasificación VSI global",
    accent: "from-primary/20 to-primary/5 border-primary/30",
    iconColor: "text-primary",
  },
  {
    path: "/lab",
    icon: Camera,
    label: "VITAS.LAB",
    desc: "Análisis de video avanzado",
    accent: "from-electric/20 to-electric/5 border-electric/30",
    iconColor: "text-electric",
  },
  {
    path: "/compare",
    icon: GitCompareArrows,
    label: "Comparador",
    desc: "Análisis comparativo scout",
    accent: "from-gold/20 to-gold/5 border-gold/30",
    iconColor: "text-gold",
  },
  {
    path: "/settings",
    icon: Settings,
    label: "Configuración",
    desc: "Ajustes del sistema",
    accent: "from-muted/40 to-muted/10 border-border",
    iconColor: "text-muted-foreground",
  },
];

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.07, delayChildren: 0.3 } },
};
const item = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as [number, number, number, number] } },
};

const Landing = () => {
  const navigate = useNavigate();

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Hero */}
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{ duration: 0.8 }}
        className="relative overflow-hidden"
      >
        {/* Ambient glow */}
        <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-primary/8 rounded-full blur-[120px] pointer-events-none" />
        <div className="absolute top-20 right-0 w-[300px] h-[300px] bg-electric/6 rounded-full blur-[100px] pointer-events-none" />

        <div className="relative z-10 px-6 pt-16 pb-10 max-w-2xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
            className="mb-2"
          >
            <h1 className="font-display font-black text-5xl md:text-6xl text-foreground tracking-tight leading-none">
              VITAS<span className="text-primary">.</span>
            </h1>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.5 }}
            className="flex items-center justify-center gap-2 mb-6"
          >
            <div className="h-px w-8 bg-gradient-to-r from-transparent to-primary/50" />
            <span className="text-[10px] font-display font-semibold uppercase tracking-[0.3em] text-primary/80">
              Prophet Horizon V2.4
            </span>
            <div className="h-px w-8 bg-gradient-to-l from-transparent to-primary/50" />
          </motion.div>

          <motion.p
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.35, duration: 0.5 }}
            className="text-sm text-muted-foreground max-w-xs mx-auto leading-relaxed"
          >
            Plataforma de inteligencia deportiva para detección, evaluación y proyección de talento juvenil.
          </motion.p>

          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.5 }}
            className="mt-6 flex items-center justify-center gap-2"
          >
            <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
            <span className="text-[10px] font-display text-primary uppercase tracking-widest font-semibold">
              Sistema activo
            </span>
          </motion.div>
        </div>
      </motion.div>

      {/* Modules Grid */}
      <motion.div
        variants={container}
        initial="hidden"
        animate="show"
        className="flex-1 px-4 pb-12 max-w-2xl mx-auto w-full"
      >
        <motion.p
          variants={item}
          className="text-[10px] font-display font-semibold uppercase tracking-[0.2em] text-muted-foreground mb-4 px-1"
        >
          <Zap size={10} className="inline mr-1 text-primary" />
          Módulos disponibles
        </motion.p>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {modules.map((mod) => {
            const Icon = mod.icon;
            return (
              <motion.button
                key={mod.path}
                variants={item}
                onClick={() => navigate(mod.path)}
                className={`group relative w-full text-left rounded-xl border bg-gradient-to-br ${mod.accent} p-4 transition-all duration-300 hover:scale-[1.02] hover:shadow-lg hover:shadow-primary/5 active:scale-[0.98]`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-start gap-3">
                    <div className="mt-0.5 p-2 rounded-lg bg-background/50 backdrop-blur-sm">
                      <Icon size={18} className={mod.iconColor} />
                    </div>
                    <div>
                      <h3 className="font-display font-bold text-sm text-foreground">
                        {mod.label}
                      </h3>
                      <p className="text-[11px] text-muted-foreground mt-0.5 leading-snug">
                        {mod.desc}
                      </p>
                    </div>
                  </div>
                  <ChevronRight
                    size={14}
                    className="text-muted-foreground/50 group-hover:text-foreground group-hover:translate-x-0.5 transition-all mt-1"
                  />
                </div>
              </motion.button>
            );
          })}
        </div>
      </motion.div>

      {/* Footer */}
      <div className="px-6 py-6 text-center border-t border-border/50">
        <p className="text-[9px] font-display uppercase tracking-[0.25em] text-muted-foreground/60">
          © 2026 VITAS Intelligence · Todos los derechos reservados
        </p>
      </div>
    </div>
  );
};

export default Landing;
