import { motion } from "framer-motion";
import { Activity, BarChart3, Users, TrendingUp, Zap, Shield } from "lucide-react";

/* ─── Mini bar chart ─── */
function MiniBars({ count = 5, color = "primary" }: { count?: number; color?: string }) {
  return (
    <div className="flex items-end gap-[3px] h-8">
      {Array.from({ length: count }).map((_, i) => (
        <motion.div
          key={i}
          className={`w-[6px] rounded-sm bg-${color}/60`}
          initial={{ height: 4 }}
          animate={{ height: 8 + Math.random() * 24 }}
          transition={{ delay: i * 0.1, duration: 0.8, repeat: Infinity, repeatType: "reverse", repeatDelay: 1 + Math.random() * 2 }}
        />
      ))}
    </div>
  );
}

/* ─── Mini line pulse ─── */
function MiniPulse() {
  return (
    <svg viewBox="0 0 120 30" className="w-full h-6 opacity-60">
      <motion.path
        d="M0,15 Q10,5 20,15 T40,15 T60,8 T80,20 T100,12 T120,15"
        fill="none"
        stroke="hsl(var(--primary))"
        strokeWidth="1.5"
        strokeLinecap="round"
        initial={{ pathLength: 0, opacity: 0 }}
        animate={{ pathLength: 1, opacity: 1 }}
        transition={{ duration: 2, ease: "easeOut" }}
      />
    </svg>
  );
}

/* ─── Mini player row ─── */
function MiniPlayerRow({ name, score, rank }: { name: string; score: number; rank: number }) {
  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-[7px] font-display font-bold text-muted-foreground w-3">{rank}</span>
      <div className="w-4 h-4 rounded-full bg-primary/20 border border-primary/30" />
      <span className="text-[8px] font-display text-foreground/80 flex-1 truncate">{name}</span>
      <div className="flex items-center gap-1">
        <div className="w-8 h-1.5 rounded-full bg-muted overflow-hidden">
          <div className="h-full rounded-full bg-primary/70" style={{ width: `${score}%` }} />
        </div>
        <span className="text-[7px] font-display font-bold text-primary/80">{score}</span>
      </div>
    </div>
  );
}

/* ─── Mini stat box ─── */
function MiniStat({ label, value, icon: Icon }: { label: string; value: string; icon: React.ElementType }) {
  return (
    <div className="flex flex-col gap-1 p-2 rounded-lg bg-background/30 border border-border/30">
      <div className="flex items-center gap-1">
        <Icon size={8} className="text-primary/70" />
        <span className="text-[6px] font-display uppercase tracking-wider text-muted-foreground">{label}</span>
      </div>
      <span className="text-[11px] font-display font-bold text-foreground/90">{value}</span>
    </div>
  );
}

/* ─── PULSE SCREEN ─── */
export function PulseScreen() {
  return (
    <div className="w-full h-full p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Activity size={10} className="text-primary" />
        <span className="text-[8px] font-display font-bold text-foreground/70 uppercase tracking-wider">Pulse — Live</span>
        <div className="ml-auto w-1.5 h-1.5 rounded-full bg-primary pulse-live" />
      </div>
      <div className="grid grid-cols-3 gap-1.5">
        <MiniStat label="VSI Avg" value="72.4" icon={Zap} />
        <MiniStat label="Active" value="342" icon={Users} />
        <MiniStat label="Alerts" value="18" icon={Shield} />
      </div>
      <MiniPulse />
      <MiniBars count={8} />
    </div>
  );
}

/* ─── MASTER SCREEN ─── */
export function MasterScreen() {
  return (
    <div className="w-full h-full p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 mb-1">
        <TrendingUp size={10} className="text-primary" />
        <span className="text-[8px] font-display font-bold text-foreground/70 uppercase tracking-wider">Master Dashboard</span>
      </div>
      <div className="grid grid-cols-2 gap-1.5">
        <MiniStat label="Scouted" value="1,247" icon={Users} />
        <MiniStat label="Growth" value="+14%" icon={TrendingUp} />
      </div>
      <div className="flex gap-2 flex-1">
        <MiniBars count={6} />
        <MiniBars count={4} color="electric" />
      </div>
      <MiniPulse />
    </div>
  );
}

/* ─── RANKINGS SCREEN ─── */
export function RankingsScreen() {
  return (
    <div className="w-full h-full p-3 flex flex-col gap-1.5">
      <div className="flex items-center gap-1.5 mb-1">
        <BarChart3 size={10} className="text-primary" />
        <span className="text-[8px] font-display font-bold text-foreground/70 uppercase tracking-wider">Rankings</span>
      </div>
      <MiniPlayerRow name="L. Rodríguez" score={94} rank={1} />
      <MiniPlayerRow name="M. Fernández" score={91} rank={2} />
      <MiniPlayerRow name="A. García" score={88} rank={3} />
      <MiniPlayerRow name="D. López" score={85} rank={4} />
      <MiniPlayerRow name="J. Martínez" score={82} rank={5} />
    </div>
  );
}

/* ─── SCOUT SCREEN ─── */
export function ScoutScreen() {
  return (
    <div className="w-full h-full p-3 flex flex-col gap-2">
      <div className="flex items-center gap-1.5 mb-1">
        <Users size={10} className="text-primary" />
        <span className="text-[8px] font-display font-bold text-foreground/70 uppercase tracking-wider">Scout Feed</span>
      </div>
      {[
        { name: "Nuevo talento Sub-15", tag: "ALERT" },
        { name: "Rendimiento semanal", tag: "REPORT" },
        { name: "Comparación táctica", tag: "INSIGHT" },
      ].map((item) => (
        <div key={item.name} className="flex items-center gap-2 p-1.5 rounded-md bg-background/30 border border-border/20">
          <div className="w-5 h-5 rounded-md bg-primary/10 flex items-center justify-center">
            <Zap size={8} className="text-primary/70" />
          </div>
          <div className="flex-1">
            <span className="text-[7px] font-display text-foreground/70 block">{item.name}</span>
          </div>
          <span className="text-[5px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-full bg-primary/10 text-primary/80 border border-primary/20">
            {item.tag}
          </span>
        </div>
      ))}
    </div>
  );
}
