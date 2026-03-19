import { z } from "zod";
import { mockPlayers, type Player } from "@/lib/mockData";

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

function simulateDelay<T>(data: T, ms = 500): Promise<T> {
  return new Promise((resolve) => setTimeout(() => resolve(data), ms));
}

export type SortField = "vsi" | "name" | "age";
export type SortDir = "asc" | "desc";

export async function fetchRankedPlayers(sortBy: SortField = "vsi", dir: SortDir = "desc"): Promise<Player[]> {
  const parsed = z.array(PlayerSchema).safeParse(mockPlayers);
  if (!parsed.success) {
    throw new Error(`Datos de ranking inválidos: ${parsed.error.issues[0]?.message}`);
  }

  const players = [...(parsed.data as Player[])];
  players.sort((a, b) => {
    const mul = dir === "desc" ? -1 : 1;
    if (sortBy === "vsi") return mul * (a.vsi - b.vsi);
    if (sortBy === "age") return mul * (a.age - b.age);
    return mul * a.name.localeCompare(b.name);
  });

  return simulateDelay(players);
}
