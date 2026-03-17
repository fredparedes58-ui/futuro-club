import { motion } from "framer-motion";
import { TrendingUp, TrendingDown, Minus, ChevronRight } from "lucide-react";
import { useNavigate } from "react-router-dom";
import type { Player } from "@/lib/mockData";
import VsiGauge from "./VsiGauge";

const PlayerCard = ({ player }: { player: Player }) => {
  const navigate = useNavigate();
  const TrendIcon =
    player.trending === "up"
      ? TrendingUp
      : player.trending === "down"
      ? TrendingDown
      : Minus;
  const trendColor =
    player.trending === "up"
      ? "text-primary"
      : player.trending === "down"
      ? "text-danger"
      : "text-muted-foreground";

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      onClick={() => navigate(`/player/${player.id}`)}
      className="glass rounded-xl p-4 cursor-pointer hover:border-primary/30 transition-colors group"
    >
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center font-display font-bold text-sm text-primary">
          {player.avatar}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="font-display font-semibold text-sm truncate text-foreground">
              {player.name}
            </h3>
            <TrendIcon size={14} className={trendColor} />
          </div>
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
            <span className="font-display font-medium text-electric">
              {player.positionShort}
            </span>
            <span>·</span>
            <span>{player.age} años</span>
            <span>·</span>
            <span>PHV {player.phvOffset > 0 ? "+" : ""}{player.phvOffset}</span>
          </div>
        </div>
        <VsiGauge value={player.vsi} size="sm" />
        <ChevronRight
          size={16}
          className="text-muted-foreground group-hover:text-primary transition-colors"
        />
      </div>
    </motion.div>
  );
};

export default PlayerCard;
