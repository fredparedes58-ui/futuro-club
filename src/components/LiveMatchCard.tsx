import { motion } from "framer-motion";
import { Radio } from "lucide-react";
import type { LiveMatch } from "@/lib/mockData";

const LiveMatchCard = ({ match }: { match: LiveMatch }) => {
  const isLive = match.status === "live";

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      whileTap={{ scale: 0.98 }}
      className="glass rounded-xl p-4 min-w-[260px] snap-start cursor-pointer hover:border-primary/30 transition-colors"
    >
      <div className="flex items-center justify-between mb-3">
        {isLive ? (
          <div className="flex items-center gap-1.5">
            <div className="w-2 h-2 rounded-full bg-primary pulse-live" />
            <span className="text-[10px] font-display font-semibold text-primary uppercase tracking-wider">
              EN VIVO · {match.minute}'
            </span>
          </div>
        ) : (
          <span className="text-[10px] font-display font-medium text-muted-foreground uppercase tracking-wider">
            {match.status === "upcoming" ? "Próximo" : "Finalizado"}
          </span>
        )}
        {isLive && <Radio size={14} className="text-primary animate-pulse" />}
      </div>

      <div className="flex items-center justify-between mb-3">
        <span className="font-display font-semibold text-sm text-foreground">{match.homeTeam}</span>
        <div className="flex items-center gap-2 font-display font-bold text-xl">
          <span className={match.score[0] > match.score[1] ? "text-primary" : "text-foreground"}>
            {match.score[0]}
          </span>
          <span className="text-muted-foreground text-sm">-</span>
          <span className={match.score[1] > match.score[0] ? "text-primary" : "text-foreground"}>
            {match.score[1]}
          </span>
        </div>
        <span className="font-display font-semibold text-sm text-foreground">{match.awayTeam}</span>
      </div>

      {isLive && (
        <div className="flex items-center justify-between text-[10px] text-muted-foreground border-t border-border pt-2">
          <span>{match.playersTracked} jugadores rastreados</span>
          <span className="text-primary font-medium">
            ⭐ {match.topPerformer} ({match.topVsi})
          </span>
        </div>
      )}
    </motion.div>
  );
};

export default LiveMatchCard;
