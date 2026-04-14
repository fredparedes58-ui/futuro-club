import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { fetchRoleProfile, fetchPositionFit, fetchArchetypes, fetchAuditIndicators, recalculateWithPosition } from "@/services/roleProfileService";

const STALE_TIME = 1000 * 60 * 5; // 5 minutes

/**
 * Fetches the role profile for a player.
 * If positionOverride is provided, recalculates the profile with that position forced to #1.
 */
export function useRoleProfile(playerId: string | undefined, positionOverride?: string | null) {
  const query = useQuery({
    queryKey: ["role-profile", playerId],
    queryFn: () => fetchRoleProfile(playerId!),
    enabled: !!playerId,
    staleTime: STALE_TIME,
    retry: 2,
  });

  const data = useMemo(() => {
    if (!query.data) return query.data; // preserve undefined/null from react-query
    if (!positionOverride) return query.data;
    return recalculateWithPosition(query.data, positionOverride);
  }, [query.data, positionOverride]);

  return { ...query, data };
}

export function usePositionFit(playerId: string | undefined) {
  return useQuery({
    queryKey: ["position-fit", playerId],
    queryFn: () => fetchPositionFit(playerId!),
    enabled: !!playerId,
    staleTime: STALE_TIME,
  });
}

export function useArchetypes(playerId: string | undefined) {
  return useQuery({
    queryKey: ["archetypes", playerId],
    queryFn: () => fetchArchetypes(playerId!),
    enabled: !!playerId,
    staleTime: STALE_TIME,
  });
}

export function useAuditIndicators(playerId: string | undefined, runId?: string) {
  return useQuery({
    queryKey: ["audit-indicators", playerId, runId],
    queryFn: () => fetchAuditIndicators(playerId!, runId),
    enabled: !!playerId,
    staleTime: STALE_TIME,
  });
}
