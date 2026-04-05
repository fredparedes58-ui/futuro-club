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
  Check,
  Zap,
} from "lucide-react";
import { usePlan, type PlanState } from "@/hooks/usePlan";
import { PLAN_LABELS } from "@/services/real/subscriptionService";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { StorageService } from "@/services/real/storageService";
import { PushNotificationService } from "@/services/real/pushNotificationService";

const SETTINGS_KEY = "vitas_settings";

interface AppSettings {
  notifications: boolean;
  theme: "dark" | "light";
  language: "es" | "en";
}

const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  theme: "dark",
  language: "es",
};

const SettingsPage = () => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const [settings, setSettings] = useState<AppSettings>(() =>
    StorageService.get<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS)
  );
  const planState: PlanState = usePlan();
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);

  // Persiste al cambiar
  useEffect(() => {
    StorageService.set(SETTINGS_KEY, settings);
  }, [settings]);

  // Sync real push permission on mount
  useEffect(() => {
    PushNotificationService.getPermission().then(setPushPermission);
  }, []);

  const toggle = (key: keyof AppSettings) => {
    if (key === "notifications") {
      handleNotificationsToggle();
      return;
    }
    setSettings(prev => {
      const next = { ...prev, [key]: !prev[key] };
      toast.success("Ajuste guardado");
      return next;
    });
  };

  const handleNotificationsToggle = async () => {
    if (pushLoading) return;
    setPushLoading(true);
    try {
      if (!settings.notifications) {
        // Turn ON: request permission then subscribe
        const granted = await PushNotificationService.requestPermission();
        const perm = await PushNotificationService.getPermission();
        setPushPermission(perm);
        if (granted) {
          await PushNotificationService.subscribe();
          setSettings(prev => ({ ...prev, notifications: true }));
          toast.success("Notificaciones activadas");
        } else {
          toast.error("Permiso de notificaciones denegado");
        }
      } else {
        // Turn OFF: unsubscribe
        await PushNotificationService.unsubscribe();
        setSettings(prev => ({ ...prev, notifications: false }));
        setPushPermission("denied");
        toast.success("Notificaciones desactivadas");
      }
    } catch (err) {
      toast.error("Error al cambiar notificaciones");
      console.warn(err);
    } finally {
      setPushLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
    toast.success("Sesión cerrada");
  };

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

      {/* Cuenta */}
      {user && (
        <motion.div variants={item} className="space-y-2">
          <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">Cuenta</h2>
          <div className="glass rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-sm text-foreground">{user.email}</p>
              <p className="text-[10px] text-muted-foreground">Scout activo</p>
            </div>
            <Check size={14} className="text-primary" />
          </div>
        </motion.div>
      )}

      {/* Plan */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">Plan</h2>
        <div
          className="glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 border border-transparent transition-all"
          onClick={() => navigate("/billing")}
        >
          <div className="w-10 h-10 rounded-lg bg-primary/10 flex items-center justify-center">
            <Zap size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">
              {PLAN_LABELS[planState.plan]}
            </p>
            <p className="text-[10px] text-muted-foreground">
              {planState.playerCount} / {planState.limits.players >= 9999 ? "∞" : planState.limits.players} jugadores
              {" · "}
              {planState.analysesUsed} / {planState.limits.analyses >= 9999 ? "∞" : planState.limits.analyses} análisis
            </p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>
      </motion.div>

      {/* General */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">General</h2>

        {/* Notificaciones */}
        <div
          className={`glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 border border-transparent transition-all ${pushLoading ? "opacity-60 pointer-events-none" : ""}`}
          onClick={() => toggle("notifications")}
        >
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Bell size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">Notificaciones Push</p>
            <p className="text-[10px] text-muted-foreground">
              {pushPermission === "granted"
                ? "Activas · Análisis + alertas PHV"
                : pushPermission === "denied"
                ? "Bloqueadas en el navegador"
                : "Toca para activar notificaciones nativas"}
            </p>
          </div>
          {settings.notifications
            ? <ToggleRight size={28} className="text-primary" />
            : <ToggleLeft size={28} className="text-muted-foreground" />
          }
        </div>

        {/* Idioma */}
        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Globe size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">Idioma</p>
            <p className="text-[10px] text-muted-foreground">Español (ES)</p>
          </div>
          <Check size={14} className="text-primary" />
        </div>

        {/* Tema */}
        <button
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            toast.success(`Tema cambiado a ${next === "dark" ? "Dark Obsidian" : "Light Mode"}`);
          }}
          className="glass rounded-xl p-4 flex items-center gap-4 w-full text-left hover:border-primary/30 border border-transparent transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Palette size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">Tema Visual</p>
            <p className="text-[10px] text-muted-foreground">{theme === "dark" ? "Dark Obsidian" : "Light Mode"}</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </button>
      </motion.div>

      {/* Seguridad */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">Seguridad</h2>

        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Shield size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">Autenticación</p>
            <p className="text-[10px] text-muted-foreground">{user ? "Sesión activa · Supabase Auth" : "Sin sesión"}</p>
          </div>
          <Check size={14} className={user ? "text-primary" : "text-muted-foreground"} />
        </div>

        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Key size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">API Keys</p>
            <p className="text-[10px] text-muted-foreground">Supabase · Anthropic · Bunny</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>
      </motion.div>

      {/* Datos */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">Datos</h2>
        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Database size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">Base de Datos</p>
            <p className="text-[10px] text-muted-foreground">Supabase PostgreSQL · Conectado</p>
          </div>
          <Check size={14} className="text-primary" />
        </div>
      </motion.div>

      {/* Cerrar sesión */}
      {user && (
        <motion.div variants={item}>
          <button
            onClick={handleSignOut}
            className="w-full py-3 rounded-xl border border-destructive/30 text-destructive text-sm font-display font-semibold hover:bg-destructive/10 transition-all"
          >
            Cerrar sesión
          </button>
        </motion.div>
      )}

      <motion.div variants={item} className="glass rounded-xl p-4 text-center">
        <p className="text-[10px] font-display text-muted-foreground tracking-wider">
          VITAS PLATFORM · BUILD 2.1.0 · © 2026 PROPHET HORIZON TECHNOLOGY
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SettingsPage;
