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
  Download,
  Upload,
  Trash2,
  AlertTriangle,
  BookOpen,
  RefreshCw,
  Loader2,
} from "lucide-react";
import { usePlan, type PlanState } from "@/hooks/usePlan";
import { PLAN_LABELS } from "@/services/real/subscriptionService";
import { useState, useEffect } from "react";
import { toast } from "sonner";
import { useTheme } from "next-themes";
import { useAuth } from "@/context/AuthContext";
import { StorageService } from "@/services/real/storageService";
import { PushNotificationService } from "@/services/real/pushNotificationService";
import { BackupService } from "@/services/real/backupService";
import { useTranslation } from "react-i18next";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/apiAuth";
import { useGdprExport } from "@/hooks/useGdprExport";

const SETTINGS_KEY = "settings";

interface NotifPreferences {
  rendimientoBajo: boolean;
  inactividad: boolean;
  limitePlan: boolean;
  analisisCompletado: boolean;
  scoutInsights: boolean;
  teamUpdates: boolean;
}

interface AppSettings {
  notifications: boolean;
  notifPrefs: NotifPreferences;
  theme: "dark" | "light";
  language: "es" | "en";
}

const DEFAULT_NOTIF_PREFS: NotifPreferences = {
  rendimientoBajo: true,
  inactividad: true,
  limitePlan: true,
  analisisCompletado: true,
  scoutInsights: true,
  teamUpdates: true,
};

const DEFAULT_SETTINGS: AppSettings = {
  notifications: true,
  notifPrefs: DEFAULT_NOTIF_PREFS,
  theme: "dark",
  language: "es",
};

// ── Notification History Sub-component ───────────────────────────────────────

interface NotifHistoryItem {
  id: number;
  type: string;
  title: string;
  body?: string;
  created_at: string;
  read: boolean;
}

const NOTIF_TYPE_LABELS: Record<string, string> = {
  rendimientoBajo: "Rendimiento bajo",
  inactividad: "Jugador inactivo",
  limitePlan: "Límite de plan",
  analisisCompletado: "Análisis completado",
  scoutInsights: "Scout insight",
  teamUpdates: "Actualización de equipo",
};

