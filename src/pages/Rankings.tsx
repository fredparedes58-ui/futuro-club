import { useState, useMemo, useEffect } from "react";
import { motion } from "framer-motion";
import { Crown, Medal, Shield, Search, Plus, X, SlidersHorizontal } from "lucide-react";
import PageHeader from "@/components/shared/PageHeader";
import { useRankedPlayers } from "@/hooks/useRankings";
import { RankingsPodiumSkeleton, PlayerListSkeleton } from "@/components/shared/Skeletons";
import VsiGauge from "@/components/VsiGauge";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import type { SortField, SortDir } from "@/services/rankingsService";

// ─── Constantes ───────────────────────────────────────────────────────────────
const rankIcons = [
  <Crown key="1" size={16} className="text-gold" />,
  <Medal key="2" size={16} className="text-muted-foreground" />,
  <Shield key="3" size={16} className="text-amber-700" />,
];

const PHV_FILTERS = [
  { value: "all", label: "Todos" },
  { value: "late", label: "Tardío ⭐" },
  { value: "on-time", label: "Normal" },
  { value: "early", label: "Precoz" },
];

const POSITION_GROUPS = [
  "Todos",
  "Portero",
  "Defensa Central",
  "Lateral Derecho",
  "Lateral Izquierdo",
  "Pivote",
  "Mediocentro",
  "Mediapunta",
  "Extremo Derecho",
  "Extremo Izquierdo",
  "Delantero Centro",
  "Segundo Delantero",
];

const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
const item = { hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0, transition: { duration: 0.4 } } };

