/**
 * VITAS · Not Evaluated Section (B3)
 *
 * Transparencia radical: muestra explícitamente qué dimensiones
 * NO pudimos evaluar y por qué. En vez de ocultar lo que falta,
 * lo mostramos — confianza del scout como marca.
 *
 * Ninguna plataforma de la competencia hace esto.
 */

import { useMemo } from "react";
import { motion } from "framer-motion";
import { EyeOff, Info } from "lucide-react";
import type { Player } from "@/services/real/playerService";

interface Props {
  player: Player;
  hasAnalysis: boolean;
  hasTracking: boolean;
  latestReport: Record<string, unknown> | null | undefined;
}

interface MissingDimension {
  name: string;
  reason: string;
  howToFix: string;
}

function detectMissing(player: Player, hasAnalysis: boolean, hasTracking: boolean, report: Record<string, unknown> | null | undefined): MissingDimension[] {
  const missing: MissingDimension[] = [];

  if (!hasAnalysis) {
    missing.push({
      name: "Análisis de video completo",
      reason: "No hay videos analizados",
      howToFix: "Sube y analiza un video en VITAS Lab",
    });
  }

  if (!hasTracking) {
    missing.push({
      name: "Velocidad máxima y distancia",
      reason: "Sin sesión de tracking del Lab",
      howToFix: "Analiza un video con tracking en VITAS Lab",
    });
  }

  if (!player.phvAge) {
    missing.push({
      name: "Edad madurativa (PHV)",
      reason: "Faltan medidas antropométricas",
      howToFix: "Edita el jugador y añade altura, peso, altura sentado",
    });
  }

  // Check specific metrics from report
  const quant = report?.metricasCuantitativas as Record<string, unknown> | undefined;

  if (!quant?.heatmapPositions || !Array.isArray(quant.heatmapPositions) || quant.heatmapPositions.length === 0) {
    missing.push({
      name: "Mapa de calor",
      reason: "Sin datos de posición en el video",
      howToFix: "Graba con ángulo elevado (tribuna) para mejor tracking",
    });
  }

  if (hasAnalysis && !quant?.sprintCount) {
    missing.push({
      name: "Sprints y velocidad punta",
      reason: "No se detectaron sprints en el video",
      howToFix: "Graba un video con fases de juego activo (no solo posesión)",
    });
  }

  if (hasAnalysis && !quant?.duelsWon && !quant?.duelsLost) {
    missing.push({
      name: "Duelos y disputas",
      reason: "No se detectaron duelos en la muestra",
      howToFix: "Sube más videos con fases de juego disputado",
    });
  }

  const m = player.metrics;
  if ((!m.shooting || m.shooting === 0) && (!m.defending || m.defending === 0)) {
    missing.push({
      name: "Tiro y defensa",
      reason: "Métricas base en cero",
      howToFix: "Los agentes llenarán estas métricas tras analizar videos",
    });
  }

  return missing;
}

export default function NotEvaluatedSection({ player, hasAnalysis, hasTracking, latestReport }: Props) {
  const missing = useMemo(
    () => detectMissing(player, hasAnalysis, hasTracking, latestReport as Record<string, unknown> | null),
    [player, hasAnalysis, hasTracking, latestReport]
  );

  // Don't show if nothing is missing
  if (missing.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, delay: 0.2 }}
      className="glass rounded-xl p-4 border border-border/50"
    >
      {/* Header */}
      <div className="flex items-center gap-2 mb-3">
        <div className="w-7 h-7 rounded-lg bg-muted flex items-center justify-center">
          <EyeOff size={13} className="text-muted-foreground" />
        </div>
        <div>
          <h3 className="font-display font-bold text-xs text-foreground">No evaluado</h3>
          <p className="text-[9px] text-muted-foreground">
            {missing.length} dimensión{missing.length !== 1 ? "es" : ""} sin datos suficientes
          </p>
        </div>
      </div>

      {/* Missing dimensions */}
      <div className="space-y-2">
        {missing.map((m, i) => (
          <div
            key={i}
            className="flex items-start gap-2 p-2 rounded-lg bg-secondary/30"
          >
            <span className="text-muted-foreground text-[10px] mt-0.5 shrink-0">-</span>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-semibold text-foreground">{m.name}</p>
              <p className="text-[10px] text-muted-foreground">{m.reason}</p>
              <p className="text-[10px] text-primary/80 mt-0.5">{m.howToFix}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Info footer */}
      <div className="flex items-start gap-1.5 mt-3 pt-2 border-t border-border/30">
        <Info size={10} className="text-muted-foreground mt-0.5 shrink-0" />
        <p className="text-[9px] text-muted-foreground leading-relaxed">
          VITAS muestra lo que NO sabe para que confíes en lo que SÍ sabe.
          Cada video que subas reduce esta lista y mejora la confianza de la evaluación.
        </p>
      </div>
    </motion.div>
  );
}