function NotificationHistory() {
  const [items, setItems] = useState<NotifHistoryItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch("/api/notifications/history?limit=10", { headers });
        if (res.ok) {
          const data = await res.json() as { items?: NotifHistoryItem[] };
          setItems(data.items ?? []);
        }
      } catch { /* silent */ }
      setLoading(false);
    };
    load();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-3 text-muted-foreground">
        <Loader2 size={12} className="animate-spin" />
        <span className="text-[10px]">Cargando historial...</span>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-3">
        <p className="text-[10px] text-muted-foreground">No hay notificaciones recientes</p>
      </div>
    );
  }

  return (
    <div className="space-y-2 pt-3 border-t border-white/5">
      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
        Últimas notificaciones
      </p>
      {items.map(item => (
        <div key={item.id} className="flex items-start gap-2 py-1">
          <Bell size={11} className={`mt-0.5 shrink-0 ${item.read ? "text-muted-foreground/40" : "text-primary"}`} />
          <div className="min-w-0">
            <p className="text-[11px] text-foreground leading-tight truncate">
              {item.title}
            </p>
            <p className="text-[9px] text-muted-foreground">
              {NOTIF_TYPE_LABELS[item.type] ?? item.type} · {new Date(item.created_at).toLocaleDateString("es-ES", { day: "numeric", month: "short" })}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Main Settings Page ──────────────────────────────────────────────────────

const SettingsPage = () => {
  const navigate = useNavigate();
  const { t, i18n } = useTranslation();
  const { user, signOut } = useAuth();
  const { theme, setTheme } = useTheme();
  const currentLang = i18n.language?.startsWith("en") ? "en" : "es";
  const toggleLanguage = () => {
    const next = currentLang === "es" ? "en" : "es";
    i18n.changeLanguage(next);
    toast.success(t("toasts.settingSaved"));
  };
  const [settings, setSettings] = useState<AppSettings>(() =>
    StorageService.get<AppSettings>(SETTINGS_KEY, DEFAULT_SETTINGS)
  );
  const planState: PlanState = usePlan();
  const gdpr = useGdprExport();
  const [pushPermission, setPushPermission] = useState<NotificationPermission>("default");
  const [pushLoading, setPushLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  // RAG Knowledge Base status
  const [ragStats, setRagStats] = useState<{ total: number; byCategory: Record<string, number> } | null>(null);
  const [ragLoading, setRagLoading] = useState(false);

  // Persiste al cambiar (local + sync to API)
  useEffect(() => {
    StorageService.set(SETTINGS_KEY, settings);
  }, [settings]);

  // Sync notification preferences to backend when they change
  useEffect(() => {
    if (!SUPABASE_CONFIGURED || !settings.notifications) return;
    const syncPrefs = async () => {
      try {
        const session = await supabase.auth.getSession();
        const token = session.data.session?.access_token;
        if (!token) return;
        await fetch("/api/notifications/preferences", {
          method: "POST",
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            rendimiento_bajo: settings.notifPrefs.rendimientoBajo,
            inactividad: settings.notifPrefs.inactividad,
            limite_plan: settings.notifPrefs.limitePlan,
            analisis_completado: settings.notifPrefs.analisisCompletado,
            scout_insights: settings.notifPrefs.scoutInsights,
            team_updates: settings.notifPrefs.teamUpdates,
          }),
        });
      } catch { /* best effort */ }
    };
    syncPrefs();
  }, [settings.notifPrefs, settings.notifications]);

  // Sync real push permission on mount
  useEffect(() => {
    PushNotificationService.getPermission().then(setPushPermission);
  }, []);

  // Fetch RAG knowledge base stats
  const fetchRagStats = async () => {
    if (!SUPABASE_CONFIGURED) return;
    setRagLoading(true);
    try {
      const res = await fetch("/api/rag/query", {
        method: "POST",
        headers: await getAuthHeaders(),
        body: JSON.stringify({ query: "status check", limit: 1 }),
      });
      if (!res.ok) throw new Error("RAG unavailable");
      // Count via Supabase direct (works because service reads from same DB)
      const { data, count } = await supabase
        .from("knowledge_base")
        .select("category", { count: "exact", head: false });
      if (data) {
        const byCategory: Record<string, number> = {};
        data.forEach((r: { category: string }) => { byCategory[r.category] = (byCategory[r.category] || 0) + 1; });
        setRagStats({ total: count ?? data.length, byCategory });
      }
    } catch {
      setRagStats(null);
    } finally {
      setRagLoading(false);
    }
  };

  useEffect(() => { fetchRagStats(); }, []);

  const toggle = (key: keyof AppSettings) => {
    if (key === "notifications") {
      handleNotificationsToggle();
      return;
    }
    setSettings(prev => {
      const next = { ...prev, [key]: !prev[key] };
      toast.success(t("toasts.settingSaved"));
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
          toast.success(t("toasts.notifActivated"));
        } else {
          toast.error(t("toasts.notifPermissionDenied"));
        }
      } else {
        // Turn OFF: unsubscribe
        await PushNotificationService.unsubscribe();
        setSettings(prev => ({ ...prev, notifications: false }));
        setPushPermission("denied");
        toast.success(t("toasts.notifDeactivated"));
      }
    } catch (err) {
      toast.error(t("toasts.notifChangeError"));
      console.warn(err);
    } finally {
      setPushLoading(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
    navigate("/login");
    toast.success(t("toasts.sessionClosed"));
  };

  const handleDeleteAccount = async () => {
    const confirmation = window.prompt(t("account.deleteConfirm"));
    if (!confirmation) return;
    const keyword = i18n.language?.startsWith("en") ? "DELETE" : "ELIMINAR";
    if (confirmation.trim().toUpperCase() !== keyword) {
      toast.error(t("common.error"));
      return;
    }
    setDeleteLoading(true);
    try {
      const session = await supabase.auth.getSession();
      const token = session.data.session?.access_token;
      if (!token) {
        toast.error(t("common.error"));
        return;
      }
      const res = await fetch("/api/account/delete", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) throw new Error("Delete failed");
      toast.success(t("account.deleted"));
      await signOut();
      navigate("/");
    } catch {
      toast.error(t("common.error"));
    } finally {
      setDeleteLoading(false);
    }
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
        <span className="font-display">{t("common.back")}</span>
      </motion.button>

      <motion.div variants={item}>
        <h1 className="font-display font-bold text-2xl text-foreground">
          {t("settings.title").replace(".", "")}<span className="text-primary">.</span>
        </h1>
        <p className="text-xs text-muted-foreground font-display tracking-wider uppercase">
          {t("settings.subtitle")}
        </p>
      </motion.div>

      {/* Cuenta */}
      {user && (
        <motion.div variants={item} className="space-y-2">
          <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("settings.account")}</h2>
          <div className="glass rounded-xl p-4 flex items-center gap-4">
            <div className="w-10 h-10 rounded-full bg-primary/20 flex items-center justify-center">
              <span className="text-sm font-bold text-primary">
                {user.email?.[0]?.toUpperCase() ?? "U"}
              </span>
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-sm text-foreground">{user.email}</p>
              <p className="text-[10px] text-muted-foreground">{t("settings.activeScout")}</p>
            </div>
            <Check size={14} className="text-primary" />
          </div>
        </motion.div>
      )}

      {/* Plan */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("settings.plan")}</h2>
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
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("settings.general")}</h2>

        {/* Notificaciones */}
        <div
          className={`glass rounded-xl p-4 flex items-center gap-4 cursor-pointer hover:border-primary/30 border border-transparent transition-all ${pushLoading ? "opacity-60 pointer-events-none" : ""}`}
          onClick={() => toggle("notifications")}
        >
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Bell size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">{t("settings.pushNotifications")}</p>
            <p className="text-[10px] text-muted-foreground">
              {pushPermission === "granted"
                ? t("settings.pushActive")
                : pushPermission === "denied"
                ? t("settings.pushBlocked")
                : t("settings.pushTapToActivate")}
            </p>
          </div>
          {settings.notifications
            ? <ToggleRight size={28} className="text-primary" />
            : <ToggleLeft size={28} className="text-muted-foreground" />
          }
        </div>

        {/* Preferencias granulares de notificación */}
        {settings.notifications && pushPermission === "granted" && (
          <div className="glass rounded-xl p-4 space-y-3 ml-4 border-l-2 border-primary/20">
            <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("settings.notifTypes")}
            </p>
            {([
              { key: "rendimientoBajo" as const, label: t("settings.notifLowPerformance"), desc: t("settings.notifLowPerformanceDesc") },
              { key: "inactividad" as const, label: t("settings.notifInactivity"), desc: t("settings.notifInactivityDesc") },
              { key: "limitePlan" as const, label: t("settings.notifPlanLimit"), desc: t("settings.notifPlanLimitDesc") },
              { key: "analisisCompletado" as const, label: t("settings.notifAnalysisDone"), desc: t("settings.notifAnalysisDoneDesc") },
              { key: "scoutInsights" as const, label: "Scout Insights", desc: "Notificar nuevos insights de scouting generados" },
              { key: "teamUpdates" as const, label: "Actualizaciones de Equipo", desc: "Invitaciones, cambios de rol y actividad del equipo" },
            ]).map(({ key, label, desc }) => (
              <div
                key={key}
                className="flex items-center justify-between cursor-pointer"
                onClick={() => setSettings(prev => ({
                  ...prev,
                  notifPrefs: { ...prev.notifPrefs, [key]: !prev.notifPrefs[key] },
                }))}
              >
                <div>
                  <p className="text-xs font-display font-semibold text-foreground">{label}</p>
                  <p className="text-[9px] text-muted-foreground">{desc}</p>
                </div>
                {settings.notifPrefs[key]
                  ? <ToggleRight size={22} className="text-primary" />
                  : <ToggleLeft size={22} className="text-muted-foreground" />
                }
              </div>
            ))}

            {/* Historial de notificaciones */}
            <NotificationHistory />
          </div>
        )}

        {/* Idioma */}
        <button
          onClick={toggleLanguage}
          className="glass rounded-xl p-4 flex items-center gap-4 w-full text-left hover:border-primary/30 border border-transparent transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Globe size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">{t("settings.language")}</p>
            <p className="text-[10px] text-muted-foreground">{t("settings.languageValue")}</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </button>

        {/* Tema */}
        <button
          onClick={() => {
            const next = theme === "dark" ? "light" : "dark";
            setTheme(next);
            toast.success(t("toasts.themeChanged", { theme: next === "dark" ? "Dark Obsidian" : "Light Mode" }));
          }}
          className="glass rounded-xl p-4 flex items-center gap-4 w-full text-left hover:border-primary/30 border border-transparent transition-all"
        >
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Palette size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">{t("settings.theme")}</p>
            <p className="text-[10px] text-muted-foreground">{theme === "dark" ? "Dark Obsidian" : "Light Mode"}</p>
          </div>
          <ChevronRight size={14} className="text-muted-foreground" />
        </button>
      </motion.div>

      {/* Seguridad */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("settings.security")}</h2>

        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Shield size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">{t("settings.authentication")}</p>
            <p className="text-[10px] text-muted-foreground">{user ? t("settings.activeSession") : t("settings.noSession")}</p>
          </div>
          <Check size={14} className={user ? "text-primary" : "text-muted-foreground"} />
        </div>

        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Key size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">{t("settings.apiKeys")}</p>
            <p className="text-[10px] text-muted-foreground">Supabase · Anthropic · Bunny</p>
          </div>
          <ChevronRight size={16} className="text-muted-foreground" />
        </div>
      </motion.div>

      {/* Datos */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("settings.data")}</h2>
        <div className="glass rounded-xl p-4 flex items-center gap-4">
          <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
            <Database size={18} className="text-primary" />
          </div>
          <div className="flex-1">
            <p className="font-display font-semibold text-sm text-foreground">{t("settings.database")}</p>
            <p className="text-[10px] text-muted-foreground">{t("settings.databaseConnected")}</p>
          </div>
          <Check size={14} className="text-primary" />
        </div>
      </motion.div>

      {/* RAG Knowledge Base */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">Base de Conocimiento (RAG)</h2>
        <div className="glass rounded-xl p-4 space-y-3">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-secondary flex items-center justify-center">
              <BookOpen size={18} className="text-primary" />
            </div>
            <div className="flex-1">
              <p className="font-display font-semibold text-sm text-foreground">Knowledge Base</p>
              {ragLoading ? (
                <p className="text-[10px] text-muted-foreground flex items-center gap-1"><Loader2 size={10} className="animate-spin" /> Consultando...</p>
              ) : ragStats ? (
                <p className="text-[10px] text-muted-foreground">{ragStats.total} documentos indexados con embeddings</p>
              ) : (
                <p className="text-[10px] text-destructive">No disponible</p>
              )}
            </div>
            {ragStats && <Check size={14} className="text-primary" />}
          </div>
          {ragStats && (
            <div className="grid grid-cols-3 gap-2">
              {Object.entries(ragStats.byCategory).map(([cat, count]) => (
                <div key={cat} className="bg-secondary/50 rounded-lg px-3 py-2 text-center">
                  <p className="text-xs font-display font-bold text-foreground">{count}</p>
                  <p className="text-[9px] text-muted-foreground capitalize">{cat === "drill" ? "Ejercicios" : cat === "scouting" ? "Scouting" : cat === "methodology" ? "Metodología" : cat}</p>
                </div>
              ))}
            </div>
          )}
          <button
            onClick={fetchRagStats}
            disabled={ragLoading}
            className="w-full flex items-center justify-center gap-2 py-2 px-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors disabled:opacity-50"
          >
            <RefreshCw size={14} className={ragLoading ? "animate-spin text-primary" : "text-muted-foreground"} />
            <span className="text-xs font-display text-muted-foreground">Actualizar estado</span>
          </button>
        </div>
      </motion.div>

      {/* Backup / Restaurar */}
      <motion.div variants={item} className="space-y-2">
        <h2 className="font-display font-semibold text-sm text-muted-foreground uppercase tracking-wider">{t("settings.backup")}</h2>
        <div className="glass rounded-xl p-4 space-y-3">
          <button
            onClick={() => {
              BackupService.downloadBackup();
              toast.success(t("toasts.backupDownloaded"));
            }}
            className="w-full flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <Download size={16} className="text-primary" />
            <div className="text-left flex-1">
              <p className="text-sm font-display font-semibold text-foreground">{t("settings.exportData")}</p>
              <p className="text-[10px] text-muted-foreground">{t("settings.exportDataDesc")}</p>
            </div>
          </button>
          <label className="w-full flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors cursor-pointer">
            <Upload size={16} className="text-primary" />
            <div className="text-left flex-1">
              <p className="text-sm font-display font-semibold text-foreground">{t("settings.importData")}</p>
              <p className="text-[10px] text-muted-foreground">{t("settings.importDataDesc")}</p>
            </div>
            <input
              type="file"
              accept=".json"
              className="hidden"
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                try {
                  const content = await BackupService.readFile(file);
                  const result = BackupService.import(content);
                  if (result.success) {
                    toast.success(t("toasts.importSuccess", { items: result.imported.join(", ") }));
                    if (result.errors.length > 0) {
                      toast.warning(t("toasts.importWarning", { warnings: result.errors.join("; ") }));
                    }
                  } else {
                    toast.error(result.errors[0] ?? t("toasts.importError"));
                  }
                } catch {
                  toast.error(t("toasts.fileReadError"));
                }
                e.target.value = ""; // Reset input
              }}
            />
          </label>
          <button
            onClick={() => {
              gdpr.exportData();
            }}
            disabled={gdpr.isExporting}
            className="w-full flex items-center gap-3 py-2 px-3 rounded-lg bg-secondary/50 hover:bg-secondary transition-colors"
          >
            <Shield size={16} className="text-emerald-500" />
            <div className="text-left flex-1">
              <p className="text-sm font-display font-semibold text-foreground">{t("settings.gdprExport", "Exportar todos mis datos (GDPR)")}</p>
              <p className="text-[10px] text-muted-foreground">{t("settings.gdprExportDesc", "Descarga todos tus datos del servidor y dispositivo en un solo archivo.")}</p>
            </div>
            {gdpr.isExporting && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
          </button>
        </div>
      </motion.div>

      {/* Cerrar sesión */}
      {user && (
        <motion.div variants={item}>
          <button
            onClick={handleSignOut}
            className="w-full py-3 rounded-xl border border-destructive/30 text-destructive text-sm font-display font-semibold hover:bg-destructive/10 transition-all"
          >
            {t("settings.signOut")}
          </button>
        </motion.div>
      )}

      {/* Zona de peligro */}
      {user && (
        <motion.div variants={item} className="space-y-2">
          <h2 className="font-display font-semibold text-sm text-destructive uppercase tracking-wider">
            {t("account.dangerZone")}
          </h2>
          <div className="rounded-xl border border-destructive/30 bg-destructive/5 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <AlertTriangle size={18} className="text-destructive mt-0.5 shrink-0" />
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t("account.deleteWarning")}
              </p>
            </div>
            <button
              onClick={handleDeleteAccount}
              disabled={deleteLoading}
              className="w-full py-3 rounded-xl bg-destructive/10 border border-destructive/40 text-destructive text-sm font-display font-semibold hover:bg-destructive/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              <Trash2 size={14} />
              {deleteLoading ? t("common.loading") : t("account.delete")}
            </button>
          </div>
        </motion.div>
      )}

      <motion.div variants={item} className="glass rounded-xl p-4 text-center">
        <p className="text-[10px] font-display text-muted-foreground tracking-wider">
          {t("settings.footer")}
        </p>
      </motion.div>
    </motion.div>
  );
};

export default SettingsPage;
