import { useNavigate, useLocation } from "react-router-dom";

const navItems = [
  { label: "Dashboard", path: "/" },
  { label: "Scout List", path: "/scout" },
  { label: "Player Comparison", path: "/compare" },
];

const TopNav = () => {
  const navigate = useNavigate();
  const location = useLocation();

  return (
    <nav className="w-full bg-card/80 backdrop-blur-md border-b border-border px-6 py-3 flex items-center justify-between">
      <div className="flex items-center gap-3">
        <span className="font-display font-black text-xl text-primary tracking-tight">VITAS</span>
        <span className="text-[10px] font-display font-medium uppercase tracking-widest text-muted-foreground">
          Prophet Horizon V2.4
        </span>
      </div>
      <div className="flex items-center gap-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <button
              key={item.path}
              onClick={() => navigate(item.path)}
              className={`px-4 py-2 rounded-lg text-sm font-display font-semibold transition-colors ${
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-secondary"
              }`}
            >
              {item.label}
            </button>
          );
        })}
        <div className="ml-3 w-9 h-9 rounded-full bg-secondary border border-border flex items-center justify-center">
          <span className="text-xs font-display font-bold text-muted-foreground">👤</span>
        </div>
      </div>
    </nav>
  );
};

export default TopNav;
