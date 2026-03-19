import { useQuery } from "@tanstack/react-query";
import { fetchRoleProfile, fetchPositionFit, fetchArchetypes, fetchAuditIndicators } from "@/services/roleProfileService";

const STALE_TIME = 1000 * 60 * 5; // 5 minutes

export function useRoleProfile(playerId: string | undefined) {
  return useQuery({
    queryKey: ["role-profile", playerId],
    queryFn: () => fetchRoleProfile(playerId!),
    enabled: !!playerId,
    staleTime: STALE_TIME,
    retry: 2,
  });
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
