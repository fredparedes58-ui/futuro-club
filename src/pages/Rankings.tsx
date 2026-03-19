import { useState } from "react";
import { motion } from "framer-motion";
import { Crown, Medal, Shield } from "lucide-react";
import { useRankedPlayers } from "@/hooks/useRankings";
import { RankingsPodiumSkeleton, PlayerListSkeleton } from "@/components/shared/Skeletons";
import VsiGauge from "@/components/VsiGauge";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import type { SortField, SortDir } from "@/services/rankingsService";

const rankIcons = [
  <Crown key="1" size={16} className="text-gold" />,
  <Medal key="2" size={16} className="text-muted-foreground" />,
  <Shield key="3" size={16} className="text-amber-700" />,
];

const Rankings = () => {
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<SortField>("vsi");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const { data: sortedPlayers, isLoading, isError } = useRankedPlayers(sortBy, sortDir);

  if (isError) toast.error("No se pudo cargar el ranking");

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.08 } } };
  const item = { hidden: { opacity: 0, x: -20 }, show: { opacity: 1, x: 0, transition: { duration: 0.4 } } };

  const handleSort = (field: SortField) => {
    if (sortBy === field) setSortDir(d => d === "desc" ? "asc" : "desc");
    else { setSortBy(field); setSortDir("desc"); }
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="px-4 pt-4 pb-24 space-y-6 max-w-lg mx-auto">
      <motion.div variants={item}>
        <h1 className="font-display font-bold text-2xl text-foreground">Rankings<span className="text-primary">.</span></h1>
        <p className="text-xs text-muted-foreground font-display tracking-wider uppercase">VSI ajustado por maduración biológica</p>
      </motion.div>

      {/* Sort controls */}
      <motion.div variants={item} className="flex gap-1 bg-muted rounded-md p-0.5 w-fit">
        {([["vsi", "VSI"], ["age", "Edad"], ["name", "Nombre"]] as [SortField, string][]).map(([field, label]) => (
          <Button
            key={field}
            variant={sortBy === field ? "default" : "ghost"}
            size="sm"
            className="h-7 text-xs"
            onClick={() => handleSort(field)}
          >
            {label} {sortBy === field && (sortDir === "desc" ? "↓" : "↑")}
          </Button>
        ))}
      </motion.div>

      {/* Podium */}
      {isLoading ? (
        <RankingsPodiumSkeleton />
      ) : sortedPlayers && sortedPlayers.length >= 3 && sortBy === "vsi" && sortDir === "desc" ? (
        <motion.div variants={item} className="flex items-end justify-center gap-3 py-4">
          {[sortedPlayers[1], sortedPlayers[0], sortedPlayers[2]].map((player, i) => {
            const heights = ["h-24", "h-32", "h-20"];
            const order = [1, 0, 2];
            return (
              <motion.div key={player.id} whileTap={{ scale: 0.95 }} onClick={() => navigate(`/player/${player.id}`)} className="flex flex-col items-center cursor-pointer">
                <VsiGauge value={player.vsi} size="sm" />
                <div className="mt-1 text-xs font-display font-semibold text-foreground text-center">{player.name.split(" ")[0]}</div>
                <div className={`${heights[i]} w-16 mt-2 rounded-t-lg flex items-start justify-center pt-2 ${order[i] === 0 ? "bg-gradient-to-b from-primary/30 to-primary/5 border-t-2 border-primary" : "bg-gradient-to-b from-secondary to-secondary/50"}`}>
                  {rankIcons[order[i]] || <span className="text-xs text-muted-foreground font-display">#{order[i] + 1}</span>}
                </div>
              </motion.div>
            );
          })}
        </motion.div>
      ) : null}

      {/* List */}
      {isLoading ? (
        <PlayerListSkeleton count={6} />
      ) : !sortedPlayers || sortedPlayers.length === 0 ? (
        <div className="glass rounded-xl p-8 text-center">
          <p className="font-display font-bold text-lg mb-1">Sin jugadores registrados</p>
          <p className="text-sm text-muted-foreground">Agrega jugadores para ver el ranking</p>
        </div>
      ) : (
        <div className="space-y-2">
          {sortedPlayers.map((player, i) => (
            <motion.div
              key={player.id}
              variants={item}
              whileTap={{ scale: 0.97 }}
              onClick={() => navigate(`/player/${player.id}`)}
              className="glass rounded-xl p-3 flex items-center gap-3 cursor-pointer hover:border-primary/30 transition-colors"
            >
              <span className="w-6 text-center font-display font-bold text-sm text-muted-foreground">{i + 1}</span>
              <div className="w-9 h-9 rounded-full overflow-hidden border border-border">
                <img src={player.image} alt={player.name} className="w-full h-full object-cover grayscale" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-display font-semibold text-foreground truncate">{player.name}</p>
                <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
                  <span className="text-electric font-display">{player.positionShort}</span>
                  <span>·</span>
                  <span>{player.academy}</span>
                  <span>·</span>
                  <span className={player.phvCategory === "late" ? "text-primary" : player.phvCategory === "early" ? "text-gold" : "text-muted-foreground"}>
                    PHV {player.phvCategory === "late" ? "tardío" : player.phvCategory === "early" ? "precoz" : "normal"}
                  </span>
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
