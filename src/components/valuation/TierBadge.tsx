/**
 * TierBadge — Visual badge showing player's valuation tier
 *
 * Sprint 12: Valuation Model
 */

import { motion } from "framer-motion";
import { Star, TrendingUp, Zap, Layers } from "lucide-react";

interface TierBadgeProps {
  tier: string;
  tierColor: string;
  score: number;
  compact?: boolean;
}

const TIER_ICONS: Record<string, React.ElementType> = {
  "Elite Prospect": Star,
  "High Potential": Zap,
  "Developing Talent": TrendingUp,
  "Foundation": Layers,
};

export default function TierBadge({ tier, tierColor, score, compact = false }: TierBadgeProps) {
  const Icon = TIER_ICONS[tier] ?? TrendingUp;

  if (compact) {
    return (
      <div
        className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-display font-bold border"
        style={{
          color: tierColor,
          backgroundColor: `${tierColor}15`,
          borderColor: `${tierColor}30`,
        }}
      >
        <Icon size={10} />
        {tier}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ scale: 0.9, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      className="flex flex-col items-center gap-1"
    >
      <div
        className="w-12 h-12 rounded-full flex items-center justify-center border-2"
        style={{
          backgroundColor: `${tierColor}15`,
          borderColor: `${tierColor}50`,
        }}
      >
        <Icon size={20} style={{ color: tierColor }} />
      </div>
      <span
        className="text-xs font-display font-bold text-center"
        style={{ color: tierColor }}
      >
        {tier}
      </span>
      <span className="text-[10px] text-muted-foreground tabular-nums">
        Score: {score}/100
      </span>
    </motion.div>
  );
}
