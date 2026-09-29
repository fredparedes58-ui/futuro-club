/**
 * VITAS — Supabase Player Sync Service
 * DETERMINISTA — sin IA.
 *
 * Estrategia Supabase-first (Semana 4):
 *   - Supabase es la fuente de verdad
 *   - localStorage como caché de lectura rápida
 *   - Writes: Supabase primero → localStorage después
 *   - Offline: localStorage + SyncQueue → flush cuando online
 *   - Pull: Supabase reemplaza localStorage (cloud es autoritativo), salvo los
 *     jugadores con cambios locales pendientes en SyncQueue (no se pisan)
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { PlayerService, type Player, type CreatePlayerInput } from "./playerService";
import { SyncQueueService } from "./syncQueueService";
import { OrganizationService } from "./organizationService";
import { toIsoBirthDate } from "@/lib/shared/birthDate";

// ── Resultado honesto de un guardado ─────────────────────────────────────────
//   synced     → escrito en localStorage Y en Supabase.
//   local_only → Supabase no configurado: localStorage ES la persistencia.
//   queued     → escrito en localStorage, la nube falló → en SyncQueue
//                («pendiente de sincronizar», visible en la UI). NO es «guardado».
export type PlayerPersistStatus = "synced" | "local_only" | "queued";
export interface PlayerPersistResult {
  status: PlayerPersistStatus;
  error?: string;
}
export type PlayerSaveResult =
  | { status: "not_found"; player: null }
  | (PlayerPersistResult & { player: Player });

// ── Helper: extraer columnas relacionales de un Player (024_normalize_players) ─
export function playerToColumns(p: Player) {
  return {
    name: p.name,
    age: p.age,
    position: p.position,
    secondary_positions: p.secondaryPositions ?? [],   // multi-posición · array text[]
    foot: p.foot,
    height_cm: p.height,
    weight_kg: p.weight,
    sitting_height: p.sittingHeight ?? null,
    leg_length: p.legLength ?? null,
    competitive_level: p.competitiveLevel ?? "Regional",
    minutes_played: p.minutesPlayed ?? 0,
    gender: p.gender ?? null, // sin sexo registrado ⇒ null (no asumir masculino; invariante #5)
    metric_speed: p.metrics?.speed ?? 0,
    metric_technique: p.metrics?.technique ?? 0,
    metric_vision: p.metrics?.vision ?? 0,
    metric_stamina: p.metrics?.stamina ?? 0,
    metric_shooting: p.metrics?.shooting ?? 0,
    metric_defending: p.metrics?.defending ?? 0,
    vsi: p.vsi ?? null, // sin evaluar ⇒ null en la columna (no un 0 fabricado)
    vsi_history: p.vsiHistory ?? [],
    phv_category: p.phvCategory ?? null,
    phv_offset: p.phvOffset ?? null,
    // Fecha de nacimiento DEL JUGADOR → columna que usa el control RGPD de
    // consentimiento parental (036). Sin fecha válida ⇒ null (nunca inventada).
    birth_date: toIsoBirthDate(p.birthDate),
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

      // Supabase-first: cloud reemplaza localStorage — SALVO los jugadores con
      // cambios locales aún sin sincronizar (cualquier op en SyncQueue: la cola
      // solo guarda lo que NO llegó a la nube). Pisar esos con la copia de la nube
      // borraría en silencio una edición local (p.ej. la fecha de nacimiento).
      // (Antes se filtraba por `op.status === "pending"`, un campo que SyncQueueItem
      // no tiene → nunca se preservaba nada.)
      const cloudPlayers = data.map((row) => row.data as Player);
      const pendingOps = SyncQueueService.getQueue().filter((op) => op.entity === "player");

      let result = cloudPlayers;
      if (pendingOps.length > 0) {
        const pendingIds = new Set(pendingOps.map((op) => op.entityId));
        const pendingDeletes = new Set(
          pendingOps.filter((op) => op.action === "delete").map((op) => op.entityId),
        );
        const localById = new Map(PlayerService.getAll().map((p) => [p.id, p] as const));
        const cloudIds = new Set(cloudPlayers.map((p) => p.id));
        result = cloudPlayers
          // borrado local pendiente: la nube no lo resucita
          .filter((p) => !pendingDeletes.has(p.id))
          // edición local pendiente: gana la copia local (es la más reciente)
          .map((p) => (pendingIds.has(p.id) ? localById.get(p.id) ?? p : p));
        // altas locales pendientes que aún no están en la nube
        for (const id of pendingIds) {
          if (pendingDeletes.has(id) || cloudIds.has(id)) continue;
          const lp = localById.get(id);
          if (lp) result.push(lp);
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
  // LANZA si la nube falla. Antes se tragaba el error, así que ni los catch con
  // SyncQueue.enqueue de create/updateMetrics/updatePHV ni el reintento de la
  // cola (useSupabaseSync) llegaban a ejecutarse: un fallo se daba por «guardado».
  async pushOne(userId: string, player: Player): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;

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

    if (error) {
      console.warn("[SupabasePlayerService] pushOne failed:", error);
      throw new Error(`players upsert failed: ${error.message ?? String(error)}`);
    }

    // Invalidate AI cache for this player (non-blocking)
    import("@/services/real/agentService").then(({ AgentService }) =>
      AgentService.invalidateCacheForPlayer(player.id)
    ).catch(() => {});
  },

  // ── PERSIST OR QUEUE: sube un jugador ya guardado en local; si la nube falla,
  //    lo encola en SyncQueue. Nunca lanza: devuelve el estado REAL para que la
  //    UI solo diga «guardado» cuando lo está (o «pendiente de sincronizar»).
  async persistOrQueue(
    userId: string | null | undefined,
    player: Player,
    action: "create" | "update" = "update",
  ): Promise<PlayerPersistResult> {
    if (!SUPABASE_CONFIGURED) return { status: "local_only" };
    if (!userId) {
      // Nube configurada pero sin sesión: el cambio NO está en la nube.
      SyncQueueService.enqueue(action, "player", player.id, player);
      return { status: "queued", error: "no_session" };
    }
    try {
      await this.pushOne(userId, player);
      // La fila completa ya está arriba: una op vieja en cola la pisaría al reprocesarse.
      SyncQueueService.removeUpsertsFor("player", player.id);
      return { status: "synced" };
    } catch (err) {
      SyncQueueService.enqueue(action, "player", player.id, player);
      return { status: "queued", error: err instanceof Error ? err.message : String(err) };
    }
  },

  // ── SAVE PROFILE: campos de identidad/antropometría (fecha de nacimiento del
  //    jugador, alturas parentales, …) → localStorage → nube (o cola).
  //    not_found ⇒ NO se guardó nada (el jugador no está en la caché local).
  async saveProfile(
    userId: string | null | undefined,
    id: string,
    partial: Parameters<typeof PlayerService.update>[1],
  ): Promise<PlayerSaveResult> {
    const updated = await PlayerService.update(id, partial);
    if (!updated) return { status: "not_found", player: null };
    const persisted = await this.persistOrQueue(userId, updated, "update");
    return { ...persisted, player: updated };
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
    metrics: NonNullable<Player["metrics"]>
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
