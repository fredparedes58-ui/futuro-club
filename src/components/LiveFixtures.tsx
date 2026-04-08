import { useEffect } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { Trophy, Clock, Wifi, WifiOff } from "lucide-react";

/* ── Types ─────────────────────────────────────────────────── */

interface Fixture {
  id: number;
  homeTeam: string;
  awayTeam: string;
  score: [number, number];
  minute: number | null;
  status: "IN_PLAY" | "PAUSED" | "TIMED" | "SCHEDULED" | "FINISHED";
  playersTracked: number;
  topPerformer: string | null;
  topVsi: number | null;
}

interface FixturesResponse {
  fixtures: Fixture[];
  source: string;
  updatedAt: string;
  error?: string;
}

interface LiveFixturesProps {
  className?: string;
  compact?: boolean;
}

/* ── Status helpers ────────────────────────────────────────── */

const STATUS_CONFIG: Record<
  Fixture["status"],
  { label: string; color: string; bg: string; pulse: boolean }
> = {
  IN_PLAY:   { label: "En Juego",    color: "text-emerald-400", bg: "bg-emerald-500/20", pulse: true },
  PAUSED:    { label: "Pausado",     color: "text-yellow-400",  bg: "bg-yellow-500/20",  pulse: false },
  TIMED:     { label: "Programado",  color: "text-muted-foreground", bg: "bg-white/5",   pulse: false },
  SCHEDULED: { label: "Programado",  color: "text-muted-foreground", bg: "bg-white/5",   pulse: false },
  FINISHED:  { label: "Finalizado",  color: "text-muted-foreground/60", bg: "bg-white/5", pulse: false },
};

/* ── Fetcher ───────────────────────────────────────────────── */

async function fetchFixtures(): Promise<FixturesResponse> {
  const res = await fetch("/api/fixtures/live");
  if (!res.ok) throw new Error("Error al obtener partidos");
  return res.json();
}

/* ── Component ─────────────────────────────────────────────── */

