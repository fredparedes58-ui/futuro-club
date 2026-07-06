/**
 * VITAS · PlayerHeatmapGrid
 *
 * Grid de mini-heatmaps, uno por jugador, para una fase seleccionada.
 * Click → expande a tamaño completo en modal.
 */
import { useState } from "react";
import { useTranslation } from "react-i18next";
import { X } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { PitchHeatmap } from "./PitchHeatmap";
import type { PhaseHeatmap } from "@/lib/tactical/tacticalTypes";

interface Props {
  heatmaps: PhaseHeatmap[];
  playerNames?: Record<string, string>;
}

export function PlayerHeatmapGrid({ heatmaps, playerNames = {} }: Props) {
  const { t } = useTranslation();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const expanded = heatmaps.find((h) => h.id === expandedId);

  // Lock all heatmaps to same colour scale for comparison
  const maxWeight = Math.max(
    0.05,
    ...heatmaps.flatMap((h) => h.bins.map((b) => b.weight)),
  );

  if (heatmaps.length === 0) {
    return (
      <div className="rounded-lg border border-dashed border-white/10 p-6 text-center text-sm text-slate-400">
        {t("playerHeatmapGrid.noPlayerData")}
      </div>
    );
  }

  return (
    <>
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
        {heatmaps.map((h) => (
          <button
            key={h.id}
            onClick={() => setExpandedId(h.id)}
            className="rounded-lg border border-white/5 hover:border-cyan-400/40 bg-white/[0.02] p-2 transition-colors text-left"
          >
            <div className="text-[10px] uppercase tracking-wider text-slate-500 mb-1 truncate">
              {playerNames[h.playerId ?? ""] ?? t("playerHeatmapGrid.playerFallback", { id: h.playerId?.slice(0, 6) ?? "?" })}
            </div>
            <PitchHeatmap
              bins={h.bins}
              hotZones={h.hotZones.slice(0, 1)}
              height={100}
              maxWeight={maxWeight}
            />
            <div className="text-[10px] text-slate-400 mt-1">
              {t("playerHeatmapGrid.secondsInPhase", { seconds: Math.round(h.totalTimeSec) })}
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setExpandedId(null)}
            className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
          >
            <motion.div
              initial={{ scale: 0.95 }}
              animate={{ scale: 1 }}
              exit={{ scale: 0.95 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-slate-900 border border-white/10 rounded-xl p-4 max-w-2xl"
            >
              <div className="flex items-center justify-between mb-3">
                <div className="text-sm font-semibold text-white">
                  {playerNames[expanded.playerId ?? ""] ?? t("playerHeatmapGrid.playerFallback", { id: expanded.playerId?.slice(0, 6) ?? "?" })}
                </div>
                <button onClick={() => setExpandedId(null)} className="text-slate-400 hover:text-white">
                  <X className="size-4" />
                </button>
              </div>
              <PitchHeatmap bins={expanded.bins} hotZones={expanded.hotZones} height={360} />
              <div className="mt-3 text-xs text-slate-400">
                {t("playerHeatmapGrid.expandedSummary", {
                  seconds: Math.round(expanded.totalTimeSec),
                  count: expanded.hotZones.length,
                })}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </>
  );
}
