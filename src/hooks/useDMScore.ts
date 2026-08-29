/**
 * VITAS · useDMScore — Decision-Making Score + Scan IQ por jugador
 *
 * Compone (sin IA, coste cero) las señales cognitivas ya existentes:
 *   1. Scanning real (ScanningVideoAnalyses, localStorage/MediaPipe)
 *      → Scan IQ calibrado por edad
 *   2. BPE (BehavioralProfileService): decisionSpeed + clutchFactor
 *   3. Análisis de video (useSavedAnalysesV2): inteligenciaTactica (0-10)
 *
 * Devuelve el DMScoreResult + el detalle de Scan IQ para las cards.
 */

import { useQuery } from "@tanstack/react-query";
import { usePlayerById } from "@/hooks/usePlayers";
import { useSavedAnalysesV2 } from "@/hooks/usePlayerAnalysisV2";
import { ScanningVideoAnalyses } from "@/services/real/scanningVideoDetector";
import { BehavioralProfileService } from "@/services/real/behavioralProfileService";
import {
  computeDMScore,
  computeScanIQ,
  type DMScoreInput,
  type DMScoreResult,
  type ScanIQResult,
} from "@/lib/dmscore";

export interface DMScoreBundle {
  dmScore: DMScoreResult;
  scanIQ: ScanIQResult | null;
  /** Edad usada para calibrar (default 14 si no hay dato). */
  ageUsed: number;
  /** Fuente del scanning: "real" (MediaPipe) | "mock" | null si no hay análisis. */
  scanSource: "real" | "mock" | null;
}

export function useDMScore(playerId: string | undefined) {
  const { data: player } = usePlayerById(playerId);
  const { data: savedAnalyses } = useSavedAnalysesV2(playerId ?? "");

  return useQuery<DMScoreBundle>({
    queryKey: [
      "dm-score",
      playerId,
      (player as { age?: number } | undefined)?.age,
      Array.isArray(savedAnalyses) ? savedAnalyses.length : 0,
    ],
    enabled: Boolean(playerId),
    staleTime: 1000 * 60 * 5,
    queryFn: async () => {
      const age =
        typeof (player as { age?: number } | undefined)?.age === "number"
          ? (player as { age: number }).age
          : 14;

      // 1. Scanning → Scan IQ age-aware
      const latestScan = ScanningVideoAnalyses.getLatestForPlayer(playerId!);
      const scanIQ = latestScan
        ? computeScanIQ(latestScan.avgScansPreReception, age)
        : null;
      const scanSource: "real" | "mock" | null = latestScan
        ? (latestScan.source ?? "mock")
        : null;

      // 2. BPE → decisionSpeed + clutch
      let decisionSpeed: number | null = null;
      let pressureComposure: number | null = null;
      try {
        const bpe = await BehavioralProfileService.getLatest(playerId!);
        if (bpe) {
          decisionSpeed = bpe.scores.decisionSpeed;
          pressureComposure = bpe.scores.clutchFactor;
          // Fallback de scanning si no hay análisis de scanning dedicado
          if (!scanIQ && typeof bpe.scores.scanningIntelligence === "number") {
            // El BPE ya lo entrega 0-100 (sin edad) — usable como aproximación
          }
        }
      } catch {
        // BPE opcional
      }

      // 3. Video analysis → inteligenciaTactica (0-10 → 0-100)
      let tacticalAwareness: number | null = null;
      if (Array.isArray(savedAnalyses) && savedAnalyses.length > 0) {
        const latest = savedAnalyses[0] as {
          report?: { estadoActual?: { dimensiones?: { inteligenciaTactica?: { score?: number } }; dimensionesMedidas?: boolean } };
        };
        // Solo si las dimensiones son REALES: el score por dimensión es una constante
        // fabricada (el pipeline no lo mide) → no alimentar el DM score con ella (inv #2).
        if (latest?.report?.estadoActual?.dimensionesMedidas === true) {
          const s = latest?.report?.estadoActual?.dimensiones?.inteligenciaTactica?.score;
          if (typeof s === "number") tacticalAwareness = Math.round(s * 10);
        }
      }

      const input: DMScoreInput = {
        scanIQ: scanIQ?.scanIQ ?? null,
        decisionSpeed,
        pressureComposure,
        tacticalAwareness,
        sources: {
          scanIQ: scanSource ?? undefined,
          decisionSpeed: decisionSpeed != null ? "bpe" : undefined,
          pressureComposure: pressureComposure != null ? "bpe" : undefined,
          tacticalAwareness: tacticalAwareness != null ? "video" : undefined,
        },
      };

      return {
        dmScore: computeDMScore(input),
        scanIQ,
        ageUsed: age,
        scanSource,
      };
    },
  });
}
