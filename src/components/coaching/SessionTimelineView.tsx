/**
 * VITAS · SessionTimelineView (Sprint 16)
 *
 * Horizontal colored bar showing session segments by type with duration.
 * Input: TrainingSegment[] from SessionSegmenter.
 */
import { motion } from "framer-motion";
import type { TrainingSegment, SegmentType } from "@/lib/shared/sessionTypes";

interface Props {
  segments: TrainingSegment[];
  totalDurationMin?: number;
}

const SEGMENT_COLORS: Record<SegmentType, string> = {
  warmup:           "bg-amber-500/80",
  technical:        "bg-blue-500/80",
  tactical:         "bg-violet-500/80",
  physical:         "bg-red-500/80",
  game_small_sided: "bg-emerald-500/80",
  game_full:        "bg-green-600/80",
  cooldown:         "bg-sky-400/80",
  transition_break: "bg-white/10",
};

const SEGMENT_LABELS: Record<SegmentType, string> = {
  warmup:           "Calentamiento",
  technical:        "Técnica",
  tactical:         "Táctica",
  physical:         "Físico",
  game_small_sided: "Juego reducido",
  game_full:        "Partido",
  cooldown:         "Vuelta a calma",
  transition_break: "Pausa",
};

export default function SessionTimelineView({ segments, totalDurationMin }: Props) {
  const total = totalDurationMin ?? segments.reduce((s, seg) => s + seg.durationMin, 0);
  if (total === 0) return null;

  return (
    <div className="glass rounded-xl p-4 space-y-3">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground font-bold">
        Línea de Tiempo
      </span>

      {/* Timeline bar */}
      <div className="flex h-8 rounded-lg overflow-hidden gap-px">
        {segments.map((seg, i) => {
          const pct = (seg.durationMin / total) * 100;
          if (pct < 1) return null;
          return (
            <motion.div
              key={i}
              className={`${SEGMENT_COLORS[seg.type]} relative group cursor-default`}
              initial={{ width: 0 }}
              animate={{ width: `${pct}%` }}
              transition={{ duration: 0.6, delay: i * 0.05 }}
            >
              {/* Tooltip */}
              <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none z-10">
                <div className="glass rounded-md px-2 py-1 text-[10px] whitespace-nowrap text-foreground font-medium">
                  {SEGMENT_LABELS[seg.type]} — {Math.round(seg.durationMin)} min
                </div>
              </div>

              {/* Label inside bar if wide enough */}
              {pct > 12 && (
                <span className="absolute inset-0 flex items-center justify-center text-[9px] font-bold text-white/90 truncate px-1">
                  {Math.round(seg.durationMin)}′
                </span>
              )}
            </motion.div>
          );
        })}
      </div>

      {/* Legend */}
      <div className="flex flex-wrap gap-x-3 gap-y-1">
        {Array.from(new Set(segments.map(s => s.type))).map(type => (
          <div key={type} className="flex items-center gap-1">
            <div className={`w-2 h-2 rounded-full ${SEGMENT_COLORS[type]}`} />
            <span className="text-[9px] text-muted-foreground">{SEGMENT_LABELS[type]}</span>
          </div>
        ))}
      </div>

      {/* Total */}
      <div className="text-[10px] text-muted-foreground">
        Duración total: <span className="font-mono font-bold text-foreground">{Math.round(total)}</span> min
      </div>
    </div>
  );
}
