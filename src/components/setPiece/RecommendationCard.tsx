/**
 * VITAS · RecommendationCard — Tactical set piece recommendation
 */

import { useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { ChevronDown, Sparkles, Target, CheckCircle2 } from "lucide-react";
import PitchView from "./PitchView";
import {
  SET_PIECE_TYPE_LABELS,
  PATTERN_LABELS,
} from "@/services/real/setPieceService";
import type { SetPieceRecommendation } from "@/lib/setPiece/types";

interface RecommendationCardProps {
  rec: SetPieceRecommendation;
}

export default function RecommendationCard({ rec }: RecommendationCardProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);

  const probColor =
    rec.successProbability >= 35
      ? "text-emerald-500 bg-emerald-500/15"
      : rec.successProbability >= 20
      ? "text-amber-500 bg-amber-500/15"
      : "text-red-500 bg-red-500/15";

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="glass rounded-2xl overflow-hidden border border-border"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full p-4 flex items-start gap-3 text-left hover:bg-secondary/20 transition-colors"
      >
        <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary/30 to-purple-500/30 flex items-center justify-center shrink-0">
          <Sparkles size={18} className="text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-primary/15 text-primary font-bold">
              {SET_PIECE_TYPE_LABELS[rec.type]}
            </span>
            <span className="text-[9px] uppercase tracking-wider px-2 py-0.5 rounded-full bg-secondary text-muted-foreground font-semibold">
              {PATTERN_LABELS[rec.pattern]}
            </span>
            <span
              className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${probColor}`}
            >
              {t("recommendationCard.successProbability", {
                probability: rec.successProbability,
              })}
            </span>
          </div>
          <h4 className="text-sm font-display font-bold text-foreground">
            {rec.title}
          </h4>
          <p className="text-[11px] text-muted-foreground mt-1 leading-relaxed">
            {rec.description}
          </p>
          <p className="text-[10px] text-primary/80 mt-1 flex items-center gap-1">
            <Target size={9} /> {rec.basedOn}
          </p>
        </div>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.2 }}
          className="shrink-0 mt-1"
        >
          <ChevronDown size={16} className="text-muted-foreground" />
        </motion.div>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25 }}
            className="overflow-hidden border-t border-border"
          >
            <div className="p-4 space-y-4">
              {/* Pitch diagram */}
              <PitchView players={rec.diagram} height={260} />

              {/* Key points */}
              <div>
                <h5 className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold mb-2">
                  {t("recommendationCard.keyPoints")}
                </h5>
                <ul className="space-y-1.5">
                  {rec.keyPoints.map((point, i) => (
                    <motion.li
                      key={i}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.05 }}
                      className="flex items-start gap-2 text-[12px] text-foreground/90"
                    >
                      <CheckCircle2
                        size={14}
                        className="text-emerald-500 mt-[2px] shrink-0"
                      />
                      <span>{point}</span>
                    </motion.li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
