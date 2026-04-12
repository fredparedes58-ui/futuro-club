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
  sittingHeight: z.number().min(30).max(130).optional(),
  legLength: z.number().min(30).max(130).optional(),
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

/**
 * Simple write-lock para evitar race conditions entre
 * updateMetrics() y updatePHV() ejecutados concurrentemente.
 * Si el lock está ocupado, espera hasta 500ms y reintenta.
 */
let _writeLock = false;
async function acquireWriteLock(): Promise<void> {
  const start = Date.now();
  while (_writeLock) {
    if (Date.now() - start > 500) {
      console.warn("[PlayerService] Write lock timeout — proceeding anyway");
      break;
    }
    await new Promise((r) => setTimeout(r, 10));
  }
  _writeLock = true;
}
function releaseWriteLock(): void {
  _writeLock = false;
}

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
   * Actualiza métricas de un jugador y recalcula VSI.
   * Usa write-lock para evitar race condition con updatePHV.
   */
  async updateMetrics(id: string, metrics: Player["metrics"]): Promise<Player | null> {
    await acquireWriteLock();
    try {
      const players = PlayerService.getAll();
      const idx = players.findIndex((p) => p.id === id);
      if (idx === -1) return null;

      const previous = players[idx];
      const newVSI = MetricsService.calculateVSI(metrics);

      const updated: Player = {
        ...previous,
        metrics,
        vsi: newVSI,
        vsiHistory: [...(previous.vsiHistory ?? []), newVSI].slice(-10),
        updatedAt: new Date().toISOString(),
      };

      players[idx] = updated;
      StorageService.set(STORAGE_KEY, players);
      return updated;
    } finally {
      releaseWriteLock();
    }
  },

  /**
   * Actualiza datos PHV calculados por el agente.
   * Usa write-lock para evitar race condition con updateMetrics.
   */
  async updatePHV(id: string, phvCategory: Player["phvCategory"], phvOffset: number, adjustedVSI: number): Promise<Player | null> {
    await acquireWriteLock();
    try {
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
    } finally {
      releaseWriteLock();
    }
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
   * @deprecated REMOVED — Mock seed function eliminated to prevent fake data contamination.
   * Players must only be created by the user through onboarding or the add player form.
   * Kept as no-op to avoid breaking callers until all references are cleaned up.
   */
  seedIfEmpty(): void {
    // No-op — fake players removed. Real players come from user input or Supabase.
  },
};
