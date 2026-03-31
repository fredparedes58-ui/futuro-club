import { type Player } from "@/lib/mockData";
import { PlayerService } from "@/services/real/playerService";
import { adaptPlayerForUI } from "@/services/real/adapters";

export type SortField = "vsi" | "name" | "age";
export type SortDir = "asc" | "desc";

export async function fetchRankedPlayers(
  sortBy: SortField = "vsi",
  dir: SortDir = "desc"
): Promise<Player[]> {
  PlayerService.seedIfEmpty();
  const players = PlayerService.getAll();
  const sorted = PlayerService.sort(players, sortBy, dir);
  return sorted.map(adaptPlayerForUI) as unknown as Player[];
}
