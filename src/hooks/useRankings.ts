import { useQuery } from "@tanstack/react-query";
import {
  fetchRankedPlayers,
  type SortField,
  type SortDir,
  type RankingsFilters,
  type RankingsResponse,
} from "@/services/rankingsService";

export function useRankedPlayers(
  sortBy: SortField = "vsi",
  dir: SortDir = "desc",
  filters: RankingsFilters = {},
  limit = 50,
  offset = 0
) {
  return useQuery<RankingsResponse>({
    queryKey: ["ranked-players", sortBy, dir, filters, limit, offset],
    queryFn: () => fetchRankedPlayers(sortBy, dir, filters, limit, offset),
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}
