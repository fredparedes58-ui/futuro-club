/**
 * VITAS · Match Events Service
 * CRUD de eventos de partido para cálculo de VAEP.
 * localStorage-first (sin Supabase en Fase 3 inicial).
 */

import { z } from "zod";
import { StorageService } from "./storageService";

// ─── Types ────────────────────────────────────────────────────────────────────

export const EVENT_TYPES = [
  "pass", "shot", "dribble", "tackle", "press", "cross", "header",
] as const;

export const EVENT_ZONES = ["defensive", "middle", "offensive"] as const;

export type EventType = typeof EVENT_TYPES[number];
export type EventZone = typeof EVENT_ZONES[number];

export const MatchEventSchema = z.object({
  id:        z.string(),
  playerId:  z.string(),
  type:      z.enum(EVENT_TYPES),
  result:    z.enum(["success", "fail"]),
  minute:    z.number().min(1).max(120),
  matchDate: z.string(),   // ISO date "2026-04-01"
  xZone:     z.enum(EVENT_ZONES).optional(),
  createdAt: z.string(),
});

export type MatchEvent = z.infer<typeof MatchEventSchema>;
export type CreateMatchEventInput = Omit<MatchEvent, "id" | "createdAt">;

// ─── Service ──────────────────────────────────────────────────────────────────

const STORAGE_KEY = "match_events";

export const MatchEventsService = {
  getAll(): MatchEvent[] {
    return StorageService.get<MatchEvent[]>(STORAGE_KEY, []);
  },

  getByPlayerId(playerId: string): MatchEvent[] {
    return MatchEventsService.getAll()
      .filter((e) => e.playerId === playerId)
      .sort((a, b) => b.minute - a.minute); // most recent minute first
  },

  create(input: CreateMatchEventInput): MatchEvent {
    const all = MatchEventsService.getAll();
    const event: MatchEvent = {
      ...input,
      id:        `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      createdAt: new Date().toISOString(),
    };
    MatchEventSchema.parse(event); // throws on invalid data
    StorageService.set(STORAGE_KEY, [event, ...all]);
    return event;
  },

  delete(id: string): boolean {
    const all = MatchEventsService.getAll();
    const filtered = all.filter((e) => e.id !== id);
    if (filtered.length === all.length) return false;
    StorageService.set(STORAGE_KEY, filtered);
    return true;
  },

  deleteByPlayerId(playerId: string): void {
    const all = MatchEventsService.getAll().filter((e) => e.playerId !== playerId);
    StorageService.set(STORAGE_KEY, all);
  },

  count(playerId: string): number {
    return MatchEventsService.getByPlayerId(playerId).length;
  },
};
