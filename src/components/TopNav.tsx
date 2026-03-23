import { useNavigate, useLocation } from "react-router-dom";
import { Bell, ChevronDown } from "lucide-react";

const navItems = [
  { label: "Dashboard", path: "/pulse" },
  { label: "Scouting", path: "/scout" },
  { label: "Players", path: "/rankings" },
  { label: "Teams", path: "/master" },
  { label: "Reports", path: "/reports" },
  { label: "Settings", path: "/settings" },
];

const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="w-full border-b border-border px-6 py-3 flex items-center justify-between" style={{
      background: "linear-gradient(180deg, hsl(225 25% 12%) 0%, hsl(225 25% 10%) 100%)",
    }}>
      <div className="flex items-center gap-8">
        <div className="flex items-center gap-2 cursor-pointer" onClick={() => navigate("/")}>
          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-accent flex items-center justify-center">
            <span className="font-display font-black text-xs text-primary-foreground">V</span>
          </div>
          <span className="font-display font-black text-xl text-foreground tracking-tight">
            vitas
          </span>
        </div>
        <div className="hidden md:flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path || 
              (item.path === "/scout" && location.pathname.startsWith("/scout"));
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`px-4 py-2 rounded-lg text-sm font-display font-semibold transition-colors ${
                  isActive
                    ? "text-foreground bg-secondary"
                    : "text-muted-foreground hover:text-foreground hover:bg-secondary/50"
                }`}
              >
                {item.label}
              </button>
            );
          })}
        </div>
      </div>
      <div className="flex items-center gap-3">
        <button className="relative p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors">
          <Bell size={18} />
          <div className="absolute top-1.5 right-1.5 w-2 h-2 rounded-full bg-primary" />
        </button>
        <div className="flex items-center gap-2 cursor-pointer px-2 py-1 rounded-lg hover:bg-secondary/50 transition-colors">
          <div className="w-8 h-8 rounded-full bg-gradient-to-br from-primary/40 to-accent/40 border border-border flex items-center justify-center overflow-hidden">
            <span className="text-xs font-display font-bold text-foreground">JS</span>
          </div>
          <ChevronDown size={14} className="text-muted-foreground" />
        </div>
      </div>
    </nav>
  );
};

export default TopNav;
