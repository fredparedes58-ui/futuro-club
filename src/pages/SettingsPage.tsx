import { motion } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  ArrowLeft,
  Bell,
  Shield,
  Globe,
  Palette,
  Database,
  Key,
  ChevronRight,
  ToggleRight,
  ToggleLeft,
} from "lucide-react";
import { useState } from "react";

const settingSections = [
  {
    title: "General",
    items: [
      { id: "lang", label: "Idioma", desc: "Español (ES)", icon: Globe },
      { id: "theme", label: "Tema Visual", desc: "Dark Obsidian", icon: Palette },
      { id: "notif", label: "Notificaciones", desc: "Push + Email", icon: Bell, toggle: true },
    ],
  },
  {
    title: "Seguridad",
    items: [
      { id: "auth", label: "Autenticación", desc: "2FA Activado", icon: Shield },
      { id: "api", label: "API Keys", desc: "3 keys activas", icon: Key },
    ],
  },
  {
    title: "Datos",
    items: [
      { id: "db", label: "Base de Datos", desc: "PostgreSQL · 2.4GB", icon: Database },
    ],
  },
];

const SettingsPage = () => {
  const navigate = useNavigate();
  const [toggles, setToggles] = useState<Record<string, boolean>>({ notif: true });

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.05 } } };
  const item = { hidden: { opacity: 0, y: 16 }, show: { opacity: 1, y: 0, transition: { duration: 0.35 } } };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-24 space-y-6 max-w-lg mx-auto">
      <motion.button
        variants={item}
        onClick={() => navigate(-1)}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft size={16} />
        <span className="font-display">Volver</span>
      </motion.button>

      <motion.div variants={item}>
        <h1 className="font-display font-bold text-2xl text-foreground">
          Configuración<span className="text-primary">.</span>
        </h1>
        <p className="text-xs text-muted-foreground font-display tracking-wider uppercase">
          Ajustes de la plataforma
        </p>
      </motion.div>

      {settingSections.map((section) => (
        <motion.div key={section.title} variants={item} className="space-y-2">
          <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">
            {section.title}
          </h2>
          {section.items.map((setting) => {
            const Icon = setting.icon;
            const isOn = toggles[setting.id] ?? false;
            return (
              <div
                key={setting.id}
                className="glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 border border-transparent transition-all"
                onClick={() => {
                  if (setting.toggle) {
                    setToggles((prev) => ({ ...prev, [setting.id]: !prev[setting.id] }));
                  }
                }}
              >
                <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
                  <Icon size={18} className="text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-display font-semibold text-sm text-foreground">{setting.label}</p>
                  <p className="text-[10px] text-muted-foreground">{setting.desc}</p>
                </div>
                {setting.toggle ? (
                  isOn ? (
                    <ToggleRight size={28} className="text-primary" />
                  ) : (
                    <ToggleLeft size={28} className="text-muted-foreground" />
                  )
                ) : (
                  <ChevronRight size={16} className="text-muted-foreground" />
                )}
              </div>
            );
          })}
        </motion.div>
      ))}

      <motion.div variants={item} className="glass rounded-xl p-4 text-center">
        <p className="text-[10px] font-display text-muted-foreground tracking-wider">
          VITAS PLATFORM · BUILD 2.0.42 · © 2024 PROPHET HORIZON TECHNOLOGY
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SettingsPage;
