/**
 * VITAS · Player Tracking Service
 *
 * Persiste el snapshot del análisis YOLO de un jugador (escaneos, duelos,
 * Voronoi, métricas físicas) generado en VitasLab para que sea visible en
 * PlayerIntelligencePage y RoleProfile.
 *
 * Storage: localStorage `vitas_tracking_snapshot_{playerId}` (uno por jugador,
 * el último prevalece).
 */
import type { PhysicalMetrics, ScanEvent, DuelEvent } from "@/lib/yolo/types";
import type { TacticalEvent } from "@/lib/tracking/eventDetectionEngine";
import type { BiomechanicsScore } from "@/lib/mediapipe/biomechanicsEngine";
import { getAuthHeaders } from "@/lib/apiAuth";

const STORAGE_PREFIX = "vitas_tracking_snapshot_";

export interface TrackingSnapshot {
  playerId:       string;
  videoId:        string | null;
  savedAt:        string;            // ISO
  durationSec:    number;            // duración aproximada de la sesión
  sessionMetrics: PhysicalMetrics;
  scanCount:      number;
  duelCount:      number;
  tracksCount:    number;
  focusTrackId:   number | null;
  /** Hasta 200 eventos · suficiente para línea de tiempo · evita storage bloat */
  scanEvents:     ScanEvent[];
  duelEvents:     DuelEvent[];
  /** Posiciones del track enfocado (para heatmap), normalizadas 0-105 x 0-68 */
  focusPositions?: Array<{ fx: number; fy: number; tMs: number }>;
  /** Tactical events detected by EventDetectionEngine (Sprint 2 — VAEP input) */
  tacticalEvents?: TacticalEvent[];
  /** MediaPipe biomechanics score (Sprint 2 — real biomechanics) */
  biomechanicsScore?: BiomechanicsScore;
}

export const PlayerTrackingService = {
  /** Guarda snapshot · sobreescribe si ya existía. Recorta arrays grandes.
   *  Persiste en localStorage (inmediato) + Supabase (async, best-effort). */
  save(snapshot: TrackingSnapshot): void {
    if (!snapshot.playerId) return;
    const trimmed: TrackingSnapshot = {
      ...snapshot,
      scanEvents: snapshot.scanEvents.slice(-200),
      duelEvents: snapshot.duelEvents.slice(-200),
      focusPositions: snapshot.focusPositions?.slice(-500),
      tacticalEvents: snapshot.tacticalEvents?.slice(-300),
    };
    // 1. localStorage (inmediato, nunca falla la app)
    try {
      localStorage.setItem(STORAGE_PREFIX + snapshot.playerId, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("[playerTrackingService] localStorage save failed", e);
    }
    // 2. Supabase (async, best-effort — no bloquea UI)
    this._persistToSupabase(trimmed).catch((e) =>
      console.warn("[playerTrackingService] Supabase save failed (non-blocking)", e),
    );
  },

  /** Fire-and-forget persistence to Supabase via /api/tracking/save */
  async _persistToSupabase(snapshot: TrackingSnapshot): Promise<void> {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch("/api/tracking/save", {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: snapshot.playerId,
          videoId: snapshot.videoId,
          targetTrackId: snapshot.focusTrackId,
          durationMs: Math.round(snapshot.durationSec * 1000),
          metrics: snapshot.sessionMetrics,
          scanEvents: snapshot.scanEvents,
          duelEvents: snapshot.duelEvents,
          calibrationPreset: "full_corners",
        }),
      });
      if (!res.ok) {
        const err = await res.text().catch(() => "unknown");
        console.warn("[playerTrackingService] Supabase returned", res.status, err);
      }
    } catch {
      // Network error — ignore, localStorage has the data
    }
  },

  /** Lee el último snapshot guardado · null si no existe o está corrupto. */
  get(playerId: string): TrackingSnapshot | null {
    if (!playerId) return null;
    try {
      const raw = localStorage.getItem(STORAGE_PREFIX + playerId);
      if (!raw) return null;
      return JSON.parse(raw) as TrackingSnapshot;
    } catch {
      return null;
    }
  },

  /** Borra el snapshot del jugador. */
  remove(playerId: string): void {
    if (!playerId) return;
    localStorage.removeItem(STORAGE_PREFIX + playerId);
  },

  /** Lista todos los snapshots guardados (localStorage). */
  list(): TrackingSnapshot[] {
    const result: TrackingSnapshot[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (!key?.startsWith(STORAGE_PREFIX)) continue;
      const raw = localStorage.getItem(key);
      if (!raw) continue;
      try { result.push(JSON.parse(raw) as TrackingSnapshot); } catch { /* skip */ }
    }
    return result.sort((a, b) => b.savedAt.localeCompare(a.savedAt));
  },

  /** Historial de sesiones desde Supabase (últimas N). Fallback a localStorage si falla. */
  async getHistory(playerId: string, limit = 10): Promise<TrackingSessionSummary[]> {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(
        `/api/tracking/history?playerId=${encodeURIComponent(playerId)}&limit=${limit}`,
        { headers },
      );
      if (!res.ok) throw new Error(`${res.status}`);
      const json = await res.json();
      if (json.success && Array.isArray(json.data)) {
        return json.data as TrackingSessionSummary[];
      }
    } catch {
      // Fallback: build summary from localStorage
    }
    const snap = this.get(playerId);
    if (!snap) return [];
    return [{
      id: `local-${playerId}`,
      date: snap.savedAt,
      durationSec: snap.durationSec,
      maxSpeedMs: snap.sessionMetrics.maxSpeedMs,
      avgSpeedMs: snap.sessionMetrics.avgSpeedMs,
      sprintCount: snap.sessionMetrics.sprintCount,
      scanCount: snap.scanCount,
      duelCount: snap.duelCount,
      eventCount: snap.tacticalEvents?.length ?? 0,
      source: "localStorage" as const,
    }];
  },
};

export interface TrackingSessionSummary {
  id: string;
  date: string;
  durationSec: number;
  maxSpeedMs: number;
  avgSpeedMs: number;
  sprintCount: number;
  scanCount: number;
  duelCount: number;
  eventCount: number;
  source: "supabase" | "localStorage";
}
