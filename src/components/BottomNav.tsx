import { useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { Activity, User, Compass, Crosshair, BarChart3 } from "lucide-react";

const navItems = [
  { path: "/", icon: Activity, label: "Pulse" },
  { path: "/scout", icon: Compass, label: "Scout" },
  { path: "/drill", icon: Crosshair, label: "Drill" },
  { path: "/rankings", icon: BarChart3, label: "Rankings" },
  { path: "/player/p1", icon: User, label: "Perfil" },
];

const BottomNav = () => {
  const location = useLocation();
  const navigate = useNavigate();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-50 glass-strong safe-area-bottom">
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive =
            item.path === "/"
              ? location.pathname === "/"
              : location.pathname.startsWith(item.path);
          const Icon = item.icon;

          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className="relative flex flex-col items-center gap-0.5 px-3 py-1 transition-colors"
            >
              <div className="relative">
                <Icon
                  size={22}
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
                className={`text-[10px] font-medium font-display tracking-wider uppercase transition-colors duration-200 ${
                  isActive ? "text-primary" : "text-muted-foreground"
                }`}
              >
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </nav>
  );
};

export default BottomNav;
