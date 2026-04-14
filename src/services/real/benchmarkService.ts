/**
 * VITAS · Benchmark Service
 * Calculates percentile rankings for a player's video intelligence dimensions
 * compared to players of the same age (±1 year) and position.
 * 100% client-side, no API calls — uses PlayerService.getAll().
 */

import { PlayerService } from "./playerService";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface DimensionBenchmark {
  dimensionKey: string;
  playerScore: number;
  percentile: number;
  sampleSize: number;
  isSmallSample: boolean;
}

export interface ReportBenchmark {
  dimensions: DimensionBenchmark[];
  groupDescription: string;
  sampleSize: number;
  calculatedAt: string;
}

// ─── Dimension → Player Metric mapping ──────────────────────────────────────
// Video intelligence scores (0-10) map to player stats (0-100)

export const DIMENSION_TO_METRIC: Record<string, string> = {
  velocidadDecision: "speed",
  tecnicaConBalon: "technique",
  inteligenciaTactica: "vision",
  capacidadFisica: "stamina",
  liderazgoPresencia: "vision",      // closest proxy
  eficaciaCompetitiva: "shooting",
};

// ─── Percentile calculation (same formula as rankingsService) ────────────────

function percentileRank(value: number, allValues: number[]): number {
  if (allValues.length <= 1) return 100;
  const below = allValues.filter((v) => v < value).length;
  const equal = allValues.filter((v) => v === value).length;
  return Math.round(((below + equal * 0.5) / allValues.length) * 100);
}

// ─── Main function ──────────────────────────────────────────────────────────

export function calculateReportBenchmark(
  playerAge: number,
  playerPosition: string,
  dimensionScores: Record<string, { score: number; observacion?: string }>,
): ReportBenchmark {
  const allPlayers = PlayerService.getAll();

  // Filter by age ±1 and same position
  let group = allPlayers.filter(
    (p) =>
      p.age >= playerAge - 1 &&
      p.age <= playerAge + 1 &&
      p.position?.toLowerCase() === playerPosition?.toLowerCase(),
  );

  let isSmallSample = group.length < 5;

  // Fallback: only age filter if position group is too small
  if (isSmallSample) {
    group = allPlayers.filter(
      (p) => p.age >= playerAge - 1 && p.age <= playerAge + 1,
    );
    isSmallSample = group.length < 5;
  }

  const sampleSize = group.length;

  // Build description
  const groupDescription = sampleSize >= 5
    ? `${playerPosition}, ${playerAge} años ±1 — ${sampleSize} jugadores`
    : sampleSize > 0
      ? `${playerAge} años ±1 — ${sampleSize} jugadores (muestra pequeña)`
      : "Sin datos de comparación";

  // Calculate percentile for each dimension
  const dimensions: DimensionBenchmark[] = Object.entries(dimensionScores)
    .filter(([, dim]) => dim && typeof dim.score === "number")
    .map(([dimKey, dim]) => {
      const metricKey = DIMENSION_TO_METRIC[dimKey];
      if (!metricKey || sampleSize === 0) {
        return {
          dimensionKey: dimKey,
          playerScore: dim.score,
          percentile: 50,
          sampleSize: 0,
          isSmallSample: true,
        };
      }

      // Convert player metric (0-100) to dimension scale (0-10) for comparison
      const groupScores = group
        .map((p) => {
          const stats = p.stats as Record<string, number> | undefined;
          const val = stats?.[metricKey];
          return typeof val === "number" ? val / 10 : null;
        })
        .filter((v): v is number => v !== null);

      return {
        dimensionKey: dimKey,
        playerScore: dim.score,
        percentile: percentileRank(dim.score, groupScores),
        sampleSize: groupScores.length,
        isSmallSample: groupScores.length < 5,
      };
    });

  return {
    dimensions,
    groupDescription,
    sampleSize,
    calculatedAt: new Date().toISOString(),
  };
}
