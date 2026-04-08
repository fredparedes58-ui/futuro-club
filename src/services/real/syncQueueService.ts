/**
 * VITAS · SyncQueueService
 *
 * Cola offline persistente para mutaciones que no pudieron sincronizarse.
 * Almacena operaciones pendientes en localStorage y las procesa en orden
 * FIFO cuando se recupera la conexión.
 *
 * También gestiona timestamps de última sincronización para delta sync.
 */

import { StorageService } from "./storageService";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export type SyncEntity = "player" | "video";
export type SyncAction = "create" | "update" | "delete";

export interface SyncQueueItem {
  id: string;
  action: SyncAction;
  entity: SyncEntity;
  entityId: string;
  data: unknown;
  timestamp: string; // ISO
  retries: number;
}

export interface SyncTimestamps {
  players: string | null;
  videos: string | null;
}

// ─── Storage Keys ────────────────────────────────────────────────────────────

const QUEUE_KEY      = "sync_queue";
const TIMESTAMPS_KEY = "sync_timestamps";

// ─── Service ─────────────────────────────────────────────────────────────────

export const SyncQueueService = {
  // ── Cola de operaciones pendientes ──────────────────────────────────────

  /** Obtener todas las operaciones pendientes */
  getQueue(): SyncQueueItem[] {
    return StorageService.get<SyncQueueItem[]>(QUEUE_KEY, []);
  },

  /** Número de operaciones pendientes */
  pendingCount(): number {
    return this.getQueue().length;
  },

  /** Encolar una operación para sincronizar cuando haya conexión */
  enqueue(action: SyncAction, entity: SyncEntity, entityId: string, data: unknown): void {
    const queue = this.getQueue();

    // Deduplicar: si ya hay una operación para el mismo entity+id, reemplazar
    const existing = queue.findIndex(
      (q) => q.entity === entity && q.entityId === entityId
    );

    const item: SyncQueueItem = {
      id: `${entity}-${entityId}-${Date.now()}`,
      action,
      entity,
      entityId,
      data,
      timestamp: new Date().toISOString(),
      retries: 0,
    };

    if (existing >= 0) {
      const existingAction = queue[existing].action;
      if (action === "delete") {
        // Delete cancela todo: si era un create local, simplemente quitar de la cola
        if (existingAction === "create") {
          queue.splice(existing, 1);
        } else {
          queue[existing] = item;
        }
      } else {
        // Mantener la acción original ("create" sigue como "create")
        // pero SIEMPRE usar los datos más recientes (merge update data)
        queue[existing] = {
          ...item,
          action: existingAction === "create" ? "create" : action,
          data: action === "update" && existingAction === "create"
            ? { ...(queue[existing].data as Record<string, unknown> ?? {}), ...(data as Record<string, unknown> ?? {}) }
            : data,
        };
      }
    } else {
      queue.push(item);
    }

    StorageService.set(QUEUE_KEY, queue);
  },

  /** Remover una operación procesada exitosamente */
  dequeue(itemId: string): void {
    const queue = this.getQueue().filter((q) => q.id !== itemId);
    StorageService.set(QUEUE_KEY, queue);
  },

  /** Incrementar retry count de un item fallido */
  incrementRetry(itemId: string): void {
    const queue = this.getQueue();
    const item = queue.find((q) => q.id === itemId);
    if (item) {
      item.retries += 1;
      StorageService.set(QUEUE_KEY, queue);
    }
  },

  /** Limpiar toda la cola */
  clearQueue(): void {
    StorageService.set(QUEUE_KEY, []);
  },

  /** Remover items con demasiados reintentos (>5). Logs para auditoría. */
  pruneStale(): number {
    const queue = this.getQueue();
    const stale = queue.filter((q) => q.retries > 5);
    const fresh = queue.filter((q) => q.retries <= 5);
    const pruned = stale.length;
    if (pruned > 0) {
      for (const item of stale) {
        console.warn(`[SyncQueue] Pruned stale item: ${item.action} ${item.entity}/${item.entityId} (${item.retries} retries)`);
      }
      StorageService.set(QUEUE_KEY, fresh);
    }
    return pruned;
  },

  // ── Timestamps de última sincronización (para delta sync) ──────────────

  /** Obtener timestamps de la última sincronización por entidad */
  getTimestamps(): SyncTimestamps {
    return StorageService.get<SyncTimestamps>(TIMESTAMPS_KEY, {
      players: null,
      videos: null,
    });
  },

  /** Actualizar timestamp de sincronización para una entidad */
  setTimestamp(entity: SyncEntity, timestamp: string): void {
    const ts = this.getTimestamps();
    ts[entity === "player" ? "players" : "videos"] = timestamp;
    StorageService.set(TIMESTAMPS_KEY, ts);
  },

  /** Obtener timestamp de última sync para una entidad */
  getLastSync(entity: SyncEntity): string | null {
    const ts = this.getTimestamps();
    return ts[entity === "player" ? "players" : "videos"];
  },

  /** Resetear todos los timestamps (forzar full pull) */
  resetTimestamps(): void {
    StorageService.set(TIMESTAMPS_KEY, { players: null, videos: null });
  },

  // ── Estado de sync ─────────────────────────────────────────────────────

  /** Verificar si hay operaciones pendientes */
  hasPending(): boolean {
    return this.pendingCount() > 0;
  },

  /** Verificar si estamos online */
  isOnline(): boolean {
    return navigator.onLine;
  },

  /** Resumen del estado de sync para UI */
  getStatus(): { pending: number; lastPlayers: string | null; lastVideos: string | null; online: boolean } {
    const ts = this.getTimestamps();
    return {
      pending: this.pendingCount(),
      lastPlayers: ts.players,
      lastVideos: ts.videos,
      online: this.isOnline(),
    };
  },
};
