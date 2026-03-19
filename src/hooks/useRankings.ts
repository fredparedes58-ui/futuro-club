import { useQuery } from "@tanstack/react-query";
import { fetchRankedPlayers, type SortField, type SortDir } from "@/services/rankingsService";

export function useRankedPlayers(sortBy: SortField = "vsi", dir: SortDir = "desc") {
  return useQuery({
    queryKey: ["ranked-players", sortBy, dir],
    queryFn: () => fetchRankedPlayers(sortBy, dir),
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}
