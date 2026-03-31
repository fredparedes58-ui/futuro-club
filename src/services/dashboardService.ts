import { mockMatches, type Player, type LiveMatch } from "@/lib/mockData";
import { PlayerService } from "@/services/real/playerService";
import { adaptPlayerForUI, computeDashboardStats } from "@/services/real/adapters";

// ─── Dashboard service ───────────────────────────────────────────────────

export interface DashboardStats {
  activePlayers: number;
  drillsCompleted: number;
  avgVsi: number;
  hiddenTalents: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  PlayerService.seedIfEmpty();
  const players = PlayerService.getAll();
  return computeDashboardStats(players);
}

export async function fetchTrendingPlayers(): Promise<Player[]> {
  PlayerService.seedIfEmpty();
  const players = PlayerService.getAll();
  const adapted = players.map(adaptPlayerForUI);
  return adapted
    .filter((p) => p.trending === "up")
    .slice(0, 4) as unknown as Player[];
}

export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  // Partidos en vivo — se conectarán a datos reales en Fase 3
  return mockMatches as LiveMatch[];
}
