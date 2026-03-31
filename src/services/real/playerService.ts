/**
 * VITAS Player Service — DETERMINISTA
 * CRUD completo de jugadores con localStorage.
 * No usa IA. Lógica pura de base de datos local.
 */

import { z } from "zod";
import { StorageService } from "./storageService";
import { MetricsService } from "./metricsService";

// ─── Schema del jugador ───────────────────
export const PlayerSchema = z.object({
  id: z.string(),
  name: z.string().min(2).max(80),
  age: z.number().min(8).max(21),
  position: z.string(),
  foot: z.enum(["right", "left", "both"]),
  height: z.number().min(100).max(220),
  weight: z.number().min(20).max(120),
  competitiveLevel: z.string().default("Regional"),
  minutesPlayed: z.number().default(0),
  metrics: z.object({
    speed: z.number().min(0).max(100),
    technique: z.number().min(0).max(100),
    vision: z.number().min(0).max(100),
    stamina: z.number().min(0).max(100),
    shooting: z.number().min(0).max(100),
    defending: z.number().min(0).max(100),
  }),
  vsi: z.number().default(0),
  vsiHistory: z.array(z.number()).default([]),
  gender: z.enum(["M", "F"]).default("M"),
  phvCategory: z.enum(["early", "ontme", "late"]).optional(),
  phvOffset: z.number().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type Player = z.infer<typeof PlayerSchema>;
export type CreatePlayerInput = Omit<Player, "id" | "vsi" | "vsiHistory" | "createdAt" | "updatedAt">;

const STORAGE_KEY = "players";

export const PlayerService = {
  /**
   * Obtiene todos los jugadores
   */
  getAll(): Player[] {
    return StorageService.get<Player[]>(STORAGE_KEY, []);
  },

  /**
   * Obtiene un jugador por ID
   */
  getById(id: string): Player | null {
    const players = PlayerService.getAll();
    return players.find((p) => p.id === id) ?? null;
  },

  /**
   * Crea un nuevo jugador y calcula su VSI inicial
   */
  create(input: CreatePlayerInput): Player {
    const players = PlayerService.getAll();
    const vsi = MetricsService.calculateVSI(input.metrics);
    const now = new Date().toISOString();

    const newPlayer: Player = {
      ...input,
      id: `p${Date.now()}`,
      vsi,
      vsiHistory: [vsi],
      createdAt: now,
      updatedAt: now,
    };

    PlayerSchema.parse(newPlayer); // Valida antes de guardar
    StorageService.set(STORAGE_KEY, [...players, newPlayer]);
    return newPlayer;
  },

  /**
   * Actualiza métricas de un jugador y recalcula VSI
   */
  updateMetrics(id: string, metrics: Player["metrics"]): Player | null {
    const players = PlayerService.getAll();
    const idx = players.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    const previous = players[idx];
    const newVSI = MetricsService.calculateVSI(metrics);

    const updated: Player = {
      ...previous,
      metrics,
      vsi: newVSI,
      vsiHistory: [...(previous.vsiHistory ?? []), newVSI].slice(-10), // máximo 10 históricos
      updatedAt: new Date().toISOString(),
    };

    players[idx] = updated;
    StorageService.set(STORAGE_KEY, players);
    return updated;
  },

  /**
   * Actualiza datos PHV calculados por el agente
   */
  updatePHV(id: string, phvCategory: Player["phvCategory"], phvOffset: number, adjustedVSI: number): Player | null {
    const players = PlayerService.getAll();
    const idx = players.findIndex((p) => p.id === id);
    if (idx === -1) return null;

    players[idx] = {
      ...players[idx],
      phvCategory,
      phvOffset,
      vsi: adjustedVSI,
      updatedAt: new Date().toISOString(),
    };

    StorageService.set(STORAGE_KEY, players);
    return players[idx];
  },

  /**
   * Elimina un jugador
   */
  delete(id: string): boolean {
    const players = PlayerService.getAll();
    const filtered = players.filter((p) => p.id !== id);
    if (filtered.length === players.length) return false;
    StorageService.set(STORAGE_KEY, filtered);
    return true;
  },

  /**
   * Ordena jugadores por campo — DETERMINISTA puro
   */
  sort(players: Player[], by: "vsi" | "age" | "name", dir: "asc" | "desc"): Player[] {
    return [...players].sort((a, b) => {
      let diff = 0;
      if (by === "vsi") diff = a.vsi - b.vsi;
      else if (by === "age") diff = a.age - b.age;
      else diff = a.name.localeCompare(b.name);
      return dir === "asc" ? diff : -diff;
    });
  },

  /**
   * Obtiene todos los VSIs para cálculo de percentiles
   */
  getAllVSIs(): number[] {
    return PlayerService.getAll().map((p) => p.vsi);
  },

  /**
   * Carga los jugadores mock iniciales si no hay datos
   */
  seedIfEmpty(): void {
    if (PlayerService.getAll().length > 0) return;

    const mockPlayers: CreatePlayerInput[] = [
      {
        name: "Lucas Moreno", age: 15, position: "RW", foot: "right",
        height: 172, weight: 62, competitiveLevel: "Regional", minutesPlayed: 840,
        metrics: { speed: 82, technique: 74, vision: 71, stamina: 76, shooting: 78, defending: 45 },
      },
      {
        name: "Alejandro Ruiz", age: 14, position: "DM", foot: "right",
        height: 168, weight: 59, competitiveLevel: "Regional", minutesPlayed: 620,
        metrics: { speed: 65, technique: 70, vision: 78, stamina: 80, shooting: 50, defending: 82 },
      },
      {
        name: "Daniel Torres", age: 16, position: "ST", foot: "left",
        height: 178, weight: 68, competitiveLevel: "Provincial", minutesPlayed: 1050,
        metrics: { speed: 79, technique: 76, vision: 68, stamina: 72, shooting: 85, defending: 40 },
      },
      {
        name: "Pablo García", age: 15, position: "LCM", foot: "both",
        height: 170, weight: 61, competitiveLevel: "Regional", minutesPlayed: 540,
        metrics: { speed: 72, technique: 80, vision: 83, stamina: 74, shooting: 62, defending: 60 },
      },
      {
        name: "Mateo Fernández", age: 13, position: "LB", foot: "left",
        height: 160, weight: 52, competitiveLevel: "Regional", minutesPlayed: 380,
        metrics: { speed: 76, technique: 66, vision: 65, stamina: 71, shooting: 44, defending: 75 },
      },
      {
        name: "Iker Navarro", age: 16, position: "RCB", foot: "right",
        height: 182, weight: 72, competitiveLevel: "Provincial", minutesPlayed: 920,
        metrics: { speed: 68, technique: 64, vision: 70, stamina: 78, shooting: 38, defending: 88 },
      },
    ];

    mockPlayers.forEach((p) => PlayerService.create(p));
  },
};
