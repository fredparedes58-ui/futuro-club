/**
 * VITAS · useLiveMatch (Sprint B2 · Match-day Live Mode)
 *
 * Hook que gestiona un partido en directo desde el móvil:
 *   - Crea/carga el partido
 *   - Cronómetro tiempo real (interval JS · 1s)
 *   - Cola offline en localStorage para taps que no se han sync
 *   - Auto-sync a /api/live/events en batch al recuperar conexión
 *   - Idempotencia con clientEventId UUID
 */

import { useEffect, useState, useCallback, useRef } from "react";
import { getAuthHeaders } from "@/lib/apiAuth";

export type LiveEventType =
  | "gol" | "pase_clave" | "recuperacion" | "perdida"
  | "duelo_ganado" | "duelo_perdido"
  | "asistencia" | "tarjeta_amarilla" | "tarjeta_roja"
  | "parada_portero" | "penalti_provocado" | "penalti_cometido";

export interface LiveEventDraft {
  matchId: string;
  playerId?: string | null;
  eventType: LiveEventType;
  timestampSeconds: number;
  half?: 1 | 2 | 3 | 4;
  zoneRow?: "defensa" | "medio" | "ataque";
  zoneCol?: "izq" | "cen" | "dcha";
  notes?: string;
  metadata?: Record<string, unknown>;   // ej. { player_position: "Lateral Izquierdo" }
  clientEventId: string;                // UUID idempotencia
  syncStatus: "queued" | "synced" | "failed";
  createdAt: number;                    // ms epoch local
}

export interface LiveMatchState {
  id: string;
  team_name: string;
  opponent_name: string | null;
  status: "live" | "paused" | "finished" | "aborted";
  started_at: string | null;
  ended_at: string | null;
  duration_seconds: number;
  score_home: number;
  score_away: number;
}

const QUEUE_KEY = "vitas_live_queue_v1";

function loadQueue(): LiveEventDraft[] {
  try {
    const raw = localStorage.getItem(QUEUE_KEY);
    return raw ? (JSON.parse(raw) as LiveEventDraft[]) : [];
  } catch { return []; }
}

function saveQueue(queue: LiveEventDraft[]): void {
  try { localStorage.setItem(QUEUE_KEY, JSON.stringify(queue)); }
  catch { /* localStorage llena · ignorar */ }
}

