/**
 * VITAS · Behavioral Overview (Team)
 * /behavioral
 *
 * Team-level dashboard for the Behavioral Profiling Engine.
 * Lists all players ranked by mental composite score and archetype.
 * Click → opens the player's Hub on the "Mental" tab.
 */

import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft,
  Brain,
  Search,
  Filter,
  Sparkles,
  Crown,
  Lightbulb,
  Activity,
  Ghost,
  Sword,
  Compass,
  Eye,
  Share2,
  X,
} from "lucide-react";
import { PlayerService, type Player } from "@/services/real/playerService";
import { SquadMentalComposition } from "@/components/behavioral/SquadMentalComposition";
import { ArchetypeShareCard } from "@/components/behavioral/ArchetypeShareCard";
import DemoDataBanner from "@/components/DemoDataBanner";

interface BehavioralScores {
  decisionSpeed: number;
  scanningIntelligence: number;
  resilience: number;
  clutchFactor: number;
  leadership: number;
  mentalFatigue: number;
  unpredictability: number;
  mentalComposite: number;
  archetype: Archetype;
}

type Archetype = "commander" | "creator" | "engine" | "ghost" | "warrior" | "architect";

const ARCHETYPE_META: Record<
  Archetype,
  { label: string; icon: React.ElementType; color: string; description: string }
> = {
  commander: {
    label: "Commander",
    icon: Crown,
    color: "#ef4444",
    description: "Liderazgo + decisión rápida bajo presión",
  },
  creator: {
    label: "Creator",
    icon: Lightbulb,
    color: "#fbbf24",
    description: "Creatividad e imprevisibilidad alta",
  },
  engine: {
    label: "Engine",
    icon: Activity,
    color: "#10b981",
    description: "Resiliencia + bajo desgaste mental",
  },
  ghost: {
    label: "Ghost",
    icon: Ghost,
    color: "#94a3b8",
    description: "Scan e inteligencia espacial superior",
  },
  warrior: {
    label: "Warrior",
    icon: Sword,
    color: "#f97316",
    description: "Clutch factor + duelos ganados",
  },
  architect: {
    label: "Architect",
    icon: Compass,
    color: "#3b82f6",
    description: "Visión de juego y lectura táctica",
  },
};

const ALL_ARCHETYPES: Archetype[] = ["commander", "creator", "engine", "ghost", "warrior", "architect"];

// Deterministic mock generator — same player → same scores
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h = Math.imul(h ^ seed.charCodeAt(i), 16777619);
  }
  let s = (h >>> 0) || 1;
  return () => {
    s = (s * 9301 + 49297) % 233280;
    return s / 233280;
  };
}

function generateScores(player: Player): BehavioralScores {
  const rng = seededRng(player.id);
  const base = (min: number, max: number) => Math.round(min + rng() * (max - min));

  const decisionSpeed = base(45, 95);
  const scanningIntelligence = base(40, 95);
  const resilience = base(40, 90);
  const clutchFactor = base(35, 95);
  const leadership = base(30, 90);
  // mentalFatigue is inverted — lower is better. Show as resistance score.
  const mentalFatigue = base(40, 95);
  const unpredictability = base(30, 95);

  const mentalComposite = Math.round(
    decisionSpeed * 0.2 +
      scanningIntelligence * 0.15 +
      resilience * 0.2 +
      clutchFactor * 0.15 +
      leadership * 0.1 +
      mentalFatigue * 0.1 +
      unpredictability * 0.1,
  );

  // Pick archetype based on dominant trait
  let archetype: Archetype;
  const dominant = Math.max(
    leadership,
    unpredictability,
    resilience,
    scanningIntelligence,
    clutchFactor,
    decisionSpeed,
  );
  if (dominant === leadership) archetype = "commander";
  else if (dominant === unpredictability) archetype = "creator";
  else if (dominant === resilience) archetype = "engine";
  else if (dominant === scanningIntelligence) archetype = "ghost";
  else if (dominant === clutchFactor) archetype = "warrior";
  else archetype = "architect";

  return {
    decisionSpeed,
    scanningIntelligence,
    resilience,
    clutchFactor,
    leadership,
    mentalFatigue,
    unpredictability,
    mentalComposite,
    archetype,
  };
}

