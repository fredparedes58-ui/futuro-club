/**
 * VITAS · Confidence Badge (B2)
 *
 * Muestra qué tan confiable es la evaluación actual del jugador.
 * Calculado desde: cantidad de videos, calidad de tracking, completitud de datos.
 *
 * 3 niveles:
 *   Alta (>80)  — evaluación sólida
 *   Media (50-80) — evaluación parcial
 *   Baja (<50)  — datos insuficientes
 *
 * Diferenciador: NADIE más muestra esto. Todos presentan scores como verdades absolutas.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { Shield, ShieldCheck, ShieldAlert, ShieldX } from "lucide-react";
import type { Player } from "@/services/real/playerService";

interface Props {
  videosCount: number;
  hasTracking: boolean;
  player: Player;
}

interface ConfidenceResult {
  score: number;
  level: "high" | "medium" | "low";
  label: string;
  description: string;
  color: string;
  Icon: React.ElementType;
  factors: string[];
}

function calculateConfidence(videosCount: number, hasTracking: boolean, player: Player): ConfidenceResult {
  // Base confidence from video count
  let baseConfidence: number;
  if (videosCount >= 7) baseConfidence = 95;
  else if (videosCount >= 4) baseConfidence = 90;
  else if (videosCount >= 2) baseConfidence = 82;
  else if (videosCount === 1) baseConfidence = 70;
  else baseConfidence = 30;

  // Data completeness factor (0.5-1.0)
  let completeDimensions = 0;
  const totalDimensions = 8; // speed, technique, vision, stamina, shooting, defending, phv, tracking
  const m = player.metrics;
  if (m.speed && m.speed > 0) completeDimensions++;
  if (m.technique && m.technique > 0) completeDimensions++;
  if (m.vision && m.vision > 0) completeDimensions++;
  if (m.stamina && m.stamina > 0) completeDimensions++;
  if (m.shooting && m.shooting > 0) completeDimensions++;
  if (m.defending && m.defending > 0) completeDimensions++;
  if (player.phvAge) completeDimensions++;
  if (hasTracking) completeDimensions++;

  const dataFactor = 0.5 + (completeDimensions / totalDimensions) * 0.5;

  // Tracking factor
  const trackingFactor = hasTracking ? 1.0 : 0.85;

  // Final score
  const score = Math.round(baseConfidence * dataFactor * trackingFactor);

  // Build factors explanation
  const factors: string[] = [];
  if (videosCount === 0) factors.push("Sin videos analizados");
  else if (videosCount === 1) factors.push("Solo 1 video analizado");
  else factors.push(`${videosCount} videos analizados`);

  if (!hasTracking) factors.push("Sin datos de tracking (Lab)");
  if (!player.phvAge) factors.push("Sin datos PHV (añadir medidas)");
  if (completeDimensions < totalDimensions * 0.7)
    factors.push(`${totalDimensions - completeDimensions} dimensiones sin datos`);

  // Level
  if (score > 80) {
    return {
      score, level: "high",
      label: "Confianza Alta",
      description: `Evaluación sólida basada en ${videosCount} video${videosCount !== 1 ? "s" : ""} y datos completos.`,
      color: "#22c55e", Icon: ShieldCheck, factors,
    };
  } else if (score >= 50) {
    return {
      score, level: "medium",
      label: "Confianza Media",
      description: "Evaluación parcial. Más videos y datos mejorarían la precisión.",
      color: "#f59e0b", Icon: ShieldAlert, factors,
    };
  } else {
    return {
      score, level: "low",
      label: "Confianza Baja",
      description: "Datos insuficientes para una evaluación confiable. Sube videos para mejorar.",
      color: "#ef4444", Icon: ShieldX, factors,
    };
  }
}

export default function ConfidenceBadge({ videosCount, hasTracking, player }: Props) {
  const conf = useMemo(
    () => calculateConfidence(videosCount, hasTracking, player),
    [videosCount, hasTracking, player]
  );

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.1 }}
      className="glass rounded-xl p-3 flex items-center gap-3"
    >
      {/* Icon */}
      <div
        className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0"
        style={{ backgroundColor: `${conf.color}15`, border: `1px solid ${conf.color}30` }}
      >
        <conf.Icon size={16} style={{ color: conf.color }} />
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-display font-bold text-xs text-foreground">{conf.label}</span>
          <span
            className="px-1.5 py-0.5 rounded-full text-[9px] font-bold"
            style={{ backgroundColor: `${conf.color}20`, color: conf.color }}
          >
            {conf.score}%
          </span>
        </div>
        <p className="text-[10px] text-muted-foreground leading-relaxed mt-0.5">
          {conf.description}
        </p>
      </div>

      {/* Factors tooltip on hover */}
      {conf.factors.length > 0 && conf.level !== "high" && (
        <div className="hidden sm:block">
          <div className="text-[9px] text-muted-foreground space-y-0.5">
            {conf.factors.map((f, i) => (
              <p key={i} className="flex items-center gap-1">
                <span className="w-1 h-1 rounded-full shrink-0" style={{ backgroundColor: conf.color }} />
                {f}
              </p>
            ))}
          </div>
        </div>
      )}
    </motion.div>
  );
}