export default function LiveFixtures({ className = "", compact = false }: LiveFixturesProps) {
  const { data, isLoading, error, refetch } = useQuery<FixturesResponse>({
    queryKey: ["fixtures", "live"],
    queryFn: fetchFixtures,
    staleTime: 30_000,
    refetchOnWindowFocus: true,
  });

  const fixtures = data?.fixtures ?? [];
  const hasLive = fixtures.some((f) => f.status === "IN_PLAY" || f.status === "PAUSED");
  const apiMissing = !!data?.error;

  /* Auto-refresh cada 60 s cuando hay partidos en vivo */
  useEffect(() => {
    if (!hasLive) return;
    const id = setInterval(() => refetch(), 60_000);
    return () => clearInterval(id);
  }, [hasLive, refetch]);

  /* ── Render ── */

  return (
    <motion.section
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={`glass rounded-2xl p-4 ${compact ? "p-3" : "p-5"} ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Trophy size={compact ? 16 : 18} className="text-primary" />
          <h2 className={`font-display font-bold tracking-tight ${compact ? "text-sm" : "text-base"}`}>
            Partidos en Vivo
          </h2>
          {hasLive && (
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
            </span>
          )}
        </div>
        <div className="flex items-center gap-1.5 text-[10px] text-muted-foreground">
          {apiMissing ? (
            <WifiOff size={12} className="text-destructive" />
          ) : (
            <Wifi size={12} className={hasLive ? "text-emerald-400" : "text-muted-foreground"} />
          )}
          {data?.updatedAt && (
            <span className="font-mono">
              {new Date(data.updatedAt).toLocaleTimeString("es-ES", {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </span>
          )}
        </div>
      </div>

      {/* API key warning */}
      {apiMissing && (
        <div className="rounded-xl bg-yellow-500/10 border border-yellow-500/20 px-4 py-3 text-xs text-yellow-300 mb-3">
          Configura <code className="font-mono bg-white/10 px-1 py-0.5 rounded">FOOTBALL_DATA_API_KEY</code> en Vercel
        </div>
      )}

      {/* Loading */}
      {isLoading && (
        <div className="flex items-center justify-center py-8 gap-2 text-muted-foreground text-sm">
          <Clock size={14} className="animate-spin" />
          Cargando partidos...
        </div>
      )}

      {/* Error */}
      {error && !apiMissing && (
        <div className="rounded-xl bg-destructive/10 border border-destructive/20 px-4 py-3 text-xs text-destructive">
          No se pudieron cargar los partidos. Intenta de nuevo.
        </div>
      )}

      {/* Empty state */}
      {!isLoading && !error && !apiMissing && fixtures.length === 0 && (
        <p className="text-sm text-muted-foreground text-center py-6">
          No hay partidos en este momento
        </p>
      )}

      {/* Fixtures list */}
      <AnimatePresence mode="popLayout">
        <div className={`space-y-2 ${compact ? "max-h-[320px] overflow-y-auto pr-1 scrollbar-thin" : ""}`}>
          {fixtures.map((fixture, i) => (
            <FixtureCard key={fixture.id} fixture={fixture} index={i} compact={compact} />
          ))}
        </div>
      </AnimatePresence>
    </motion.section>
  );
}

/* ── Fixture Card ──────────────────────────────────────────── */

function FixtureCard({
  fixture,
  index,
  compact,
}: {
  fixture: Fixture;
  index: number;
  compact: boolean;
}) {
  const cfg = STATUS_CONFIG[fixture.status];
  const isLive = fixture.status === "IN_PLAY";

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.3, delay: index * 0.05 }}
      className={`
        rounded-xl border transition-colors
        ${isLive
          ? "border-emerald-500/30 bg-emerald-500/5 hover:border-emerald-500/50"
          : "border-border/50 bg-white/[0.02] hover:border-border"
        }
        ${compact ? "px-3 py-2" : "px-4 py-3"}
      `}
    >
      {/* Status row */}
      <div className="flex items-center justify-between mb-2">
        <div className={`flex items-center gap-1.5 text-[10px] font-display font-semibold uppercase tracking-wider ${cfg.color}`}>
          {cfg.pulse && (
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500" />
            </span>
          )}
          {cfg.label}
        </div>
        {fixture.minute !== null && isLive && (
          <span className="text-[10px] font-mono font-bold text-emerald-400 bg-emerald-500/15 px-1.5 py-0.5 rounded">
            {fixture.minute}'
          </span>
        )}
      </div>

      {/* Score row */}
      <div className="flex items-center justify-between">
        <span className={`font-display font-semibold truncate max-w-[35%] ${compact ? "text-xs" : "text-sm"} text-foreground`}>
          {fixture.homeTeam}
        </span>
        <div className="flex items-center gap-2 font-display font-bold text-lg">
          <span className={fixture.score[0] > fixture.score[1] ? "text-primary" : "text-foreground"}>
            {fixture.score[0]}
          </span>
          <span className="text-muted-foreground text-xs">-</span>
          <span className={fixture.score[1] > fixture.score[0] ? "text-primary" : "text-foreground"}>
            {fixture.score[1]}
          </span>
        </div>
        <span className={`font-display font-semibold truncate max-w-[35%] text-right ${compact ? "text-xs" : "text-sm"} text-foreground`}>
          {fixture.awayTeam}
        </span>
      </div>

      {/* Footer — tracked players & top performer */}
      {(fixture.playersTracked > 0 || fixture.topPerformer) && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border/30 pt-2 mt-2">
          <span>{fixture.playersTracked} jugadores rastreados</span>
          {fixture.topPerformer && fixture.topVsi !== null && (
            <span className="text-primary font-medium">
              ⭐ {fixture.topPerformer} ({fixture.topVsi})
            </span>
          )}
        </div>
      )}
    </motion.div>
  );
}