// ─── Componente principal ─────────────────────────────────────────────────────
const Rankings = () => {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortField>("vsi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [search, setSearch] = useState("");
  const [phvFilter, setPhvFilter] = useState("all");
  const [posFilter, setPosFilter] = useState("Todos");
  const [showFilters, setShowFilters] = useState(false);

  const { data: sortedPlayers, isLoading, isError } = useRankedPlayers(sortBy, sortDir);

  useEffect(() => {
    if (isError) toast.error("No se pudo cargar el ranking");
  }, [isError]);

  // Filtros en cliente (rápido, sobre datos ya ordenados)
  const filteredPlayers = useMemo(() => {
    if (!sortedPlayers) return [];
    return sortedPlayers.filter((p) => {
      const matchSearch = search === "" || p.name.toLowerCase().includes(search.toLowerCase());
      const matchPHV = phvFilter === "all" || p.phvCategory === phvFilter;
      const matchPos = posFilter === "Todos" || p.position === posFilter;
      return matchSearch && matchPHV && matchPos;
    });
  }, [sortedPlayers, search, phvFilter, posFilter]);

  const hasFilters = search !== "" || phvFilter !== "all" || posFilter !== "Todos";
  const isFiltered = filteredPlayers.length !== (sortedPlayers?.length ?? 0);

  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortDir((d) => (d === "desc" ? "asc" : "desc"));
    else { setSortBy(field); setSortDir("desc"); }
  };

  const clearFilters = () => {
    setSearch("");
    setPhvFilter("all");
    setPosFilter("Todos");
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-24 space-y-4 max-w-lg mx-auto">

      {/* Header + Nuevo jugador */}
      <motion.div variants={item} className="flex items-start justify-between">
        <PageHeader title="Rankings" subtitle="VSI ajustado por maduración biológica" />
        <Button
          size="sm"
          className="gap-1.5 shrink-0 mt-1"
          onClick={() => navigate("/players/new")}
        >
          <Plus size={14} />
          Nuevo
        </Button>
      </motion.div>

      {/* Búsqueda */}
      <motion.div variants={item} className="relative">
        <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="Buscar jugador…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9 pr-9 h-9 text-sm"
        />
        {search && (
          <button
            onClick={() => setSearch("")}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            <X size={14} />
          </button>
        )}
      </motion.div>

      {/* Sort + Filtros toggle */}
      <motion.div variants={item} className="flex items-center gap-2">
        <div className="flex gap-1 bg-muted rounded-md p-0.5 flex-1">
          {([["vsi", "VSI"], ["age", "Edad"], ["name", "Nombre"]] as [SortField, string][]).map(
            ([field, label]) => (
              <Button
                key={field}
                variant={sortBy === field ? "default" : "ghost"}
                size="sm"
                className="h-7 text-xs flex-1"
                onClick={() => handleSort(field)}
              >
                {label} {sortBy === field && (sortDir === "desc" ? "↓" : "↑")}
              </Button>
            )
          )}
        </div>
        <Button
          variant={showFilters ? "default" : "outline"}
          size="sm"
          className="h-7 gap-1 shrink-0"
          onClick={() => setShowFilters((v) => !v)}
        >
          <SlidersHorizontal size={12} />
          Filtros
          {hasFilters && (
            <span className="w-4 h-4 rounded-full bg-primary-foreground text-primary text-[9px] font-bold flex items-center justify-center">
              !
            </span>
          )}
        </Button>
      </motion.div>

      {/* Panel de filtros expandible */}
      {showFilters && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="glass rounded-xl p-4 space-y-4"
        >
          {/* Filtro PHV */}
          <div>
            <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-2">
              Maduración Biológica (PHV)
            </p>
            <div className="flex gap-1.5 flex-wrap">
              {PHV_FILTERS.map((f) => (
                <button
                  key={f.value}
                  onClick={() => setPhvFilter(f.value)}
                  className={`px-3 py-1 rounded-lg text-xs font-display font-semibold border transition-all ${
                    phvFilter === f.value
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary text-muted-foreground border-border hover:border-primary/50"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Filtro Posición */}
          <div>
            <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-2">
              Posición
            </p>
            <select
              value={posFilter}
              onChange={(e) => setPosFilter(e.target.value)}
              className="w-full h-8 rounded-md border border-input bg-background px-3 text-xs font-display text-foreground focus:outline-none focus:ring-2 focus:ring-ring"
            >
              {POSITION_GROUPS.map((pos) => (
                <option key={pos} value={pos}>{pos}</option>
              ))}
            </select>
          </div>

          {/* Limpiar filtros */}
          {hasFilters && (
            <Button variant="ghost" size="sm" className="w-full text-xs gap-1" onClick={clearFilters}>
              <X size={12} />
              Limpiar todos los filtros
            </Button>
          )}
        </motion.div>
      )}

      {/* Resultado de búsqueda */}
      {isFiltered && !isLoading && (
        <motion.div variants={item} className="flex items-center justify-between text-xs text-muted-foreground px-1">
          <span>
            {filteredPlayers.length} de {sortedPlayers?.length} jugadores
          </span>
          <button onClick={clearFilters} className="text-primary hover:underline font-display font-semibold">
            Ver todos
          </button>
        </motion.div>
      )}

      {/* Podium (solo en vista VSI sin filtros) */}
      {isLoading ? (
        <RankingsPodiumSkeleton />
      ) : filteredPlayers.length >= 3 && sortBy === "vsi" && sortDir === "desc" && !hasFilters ? (
        <motion.div variants={item} className="flex items-end justify-center gap-3 py-4">
          {[filteredPlayers[1], filteredPlayers[0], filteredPlayers[2]].map((player, i) => {
            const heights = ["h-24", "h-32", "h-20"];
            const order = [1, 0, 2];
            return (
              <motion.div
                key={player.id}
                whileTap={{ scale: 0.95 }}
                onClick={() => navigate(`/player/${player.id}`)}
                className="flex flex-col items-center cursor-pointer"
              >
                <VsiGauge value={player.vsi} size="sm" />
                <div className="mt-1 text-xs font-display font-semibold text-foreground text-center">
                  {player.name.split(" ")[0]}
                </div>
                <div
                  className={`${heights[i]} w-16 mt-2 rounded-t-lg flex items-start justify-center pt-2 ${
                    order[i] === 0
                      ? "bg-gradient-to-b from-primary/30 to-primary/5 border-t-2 border-primary"
                      : "bg-gradient-to-b from-secondary to-secondary/50"
                  }`}
                >
                  {rankIcons[order[i]] || (
                    <span className="text-xs text-muted-foreground font-display">#{order[i] + 1}</span>
                  )}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : null}

      {/* Lista de jugadores */}
      {isLoading ? (
        <PlayerListSkeleton count={6} />
      ) : filteredPlayers.length === 0 ? (
        <motion.div variants={item} className="glass rounded-xl p-8 text-center space-y-3">
          {hasFilters ? (
            <>
              <p className="font-display font-bold text-lg">Sin resultados</p>
              <p className="text-sm text-muted-foreground">
                Ningún jugador coincide con los filtros actuales.
              </p>
              <Button variant="outline" size="sm" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            </>
          ) : (
            <>
              <p className="font-display font-bold text-lg">Sin jugadores registrados</p>
              <p className="text-sm text-muted-foreground">
                Agrega tu primer jugador para comenzar.
              </p>
              <Button size="sm" onClick={() => navigate("/players/new")} className="gap-1.5">
                <Plus size={14} />
                Agregar jugador
              </Button>
            </>
          )}
        </motion.div>
      ) : (
        <div className="space-y-2">
          {filteredPlayers.map((player, i) => (
            <motion.div
              key={player.id}
              variants={item}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/player/${player.id}`)}
              className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-primary/30 transition-colors"
            >
              {/* Posición en ranking */}
              <span className="w-6 text-center font-display font-bold text-sm text-muted-foreground">
                {isFiltered ? "—" : i + 1}
              </span>

              {/* Avatar iniciales */}
              <div className="w-9 h-9 rounded-full border border-border bg-secondary flex items-center justify-center flex-shrink-0">
                <span className="text-xs font-display font-bold text-muted-foreground">
                  {player.name.split(" ").map((n) => n[0]).join("").slice(0, 2)}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-semibold text-foreground truncate">{player.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground flex-wrap">
                  <span className="text-electric font-display">{player.positionShort}</span>
                  <span>·</span>
                  <span>{player.age}a</span>
                  <span>·</span>
                  <span
                    className={
                      player.phvCategory === "late"
                        ? "text-primary font-semibold"
                        : player.phvCategory === "early"
                        ? "text-gold"
                        : "text-muted-foreground"
                    }
                  >
                    {player.phvCategory === "late"
                      ? "Tardío ⭐"
                      : player.phvCategory === "early"
                      ? "Precoz"
                      : "Normal"}
                  </span>
                  {/* Tendencia */}
                  {player.trending === "up" && <span className="text-primary">↑</span>}
                  {player.trending === "down" && <span className="text-destructive">↓</span>}
                </div>
              </div>

              <VsiGauge value={player.vsi} size="sm" />
            </motion.div>
          ))}
        </div>
      )}
    </motion.div>
  );
};

export default Rankings;
