import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ArrowUp, RefreshCw, Plus,
  Search, Database, Filter, Eye, ChevronDown, X,
} from "lucide-react";
import { EmptySearch } from "@/components/illustrations/EmptyIllustrations";
import PageHeader from "@/components/shared/PageHeader";
import { useNavigate, Link } from "react-router-dom";
import {
  useScoutInsights, useGenerateInsights, useUpdateInsight,
  type ScoutInsightRow, type InsightsFilters,
} from "@/hooks/useScoutFeed";
import { useAllPlayers } from "@/hooks/usePlayers";
import { ScoutFeedSkeleton } from "@/components/shared/Skeletons";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import InsightCard from "@/components/scout/InsightCard";

// ── Tipos ──────────────────────────────────────────────────────────────────────

interface IndexedPlayer {
  id: string; name: string; short_name: string; position: string;
  age: number | null; nationality: string | null; club: string | null;
  league: string; season: string; source: string;
  metric_speed: number; metric_shooting: number; metric_vision: number;
  metric_technique: number; metric_defending: number; metric_stamina: number;
  vsi_estimated: number;
}

const LEAGUES  = ["La Liga","Premier League","Champions League","Bundesliga","Ligue 1","FIFA World Cup","UEFA Euro"];
const POSITIONS = ["GK","CB","RB","LB","CDM","CM","CAM","LW","RW","ST"];

// ── Hook de busqueda ───────────────────────────────────────────────────────────

function useIndexedPlayers(q: string, position: string, league: string) {
  return useQuery<IndexedPlayer[]>({
    queryKey: ["indexed-players", q, position, league],
    queryFn: async () => {
      const params = new URLSearchParams({ limit: "30" });
      if (q)        params.set("q", q);
      if (position) params.set("position", position);
      if (league)   params.set("league", league);
      const res = await fetch(`/api/players/search?${params}`);
      if (!res.ok) return [];
      const data = await res.json();
      // El API responde { success, data: { players, total } } via apiResponse helper
      return data?.data?.players ?? data?.players ?? [];
    },
    staleTime: 1000 * 60 * 5,
  });
}

// ── Sub-componente: lista de jugadores indexados ───────────────────────────────

