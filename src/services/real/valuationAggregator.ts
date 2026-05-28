/**
 * ValuationAggregator — Multi-video aggregation for valuation model
 *
 * Computes trends over N analyses:
 * - VSI slope (improvement rate)
 * - Event quality trend
 * - Consistency score
 * - Position fit stability
 *
 * Used by valuation-model to weight trend data.
 * Gated: Club plan only (multi-video aggregation).
 *
 * Sprint 12: Valuation Model
 */

import { getAuthHeaders } from "@/lib/apiAuth";

// ── Types ───────────────────────────────────────────────────────────────────

export interface ValuationSnapshot {
  date: string;
  vsi: number | null;
  injuryRisk: number | null;
  fatigueIndex: number | null;
  acwr: number | null;
  phvOffset: number | null;
}

export interface ValuationAggregation {
  snapshotCount: number;
  periodDays: number;
  vsiSlope: number;          // VSI points per month
  vsiCurrent: number | null;
  vsiAvg: number;
  injuryRiskAvg: number;
  injuryRiskTrend: number;   // positive = worsening
  consistencyScore: number;  // 0-100
  coldStart: boolean;
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function linearSlope(values: number[]): number {
  if (values.length < 2) return 0;
  const n = values.length;
  const xs = values.map((_, i) => i);
  const sumX = xs.reduce((a, b) => a + b, 0);
  const sumY = values.reduce((a, b) => a + b, 0);
  const sumXY = xs.reduce((a, x, i) => a + x * values[i], 0);
  const sumX2 = xs.reduce((a, x) => a + x * x, 0);
  const denominator = n * sumX2 - sumX * sumX;
  if (denominator === 0) return 0;
  return (n * sumXY - sumX * sumY) / denominator;
}

// ── Service ─────────────────────────────────────────────────────────────────

const API_BASE = import.meta.env?.VITE_API_BASE_URL ?? "";

export const ValuationAggregator = {
  /**
   * Fetch metric snapshots from Supabase and compute aggregation.
   * Falls back to empty aggregation if API unavailable.
   */
  async aggregate(playerId: string, days = 90): Promise<ValuationAggregation> {
    const snapshots = await this._fetchSnapshots(playerId, days);

    if (snapshots.length === 0) {
      return {
        snapshotCount: 0,
        periodDays: days,
        vsiSlope: 0,
        vsiCurrent: null,
        vsiAvg: 0,
        injuryRiskAvg: 0,
        injuryRiskTrend: 0,
        consistencyScore: 0,
        coldStart: true,
      };
    }

    const sorted = [...snapshots].sort((a, b) => a.date.localeCompare(b.date));
    const n = sorted.length;

    // VSI analysis
    const vsiValues = sorted.map((s) => s.vsi).filter((v): v is number => v != null);
    const vsiSlope = linearSlope(vsiValues);
    const vsiCurrent = vsiValues.length > 0 ? vsiValues[vsiValues.length - 1] : null;
    const vsiAvg = vsiValues.length > 0 ? vsiValues.reduce((a, b) => a + b, 0) / vsiValues.length : 0;

    // Injury risk analysis
    const riskValues = sorted.map((s) => s.injuryRisk).filter((v): v is number => v != null);
    const injuryRiskAvg = riskValues.length > 0 ? riskValues.reduce((a, b) => a + b, 0) / riskValues.length : 0;
    const injuryRiskTrend = linearSlope(riskValues);

    // Consistency: coefficient of variation of VSI
    const vsiMean = vsiAvg;
    const vsiStdDev = vsiValues.length > 1
      ? Math.sqrt(vsiValues.reduce((a, v) => a + (v - vsiMean) ** 2, 0) / vsiValues.length)
      : 0;
    const cv = vsiMean > 0 ? vsiStdDev / vsiMean : 1;
    const consistencyScore = Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));

    return {
      snapshotCount: n,
      periodDays: days,
      vsiSlope: Math.round(vsiSlope * 100) / 100,
      vsiCurrent,
      vsiAvg: Math.round(vsiAvg * 10) / 10,
      injuryRiskAvg: Math.round(injuryRiskAvg * 10) / 10,
      injuryRiskTrend: Math.round(injuryRiskTrend * 100) / 100,
      consistencyScore,
      coldStart: n < 3,
    };
  },

  /** Fetch snapshots from API */
  async _fetchSnapshots(playerId: string, days: number): Promise<ValuationSnapshot[]> {
    try {
      const headers = await getAuthHeaders();
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - days);
      const cutoffStr = cutoff.toISOString().slice(0, 10);

      const res = await fetch(
        `${API_BASE}/api/tracking/history?playerId=${encodeURIComponent(playerId)}&limit=50`,
        { headers },
      );
      if (!res.ok) return [];
      const json = await res.json();
      if (!json.success || !Array.isArray(json.data)) return [];

      // Map to ValuationSnapshot format
      return (json.data as Array<Record<string, unknown>>)
        .filter((s) => (s.date as string) >= cutoffStr)
        .map((s) => ({
          date: s.date as string,
          vsi: (s as Record<string, number | null>).vsi ?? null,
          injuryRisk: (s as Record<string, number | null>).injury_risk_score ?? null,
          fatigueIndex: (s as Record<string, number | null>).fatigue_index ?? null,
          acwr: (s as Record<string, number | null>).acwr_value ?? null,
          phvOffset: (s as Record<string, number | null>).phv_offset ?? null,
        }));
    } catch {
      return [];
    }
  },
};
