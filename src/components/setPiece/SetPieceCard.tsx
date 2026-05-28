/**
 * VITAS · SetPieceCard — Single set piece event card
 */

import { motion } from "framer-motion";
import { Trophy, Target, ShieldOff, Clock, MapPin } from "lucide-react";
import {
  SET_PIECE_TYPE_LABELS,
  PATTERN_LABELS,
  OUTCOME_LABELS,
} from "@/services/real/setPieceService";
import type { SetPieceEvent } from "@/lib/setPiece/types";

interface SetPieceCardProps {
  event: SetPieceEvent;
  onClick?: () => void;
  active?: boolean;
}

export default function SetPieceCard({ event, onClick, active }: SetPieceCardProps) {
  const outcome = OUTCOME_LABELS[event.outcome];
  const isPositive = event.outcome === "goal" || event.outcome === "shot_on_target";

  const sideLabel =
    event.side === "left" ? "Izq" : event.side === "right" ? "Der" : "Centro";

  return (
    <motion.button
      whileHover={{ scale: 1.01, y: -2 }}
      whileTap={{ scale: 0.99 }}
      onClick={onClick}
      className={`w-full text-left glass rounded-xl p-4 transition-all ${
        active ? "ring-2 ring-primary border-primary" : "border border-border hover:border-primary/40"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span
              className={`text-[9px] uppercase tracking-wider font-bold px-2 py-0.5 rounded-full ${
                event.isOffensive
                  ? "bg-emerald-500/15 text-emerald-600"
                  : "bg-red-500/15 text-red-600"
              }`}
            >
              {event.isOffensive ? "OFENSIVA" : "DEFENSIVA"}
            </span>
            <span className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Clock size={10} />
              Min {event.minute}'
            </span>
          </div>
          <h4 className="text-sm font-display font-bold text-foreground">
            {SET_PIECE_TYPE_LABELS[event.type]}
            <span className="text-muted-foreground font-normal ml-2 text-[11px]">
              {sideLabel}
            </span>
          </h4>
          <p className="text-[11px] text-muted-foreground mt-0.5">
            {PATTERN_LABELS[event.pattern]} · {event.matchLabel}
          </p>
        </div>

        {/* Outcome icon */}
        <div className="flex flex-col items-center gap-0.5 shrink-0">
          {event.outcome === "goal" ? (
            <Trophy size={20} className="text-emerald-500" />
          ) : isPositive ? (
            <Target size={20} className="text-blue-500" />
          ) : (
            <ShieldOff size={20} className="text-gray-400" />
          )}
          <span className={`text-[9px] font-bold ${outcome.color}`}>
            {outcome.label}
          </span>
        </div>
      </div>

      {/* xG bar */}
      {event.xG !== undefined && (
        <div className="space-y-1 mb-2">
          <div className="flex items-center justify-between text-[10px]">
            <span className="text-muted-foreground">xG</span>
            <span className="font-mono font-bold text-foreground">
              {event.xG.toFixed(2)}
            </span>
          </div>
          <div className="h-1.5 bg-secondary/50 rounded-full overflow-hidden">
            <motion.div
              initial={{ width: 0 }}
              animate={{ width: `${Math.min(100, event.xG * 200)}%` }}
              transition={{ duration: 0.6, ease: "easeOut" }}
              className="h-full bg-gradient-to-r from-amber-500 to-emerald-500"
            />
          </div>
        </div>
      )}

      {/* Notes */}
      {event.tacticalNotes.length > 0 && (
        <div className="space-y-0.5">
          {event.tacticalNotes.slice(0, 1).map((note, i) => (
            <p
              key={i}
              className="text-[10px] text-muted-foreground/90 flex items-start gap-1.5"
            >
              <MapPin size={9} className="mt-[2px] text-primary shrink-0" />
              {note}
            </p>
          ))}
        </div>
      )}

      {/* Confidence */}
      <div className="mt-2 pt-2 border-t border-border flex items-center justify-between text-[9px]">
        <span className="text-muted-foreground/70">Confianza IA</span>
        <span className="font-mono text-muted-foreground">
          {Math.round(event.confidence * 100)}%
        </span>
      </div>
    </motion.button>
  );
}