function IndexedPlayersTab() {
  const { t } = useTranslation();
  const [q, setQ]               = useState("");
  const [position, setPosition] = useState("");
  const [league, setLeague]     = useState("");
  const [search, setSearch]     = useState({ q: "", position: "", league: "" });

  const { data: players, isLoading } = useIndexedPlayers(search.q, search.position, search.league);

  const handleSearch = () => setSearch({ q, position, league });

  const metricBar = (label: string, val: number, color: string) => (
    <div key={label}>
      <div className="flex justify-between text-[9px] text-muted-foreground mb-0.5">
        <span className="font-display uppercase">{label}</span>
        <span>{val}</span>
      </div>
      <div className="h-1 bg-secondary rounded-full overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${val}%` }} />
      </div>
    </div>
  );

  return (
    <div className="flex flex-col h-full">
      {/* Filtros */}
      <div className="px-4 pb-3 space-y-2">
        <div className="flex gap-2">
          <div className="flex-1 relative">
            <Search size={12} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={e => setQ(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              placeholder={t("scout.searchPlaceholder")}
              className="w-full pl-8 pr-3 py-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-display font-semibold"
          >
            {t("scout.searchBtn")}
          </button>
        </div>
        <div className="flex gap-2">
          <select
            value={position} onChange={e => setPosition(e.target.value)}
            className="flex-1 py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
          >
            <option value="">{t("scout.allPositions")}</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={league} onChange={e => setLeague(e.target.value)}
            className="flex-1 py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
          >
            <option value="">{t("scout.allLeagues")}</option>
            {LEAGUES.map(l => <option key={l} value={l}>{l}</option>)}
          </select>
        </div>
      </div>

      {/* Lista */}
      <div className="flex-1 overflow-y-auto no-scrollbar px-4 pb-24 space-y-3">
        {isLoading && (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        )}

        {!isLoading && (!players || players.length === 0) && (
          <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
            <EmptySearch className="w-32" />
            <p className="font-bold text-foreground">{t("scout.noIndexedResults")}</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              {t("scout.noIndexedDesc")}
            </p>
          </div>
        )}

        {players?.map(player => (
          <motion.div
            key={player.id}
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass rounded-xl p-4"
          >
            {/* Header */}
            <div className="flex items-start justify-between mb-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-display font-bold text-foreground text-sm">{player.name}</span>
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-display uppercase">
                    {player.position}
                  </span>
                </div>
                <div className="text-[10px] text-muted-foreground mt-0.5">
                  {[player.club, player.league, player.season].filter(Boolean).join(" · ")}
                </div>
              </div>
              <div className="text-right">
                <div className="font-display font-bold text-xl text-primary">{player.vsi_estimated}</div>
                <div className="text-[9px] text-muted-foreground font-display">VSI est.</div>
              </div>
            </div>

            {/* Metricas */}
            <div className="space-y-1">
              {metricBar("Vel", player.metric_speed, "bg-cyan-500")}
              {metricBar("Dis", player.metric_shooting, "bg-violet-500")}
              {metricBar("Vis", player.metric_vision, "bg-emerald-500")}
              {metricBar("Tec", player.metric_technique, "bg-amber-500")}
              {metricBar("Def", player.metric_defending, "bg-rose-500")}
              {metricBar("Fis", player.metric_stamina, "bg-sky-500")}
            </div>

            <div className="mt-2 flex justify-between items-center">
              <span className="text-[9px] text-muted-foreground font-display uppercase">
                {t("common.source")}: {player.source}
              </span>
              {player.nationality && (
                <span className="text-[9px] text-muted-foreground">{player.nationality}</span>
              )}
            </div>
          </motion.div>
        ))}
      </div>
    </div>
  );
}

// ── Pagina principal ───────────────────────────────────────────────────────────

const ScoutFeed = () => {
  const { t } = useTranslation();
  const navigate   = useNavigate();
  const [tab, setTab] = useState<"insights" | "indexed">("insights");
  const [showFilters, setShowFilters] = useState(false);
  const [filters, setFilters] = useState<InsightsFilters>({});

  const { data, isLoading, isError, isFetching } = useScoutInsights(filters);
  const generateMutation = useGenerateInsights();
  const updateMutation = useUpdateInsight();
  const { data: allPlayers } = useAllPlayers();

  // "Cargar más" acumula páginas (antes reemplazaba: al subir offset la query
  // nueva sustituía la lista y se perdían los insights anteriores).
  const [accumulated, setAccumulated] = useState<NonNullable<typeof data>["insights"]>([]);
  useEffect(() => {
    const page = data?.insights;
    if (!page) return;
    setAccumulated((prev) =>
      (filters.offset ?? 0) === 0
        ? page
        : [...prev, ...page.filter((i) => !prev.some((p) => p.id === i.id))],
    );
  }, [data, filters.offset]);
  const insights = accumulated;
  const unreadCount = data?.unread ?? 0;
  const totalCount = data?.total ?? 0;

  useEffect(() => {
    if (isError) toast.error(t("toasts.scoutFeedError"));
  }, [isError, t]);

  const handleGenerate = useCallback(() => {
    generateMutation.mutate(undefined, {
      onSuccess: (result) => {
        toast.success(t("toasts.insightsGenerated", { count: result.generated }));
      },
      onError: () => {
        toast.error(t("toasts.insightsGenerateError"));
      },
    });
  }, [generateMutation, t]);

  const handleMarkRead = useCallback((id: string) => {
    updateMutation.mutate({ id, is_read: true });
  }, [updateMutation]);

  const handleArchive = useCallback((id: string) => {
    updateMutation.mutate({ id, is_archived: true }, {
      onSuccess: () => toast.info(t("toasts.insightArchived")),
    });
  }, [updateMutation, t]);

  const handleFilterChange = useCallback((key: keyof InsightsFilters, value: string) => {
    setFilters(prev => ({ ...prev, [key]: value || undefined, offset: 0 }));
  }, []);

  const clearFilters = useCallback(() => {
    setFilters({});
    setShowFilters(false);
  }, []);

  const hasActiveFilters = !!(filters.type || filters.urgency || filters.playerId);

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 glass-strong">
        <PageHeader
          title={t("scout.title")}
          subtitle={tab === "insights" ? t("scout.subtitleInsights") : t("scout.subtitleIndexed")}
          rightContent={
            tab === "insights" ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => setShowFilters(!showFilters)}
                  className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-display font-semibold transition-colors ${
                    hasActiveFilters
                      ? "border-primary/30 text-primary bg-primary/5"
                      : "border-border text-muted-foreground hover:text-foreground hover:bg-secondary"
                  }`}
                >
                  <Filter size={12} />
                  {t("scout.filters")}
                  {hasActiveFilters && (
                    <span className="w-4 h-4 rounded-full bg-primary text-primary-foreground text-[9px] flex items-center justify-center">
                      {[filters.type, filters.urgency, filters.playerId].filter(Boolean).length}
                    </span>
                  )}
                </button>
                <button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-display font-semibold hover:bg-primary/20 transition-colors disabled:opacity-50"
                >
                  {generateMutation.isPending ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {generateMutation.isPending ? t("scout.generating") : t("scout.generate")}
                </button>
              </div>
            ) : null
          }
        />

        {/* Tabs */}
        <div className="flex gap-1 mt-3 p-1 bg-secondary rounded-lg">
          <button
            onClick={() => setTab("insights")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${
              tab === "insights" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Sparkles size={11} />
            {t("scout.tabInsights")}
            {unreadCount > 0 && (
              <span className="ml-1 px-1.5 py-0.5 rounded-full bg-primary text-primary-foreground text-[9px] font-bold min-w-[18px] text-center">
                {unreadCount > 99 ? "99+" : unreadCount}
              </span>
            )}
          </button>
          <button
            onClick={() => setTab("indexed")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${
              tab === "indexed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Database size={11} />
            {t("scout.tabIndexed")}
          </button>
        </div>

        {/* Filter bar (collapsible) */}
        <AnimatePresence>
          {showFilters && tab === "insights" && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="pt-3 space-y-2">
                <div className="flex gap-2">
                  <select
                    value={filters.type ?? ""}
                    onChange={e => handleFilterChange("type", e.target.value)}
                    className="flex-1 py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
                  >
                    <option value="">{t("scout.allTypes")}</option>
                    <option value="breakout">{t("scout.insightTypes.breakout")}</option>
                    <option value="comparison">{t("scout.insightTypes.comparison")}</option>
                    <option value="phv-alert">{t("scout.insightTypes.phvAlert")}</option>
                    <option value="drill-record">{t("scout.insightTypes.drillRecord")}</option>
                    <option value="regression">{t("scout.insightTypes.regression")}</option>
                    <option value="milestone">{t("scout.insightTypes.milestone")}</option>
                  </select>
                  <select
                    value={filters.urgency ?? ""}
                    onChange={e => handleFilterChange("urgency", e.target.value)}
                    className="flex-1 py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
                  >
                    <option value="">{t("scout.allUrgencies")}</option>
                    <option value="high">{t("scout.urgencyHigh")}</option>
                    <option value="medium">{t("scout.urgencyMedium")}</option>
                    <option value="low">{t("scout.urgencyLow")}</option>
                  </select>
                </div>
                {/* Filtro por jugador (docx #13): con muchos jugadores, ver solo
                    los informes del que interesa. El backend ya soporta playerId. */}
                <select
                  value={filters.playerId ?? ""}
                  onChange={e => handleFilterChange("playerId", e.target.value)}
                  className="w-full py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
                >
                  <option value="">{t("scout.allPlayers")}</option>
                  {[...(allPlayers ?? [])]
                    .filter(p => p?.id)
                    .sort((a, b) => (a.name ?? "").localeCompare(b.name ?? ""))
                    .map(p => <option key={p.id} value={p.id}>{p.name ?? p.id}</option>)}
                </select>
                <select
                  value={(filters as Record<string, string>).position ?? ""}
                  onChange={e => handleFilterChange("position" as keyof InsightsFilters, e.target.value)}
                  className="w-full py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
                >
                  <option value="">{t("scout.allPositions")}</option>
                  {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
                {hasActiveFilters && (
                  <button
                    onClick={clearFilters}
                    className="flex items-center gap-1 text-[10px] text-primary font-display font-semibold"
                  >
                    <X size={10} />
                    {t("scout.clearFilters")}
                  </button>
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Contenido segun tab */}
      {tab === "indexed" ? (
        <IndexedPlayersTab />
      ) : (
        <div className="flex-1 overflow-y-auto no-scrollbar px-4 py-4 space-y-4 pb-24">
          {/* Loading */}
          {isLoading && <><ScoutFeedSkeleton /><ScoutFeedSkeleton /></>}

          {/* Empty state */}
          {!isLoading && insights.length === 0 && (
            <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-4 py-16">
              <Sparkles size={36} className="text-muted-foreground" />
              <div>
                <p className="font-display font-bold text-lg text-foreground">{t("scout.noInsights")}</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  {t("scout.noInsightsDesc")}
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleGenerate}
                  disabled={generateMutation.isPending}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold disabled:opacity-50"
                >
                  {generateMutation.isPending ? (
                    <RefreshCw size={12} className="animate-spin" />
                  ) : (
                    <Sparkles size={12} />
                  )}
                  {t("scout.generate")}
                </button>
                <button
                  onClick={() => navigate("/players/new")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground"
                >
                  <Plus size={12} />
                  {t("scout.addPlayer")}
                </button>
              </div>
            </div>
          )}

          {/* Summary bar */}
          {insights.length > 0 && (
            <div className="flex items-center justify-between text-[10px] text-muted-foreground font-display">
              <span>{totalCount} {t("scout.totalInsights")} · {unreadCount} {t("scout.unreadLabel")}</span>
              {isFetching && <RefreshCw size={10} className="animate-spin text-primary" />}
            </div>
          )}

          {/* Insight cards */}
          <AnimatePresence mode="popLayout">
            {insights.map((insight) => (
              <InsightCard
                key={insight.id}
                insight={insight}
                onMarkRead={handleMarkRead}
                onArchive={handleArchive}
              />
            ))}
          </AnimatePresence>

          {/* Load more */}
          {insights.length < totalCount && (
            <button
              onClick={() => setFilters(prev => ({ ...prev, offset: (prev.offset ?? 0) + 20 }))}
              className="w-full py-3 text-center text-xs font-display font-semibold text-primary hover:bg-primary/5 rounded-lg transition-colors"
            >
              <ChevronDown size={14} className="inline mr-1" />
              {t("scout.loadMore")}
            </button>
          )}
        </div>
      )}
    </div>
  );
};

export default ScoutFeed;
