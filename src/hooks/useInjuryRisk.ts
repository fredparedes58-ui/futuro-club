/**
 * useInjuryRisk — Hook for injury risk data (calculator + history)
 *
 * Fetches from:
 * - /api/injuries/list — injury history
 * - /api/agents/injury-risk-calculator — deterministic risk score
 * - Pipeline reports table — injury-risk-report (narrative)
 *
 * Fallback: localStorage tracking snapshot for biomechanics/fatigue data.
 *
 * Sprint 10: Injury Risk Model & Data
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { getAuthHeaders } from "@/lib/apiAuth";
import { PlayerTrackingService } from "@/services/real/playerTrackingService";
import type { InjuryEntry } from "@/components/injury/InjuryLogForm";
import type { InjuryRiskData } from "@/components/injury/InjuryRiskCard";

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? "";

// Referencia ESTABLE para el caso "sin datos". Devolver `?? []` (literal nuevo en
// cada render) hacía que un consumidor con `useEffect(..., [injuries])` (p.ej.
// PlayerHubPage) hiciera setState en cada render → "Maximum update depth exceeded"
// mientras la query estaba pending/retry (API caído). Un array vacío compartido
// mantiene la identidad estable entre renders y corta el bucle.
const EMPTY_INJURIES: InjuryEntry[] = [];

// ── Fetch injury history ────────────────────────────────────────────────────

async function fetchInjuries(playerId: string): Promise<InjuryEntry[]> {
  try {
    const headers = await getAuthHeaders();
    const res = await fetch(
      `${API_BASE}/api/injuries/list?playerId=${encodeURIComponent(playerId)}`,
      { headers },
    );
    if (!res.ok) throw new Error(`${res.status}`);
    const json = await res.json();
    if (json.success && Array.isArray(json.data)) {
      return json.data as InjuryEntry[];
    }
  } catch {
    // Fallback: return empty
  }
  return [];
}

// ── Save injury history ─────────────────────────────────────────────────────

async function saveInjuries(playerId: string, injuries: InjuryEntry[]): Promise<void> {
  const headers = await getAuthHeaders();
  const res = await fetch(`${API_BASE}/api/injuries/save`, {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify({ playerId, injuries }),
  });
  if (!res.ok) throw new Error(`Save failed: ${res.status}`);
}

// ── Calculate injury risk (deterministic) ───────────────────────────────────

async function calculateInjuryRisk(
  playerId: string,
  injuries: InjuryEntry[],
): Promise<InjuryRiskData | null> {
  // Gather data from localStorage tracking snapshot
  const snapshot = PlayerTrackingService.get(playerId);
  const fatigue = snapshot?.fatigueReport;
  const biomech = snapshot?.biomechanicsScore;

  // Get fatigue history for session count
  const fatigueHistory = await PlayerTrackingService.getFatigueHistory(playerId, 28);

  // Days since last injury
  let daysSinceLastInjury: number | null = null;
  if (injuries.length > 0) {
    const sorted = [...injuries].sort((a, b) => b.date.localeCompare(a.date));
    const lastDate = new Date(sorted[0].date);
    daysSinceLastInjury = Math.round((Date.now() - lastDate.getTime()) / (1000 * 60 * 60 * 24));
  }

  try {
    const headers = await getAuthHeaders();
    const res = await fetch(`${API_BASE}/api/agents/injury-risk-calculator`, {
      method: "POST",
      headers: { ...headers, "Content-Type": "application/json" },
      body: JSON.stringify({
        playerId,
        age: null, // will be filled from player context if available
        phvOffset: fatigue?.thresholds?.phvOffset ?? null,
        phvCategory: fatigue?.thresholds?.band ?? null,
        acwrValue: fatigue?.acwr?.value ?? null,
        acwrZone: fatigue?.acwr?.zone ?? null,
        fatigueIndex: fatigue?.fatigueIndex?.value ?? null,
        fatigueSeverity: fatigue?.fatigueIndex?.severity ?? null,
        biomechanicsInjuryRisk: biomech?.injuryRisk ?? null,
        asymmetryPct: biomech?.asymmetry?.overallAsymmetryPct ?? null,
        injuryHistory: injuries.map((inj) => ({
          type: inj.type,
          severity: inj.severity,
          daysOut: inj.daysOut,
          date: inj.date,
          bodyPart: inj.bodyPart,
        })),
        daysSinceLastInjury,
        sessionsLast28Days: fatigueHistory.length,
      }),
    });

    if (!res.ok) return null;
    const json = await res.json();
    if (json.success && json.data?.report) {
      return json.data.report as InjuryRiskData;
    }
  } catch {
    // Calculator failed — return null (fallback handled in UI)
  }
  return null;
}

// ── Hook ────────────────────────────────────────────────────────────────────

export function useInjuryRisk(playerId: string | null | undefined) {
  const queryClient = useQueryClient();

  const injuriesQuery = useQuery({
    queryKey: ["injuries", playerId],
    queryFn: () => fetchInjuries(playerId!),
    enabled: !!playerId,
    staleTime: 5 * 60 * 1000,
  });

  const riskQuery = useQuery({
    queryKey: ["injury-risk", playerId],
    queryFn: () => calculateInjuryRisk(playerId!, injuriesQuery.data ?? []),
    enabled: !!playerId && injuriesQuery.isSuccess,
    staleTime: 10 * 60 * 1000,
  });

  const saveMutation = useMutation({
    mutationFn: (injuries: InjuryEntry[]) => saveInjuries(playerId!, injuries),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["injuries", playerId] });
      queryClient.invalidateQueries({ queryKey: ["injury-risk", playerId] });
    },
  });

  return {
    injuries: injuriesQuery.data ?? EMPTY_INJURIES,
    injuriesLoading: injuriesQuery.isLoading,
    riskData: riskQuery.data ?? null,
    riskLoading: riskQuery.isLoading,
    saveInjuries: saveMutation.mutateAsync,
    saving: saveMutation.isPending,
  };
}
