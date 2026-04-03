import { useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import { Activity, Compass, FlaskConical, BarChart3, FileVideo, LogOut, Users, Trophy } from "lucide-react";
import { useState } from "react";
import { useAuth, getUserInitials } from "@/context/AuthContext";
import { toast } from "sonner";
import { useSupabaseSync } from "@/hooks/useSupabaseSync";
import { usePlan } from "@/hooks/usePlan";

const BASE_NAV = [
  { path: "/pulse",    icon: Activity,      label: "Pulse" },
  { path: "/reports",  icon: FileVideo,     label: "Vídeos" },
  { path: "/scout",    icon: Compass,       label: "Scout" },
  { path: "/lab",      icon: FlaskConical,  label: "Lab" },
  { path: "/rankings", icon: BarChart3,     label: "Rank" },
];

// Pages where bottom nav should be hidden
const hiddenOnRoutes = ["/compare", "/login", "/register", "/forgot-password"];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, signOut, configured } = useAuth();
  const [showUserMenu, setShowUserMenu] = useState(false);
  const { isClub } = usePlan();

  // Sincroniza jugadores desde Supabase al hacer login
  useSupabaseSync();

  const navItems = isClub
    ? [...BASE_NAV, { path: "/equipo", icon: Users, label: "Equipo" }]
    : BASE_NAV;

  const shouldHide =
    location.pathname === "/" ||
    hiddenOnRoutes.some((r) => location.pathname.startsWith(r));
  if (shouldHide) return null;

  const initials = getUserInitials(user);

  const handleSignOut = async () => {
    setShowUserMenu(false);
    await signOut();
    toast.success("Sesión cerrada");
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
                  <p className="text-[9px] text-gold mt-0.5">Modo offline</p>
                )}
              </div>

              {/* Actions */}
              {isClub && (
                <button
                  onClick={() => { setShowUserMenu(false); navigate("/director"); }}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-foreground hover:bg-secondary transition-colors"
                >
                  <Trophy size={12} />
                  Director
                </button>
              )}
              <button
                onClick={() => { setShowUserMenu(false); navigate("/settings"); }}
                className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-foreground hover:bg-secondary transition-colors"
              >
                Configuración
              </button>
              {configured && user && (
                <button
                  onClick={handleSignOut}
                  className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-display text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <LogOut size={12} />
                  Cerrar sesión
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
                  {navItem.label}
                </span>
              </button>
            );
          })}

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
              Yo
            </span>
          </button>
        </div>
      </nav>
    </>
  );
};

export default BottomNav;
