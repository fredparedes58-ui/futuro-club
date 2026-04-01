/**
 * useUsageAnalytics — Stats de uso para el Director Dashboard
 */

import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/context/AuthContext";
import { PlayerService } from "@/services/real/playerService";
import { SubscriptionService } from "@/services/real/subscriptionService";
import { StorageService } from "@/services/real/storageService";
import { MatchEventsService } from "@/services/real/matchEventsService";
import { PLAN_LIMITS } from "@/services/real/subscriptionService";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface PlayerActivity {
  playerId: string;
  playerName: string;
  visits: number;
  eventsCount: number;
  lastActivity: string | null;
}

export interface UsageAnalytics {
  // Plan
  plan: string;
  playerCount: number;
  playerLimit: number;
  analysesUsed: number;
  analysesLimit: number;

  // Jugadores más activos
  topPlayers: PlayerActivity[];

  // Alertas
  alerts: string[];

  // Drills completados (approximation from storage)
  drillsCompleted: number;
}

// ─── Helper: registrar visita a jugador ──────────────────────────────────────

const PLAYER_VISITS_KEY = "player_visits";

export function recordPlayerVisit(playerId: string): void {
  const visits = StorageService.get<Record<string, { count: number; last: string }>>(
    PLAYER_VISITS_KEY,
    {}
  );
  const entry = visits[playerId] ?? { count: 0, last: "" };
  visits[playerId] = { count: entry.count + 1, last: new Date().toISOString() };
  StorageService.set(PLAYER_VISITS_KEY, visits);
}

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useUsageAnalytics() {
  const { user } = useAuth();

  return useQuery<UsageAnalytics>({
    queryKey: ["usage-analytics", user?.id],
    queryFn: (): UsageAnalytics => {
      const sub = SubscriptionService.getCurrent();
      const limits = PLAN_LIMITS[sub.plan];
      const players = PlayerService.getAll();
      const allEvents = MatchEventsService.getAll();
      const visits = StorageService.get<Record<string, { count: number; last: string }>>(
        PLAYER_VISITS_KEY,
        {}
      );

      // Top players por visitas + eventos
      const topPlayers: PlayerActivity[] = players
        .map((p) => ({
          playerId: p.id,
          playerName: p.name,
          visits: visits[p.id]?.count ?? 0,
          eventsCount: allEvents.filter((e) => e.playerId === p.id).length,
          lastActivity: visits[p.id]?.last ?? null,
        }))
        .sort((a, b) => (b.visits + b.eventsCount) - (a.visits + a.eventsCount))
        .slice(0, 5);

      // Alertas
      const alerts: string[] = [];
      const analysesUsed = SubscriptionService.getAnalysesUsedThisMonth();
      const analysesLimit = limits.analyses >= 9999 ? Infinity : limits.analyses;
      const playerLimit = limits.players >= 9999 ? Infinity : limits.players;

      if (analysesLimit !== Infinity && analysesUsed / analysesLimit >= 0.8) {
        alerts.push(`Análisis IA: ${analysesUsed}/${analysesLimit} usados este mes`);
      }
      if (playerLimit !== Infinity && players.length / playerLimit >= 0.8) {
        alerts.push(`Jugadores: ${players.length}/${playerLimit} del plan`);
      }

      // Jugadores sin eventos en 30 días
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const stale = players.filter((p) => {
        const lastVisit = visits[p.id]?.last;
        return !lastVisit || lastVisit < thirtyDaysAgo;
      });
      if (stale.length > 0) {
        alerts.push(`${stale.length} jugador${stale.length > 1 ? "es" : ""} sin actividad en 30 días`);
      }

      return {
        plan: sub.plan,
        playerCount: players.length,
        playerLimit: limits.players >= 9999 ? -1 : limits.players,
        analysesUsed,
        analysesLimit: limits.analyses >= 9999 ? -1 : limits.analyses,
        topPlayers,
        alerts,
        drillsCompleted: StorageService.get<number>("drills_completed_count", 0),
      };
    },
    staleTime: 60 * 1000,
    enabled: !!user,
  });
}
