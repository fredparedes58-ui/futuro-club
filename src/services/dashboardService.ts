import { z } from "zod";
import { mockPlayers, mockMatches, type Player, type LiveMatch } from "@/lib/mockData";

// ─── Zod schemas ─────────────────────────────────────────────────────────

const PlayerSchema = z.object({
  id: z.string(),
  name: z.string(),
  age: z.number().int().positive(),
  position: z.string(),
  positionShort: z.string(),
  academy: z.string(),
  vsi: z.number().min(0).max(99),
  phvOffset: z.number(),
  phvCategory: z.enum(["early", "on-time", "late"]),
  trending: z.enum(["up", "down", "stable"]),
  avatar: z.string(),
  image: z.string(),
  stats: z.object({
    speed: z.number(), technique: z.number(), vision: z.number(),
    stamina: z.number(), shooting: z.number(), defending: z.number(),
  }),
  recentDrills: z.number().int().min(0),
  lastActive: z.string(),
});

const MatchSchema = z.object({
  id: z.string(),
  homeTeam: z.string(),
  awayTeam: z.string(),
  score: z.tuple([z.number(), z.number()]),
  minute: z.number().int().min(0),
  status: z.enum(["live", "upcoming", "finished"]),
  playersTracked: z.number().int().min(0),
  topPerformer: z.string(),
  topVsi: z.number(),
});

// ─── Helpers ─────────────────────────────────────────────────────────────

function simulateDelay<T>(data: T, ms = 600): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

// ─── Dashboard service ───────────────────────────────────────────────────

export interface DashboardStats {
  activePlayers: number;
  drillsCompleted: number;
  avgVsi: number;
  hiddenTalents: number;
}

export async function fetchDashboardStats(): Promise<DashboardStats> {
  const stats: DashboardStats = {
    activePlayers: 147,
    drillsCompleted: 38,
    avgVsi: 76.4,
    hiddenTalents: 5,
  };
  return simulateDelay(stats);
}

export async function fetchTrendingPlayers(): Promise<Player[]> {
  const players = mockPlayers.filter(p => p.trending === "up").slice(0, 4);
  const parsed = z.array(PlayerSchema).safeParse(players);
  if (!parsed.success) {
    throw new Error(`Datos de jugadores inválidos: ${parsed.error.issues[0]?.message}`);
  }
  return simulateDelay(parsed.data as Player[]);
}

export async function fetchLiveMatches(): Promise<LiveMatch[]> {
  const parsed = z.array(MatchSchema).safeParse(mockMatches);
  if (!parsed.success) {
    throw new Error(`Datos de partidos inválidos: ${parsed.error.issues[0]?.message}`);
  }
  return simulateDelay(parsed.data as LiveMatch[]);
}
