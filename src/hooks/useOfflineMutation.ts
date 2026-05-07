/**
 * VITAS · useOfflineMutation (Sprint A3 · día 3 · M9)
 *
 * Hook genérico para POST/PATCH/DELETE con queue offline. Si hay conexión
 * ejecuta inmediato; si no, guarda la acción en localStorage con un UUID
 * idempotente y la sincroniza al volver online.
 *
 * Compartido entre forms críticos (antropometría, comentarios, eventos
 * live, mediciones de growth, etc.).
 *
 * Uso:
 *   const m = useOfflineMutation({
 *     queueKey: "vitas_anthro_queue_v1",
 *     execute: async (action) => {
 *       const headers = await getAuthHeaders();
 *       const r = await fetch(action.url, {
 *         method: action.method,
 *         headers: { ...headers, "Content-Type": "application/json" },
 *         body: JSON.stringify(action.payload),
 *       });
 *       if (!r.ok) throw new Error(...);
 *     },
 *   });
 *   await m.run({ url: "/api/...", method: "POST", payload: {...} });
 */

import { useEffect, useState, useCallback, useRef } from "react";

export interface QueuedAction<P = unknown> {
  id: string;                                  // UUID idempotente
  url: string;
  method: "POST" | "PATCH" | "DELETE" | "PUT";
  payload?: P;
  createdAt: number;
  attempts: number;
  lastError?: string;
  /** Opcional · etiqueta humana para mostrar en UI ("Medición de Samu") */
  label?: string;
}

export interface UseOfflineMutationOptions<P = unknown> {
  queueKey: string;
  execute: (action: QueuedAction<P>) => Promise<void>;
  /** Intentar sincronizar cada X ms · default 15s. 0 = solo on online event */
  syncIntervalMs?: number;
  /** Max attempts antes de marcar como failed permanente · default 5 */
  maxAttempts?: number;
}

function uuid(): string {
  return crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

function loadQueue<P>(key: string): QueuedAction<P>[] {
  try {
    const raw = localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as QueuedAction<P>[]) : [];
  } catch { return []; }
}

function saveQueue<P>(key: string, queue: QueuedAction<P>[]): void {
  try { localStorage.setItem(key, JSON.stringify(queue)); }
  catch { /* localStorage llena · ignorar */ }
}

export function useOfflineMutation<P = unknown>(opts: UseOfflineMutationOptions<P>) {
  const { queueKey, execute, syncIntervalMs = 15_000, maxAttempts = 5 } = opts;
  const [queue, setQueue] = useState<QueuedAction<P>[]>(() => loadQueue<P>(queueKey));
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const [syncing, setSyncing] = useState(false);
  const syncingRef = useRef(false);
  const executeRef = useRef(execute);

  // Mantener execute fresco
  useEffect(() => { executeRef.current = execute; }, [execute]);

  // Online/offline listeners
  useEffect(() => {
    const onOn  = () => setOnline(true);
    const onOff = () => setOnline(false);
    window.addEventListener("online", onOn);
    window.addEventListener("offline", onOff);
    return () => {
      window.removeEventListener("online", onOn);
      window.removeEventListener("offline", onOff);
    };
  }, []);

  // Sync queue · FIFO
  const flushQueue = useCallback(async () => {
    if (syncingRef.current || !online) return;
    syncingRef.current = true;
    setSyncing(true);
    try {
      let current = loadQueue<P>(queueKey);
      while (current.length > 0) {
        const next = current[0];
        if (next.attempts >= maxAttempts) {
          // Skip permanent failures (queda en queue para inspección)
          current = current.slice(1);
          saveQueue(queueKey, current);
          continue;
        }
        try {
          await executeRef.current(next);
          // Success · pop from queue
          current = current.slice(1);
          saveQueue(queueKey, current);
          setQueue(current);
        } catch (err) {
          // Increment attempts and retry next loop
          const updated: QueuedAction<P>[] = [
            { ...next, attempts: next.attempts + 1, lastError: err instanceof Error ? err.message : "unknown" },
            ...current.slice(1),
          ];
          saveQueue(queueKey, updated);
          setQueue(updated);
          break; // retry on next interval · no consume rate hammering
        }
      }
    } finally {
      syncingRef.current = false;
      setSyncing(false);
    }
  }, [queueKey, online, maxAttempts]);

  // Auto-sync al volver online + cada N ms
  useEffect(() => {
    if (online) flushQueue();
  }, [online, flushQueue]);

  useEffect(() => {
    if (syncIntervalMs <= 0) return;
    const id = window.setInterval(() => {
      if (online) flushQueue();
    }, syncIntervalMs);
    return () => clearInterval(id);
  }, [online, flushQueue, syncIntervalMs]);

  /**
   * Ejecuta una mutación · si offline o falla, queue.
   * Devuelve { sent: boolean, queued: boolean }.
   */
  const run = useCallback(
    async (
      action: Omit<QueuedAction<P>, "id" | "createdAt" | "attempts">,
    ): Promise<{ sent: boolean; queued: boolean; error?: string }> => {
      const queued: QueuedAction<P> = {
        id: uuid(),
        createdAt: Date.now(),
        attempts: 0,
        ...action,
      };

      if (online) {
        try {
          await executeRef.current(queued);
          return { sent: true, queued: false };
        } catch (err) {
          // Falla → queue para retry
          const current = loadQueue<P>(queueKey);
          const next: QueuedAction<P>[] = [
            ...current,
            { ...queued, attempts: 1, lastError: err instanceof Error ? err.message : "unknown" },
          ];
          saveQueue(queueKey, next);
          setQueue(next);
          return { sent: false, queued: true, error: err instanceof Error ? err.message : "unknown" };
        }
      }

      // Offline · directo a queue
      const current = loadQueue<P>(queueKey);
      const next: QueuedAction<P>[] = [...current, queued];
      saveQueue(queueKey, next);
      setQueue(next);
      return { sent: false, queued: true };
    },
    [online, queueKey],
  );

  /** Borrar una acción específica de la queue (ej. usuario cancela) */
  const remove = useCallback((id: string) => {
    const filtered = loadQueue<P>(queueKey).filter((a) => a.id !== id);
    saveQueue(queueKey, filtered);
    setQueue(filtered);
  }, [queueKey]);

  /** Limpiar toda la queue (peligroso · usar solo en logout) */
  const clear = useCallback(() => {
    saveQueue<P>(queueKey, []);
    setQueue([]);
  }, [queueKey]);

  return {
    queue,
    queueSize: queue.length,
    online,
    syncing,
    run,
    flushQueue,
    remove,
    clear,
  };
}

/**
 * Helper · cuenta total de items en TODAS las queues con prefijo dado.
 * Útil para banner global.
 */
export function getTotalPendingCount(prefix = "vitas_") : number {
  if (typeof localStorage === "undefined") return 0;
  let total = 0;
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith(prefix) || !k.includes("_queue_")) continue;
    try {
      const arr = JSON.parse(localStorage.getItem(k) ?? "[]");
      if (Array.isArray(arr)) total += arr.length;
    } catch { /* ignore */ }
  }
  return total;
}
