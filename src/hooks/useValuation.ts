/**
 * useValuation — Hook for player valuation model data
 *
 * Fetches from:
 * - /api/agents/valuation-model — deterministic valuation score
 * - ValuationAggregator — multi-video trend analysis
 * - Pipeline reports table — valuation-report (narrative)
 *
 * Sprint 12: Valuation Model
 */

import { useQuery } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/apiAuth";
import { PlayerTrackingService } from "@/services/real/playerTrackingService";
import { ValuationAggregator } from "@/services/real/valuationAggregator";
import type { ValuationData } from "@/components/valuation/ValuationCard";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// ── Calculate valuation (deterministic) ─────────────────────────────────────

async function calculateValuation(playerId: string): Promise<ValuationData | null> {
  const snapshot = PlayerTrackingService.get(playerId);
  const fatigue = snapshot?.fatigueReport;
  const aggregation = await ValuationAggregator.aggregate(playerId, 90);

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/agents/valuation-model`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        currentVsi: null, // Will be filled from analyses
        vsiHistory: [],
        phvOffset: fatigue?.thresholds?.phvOffset ?? null,
        phvCategory: fatigue?.thresholds?.band ?? null,
        injuryRisk: null,
        positionFitScores: [],
        sessionCount: aggregation.snapshotCount,
        consistencyScore: aggregation.consistencyScore,
        speedTrend: null,
        analysisCount: aggregation.snapshotCount,
        competitiveLevel: "academy",
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.data?.report) {
      return json.data.report as ValuationData;
    }
  } catch {
    // Calculator failed
  }
  return null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useValuation(playerId: string | null | undefined) {
  const valuationQuery = useQuery({
    queryKey: ["valuation", playerId],
    queryFn: () => calculateValuation(playerId!),
    enabled: !!playerId,
    staleTime: 15 * 60 * 1000, // 15 min cache
  });

  const aggregationQuery = useQuery({
    queryKey: ["valuation-aggregation", playerId],
    queryFn: () => ValuationAggregator.aggregate(playerId!, 90),
    enabled: !!playerId,
    staleTime: 15 * 60 * 1000,
  });

  return {
    valuationData: valuationQuery.data ?? null,
    valuationLoading: valuationQuery.isLoading,
    aggregation: aggregationQuery.data ?? null,
    aggregationLoading: aggregationQuery.isLoading,
  };
}