type SortKey = "composite" | "name" | "age" | "scanning";

export default function BehavioralOverviewPage() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [players, setPlayers] = useState<Player[]>([]);
  const [query, setQuery] = useState("");
  const [archetypeFilter, setArchetypeFilter] = useState<Archetype | "all">("all");
  const [sortKey, setSortKey] = useState<SortKey>("composite");
  const [shareEntry, setShareEntry] = useState<{ player: Player; scores: BehavioralScores } | null>(null);

  useEffect(() => {
    setPlayers(PlayerService.getAll());
  }, []);

  const enriched = useMemo(() => {
    return players.map((p) => ({ player: p, scores: generateScores(p) }));
  }, [players]);

  const filtered = useMemo(() => {
    let list = enriched;
    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter(
        (e) =>
          e.player.name.toLowerCase().includes(q) ||
          e.player.position.toLowerCase().includes(q),
      );
    }
    if (archetypeFilter !== "all") {
      list = list.filter((e) => e.scores.archetype === archetypeFilter);
    }
    return [...list].sort((a, b) => {
      if (sortKey === "name") return a.player.name.localeCompare(b.player.name);
      if (sortKey === "age") return b.player.age - a.player.age;
      if (sortKey === "scanning") return b.scores.scanningIntelligence - a.scores.scanningIntelligence;
      return b.scores.mentalComposite - a.scores.mentalComposite;
    });
  }, [enriched, query, archetypeFilter, sortKey]);

  // Aggregated stats
  const teamStats = useMemo(() => {
    if (enriched.length === 0) {
      return {
        avg: 0,
        topArchetype: null as Archetype | null,
        topPlayer: null as { player: Player; scores: BehavioralScores } | null,
      };
    }
    const avg = Math.round(
      enriched.reduce((s, e) => s + e.scores.mentalComposite, 0) / enriched.length,
    );
    const counts: Record<string, number> = {};
    for (const e of enriched) {
      counts[e.scores.archetype] = (counts[e.scores.archetype] || 0) + 1;
    }
    const topArchetype = Object.entries(counts).sort((a, b) => b[1] - a[1])[0]?.[0] as Archetype | undefined;
    const topPlayer = [...enriched].sort((a, b) => b.scores.mentalComposite - a.scores.mentalComposite)[0];
    return {
      avg,
      topArchetype: topArchetype ?? null,
      topPlayer,
    };
  }, [enriched]);

  const archetypeCounts = useMemo(() => {
    const counts: Record<Archetype, number> = {
      commander: 0,
      creator: 0,
      engine: 0,
      ghost: 0,
      warrior: 0,
      architect: 0,
    };
    for (const e of enriched) counts[e.scores.archetype]++;
    return counts;
  }, [enriched]);

  return (
    <div className="min-h-screen bg-background pb-24">
      {/* Header */}
      <header className="sticky top-0 z-30 glass-strong border-b border-border">
        <div className="max-w-6xl mx-auto px-4 py-3">
          <div className="flex items-center gap-3 mb-3 flex-wrap">
            <button
              onClick={() => navigate(-1)}
              className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <ArrowLeft size={16} />
            </button>
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shrink-0">
              <Brain size={18} className="text-white" />
            </div>
            <div className="flex-1 min-w-0">
              <h1 className="font-display font-bold text-base text-foreground">
                {t("behavioralOverviewPage.title")}
              </h1>
              <p className="text-[11px] text-muted-foreground">
                {t("behavioralOverviewPage.subtitle", { count: enriched.length })}
              </p>
            </div>
          </div>

          {enriched.length > 0 && (
            <div className="space-y-2">
              <div className="relative">
                <Search
                  size={12}
                  className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder={t("behavioralOverviewPage.searchPlaceholder")}
                  className="w-full pl-8 pr-3 py-1.5 bg-secondary/40 rounded-lg text-xs border border-border focus:border-primary focus:outline-none"
                />
              </div>
              <div className="flex items-center gap-1.5 flex-wrap">
                <Filter size={12} className="text-muted-foreground" />
                <button
                  onClick={() => setArchetypeFilter("all")}
                  className={`px-2.5 py-1 rounded-full text-[11px] font-display font-semibold transition-all ${
                    archetypeFilter === "all"
                      ? "bg-primary text-primary-foreground"
                      : "bg-secondary text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {t("behavioralOverviewPage.filterAll", { count: enriched.length })}
                </button>
                {ALL_ARCHETYPES.map((a) => {
                  const meta = ARCHETYPE_META[a];
                  const Icon = meta.icon;
                  const count = archetypeCounts[a];
                  if (count === 0) return null;
                  return (
                    <button
                      key={a}
                      onClick={() => setArchetypeFilter(a)}
                      className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-display font-semibold whitespace-nowrap transition-all border ${
                        archetypeFilter === a
                          ? "border-foreground"
                          : "border-transparent bg-secondary text-muted-foreground hover:text-foreground"
                      }`}
                      style={
                        archetypeFilter === a
                          ? { background: `${meta.color}25`, color: meta.color, borderColor: meta.color }
                          : undefined
                      }
                    >
                      <Icon size={10} />
                      {meta.label} ({count})
                    </button>
                  );
                })}
                <span className="ml-auto text-[10px] text-muted-foreground">
                  {t("behavioralOverviewPage.sortLabel")}
                </span>
                {(["composite", "scanning", "name", "age"] as SortKey[]).map((k) => (
                  <button
                    key={k}
                    onClick={() => setSortKey(k)}
                    className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all ${
                      sortKey === k
                        ? "bg-primary/15 text-primary"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {k === "composite"
                      ? "Composite"
                      : k === "scanning"
                      ? "Scan IQ"
                      : k === "name"
                      ? t("behavioralOverviewPage.sortName")
                      : t("behavioralOverviewPage.sortAge")}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </header>

      <main className="max-w-6xl mx-auto px-4 py-5 space-y-5">
        {enriched.length === 0 ? (
          <EmptyState onCreate={() => navigate("/players/new")} />
        ) : (
          <>
            <DemoDataBanner messageKey="demoData.behavioral" />

            {/* Team summary */}
            <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
              <StatCard
                label={t("behavioralOverviewPage.statAvgComposite")}
                value={teamStats.avg.toString()}
                sub="/ 100"
                color="from-purple-500 to-indigo-600"
              />
              {teamStats.topArchetype && (
                <StatCard
                  label={t("behavioralOverviewPage.statDominantArchetype")}
                  value={ARCHETYPE_META[teamStats.topArchetype].label}
                  sub={t("behavioralOverviewPage.statPlayersCount", { count: archetypeCounts[teamStats.topArchetype] })}
                  color="from-amber-500 to-orange-500"
                  icon={ARCHETYPE_META[teamStats.topArchetype].icon}
                />
              )}
              {teamStats.topPlayer && (
                <StatCard
                  label={t("behavioralOverviewPage.statTopMental")}
                  value={teamStats.topPlayer.player.name}
                  sub={t("behavioralOverviewPage.statCompositeSuffix", { value: teamStats.topPlayer.scores.mentalComposite })}
                  color="from-emerald-500 to-teal-500"
                  icon={Sparkles}
                />
              )}
            </div>

            {/* 💎 Composición mental de la plantilla (Sprint 3.6) */}
            <SquadMentalComposition counts={archetypeCounts} total={enriched.length} />

            {/* Link to dedicated Scanning page */}
            {filtered.length > 0 && (
              <button
                onClick={() => navigate("/scanning")}
                className="w-full glass rounded-2xl p-4 border border-pink-500/30 bg-gradient-to-r from-pink-500/5 to-fuchsia-500/5 hover:from-pink-500/10 hover:to-fuchsia-500/10 transition-all flex items-center gap-3 group text-left"
              >
                <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center shrink-0">
                  <Eye size={18} className="text-white" />
                </div>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-display font-bold text-foreground">
                    Scanning Intelligence
                  </h3>
                  <p className="text-[11px] text-muted-foreground">
                    {t("behavioralOverviewPage.scanningCardDesc")}
                  </p>
                </div>
                <span className="text-[11px] text-pink-500 font-display font-semibold whitespace-nowrap group-hover:translate-x-1 transition-transform">
                  {t("behavioralOverviewPage.openReport")}
                </span>
              </button>
            )}

            {/* Players grid */}
            {filtered.length === 0 ? (
              <div className="glass rounded-xl p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  {t("behavioralOverviewPage.noMatches")}
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                <AnimatePresence>
                  {filtered.map((entry, idx) => (
                    <PlayerCard
                      key={entry.player.id}
                      rank={idx + 1}
                      entry={entry}
                      onOpen={() => navigate(`/players/${entry.player.id}?tab=mental`)}
                      onShare={() => setShareEntry(entry)}
                    />
                  ))}
                </AnimatePresence>
              </div>
            )}
          </>
        )}
      </main>

      {/* 💎 Modal: card compartible de ADN Mental (Sprint 3.6) */}
      {shareEntry && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          onClick={() => setShareEntry(null)}
        >
          <div
            className="w-full max-w-sm max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex justify-end mb-2">
              <button
                onClick={() => setShareEntry(null)}
                aria-label={t("behavioralOverviewPage.close")}
                className="p-1.5 rounded-lg bg-white/10 text-white hover:bg-white/20 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            <ArchetypeShareCard
              playerName={shareEntry.player.name}
              position={shareEntry.player.position}
              age={shareEntry.player.age}
              archetype={shareEntry.scores.archetype}
              mentalComposite={shareEntry.scores.mentalComposite}
              dimensions={{
                decisionSpeed: shareEntry.scores.decisionSpeed,
                scanningIntelligence: shareEntry.scores.scanningIntelligence,
                resilience: shareEntry.scores.resilience,
                clutchFactor: shareEntry.scores.clutchFactor,
                leadership: shareEntry.scores.leadership,
                mentalFatigue: shareEntry.scores.mentalFatigue,
                unpredictability: shareEntry.scores.unpredictability,
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
}

function StatCard({
  label,
  value,
  sub,
  color,
  icon: Icon,
}: {
  label: string;
  value: string;
  sub?: string;
  color: string;
  icon?: React.ElementType;
}) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-xl p-3 space-y-2"
    >
      <div className={`w-8 h-8 rounded-lg bg-gradient-to-br ${color} flex items-center justify-center`}>
        {Icon ? <Icon size={14} className="text-white" /> : <Brain size={14} className="text-white" />}
      </div>
      <div>
        <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
          {label}
        </p>
        <p className="text-base font-display font-bold text-foreground leading-tight mt-0.5">
          {value}
        </p>
        {sub && <p className="text-[10px] text-muted-foreground mt-0.5">{sub}</p>}
      </div>
    </motion.div>
  );
}

function PlayerCard({
  rank,
  entry,
  onOpen,
  onShare,
}: {
  rank: number;
  entry: { player: Player; scores: BehavioralScores };
  onOpen: () => void;
  onShare: () => void;
}) {
  const { t } = useTranslation();
  const meta = ARCHETYPE_META[entry.scores.archetype];
  const Icon = meta.icon;
  const composite = entry.scores.mentalComposite;
  const compositeColor =
    composite >= 75 ? "#10b981" : composite >= 60 ? "#3b82f6" : composite >= 45 ? "#f59e0b" : "#ef4444";

  // Top 2 strengths (highest dimensions)
  const dimensions = [
    { label: t("behavioralOverviewPage.dimDecision"), value: entry.scores.decisionSpeed },
    { label: t("behavioralOverviewPage.dimScan"), value: entry.scores.scanningIntelligence },
    { label: t("behavioralOverviewPage.dimResilience"), value: entry.scores.resilience },
    { label: t("behavioralOverviewPage.dimClutch"), value: entry.scores.clutchFactor },
    { label: t("behavioralOverviewPage.dimLeadership"), value: entry.scores.leadership },
    { label: t("behavioralOverviewPage.dimMentalEndurance"), value: entry.scores.mentalFatigue },
    { label: t("behavioralOverviewPage.dimCreativity"), value: entry.scores.unpredictability },
  ];
  const strengths = [...dimensions].sort((a, b) => b.value - a.value).slice(0, 2);

  return (
    <motion.button
      layout
      initial={{ opacity: 0, y: 6 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.95 }}
      whileHover={{ y: -2 }}
      onClick={onOpen}
      className="glass rounded-xl p-3 text-left border border-border hover:border-primary/40 transition-all group"
    >
      <div className="flex items-center gap-3 mb-3">
        <div className="relative shrink-0">
          <div
            className="w-10 h-10 rounded-full flex items-center justify-center font-display font-bold text-sm"
            style={{ background: `${meta.color}25`, border: `2px solid ${meta.color}55`, color: meta.color }}
          >
            {entry.player.name.slice(0, 2).toUpperCase()}
          </div>
          {rank <= 3 && (
            <span
              className="absolute -bottom-1 -right-1 w-5 h-5 rounded-full text-[9px] font-bold flex items-center justify-center text-white"
              style={{
                background:
                  rank === 1 ? "linear-gradient(135deg,#fbbf24,#f59e0b)" : rank === 2 ? "#94a3b8" : "#cd7f32",
              }}
            >
              {rank}
            </span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-display font-bold text-foreground truncate">{entry.player.name}</p>
          <p className="text-[10px] text-muted-foreground">
            {entry.player.age}a · {entry.player.position}
          </p>
        </div>
        <div className="text-right shrink-0">
          <p className="text-xl font-display font-bold leading-none" style={{ color: compositeColor }}>
            {composite}
          </p>
          <p className="text-[8px] uppercase tracking-wider text-muted-foreground">composite</p>
        </div>
        <span
          role="button"
          tabIndex={0}
          aria-label={t("behavioralOverviewPage.shareAria", { name: entry.player.name })}
          onClick={(e) => { e.stopPropagation(); onShare(); }}
          onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); e.stopPropagation(); onShare(); } }}
          className="shrink-0 p-1.5 rounded-lg text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors cursor-pointer"
        >
          <Share2 size={14} />
        </span>
      </div>

      {/* Archetype */}
      <div
        className="flex items-center gap-1.5 px-2 py-1 rounded-md text-[10px] font-semibold mb-2"
        style={{ background: `${meta.color}15`, color: meta.color }}
      >
        <Icon size={11} />
        <span className="font-bold">{meta.label}</span>
        <span className="text-muted-foreground/80 hidden sm:inline">· {t(`behavioralOverviewPage.archetypeDesc.${entry.scores.archetype}`)}</span>
      </div>

      {/* Mini strengths */}
      <div className="space-y-1">
        {strengths.map((d) => (
          <div key={d.label} className="space-y-0.5">
            <div className="flex items-center justify-between text-[10px]">
              <span className="text-muted-foreground">{d.label}</span>
              <span className="font-mono font-bold text-foreground">{d.value}</span>
            </div>
            <div className="h-1 bg-secondary/40 rounded-full overflow-hidden">
              <motion.div
                initial={{ width: 0 }}
                animate={{ width: `${d.value}%` }}
                transition={{ duration: 0.6, ease: "easeOut" }}
                className="h-full rounded-full"
                style={{ background: meta.color }}
              />
            </div>
          </div>
        ))}
      </div>

      <p className="text-[9px] text-primary/80 mt-2 group-hover:text-primary transition-colors">
        {t("behavioralOverviewPage.viewFullProfile")}
      </p>
    </motion.button>
  );
}

function EmptyState({ onCreate }: { onCreate: () => void }) {
  const { t } = useTranslation();
  return (
    <div className="glass rounded-2xl p-8 text-center max-w-2xl mx-auto border border-dashed border-border space-y-4">
      <div className="w-16 h-16 mx-auto rounded-2xl bg-gradient-to-br from-purple-500/20 to-indigo-600/20 flex items-center justify-center">
        <Brain size={28} className="text-purple-500" />
      </div>
      <div>
        <h2 className="text-lg font-display font-bold text-foreground">
          {t("behavioralOverviewPage.emptyTitle")}
        </h2>
        <p className="text-xs text-muted-foreground mt-2 leading-relaxed max-w-md mx-auto">
          {t("behavioralOverviewPage.emptyBody")}
        </p>
      </div>
      <button
        onClick={onCreate}
        className="inline-flex items-center gap-1.5 px-4 py-2 rounded-lg bg-gradient-to-r from-purple-500 to-indigo-600 text-white text-xs font-display font-semibold hover:opacity-90 transition-all"
      >
        {t("behavioralOverviewPage.createFirstPlayer")}
      </button>
    </div>
  );
}
