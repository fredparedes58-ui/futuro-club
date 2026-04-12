import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Compass, FlaskConical, BarChart3, FileVideo, LogOut, Users, Trophy, Wifi, WifiOff, RefreshCw, Check } from "lucide-react";
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
const hiddenOnRoutes = ["/login", "/register", "/forgot-password"];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, configured } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
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

  const navItems = isClub
    ? [...BASE_NAV, { path: "/equipo", icon: Users, label: "nav.team" }]
    : BASE_NAV;

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

  return (
    <>
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
      <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong safe-area-bottom">
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
                      isActive ? "text-primary" : "text-muted-foreground"
                    }`}
                  />
                  {isActive && (
                    <motion.div
                      layoutId="nav-glow"
                      className="absolute -inset-2 rounded-full bg-primary/20 blur-md"
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
