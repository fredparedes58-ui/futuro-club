import { useState } from "react";
import { motion } from "framer-motion";
import { useNavigate, useLocation } from "react-router-dom";
import PageHeader from "@/components/shared/PageHeader";
import {
  LayoutDashboard,
  Activity,
  Users,
  FileText,
  Settings,
  Search,
  SlidersHorizontal,
  ExternalLink,
  TrendingUp,
  Shield,
  UserRound,
  Video,
  Loader2,
} from "lucide-react";
import {
  mockPlayerReports,
  mockPipelines,
  mockLiveFeed,
} from "@/lib/mockData";

const sidebarItems = [
  { path: "/master", icon: LayoutDashboard, label: "Master Dashboard" },
  { path: "/lab", icon: Activity, label: "Active Analysis" },
  { path: "/rankings", icon: Users, label: "Player Database" },
  { path: "/scout", icon: FileText, label: "Scout Reports" },
  { path: "/settings", icon: Settings, label: "Configuration" },
];

const biasColors: Record<string, { bg: string; text: string; label: string }> = {
  low: { bg: "bg-primary/20", text: "text-primary", label: "LOW BIAS ALERT" },
  med: { bg: "bg-gold/20", text: "text-gold", label: "MED BIAS ALERT" },
  high: { bg: "bg-destructive/20", text: "text-destructive", label: "HIGH BIAS ALERT" },
};