function uuid(): string {
  return (crypto.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`);
}

export function useLiveMatch(matchId: string | null) {
  const [match, setMatch] = useState<LiveMatchState | null>(null);
  const [events, setEvents] = useState<LiveEventDraft[]>(() =>
    loadQueue().filter((e) => e.matchId === matchId),
  );
  const [elapsed, setElapsed] = useState<number>(0); // seg desde started_at
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState<boolean>(typeof navigator !== "undefined" ? navigator.onLine : true);
  const intervalRef = useRef<number | null>(null);
  const syncingRef = useRef<boolean>(false);

  // ── Cargar match + eventos remotos ───────────────────────────
  const loadMatch = useCallback(async () => {
    if (!matchId) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/live/matches?id=${matchId}`, { headers });
      const data = await res.json();
      if (res.ok && data.success) {
        setMatch(data.data.match);
        // Mergear remotos con queue local
        const remote = (data.data.events ?? []) as Array<{
          id: string; player_id: string | null; event_type: LiveEventType;
          timestamp_seconds: number; half: number | null; client_event_id: string | null;
          notes: string | null; created_at: string;
        }>;
        const remoteAsDrafts: LiveEventDraft[] = remote.map((r) => ({
          matchId,
          playerId: r.player_id,
          eventType: r.event_type,
          timestampSeconds: r.timestamp_seconds,
          half: (r.half ?? 1) as 1 | 2,
          notes: r.notes ?? undefined,
          clientEventId: r.client_event_id ?? r.id,
          syncStatus: "synced",
          createdAt: new Date(r.created_at).getTime(),
        }));
        const localQueue = loadQueue().filter((e) => e.matchId === matchId);
        const merged = [...remoteAsDrafts];
        const seen = new Set(remoteAsDrafts.map((e) => e.clientEventId));
        localQueue.forEach((e) => { if (!seen.has(e.clientEventId)) merged.push(e); });
        merged.sort((a, b) => a.timestampSeconds - b.timestampSeconds);
        setEvents(merged);
      }
    } catch {
      // sin conexión · seguimos con queue local
      const localQueue = loadQueue().filter((e) => e.matchId === matchId);
      setEvents(localQueue);
    } finally {
      setLoading(false);
    }
  }, [matchId]);

  useEffect(() => { loadMatch(); }, [loadMatch]);

  // ── Cronómetro tick ──────────────────────────────────────────
  useEffect(() => {
    if (!match || match.status !== "live" || !match.started_at) {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
        intervalRef.current = null;
      }
      // Si paused/finished, mostrar duracion guardada
      if (match) setElapsed(match.duration_seconds);
      return;
    }
    const startedMs = new Date(match.started_at).getTime();
    const baseDuration = match.duration_seconds ?? 0;
    const tick = () => {
      const now = Date.now();
      // baseDuration está congelado al pausar · al reanudar started_at se reseteó
      // simplificación: si live, mostramos baseDuration + (now - startedAt)
      setElapsed(baseDuration + Math.floor((now - startedMs) / 1000));
    };
    tick();
    intervalRef.current = window.setInterval(tick, 1000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [match]);

  // ── Online/offline detection ────────────────────────────────
  useEffect(() => {
    const onOnline  = () => setOnline(true);
    const onOffline = () => setOnline(false);
    window.addEventListener("online", onOnline);
    window.addEventListener("offline", onOffline);
    return () => {
      window.removeEventListener("online", onOnline);
      window.removeEventListener("offline", onOffline);
    };
  }, []);

  // ── Sync queue al servidor ───────────────────────────────────
  const syncQueue = useCallback(async () => {
    if (syncingRef.current || !matchId || !online) return;
    syncingRef.current = true;
    try {
      const queue = loadQueue().filter((e) => e.matchId === matchId && e.syncStatus !== "synced");
      if (queue.length === 0) return;
      const headers = await getAuthHeaders();
      const res = await fetch("/api/live/events", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          matchId,
          events: queue.map((e) => ({
            playerId: e.playerId ?? null,
            eventType: e.eventType,
            timestampSeconds: e.timestampSeconds,
            half: e.half ?? 1,
            zoneRow: e.zoneRow,
            zoneCol: e.zoneCol,
            notes: e.notes,
            metadata: e.metadata,                    // incluye player_position
            clientEventId: e.clientEventId,
          })),
        }),
      });
      if (res.ok) {
        // marcar synced en queue + state
        const all = loadQueue();
        const updated = all.map((e) =>
          queue.some((q) => q.clientEventId === e.clientEventId)
            ? { ...e, syncStatus: "synced" as const }
            : e,
        );
        saveQueue(updated);
        setEvents((prev) =>
          prev.map((e) =>
            queue.some((q) => q.clientEventId === e.clientEventId)
              ? { ...e, syncStatus: "synced" as const }
              : e,
          ),
        );
      }
    } catch {
      // seguir intentando · queue persistida
    } finally {
      syncingRef.current = false;
    }
  }, [matchId, online]);

  // Auto-sync cuando vuelve la conexión + cada 15s
  useEffect(() => {
    if (online) syncQueue();
    const id = window.setInterval(() => { if (online) syncQueue(); }, 15_000);
    return () => clearInterval(id);
  }, [online, syncQueue]);

  // ── Acciones ─────────────────────────────────────────────────

  const addEvent = useCallback((args: {
    playerId?: string | null;
    eventType: LiveEventType;
    half?: 1 | 2 | 3 | 4;
    zoneRow?: "defensa" | "medio" | "ataque";
    zoneCol?: "izq" | "cen" | "dcha";
    notes?: string;
    metadata?: Record<string, unknown>;
  }) => {
    if (!matchId) return;
    const draft: LiveEventDraft = {
      matchId,
      playerId: args.playerId,
      eventType: args.eventType,
      timestampSeconds: elapsed,
      half: args.half,
      zoneRow: args.zoneRow,
      zoneCol: args.zoneCol,
      notes: args.notes,
      metadata: args.metadata,
      clientEventId: uuid(),
      syncStatus: "queued",
      createdAt: Date.now(),
    };
    // Persist en queue + state
    const all = loadQueue();
    saveQueue([...all, draft]);
    setEvents((prev) => [...prev, draft].sort((a, b) => a.timestampSeconds - b.timestampSeconds));
    // Si online, sync ya
    if (online) void syncQueue();
  }, [matchId, elapsed, online, syncQueue]);

  const undoLast = useCallback(() => {
    setEvents((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      // si ya está sync, llamar DELETE en server
      if (last.syncStatus === "synced") {
        getAuthHeaders().then((h) =>
          fetch(`/api/live/events?id=${last.clientEventId}`, { method: "DELETE", headers: h }),
        ).catch(() => null);
      }
      // Quitar de queue local
      const all = loadQueue();
      saveQueue(all.filter((e) => e.clientEventId !== last.clientEventId));
      return prev.slice(0, -1);
    });
  }, []);

  const updateMatchStatus = useCallback(
    async (input: { status?: LiveMatchState["status"]; scoreHome?: number; scoreAway?: number }) => {
      if (!matchId) return;
      const headers = await getAuthHeaders();
      const update: Record<string, unknown> = { ...input };
      // Si pausamos o terminamos, congelar duration_seconds
      if (input.status === "paused" || input.status === "finished") {
        update.durationSeconds = elapsed;
      }
      const res = await fetch(`/api/live/matches?id=${matchId}`, {
        method: "PATCH",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify(update),
      });
      const data = await res.json();
      if (res.ok && data.success) setMatch(data.data.match);
    },
    [matchId, elapsed],
  );

  return {
    match,
    events,
    elapsed,                     // seg
    loading,
    online,
    queueSize: events.filter((e) => e.syncStatus !== "synced").length,
    addEvent,
    undoLast,
    syncQueue,
    updateMatchStatus,
    reload: loadMatch,
  };
}

/** Crear partido nuevo y devolver el id */
export async function createLiveMatch(input: {
  teamName?: string;
  opponentName?: string;
  competition?: string;
}): Promise<string | null> {
  const headers = await getAuthHeaders();
  const res = await fetch("/api/live/matches", {
    method: "POST",
    headers: { ...headers, "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const data = await res.json();
  if (!res.ok || !data.success) throw new Error(data?.error?.message ?? "No se pudo crear el partido");
  return data.data.match.id as string;
}
