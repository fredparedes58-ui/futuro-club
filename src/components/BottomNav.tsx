import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Compass, FlaskConical, BarChart3, FileVideo, LogOut, Users, Trophy, WifiOff, RefreshCw, Check, LayoutGrid, Crosshair, Heart, ClipboardList, Brain, Sparkles, Film } from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useAuth, getUserInitials } from "@/context/AuthContext";
import { toast } from "sonner";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { usePlan } from "@/hooks/usePlan";
import { useTranslation } from "react-i18next";

const BASE_NAV = [
  { path: "/pulse",    icon: Activity,      label: "nav.pulse" },
  { path: "/reports",  icon: FileVideo,     label: "nav.videos" },
  { path: "/scout",    icon: Compass,       label: "nav.scout" },
  { path: "/lab",      icon: FlaskConical,  label: "nav.lab" },
  { path: "/rankings", icon: BarChart3,     label: "nav.rankings" },
  { path: "/equipo",   icon: Users,         label: "nav.equipo" },
];

// Pages where bottom nav should be hidden
const hiddenOnRoutes = ["/login", "/register", "/forgot-password", "/welcome", "/home"];

// Extra sections — opened from the "Más" mega-menu, grouped by area.
// Each item has its route, icon, label, color hint, and optional "soon" badge.
type ExtraGroup = {
  title: string;
  items: Array<{
    path: string;
    icon: React.ElementType;
    label: string;
    description: string;
    color: string;
    soon?: boolean;
  }>;
};

