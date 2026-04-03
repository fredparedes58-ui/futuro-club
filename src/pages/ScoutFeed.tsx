import { useRef, useState } from "react";
import { motion } from "framer-motion";
import { Sparkles, ArrowUp, Clock, GitCompareArrows, RefreshCw, Plus, Search, Database } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useNavigate } from "react-router-dom";
import { useScoutInsights } from "@/hooks/useScoutFeed";
import { ScoutFeedSkeleton } from "@/components/shared/Skeletons";
import VsiGauge from "@/components/VsiGauge";
import { useQueryClient, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";

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
};
const typeLabels: Record<string, string> = {
  breakout: "🔥 BREAKOUT", comparison: "🔬 COMPARATIVA",
  "phv-alert": "⚠️ ALERTA PHV", "drill-record": "🏆 RÉCORD DRILL",
};

// ── Hook de búsqueda ───────────────────────────────────────────────────────────

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
              placeholder="Buscar jugador..."
              className="w-full pl-8 pr-3 py-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary/50"
            />
          </div>
          <button
            onClick={handleSearch}
            className="px-3 py-2 bg-primary text-primary-foreground rounded-lg text-xs font-display font-semibold"
          >
            Buscar
          </button>
        </div>
        <div className="flex gap-2">
          <select
            value={position} onChange={e => setPosition(e.target.value)}
            className="flex-1 py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
          >
            <option value="">Todas las posiciones</option>
            {POSITIONS.map(p => <option key={p} value={p}>{p}</option>)}
          </select>
          <select
            value={league} onChange={e => setLeague(e.target.value)}
            className="flex-1 py-1.5 px-2 bg-secondary border border-border rounded-lg text-xs font-display text-foreground focus:outline-none"
          >
            <option value="">Todas las ligas</option>
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
            <p className="font-display font-bold text-foreground">Sin resultados</p>
            <p className="text-xs text-muted-foreground max-w-xs">
              Prueba con otro nombre o quita los filtros. La base tiene 365+ jugadores de La Liga y más.
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

            {/* Métricas */}
            <div className="space-y-1">
              {metricBar("Vel", player.metric_speed, "bg-cyan-500")}
              {metricBar("Dis", player.metric_shooting, "bg-violet-500")}
              {metricBar("Vis", player.metric_vision, "bg-emerald-500")}
              {metricBar("Téc", player.metric_technique, "bg-amber-500")}
              {metricBar("Def", player.metric_defending, "bg-rose-500")}
              {metricBar("Fís", player.metric_stamina, "bg-sky-500")}
            </div>

            <div className="mt-2 flex justify-between items-center">
              <span className="text-[9px] text-muted-foreground font-display uppercase">
                Fuente: {player.source}
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

// ── Página principal ───────────────────────────────────────────────────────────

