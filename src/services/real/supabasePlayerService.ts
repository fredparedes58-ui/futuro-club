/**
 * VITAS — Supabase Player Sync Service
 * DETERMINISTA — sin IA.
 *
 * Extiende PlayerService con sincronización cloud.
 * Estrategia:
 *   - localStorage como caché local inmediata
 *   - Supabase como fuente de verdad en cloud
 *   - Optimistic updates: local primero, luego sync background
 *   - Al hacer login: pull desde Supabase → merge local
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { PlayerService, type Player, type CreatePlayerInput } from "./playerService";

export const SupabasePlayerService = {

  // ── PULL: Supabase → localStorage ──────────────────────────────────
  async pullAll(userId: string): Promise<Player[]> {
    if (!SUPABASE_CONFIGURED) return PlayerService.getAll();

    try {
      const { data, error } = await supabase
        .from("players")
        .select("id, data")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });

      if (error) throw error;

      if (!data || data.length === 0) {
        // Cloud vacío → push los locales al cloud
        await this.pushAll(userId);
        return PlayerService.getAll();
      }

      // Merge: cloud gana en caso de conflicto (updated_at más reciente)
      const cloudPlayers = data.map((row) => row.data as Player);
      const localPlayers = PlayerService.getAll();
      const localMap = new Map(localPlayers.map((p) => [p.id, p]));
      const cloudMap = new Map(cloudPlayers.map((p) => [p.id, p]));

      const merged: Player[] = [];

      // Cloud players (toman precedencia)
      for (const cp of cloudPlayers) {
        const lp = localMap.get(cp.id);
        if (!lp || cp.updatedAt >= lp.updatedAt) {
          merged.push(cp);
        } else {
          merged.push(lp); // Local más nuevo
        }
      }

      // Local players que no están en cloud
      for (const lp of localPlayers) {
        if (!cloudMap.has(lp.id)) {
          merged.push(lp);
          // Push al cloud en background
          this.pushOne(userId, lp).catch(console.warn);
        }
      }

      // Actualizar localStorage con el merge
      const { StorageService } = await import("./storageService");
      StorageService.set("players", merged);
      return merged;
    } catch (err) {
      console.warn("[SupabasePlayerService] pullAll failed:", err);
      return PlayerService.getAll();
    }
  },

  // ── PUSH ALL: localStorage → Supabase ──────────────────────────────
  async pushAll(userId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;

    const players = PlayerService.getAll();
    if (players.length === 0) return;

    try {
      const rows = players.map((p) => ({
        id: p.id,
        user_id: userId,
        data: p,
        updated_at: p.updatedAt,
      }));

      const { error } = await supabase
        .from("players")
        .upsert(rows, { onConflict: "id" });

      if (error) throw error;
    } catch (err) {
      console.warn("[SupabasePlayerService] pushAll failed:", err);
    }
  },

  // ── PUSH ONE: single player → Supabase ────────────────────────────
  async pushOne(userId: string, player: Player): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;

    try {
      const { error } = await supabase
        .from("players")
        .upsert({
          id: player.id,
          user_id: userId,
          data: player,
          updated_at: player.updatedAt,
        }, { onConflict: "id" });

      if (error) throw error;
    } catch (err) {
      console.warn("[SupabasePlayerService] pushOne failed:", err);
    }
  },

  // ── DELETE ONE: Supabase ───────────────────────────────────────────
  async deleteOne(userId: string, playerId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;

    try {
      const { error } = await supabase
        .from("players")
        .delete()
        .eq("id", playerId)
        .eq("user_id", userId);

      if (error) throw error;
    } catch (err) {
      console.warn("[SupabasePlayerService] deleteOne failed:", err);
    }
  },

  // ── CREATE (local + background sync) ──────────────────────────────
  async create(userId: string, input: CreatePlayerInput): Promise<Player> {
    const player = PlayerService.create(input);
    this.pushOne(userId, player).catch(console.warn); // background
    return player;
  },

  // ── UPDATE METRICS (local + background sync) ──────────────────────
  async updateMetrics(
    userId: string,
    id: string,
    metrics: Player["metrics"]
  ): Promise<Player | null> {
    const updated = PlayerService.updateMetrics(id, metrics);
    if (updated) this.pushOne(userId, updated).catch(console.warn);
    return updated;
  },

  // ── DELETE (local + background sync) ──────────────────────────────
  async delete(userId: string, id: string): Promise<boolean> {
    const deleted = PlayerService.delete(id);
    if (deleted) this.deleteOne(userId, id).catch(console.warn);
    return deleted;
  },
};
