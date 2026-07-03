/**
 * VITAS · useMetricSnapshots (Sprint 5.4)
 *
 * Lee player_metric_snapshots (poblada por el progression-tracker tras cada
 * análisis) para dibujar curvas longitudinales reales: VSI, riesgo de lesión,
 * PHV offset, fatiga/ACWR a lo largo del tiempo. RLS: el usuario ve las de sus
 * propios jugadores. Si no hay Supabase o no hay datos → array vacío (la UI
 * muestra estado vacío).
 */
import { useQuery } from "@tanstack/react-query";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

export interface MetricSnapshot {
  snapshotDate: string;
  vsi: number | null;
  phvOffset: number | null;
  phvCategory: string | null;
  injuryRisk: number | null;
  fatigueIndex: number | null;
  acwr: number | null;
  valuationTier: string | null;
  source: string | null;
}

interface SnapshotRow {
  snapshot_date: string;
  vsi: number | null;
  phv_offset: number | null;
  phv_category: string | null;
  injury_risk: number | null;
  fatigue_index: number | null;
  acwr: number | null;
  valuation_tier: string | null;
  source: string | null;
}

async function fetchSnapshots(playerId: string, limit: number): Promise<MetricSnapshot[]> {
  if (!SUPABASE_CONFIGURED) return [];
  try {
    const { data, error } = await supabase
      .from("player_metric_snapshots")
      .select(
        "snapshot_date, vsi, phv_offset, phv_category, injury_risk, fatigue_index, acwr, valuation_tier, source",
      )
      .eq("player_id", playerId)
      .order("snapshot_date", { ascending: true })
      .limit(limit);
    if (error || !data) return [];
    return (data as SnapshotRow[]).map((r) => ({
      snapshotDate: r.snapshot_date,
      vsi: r.vsi,
      phvOffset: r.phv_offset,
      phvCategory: r.phv_category,
      injuryRisk: r.injury_risk,
      fatigueIndex: r.fatigue_index,
      acwr: r.acwr,
      valuationTier: r.valuation_tier,
      source: r.source,
    }));
  } catch {
    return [];
  }
}

export function useMetricSnapshots(playerId?: string, limit = 60) {
  return useQuery<MetricSnapshot[]>({
    queryKey: ["metric-snapshots", playerId, limit],
    queryFn: () => fetchSnapshots(playerId!, limit),
    enabled: Boolean(playerId) && SUPABASE_CONFIGURED,
    staleTime: 15 * 60 * 1000,
  });
}