const MasterDashboard = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchQuery, setSearchQuery] = useState("");

  const container = {
    hidden: {},
    show: { transition: { staggerChildren: 0.05 } },
  };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show: { opacity: 1, y: 0, transition: { duration: 0.35 } },
  };

  return (
    <div className="flex min-h-screen">
      {/* Sidebar */}
      <aside className="hidden md:flex flex-col w-56 border-r border-border bg-card p-5 justify-between">
        <div>
          <div className="mb-8">
            <PageHeader title="VITAS" subtitle="Academy Intelligence" />
          </div>
          <nav className="space-y-1">
            {sidebarItems.map((navItem) => {
              const Icon = navItem.icon;
              const isActive = location.pathname === navItem.path;
              return (
                <button
                  key={navItem.path}
                  onClick={() => navigate(navItem.path)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-display font-medium transition-all ${
                    isActive
                      ? "bg-primary text-primary-foreground"
                      : "text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Icon size={16} />
                  {navItem.label}
                </button>
              );
            })}
          </nav>
        </div>
        {/* User */}
        <div className="flex items-center gap-3 pt-4 border-t border-border">
          <div className="w-8 h-8 rounded-full bg-primary flex items-center justify-center text-primary-foreground font-display font-bold text-xs">
            JS
          </div>
          <div>
            <p className="text-sm font-display font-semibold text-foreground">Julian Scout</p>
            <p className="text-[10px] text-muted-foreground">Elite Academy Access</p>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <motion.main
        variants={container}
        initial="hidden"
        animate="show"
        className="flex-1 overflow-y-auto pb-24 md:pb-8"
      >
        <div className="flex flex-col lg:flex-row gap-6 p-4 md:p-6">
          {/* Left Column - Main Content */}
          <div className="flex-1 space-y-6 min-w-0">
            {/* Top Stats */}
            <motion.div variants={item} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="glass rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <Users size={16} className="text-muted-foreground" />
                  <span className="text-[10px] font-display text-primary font-semibold">
                    +12% vs last month
                  </span>
                </div>
                <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                  Total Players Scouted
                </p>
                <p className="font-display font-bold text-3xl text-foreground">1,482</p>
              </div>
              <div className="glass rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <Shield size={16} className="text-muted-foreground" />
                  <span className="text-[10px] font-display text-primary font-semibold">
                    Top 2.4% Tier
                  </span>
                </div>
                <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                  Potential Elite Talents Found
                </p>
                <p className="font-display font-bold text-3xl text-foreground">36</p>
              </div>
              <div className="glass rounded-xl p-4 border border-border">
                <div className="flex items-center justify-between mb-3">
                  <TrendingUp size={16} className="text-muted-foreground" />
                  <span className="text-[10px] font-display text-primary font-semibold">
                    Aggregated Score
                  </span>
                </div>
                <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                  Average Academy Growth
                </p>
                <p className="font-display font-bold text-3xl text-foreground">78.4%</p>
              </div>
            </motion.div>

            {/* Active Analysis */}
            <motion.div variants={item}>
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
                  <h2 className="font-display font-bold text-xl text-foreground">
                    Active Analysis
                  </h2>
                </div>
                <button
                  onClick={() => navigate("/lab")}
                  className="px-3 py-1.5 rounded-lg border border-primary text-primary text-xs font-display font-semibold hover:bg-primary/10 transition-colors"
                >
                  View All Pipelines
                </button>
              </div>
              <div className="space-y-3">
                {mockPipelines.map((pipe) => (
                  <div
                    key={pipe.id}
                    className="glass rounded-xl p-4 border border-border cursor-pointer hover:border-primary/30 transition-colors"
                    onClick={() => navigate("/lab")}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center">
                          {pipe.status === "processing" ? (
                            <Video size={16} className="text-muted-foreground" />
                          ) : (
                            <Loader2 size={16} className="text-muted-foreground" />
                          )}
                        </div>
                        <div>
                          <h3 className="font-display font-bold text-sm text-foreground">
                            {pipe.title}
                          </h3>
                          <p className="text-[10px] text-muted-foreground">
                            Source: {pipe.source}
                          </p>
                        </div>
                      </div>
                      <div className="text-right">
                        <span className="text-[10px] font-display uppercase tracking-wider text-muted-foreground">
                          {pipe.status === "processing" ? "Estimated Arrival" : "Queue Position"}
                        </span>
                        <p className="font-display font-bold text-sm text-primary">
                          {pipe.status === "processing" ? pipe.eta : `#${pipe.queuePosition} in Line`}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between mt-3">
                      <span className="text-[10px] text-muted-foreground font-display">
                        {pipe.pilar}
                      </span>
                      <span className="text-[10px] font-display text-muted-foreground">
                        {pipe.status === "processing" ? `${pipe.progress}% Complete` : "Queued"}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-muted overflow-hidden mt-2">
                      <motion.div
                        className="h-full rounded-full bg-primary"
                        initial={{ width: 0 }}
                        animate={{ width: `${pipe.progress}%` }}
                        transition={{ duration: 1.2, ease: "easeOut" }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Recent Player Reports */}
            <motion.div variants={item}>
              <div className="flex items-center justify-between mb-4">
                <h2 className="font-display font-bold text-xl text-foreground">
                  Recent Player Reports
                </h2>
                <div className="flex items-center gap-2">
                  <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <SlidersHorizontal size={14} />
                  </button>
                  <button className="w-8 h-8 rounded-lg border border-border flex items-center justify-center text-muted-foreground hover:text-foreground transition-colors">
                    <Search size={14} />
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {mockPlayerReports.map((report) => {
                  const bias = biasColors[report.biasAlert];
                  return (
                    <div
                      key={report.id}
                      className="glass rounded-xl p-4 border border-border cursor-pointer hover:border-primary/30 transition-colors"
                      onClick={() => navigate("/rankings")}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center">
                            <UserRound size={16} className="text-muted-foreground" />
                          </div>
                          <div>
                            <h4 className="font-display font-bold text-sm text-foreground">
                              {report.name}
                            </h4>
                            <p className="text-[10px] text-muted-foreground">
                              {report.position} · {report.academy}
                            </p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="font-display font-bold text-xl text-foreground">
                            {report.vsi.toFixed(1)}
                          </p>
                          <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                            VSI Score
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center justify-between mt-3">
                        <span
                          className={`px-2 py-0.5 rounded text-[10px] font-display font-bold uppercase tracking-wider ${bias.bg} ${bias.text}`}
                        >
                          {bias.label}
                        </span>
                        <ExternalLink size={12} className="text-muted-foreground" />
                      </div>
                    </div>
                  );
                })}
              </div>
            </motion.div>
          </div>

          {/* Right Sidebar */}
          <div className="w-full lg:w-72 space-y-6 flex-shrink-0">
            {/* Global Talent Distribution */}
            <motion.div variants={item} className="glass rounded-xl p-5 border border-border">
              <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                Global Talent Distribution
              </h3>
              <div className="flex justify-center mb-4">
                <div className="relative w-32 h-32">
                  {/* Simulated globe */}
                  <svg viewBox="0 0 128 128" className="w-full h-full">
                     <circle
                       cx="64"
                       cy="64"
                       r="58"
                       fill="none"
                       stroke="hsl(230, 70%, 58%)"
                       strokeWidth="1.5"
                       opacity="0.3"
                     />
                     <circle
                       cx="64"
                       cy="64"
                       r="58"
                       fill="none"
                       stroke="hsl(230, 70%, 58%)"
                       strokeWidth="1.5"
                       strokeDasharray="365"
                       strokeDashoffset="10"
                       opacity="0.6"
                     />
                    {/* Dots representing talent clusters */}
                     {[
                       [40, 35], [50, 42], [55, 38], [62, 45], [70, 50],
                       [45, 55], [58, 52], [65, 58], [72, 42], [48, 48],
                       [55, 65], [68, 62], [42, 60], [75, 55], [38, 45],
                     ].map(([x, y], i) => (
                       <circle
                         key={i}
                         cx={x}
                         cy={y}
                         r="2.5"
                         fill="hsl(230, 70%, 58%)"
                         opacity={0.4 + Math.random() * 0.6}
                      />
                    ))}
                  </svg>
                  <div className="absolute inset-0 flex flex-col items-center justify-center">
                    <span className="text-[9px] font-display uppercase tracking-widest text-muted-foreground">
                      System Reliability
                    </span>
                    <span className="font-display font-bold text-lg text-foreground">99.8%</span>
                  </div>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="glass rounded-lg p-2 text-center">
                  <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                    EU Cluster
                  </span>
                  <p className="font-display font-bold text-sm text-foreground">42.1%</p>
                </div>
                <div className="glass rounded-lg p-2 text-center">
                  <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">
                    LATAM Cluster
                  </span>
                  <p className="font-display font-bold text-sm text-foreground">38.9%</p>
                </div>
              </div>
            </motion.div>

            {/* Live Feed */}
            <motion.div variants={item} className="glass rounded-xl p-5 border border-border">
              <h3 className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-4">
                Live Feed
              </h3>
              <div className="space-y-4">
                {mockLiveFeed.map((event) => (
                  <div key={event.id} className="flex items-start gap-3">
                    <div
                      className={`w-2 h-2 rounded-full mt-1.5 flex-shrink-0 ${
                        event.color === "primary"
                          ? "bg-primary"
                          : event.color === "electric"
                          ? "bg-electric"
                          : "bg-gold"
                      }`}
                    />
                    <div>
                      <p className="text-sm text-foreground font-display font-medium leading-tight">
                        {event.message}
                      </p>
                      <p className="text-[10px] text-muted-foreground mt-0.5">
                        {event.time}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </motion.div>

            {/* Expert Desk CTA */}
            <motion.div variants={item} className="glass rounded-xl p-5 border border-border">
              <h3 className="font-display font-bold text-sm text-foreground mb-2">
                Need specialist assistance?
              </h3>
              <p className="text-xs text-muted-foreground mb-4">
                Our biomechanics and scouting experts are available for detailed report reviews.
              </p>
              <button className="w-full px-4 py-3 rounded-lg bg-primary text-primary-foreground font-display font-bold text-sm hover:bg-primary/90 transition-colors">
                Contact Expert Desk
              </button>
            </motion.div>
          </div>
        </div>
      </motion.main>
    </div>
  );
};

export default MasterDashboard;