const EXTRA_GROUPS: ExtraGroup[] = [
  {
    title: "Tácticas",
    items: [
      {
        path: "/set-pieces",
        icon: Crosshair,
        label: "Set Pieces",
        description: "Análisis de balón parado",
        color: "from-amber-500 to-orange-500",
      },
      {
        path: "/live",
        icon: Sparkles,
        label: "Live Match",
        description: "Tracking en directo",
        color: "from-fuchsia-500 to-pink-500",
      },
    ],
  },
  {
    title: "Entrenamiento",
    items: [
      {
        path: "/coach",
        icon: ClipboardList,
        label: "Coach",
        description: "Planificación de sesiones",
        color: "from-blue-500 to-cyan-500",
      },
    ],
  },
  {
    title: "Salud y bienestar",
    items: [
      {
        path: "/wellbeing",
        icon: Heart,
        label: "Bienestar",
        description: "Riesgo de abandono · engagement",
        color: "from-rose-500 to-red-500",
      },
    ],
  },
  {
    title: "IA Mental",
    items: [
      {
        path: "/behavioral",
        icon: Brain,
        label: "Behavioral",
        description: "Perfil mental del equipo · 7 dimensiones",
        color: "from-purple-500 to-indigo-500",
      },
    ],
  },
  {
    title: "Multimedia",
    items: [
      {
        path: "/highlights",
        icon: Film,
        label: "Highlights",
        description: "Reels automáticos de mejores momentos",
        color: "from-emerald-500 to-teal-500",
      },
    ],
  },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, configured } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showMoreMenu, setShowMoreMenu] = useState(false);
  const { isClub } = usePlan();
  const { t } = useTranslation();

  // Sincroniza jugadores desde Supabase al hacer login
  const syncState = useSupabaseSync();
  const prevOnline = useRef(syncState.online);

  // Toast al reconectar
  useEffect(() => {
    if (syncState.online && !prevOnline.current) {
      toast.success(t("toasts.connectionRestored"), {
        description: syncState.pending > 0
          ? t("toasts.syncPending", { count: syncState.pending })
          : t("toasts.syncComplete"),
      });
    }
    if (!syncState.online && prevOnline.current) {
      toast.warning(t("toasts.offline"), {
        description: t("toasts.offlineDesc"),
      });
    }
    prevOnline.current = syncState.online;
  }, [syncState.online, syncState.pending, t]);

  // /equipo ya está en BASE_NAV · no duplicar para isClub
  const navItems = BASE_NAV;

  const shouldHide =
    location.pathname === "/" ||
    hiddenOnRoutes.some((r) => location.pathname.startsWith(r));
  if (shouldHide) return null;

  const initials = getUserInitials(user);

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
    toast.success(t("toasts.sessionClosed"));
    navigate("/login");
  };

  const isExtraActive = EXTRA_GROUPS.some((g) =>
    g.items.some((it) => !it.soon && location.pathname.startsWith(it.path)),
  );

  return (
    <>
      {/* "Más" mega-menu */}
      <AnimatePresence>
        {showMoreMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px]"
              onClick={() => setShowMoreMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 30, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 30, scale: 0.96 }}
              transition={{ type: "spring", stiffness: 400, damping: 32 }}
              className="fixed bottom-20 left-1/2 -translate-x-1/2 z-50 glass-strong rounded-2xl shadow-2xl w-[92vw] max-w-md max-h-[70vh] overflow-y-auto"
            >
              <div className="px-4 pt-4 pb-2 border-b border-border sticky top-0 glass-strong">
                <h3 className="text-sm font-display font-bold text-foreground">
                  Más secciones
                </h3>
                <p className="text-[10px] text-muted-foreground">
                  Análisis avanzado, planificación y bienestar
                </p>
              </div>
              <div className="p-3 space-y-4">
                {EXTRA_GROUPS.map((group) => (
                  <div key={group.title}>
                    <h4 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2 px-1">
                      {group.title}
                    </h4>
                    <div className="grid grid-cols-2 gap-2">
                      {group.items.map((it) => {
                        const Icon = it.icon;
                        const active =
                          !it.soon && location.pathname.startsWith(it.path);
                        return (
                          <button
                            key={it.path}
                            onClick={() => {
                              if (it.soon) {
                                toast.info(
                                  `${it.label} llega próximamente`,
                                );
                                return;
                              }
                              setShowMoreMenu(false);
                              navigate(it.path);
                            }}
                            className={`flex items-start gap-2 p-2.5 rounded-xl text-left transition-all border ${
                              active
                                ? "border-primary bg-primary/10"
                                : "border-border bg-secondary/30 hover:bg-secondary/60"
                            } ${it.soon ? "opacity-70" : ""}`}
                          >
                            <div
                              className={`w-9 h-9 rounded-lg bg-gradient-to-br ${it.color} flex items-center justify-center shrink-0`}
                            >
                              <Icon size={16} className="text-white" />
                            </div>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-1">
                                <p className="text-xs font-display font-bold text-foreground truncate">
                                  {it.label}
                                </p>
                                {it.soon && (
                                  <span className="text-[8px] uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-600 font-bold">
                                    Pronto
                                  </span>
                                )}
                              </div>
                              <p className="text-[10px] text-muted-foreground leading-snug truncate">
                                {it.description}
                              </p>
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* User menu popup */}
      <AnimatePresence>
        {showUserMenu && (
          <>
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="fixed inset-0 z-40"
              onClick={() => setShowUserMenu(false)}
            />
            <motion.div
              initial={{ opacity: 0, y: 8, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 8, scale: 0.95 }}
              transition={{ type: "spring", stiffness: 400, damping: 30 }}
              className="fixed bottom-20 right-4 z-50 glass-strong rounded-xl p-1 min-w-[180px] shadow-xl"
            >
              {/* User info */}
              <div className="px-3 py-2 border-b border-border">
                <p className="text-xs font-display font-bold text-foreground truncate">
                  {user?.user_metadata?.display_name || user?.email?.split("@")[0] || "Scout"}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">{user?.email}</p>
                {!configured && (
                  <p className="text-[9px] text-gold mt-0.5">{t("auth.login.offlineMode")}</p>
                )}
              </div>

              {/* Actions */}
              {isClub && (
                <button
                  onClick={() => { setShowUserMenu(false); navigate("/director"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-foreground hover:bg-secondary transition-colors"
                >
                  <Trophy size={12} />
                  {t("nav.director")}
                </button>
              )}
              <button
                onClick={() => { setShowUserMenu(false); navigate("/settings"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-foreground hover:bg-secondary transition-colors"
              >
                {t("dashboard.quickAccess.config")}
              </button>
              <button
                onClick={() => { setShowUserMenu(false); navigate("/welcome"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-foreground hover:bg-secondary transition-colors"
              >
                Sobre VITAS · Landing
              </button>
              {configured && user && (
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut size={12} />
                  {t("settings.signOut")}
                </button>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Nav bar */}
      <nav className="fixed bottom-0 left-0 right-0 z-50 safe-area-bottom" style={{
        background: "linear-gradient(180deg, hsl(0 0% 100% / 0.95), hsl(0 0% 100% / 0.98))",
        backdropFilter: "blur(24px)",
        borderTop: "1px solid hsl(214 32% 88%)",
        boxShadow: "0 -4px 24px hsl(210 100% 40% / 0.06), 0 -1px 0 hsl(290 70% 50% / 0.04)",
      }}>
        {/* Gradient accent line at top of nav */}
        <div className="gradient-bar" style={{ height: "2px" }} />
        <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
          {navItems.map((navItem) => {
            const isActive =
              navItem.path === "/"
                ? location.pathname === "/"
                : location.pathname.startsWith(navItem.path);
            const Icon = navItem.icon;

            return (
              <button
                key={navItem.path}
                onClick={() => navigate(navItem.path)}
                className="relative flex flex-col items-center gap-0.5 px-2 py-1 transition-colors"
              >
                <div className="relative">
                  <Icon
                    size={20}
                    className={`transition-colors duration-200 ${
                      isActive ? "text-transparent" : "text-muted-foreground"
                    }`}
                    style={isActive ? {
                      background: "linear-gradient(135deg, #0059B3, #A855F7)",
                      WebkitBackgroundClip: "text",
                      WebkitTextFillColor: "transparent",
                      backgroundClip: "text",
                    } : undefined}
                    stroke={isActive ? "url(#navGradient)" : undefined}
                  />
                  {isActive && (
                    <motion.div
                      layoutId="nav-glow"
                      className="absolute -inset-2 rounded-full blur-md"
                      style={{ background: "linear-gradient(135deg, hsl(210 100% 40% / 0.25), hsl(290 70% 50% / 0.15))" }}
                      transition={{ type: "spring", stiffness: 500, damping: 30 }}
                    />
                  )}
                </div>
                <span
                  className={`text-[9px] font-medium font-display tracking-wider uppercase transition-colors duration-200 ${
                    isActive ? "text-primary" : "text-muted-foreground"
                  }`}
                >
                  {t(navItem.label)}
                </span>
              </button>
            );
          })}

          {/* "Más" button — opens mega-menu with extra sections */}
          <button
            onClick={() => setShowMoreMenu(!showMoreMenu)}
            className="relative flex flex-col items-center gap-0.5 px-2 py-1 transition-colors"
            title="Más secciones"
          >
            <div className="relative">
              <LayoutGrid
                size={20}
                className={`transition-colors duration-200 ${
                  isExtraActive || showMoreMenu ? "text-transparent" : "text-muted-foreground"
                }`}
                style={
                  isExtraActive || showMoreMenu
                    ? {
                        background: "linear-gradient(135deg, #0059B3, #A855F7)",
                        WebkitBackgroundClip: "text",
                        WebkitTextFillColor: "transparent",
                        backgroundClip: "text",
                      }
                    : undefined
                }
              />
              {(isExtraActive || showMoreMenu) && (
                <motion.div
                  layoutId="nav-glow-more"
                  className="absolute -inset-2 rounded-full blur-md"
                  style={{
                    background:
                      "linear-gradient(135deg, hsl(210 100% 40% / 0.25), hsl(290 70% 50% / 0.15))",
                  }}
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
            </div>
            <span
              className={`text-[9px] font-medium font-display tracking-wider uppercase transition-colors duration-200 ${
                isExtraActive || showMoreMenu ? "text-primary" : "text-muted-foreground"
              }`}
            >
              Más
            </span>
          </button>

          {/* Sync indicator */}
          {configured && (
            <div className="flex flex-col items-center gap-0.5 px-1" title={
              !syncState.online ? t("toasts.offline") :
              syncState.syncing ? t("toasts.syncPending", { count: syncState.pending }) :
              syncState.pending > 0 ? `${syncState.pending} ${t("common.players")}` :
              t("toasts.syncComplete")
            }>
              {!syncState.online ? (
                <WifiOff size={14} className="text-red-400" />
              ) : syncState.syncing ? (
                <RefreshCw size={14} className="text-yellow-400 animate-spin" />
              ) : syncState.pending > 0 ? (
                <div className="relative">
                  <RefreshCw size={14} className="text-yellow-400" />
                  <span className="absolute -top-1 -right-1.5 bg-yellow-500 text-[7px] text-black font-bold rounded-full w-3 h-3 flex items-center justify-center">
                    {syncState.pending}
                  </span>
                </div>
              ) : (
                <Check size={14} className="text-green-400" />
              )}
              <span className="text-[7px] text-muted-foreground">
                {!syncState.online ? "OFF" : syncState.syncing ? "SYNC" : syncState.pending > 0 ? "PEND" : "OK"}
              </span>
            </div>
          )}

          {/* Avatar de usuario */}
          <button
            onClick={() => setShowUserMenu(!showUserMenu)}
            className="relative flex flex-col items-center gap-0.5 px-2 py-1 transition-colors"
          >
            <div
              className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-display font-bold transition-all ${
                showUserMenu
                  ? "bg-primary text-primary-foreground ring-2 ring-primary/40"
                  : user
                  ? "bg-primary/20 text-primary border border-primary/30"
                  : "bg-secondary text-muted-foreground border border-border"
              }`}
            >
              {initials || "?"}
            </div>
            <span className="text-[9px] font-medium font-display tracking-wider uppercase text-muted-foreground">
              {t("nav.me")}
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
