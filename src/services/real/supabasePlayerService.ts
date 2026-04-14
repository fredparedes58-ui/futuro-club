/**
 * VITAS — Supabase Player Sync Service
 * DETERMINISTA — sin IA.
 *
 * Estrategia Supabase-first (Semana 4):
 *   - Supabase es la fuente de verdad
 *   - localStorage como caché de lectura rápida
 *   - Writes: Supabase primero → localStorage después
 *   - Offline: localStorage + SyncQueue → flush cuando online
 *   - Pull: Supabase reemplaza localStorage (cloud es autoritativo)
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { PlayerService, type Player, type CreatePlayerInput } from "./playerService";
import { SyncQueueService } from "./syncQueueService";
import { OrganizationService } from "./organizationService";

// ── Helper: extraer columnas relacionales de un Player (024_normalize_players) ─
function playerToColumns(p: Player) {
  return {
    name: p.name,
    age: p.age,
    position: p.position,
    foot: p.foot,
    height_cm: p.height,
    weight_kg: p.weight,
    sitting_height: p.sittingHeight ?? null,
    leg_length: p.legLength ?? null,
    competitive_level: p.competitiveLevel ?? "Regional",
    minutes_played: p.minutesPlayed ?? 0,
    gender: p.gender ?? "M",
    metric_speed: p.metrics?.speed ?? 0,
    metric_technique: p.metrics?.technique ?? 0,
    metric_vision: p.metrics?.vision ?? 0,
    metric_stamina: p.metrics?.stamina ?? 0,
    metric_shooting: p.metrics?.shooting ?? 0,
    metric_defending: p.metrics?.defending ?? 0,
    vsi: p.vsi ?? 0,
    vsi_history: p.vsiHistory ?? [],
    phv_category: p.phvCategory ?? null,
    phv_offset: p.phvOffset ?? null,
  };
}

export const SupabasePlayerService = {

  // ── PULL: Supabase → localStorage (Supabase-first: cloud es autoritativo) ──
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
        // Cloud vacío — verificar si hay jugadores locales pendientes de sync
        const localPlayers = PlayerService.getAll();
        const pending = SyncQueueService.pendingCount();
        if (localPlayers.length > 0 && pending > 0) {
          // Hay operaciones pendientes — mantener locales hasta que se sincronicen
          return localPlayers;
        }
        // Cloud vacío y sin pendientes = el usuario no tiene jugadores
        const { StorageService } = await import("./storageService");
        StorageService.set("players", []);
        return [];
      }

      // Supabase-first: cloud reemplaza localStorage
      const cloudPlayers = data.map((row) => row.data as Player);

      // Excepción: si hay operaciones pendientes en SyncQueue, preservar esos locales
      const pending = SyncQueueService.getQueue().filter(
        (op) => op.entity === "player" && op.status === "pending"
      );
      const pendingIds = new Set(pending.map((op) => op.entityId));

      let result = cloudPlayers;
      if (pendingIds.size > 0) {
        const localPlayers = PlayerService.getAll();
        const localPending = localPlayers.filter((p) => pendingIds.has(p.id));
        const cloudIds = new Set(cloudPlayers.map((p) => p.id));
        // Agregar solo los locales pendientes que no están en cloud
        for (const lp of localPending) {
          if (!cloudIds.has(lp.id)) {
            result.push(lp);
          }
        }
      }

      // Reemplazar localStorage con datos del cloud
      const { StorageService } = await import("./storageService");
      StorageService.set("players", result);
      return result;
    } catch (err) {
      console.warn("[SupabasePlayerService] pullAll failed — using local cache:", err);
      return PlayerService.getAll();
    }
  },

  // ── PUSH ALL: localStorage → Supabase ──────────────────────────────
  async pushAll(userId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;

    const players = PlayerService.getAll();
    if (players.length === 0) return;

    try {
      const orgId = OrganizationService.getOrgId();
      const rows = players.map((p) => ({
        id: p.id,
        user_id: userId,
        ...(orgId ? { org_id: orgId } : {}),
        data: p,
        updated_at: p.updatedAt,
        ...playerToColumns(p),
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
      const orgId = OrganizationService.getOrgId();
      const { error } = await supabase
        .from("players")
        .upsert({
          id: player.id,
          user_id: userId,
          ...(orgId ? { org_id: orgId } : {}),
          data: player,
          updated_at: player.updatedAt,
          ...playerToColumns(player),
        }, { onConflict: "id" });

      if (error) throw error;

      // Invalidate AI cache for this player (non-blocking)
      import("@/services/real/agentService").then(({ AgentService }) =>
        AgentService.invalidateCacheForPlayer(player.id)
      ).catch(() => {});
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

      // Invalidate AI cache for this player (non-blocking)
      import("@/services/real/agentService").then(({ AgentService }) =>
        AgentService.invalidateCacheForPlayer(playerId)
      ).catch(() => {});
    } catch (err) {
      console.warn("[SupabasePlayerService] deleteOne failed:", err);
    }
  },

  // ── CREATE (Supabase-first → localStorage cache) ──────────────────
  async create(userId: string, input: CreatePlayerInput): Promise<Player> {
    // Crear el player localmente para generar id, vsi, timestamps
    const player = PlayerService.create(input);

    if (SUPABASE_CONFIGURED) {
      try {
        await this.pushOne(userId, player);
        // Supabase OK → localStorage ya está actualizado por PlayerService.create()
      } catch (err) {
        console.warn("[SupabasePlayerService] create: Supabase failed, queuing:", err);
        SyncQueueService.enqueue("create", "player", player.id, player);
      }
    }

    return player;
  },

  // ── UPDATE METRICS (Supabase-first → localStorage cache) ──────────
  async updateMetrics(
    userId: string,
    id: string,
    metrics: Player["metrics"]
  ): Promise<Player | null> {
    // Actualizar localStorage primero (optimistic — UI necesita respuesta inmediata)
    const updated = await PlayerService.updateMetrics(id, metrics);
    if (!updated) return null;

    if (SUPABASE_CONFIGURED) {
      try {
        await this.pushOne(userId, updated);
      } catch (err) {
        console.warn("[SupabasePlayerService] updateMetrics: Supabase failed, queuing:", err);
        SyncQueueService.enqueue("update", "player", id, updated);
      }
    }

    return updated;
  },

  // ── UPDATE PHV (Supabase-first → localStorage cache) ──────────────
  async updatePHV(
    userId: string,
    id: string,
    phvCategory: Player["phvCategory"],
    phvOffset: number,
    adjustedVSI: number
  ): Promise<Player | null> {
    const updated = await PlayerService.updatePHV(id, phvCategory, phvOffset, adjustedVSI);
    if (!updated) return null;

    if (SUPABASE_CONFIGURED) {
      try {
        await this.pushOne(userId, updated);
      } catch (err) {
        console.warn("[SupabasePlayerService] updatePHV: Supabase failed, queuing:", err);
        SyncQueueService.enqueue("update", "player", id, updated);
      }
    }

    return updated;
  },

  // ── DELETE (Supabase-first → localStorage cache) ──────────────────
  async delete(userId: string, id: string): Promise<boolean> {
    // Eliminar de localStorage primero (optimistic — UI necesita respuesta inmediata)
    const deleted = PlayerService.delete(id);

    if (SUPABASE_CONFIGURED && deleted) {
      try {
        await this.deleteOne(userId, id);
      } catch (err) {
        console.warn("[SupabasePlayerService] delete: Supabase failed, queuing:", err);
        SyncQueueService.enqueue("delete", "player", id, null);
      }
    }

    return deleted;
  },
};
