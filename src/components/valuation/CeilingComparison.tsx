/**
 * CeilingComparison — Compare player's ceiling with professional references
 *
 * Shows 3 comparable professionals from the same position tier,
 * matching the player's profile and ceiling potential.
 *
 * Sprint 13: Valuation Dashboard & Integration
 */

import { motion } from "framer-motion";
import { Users, Star, ArrowRight } from "lucide-react";

interface Comparable {
  nombre: string;
  equipo: string;
  razon: string;
}

interface CeilingComparisonProps {
  comparables: Comparable[];
  tier: string;
  tierColor: string;
  compact?: boolean;
}

export default function CeilingComparison({
  comparables,
  tier,
  tierColor,
  compact = false,
}: CeilingComparisonProps) {
  if (comparables.length === 0) {
    return (
      <div className="text-center py-4">
        <Users size={20} className="text-muted-foreground/40 mx-auto mb-1" />
        <p className="text-xs text-muted-foreground">Sin comparables disponibles</p>
      </div>
    );
  }

  if (compact) {
    return (
      <div className="space-y-1.5">
        {comparables.slice(0, 2).map((comp, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <Star size={10} style={{ color: tierColor }} />
            <span className="font-medium text-foreground">{comp.nombre}</span>
            <span className="text-muted-foreground">· {comp.equipo}</span>
          </div>
        ))}
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-3"
    >
      <div className="flex items-center gap-2">
        <Users size={16} className="text-primary" />
        <h4 className="font-display font-bold text-sm text-foreground">Comparables Profesionales</h4>
      </div>

      <div className="space-y-2">
        {comparables.map((comp, i) => (
          <motion.div
            key={i}
            initial={{ opacity: 0, x: -8 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-xl bg-card/60 border border-border/30 px-3 py-2.5"
          >
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center shrink-0 border"
              style={{
                backgroundColor: `${tierColor}15`,
                borderColor: `${tierColor}30`,
              }}
            >
              <Star size={14} style={{ color: tierColor }} />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2">
                <span className="text-xs font-display font-bold text-foreground">{comp.nombre}</span>
                <span className="text-[10px] text-muted-foreground">{comp.equipo}</span>
              </div>
              <p className="text-[10px] text-muted-foreground truncate">{comp.razon}</p>
            </div>
            <ArrowRight size={10} className="text-muted-foreground/30 shrink-0" />
          </motion.div>
        ))}
      </div>

      <p className="text-[9px] text-muted-foreground text-center">
        Comparaciones basadas en perfil biomecanico, posicion y tier. No implica nivel actual.
      </p>
    </motion.div>
  );
}
