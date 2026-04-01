import { useQuery } from "@tanstack/react-query";
import { fetchDashboardStats, fetchTrendingPlayers, fetchLiveMatches } from "@/services/dashboardService";

const STALE = 1000 * 60 * 5;

export function useDashboardStats() {
  return useQuery({
    queryKey: ["dashboard-stats"],
    queryFn: fetchDashboardStats,
    staleTime: STALE,
  });
}

export function useTrendingPlayers() {
  return useQuery({
    queryKey: ["trending-players"],
    queryFn: fetchTrendingPlayers,
    staleTime: STALE,
    retry: 2,
  });
}

export function useLiveMatches() {
  return useQuery({
    queryKey: ["live-matches"],
    queryFn: fetchLiveMatches,
    staleTime: 1000 * 60, // 60s
    refetchInterval: 1000 * 60, // auto-refresh cada 60s
    retry: 2,
  });
}
