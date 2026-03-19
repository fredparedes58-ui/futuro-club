import { useQuery } from "@tanstack/react-query";
import { fetchScoutInsights } from "@/services/scoutService";

export function useScoutInsights() {
  return useQuery({
    queryKey: ["scout-insights"],
    queryFn: fetchScoutInsights,
    staleTime: 1000 * 60 * 5,
    retry: 2,
  });
}
