import { useRef, useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Sparkles, ArrowUp, Clock, GitCompareArrows, RefreshCw, Plus,
  Search, Database, Filter, Eye, Archive, ChevronDown,
  AlertTriangle, TrendingUp, TrendingDown, Award, Dumbbell,
  Zap, X,
} from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useNavigate, Link } from "react-router-dom";
import {
  useScoutInsights, useGenerateInsights, useUpdateInsight,
  type ScoutInsightRow, type InsightsFilters,
} from "@/hooks/useScoutFeed";
import { ScoutFeedSkeleton } from "@/components/shared/Skeletons";
import VsiGauge from "@/components/VsiGauge";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

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

const typeColors: Record<string, string> = {
  breakout: "bg-primary/10 text-primary border-primary/20",
  comparison: "bg-electric/10 text-electric border-electric/20",
  "phv-alert": "bg-gold/10 text-gold border-gold/20",
  "drill-record": "bg-accent/10 text-accent border-accent/20",
  regression: "bg-destructive/10 text-destructive border-destructive/20",
  milestone: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
};
const typeIcons: Record<string, React.ReactNode> = {
  breakout: <TrendingUp size={11} />,
  comparison: <GitCompareArrows size={11} />,
  "phv-alert": <AlertTriangle size={11} />,
  "drill-record": <Dumbbell size={11} />,
  regression: <TrendingDown size={11} />,
  milestone: <Award size={11} />,
};
const typeLabelKeys: Record<string, string> = {
  breakout: "scout.insightTypes.breakout",
  comparison: "scout.insightTypes.comparison",
  "phv-alert": "scout.insightTypes.phvAlert",
  "drill-record": "scout.insightTypes.drillRecord",
  regression: "scout.insightTypes.regression",
  milestone: "scout.insightTypes.milestone",
};

const urgencyColors: Record<string, string> = {
  high: "border-l-destructive",
  medium: "border-l-gold",
  low: "border-l-muted-foreground/30",
};

// ── Relative time formatter ───────────────────────────────────────────────────

function relativeTime(dateStr: string): string {
  const now = Date.now();
  const then = new Date(dateStr).getTime();
  const diffMs = now - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "Ahora";
  if (mins < 60) return `Hace ${mins}min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `Hace ${hours}h`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `Hace ${days}d`;
  return new Date(dateStr).toLocaleDateString("es-ES", { day: "numeric", month: "short" });
}

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
      return data.players ?? [];
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
            <Database size={32} className="text-muted-foreground" />
            <p className="font-display font-bold text-foreground">{t("scout.noIndexedResults")}</p>
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

// ── Sub-componente: Card de Insight enriquecida ───────────────────────────────

function InsightCard({
  insight,
  onMarkRead,
  onArchive,
}: {
  insight: ScoutInsightRow;
  onMarkRead: (id: string) => void;
  onArchive: (id: string) => void;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, x: -100 }}
      className={`glass rounded-2xl p-5 space-y-4 border-l-4 ${urgencyColors[insight.urgency]} ${
        !insight.is_read ? "ring-1 ring-primary/20" : "opacity-85"
      }`}
      onClick={() => !insight.is_read && onMarkRead(insight.id)}
    >
      {/* Type badge + actions */}
      <div className="flex items-center justify-between">
        <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[10px] font-display font-semibold uppercase tracking-wider border ${typeColors[insight.insight_type]}`}>
          {typeIcons[insight.insight_type]}
          {t(typeLabelKeys[insight.insight_type] ?? "scout.insightTypes.breakout")}
        </div>
        <div className="flex items-center gap-1">
          {!insight.is_read && (
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" title={t("scout.unread")} />
          )}
          <button
            onClick={(e) => { e.stopPropagation(); onArchive(insight.id); }}
            className="p-1.5 rounded-md hover:bg-secondary transition-colors"
            title={t("scout.archive")}
          >
            <Archive size={12} className="text-muted-foreground" />
          </button>
        </div>
      </div>

      {/* Player info */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary border border-border flex items-center justify-center font-display font-bold text-primary text-sm">
          {insight.player_name.split(" ").map(n => n[0]).join("").slice(0, 2)}
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="font-display font-bold text-foreground text-sm truncate">{insight.player_name}</h3>
          <div className="text-[10px] text-muted-foreground">
            {insight.context_data?.position as string ?? ""} · {insight.context_data?.age as number ?? ""} {t("common.years")}
          </div>
        </div>
        <button
          onClick={(e) => { e.stopPropagation(); navigate(`/players/${insight.player_id}`); }}
          className="text-[10px] text-primary font-display font-semibold hover:underline"
        >
          {t("scout.viewPlayer")}
        </button>
      </div>

      {/* Content */}
      <div>
        <h4 className="font-display font-bold text-lg text-foreground leading-tight mb-2">{insight.title}</h4>
        <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>
      </div>

      {/* Metric + benchmark */}
      <div className="flex items-center justify-between pt-2 border-t border-border">
        <div className="flex items-center gap-3">
          {insight.context_data?.vsi && (
            <VsiGauge value={insight.context_data.vsi as number} size="sm" />
          )}
          <div>
            <div className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{insight.metric}</div>
            <div className="font-display font-bold text-xl text-primary">{insight.metric_value}</div>
          </div>
        </div>
        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
          <Clock size={10} />
          <span title={new Date(insight.created_at).toLocaleString("es-ES")}>{relativeTime(insight.created_at)}</span>
        </div>
      </div>

      {/* Benchmark */}
      {insight.benchmark && (
        <div className="px-3 py-2 bg-secondary/50 rounded-lg">
          <p className="text-[11px] text-muted-foreground">
            <span className="font-display font-semibold text-foreground">{t("scout.benchmark")}:</span> {insight.benchmark}
          </p>
        </div>
      )}

      {/* Recommended drills */}
      {insight.rag_drills && insight.rag_drills.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-display font-semibold text-foreground uppercase tracking-wider">{t("scout.recommendedDrills")}</p>
          <div className="flex flex-wrap gap-1.5">
            {insight.rag_drills.map((drill, i) => (
              <span
                key={i}
                className="px-2.5 py-1 rounded-full bg-primary/5 border border-primary/10 text-[10px] font-display text-primary cursor-default"
                title={drill.reason}
              >
                <Dumbbell size={9} className="inline mr-1 -mt-0.5" />
                {drill.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Action items */}
      {insight.action_items && insight.action_items.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[10px] font-display font-semibold text-foreground uppercase tracking-wider">{t("scout.actionItems")}</p>
          <ul className="space-y-1">
            {insight.action_items.map((item, i) => (
              <li key={i} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <Zap size={10} className="mt-0.5 text-primary shrink-0" />
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Tags */}
      {insight.tags && insight.tags.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {insight.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 rounded bg-secondary text-[9px] font-display text-muted-foreground">
              #{tag}
            </span>
          ))}
        </div>
      )}
    </motion.div>
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

  const insights = data?.insights ?? [];
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