const ScoutFeed = () => {
  const scrollRef  = useRef<HTMLDivElement>(null);
  const navigate   = useNavigate();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState<"insights" | "indexed">("insights");
  const { data: insights, isLoading, isError, isFetching } = useScoutInsights();

  if (isError) toast.error("No se pudieron cargar los insights del scout feed");

  const handleRefresh = () => {
    queryClient.invalidateQueries({ queryKey: ["scout-insights"] });
    toast.info("Regenerando insights…");
  };

  return (
    <div className="h-screen flex flex-col">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 glass-strong">
        <PageHeader
          title="ScoutFeed"
          subtitle={tab === "insights" ? "Insights IA · Tiempo real" : "Base de jugadores reales"}
          rightContent={
            tab === "insights" ? (
              <div className="flex items-center gap-2">
                <button
                  onClick={handleRefresh}
                  disabled={isFetching}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border text-muted-foreground text-xs font-display font-semibold hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
                >
                  <RefreshCw size={12} className={isFetching ? "animate-spin" : ""} />
                  {isFetching ? "…" : "Refresh"}
                </button>
                <button
                  onClick={() => navigate("/compare")}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/10 border border-primary/20 text-primary text-xs font-display font-semibold hover:bg-primary/20 transition-colors"
                >
                  <GitCompareArrows size={14} />
                  Compare
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
            Insights IA
          </button>
          <button
            onClick={() => setTab("indexed")}
            className={`flex-1 flex items-center justify-center gap-1.5 py-1.5 rounded-md text-xs font-display font-semibold transition-all ${
              tab === "indexed" ? "bg-background text-foreground shadow-sm" : "text-muted-foreground"
            }`}
          >
            <Database size={11} />
            Base Real
          </button>
        </div>
      </div>

      {/* Contenido según tab */}
      {tab === "indexed" ? (
        <IndexedPlayersTab />
      ) : (
        <div ref={scrollRef} className="flex-1 overflow-y-auto no-scrollbar snap-y snap-mandatory pb-20">
          {isLoading && <><ScoutFeedSkeleton /><ScoutFeedSkeleton /></>}

          {!isLoading && (!insights || insights.length === 0) && (
            <div className="flex flex-col items-center justify-center h-full px-8 text-center gap-4 py-16">
              <Sparkles size={36} className="text-muted-foreground" />
              <div>
                <p className="font-display font-bold text-lg text-foreground">Sin insights disponibles</p>
                <p className="text-sm text-muted-foreground mt-1 max-w-xs">
                  Los insights se generan con IA desde los datos de tus jugadores.
                  Necesitas ANTHROPIC_API_KEY configurada en Vercel.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  onClick={handleRefresh}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-primary-foreground text-xs font-display font-semibold"
                >
                  <RefreshCw size={12} />
                  Reintentar
                </button>
                <button
                  onClick={() => navigate("/players/new")}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground"
                >
                  <Plus size={12} />
                  Agregar jugador
                </button>
              </div>
            </div>
          )}

          {insights?.map((insight, i) => (
            <motion.div
              key={insight.id}
              initial={{ opacity: 0 }}
              whileInView={{ opacity: 1 }}
              viewport={{ once: true, amount: 0.5 }}
              className="snap-start min-h-[calc(100vh-200px)] px-4 py-6 flex flex-col justify-center"
            >
              <div className={`inline-flex self-start items-center px-3 py-1 rounded-full text-[10px] font-display font-semibold uppercase tracking-wider border mb-4 ${typeColors[insight.insightType]}`}>
                {typeLabels[insight.insightType]}
              </div>

              <div className="flex items-center gap-3 mb-4">
                <div className="w-12 h-12 rounded-full bg-secondary border border-border flex items-center justify-center font-display font-bold text-primary">
                  {insight.player.name.split(" ").map((n: string) => n[0]).join("").slice(0, 2)}
                </div>
                <div>
                  <h2 className="font-display font-bold text-lg text-foreground">{insight.player.name}</h2>
                  <div className="text-xs text-muted-foreground">
                    {insight.player.positionShort} · {insight.player.age} años · {insight.player.academy}
                  </div>
                </div>
              </div>

              <div className="glass rounded-2xl p-5 space-y-4">
                <h3 className="font-display font-bold text-xl text-foreground leading-tight">{insight.title}</h3>
                <p className="text-sm text-muted-foreground leading-relaxed">{insight.description}</p>

                <div className="flex items-center justify-between pt-2 border-t border-border">
                  <div className="flex items-center gap-3">
                    <VsiGauge value={insight.player.vsi} size="sm" />
                    <div>
                      <div className="text-[10px] text-muted-foreground font-display uppercase tracking-wider">{insight.metric}</div>
                      <div className="font-display font-bold text-xl text-primary">{insight.metricValue}</div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                    <Clock size={10} />
                    {insight.timestamp}
                  </div>
                </div>
              </div>

              {insights && i < insights.length - 1 && (
                <div className="flex justify-center mt-6 animate-bounce">
                  <ArrowUp size={16} className="text-muted-foreground rotate-180" />
                </div>
              )}
            </motion.div>
          ))}
        </div>
      )}
    </div>
  );
};

export default ScoutFeed;
