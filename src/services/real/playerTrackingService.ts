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
}

export const PlayerTrackingService = {
  /** Guarda snapshot · sobreescribe si ya existía. Recorta arrays grandes. */
  save(snapshot: TrackingSnapshot): void {
    if (!snapshot.playerId) return;
    const trimmed: TrackingSnapshot = {
      ...snapshot,
      scanEvents: snapshot.scanEvents.slice(-200),
      duelEvents: snapshot.duelEvents.slice(-200),
      focusPositions: snapshot.focusPositions?.slice(-500),
    };
    try {
      localStorage.setItem(STORAGE_PREFIX + snapshot.playerId, JSON.stringify(trimmed));
    } catch (e) {
      console.warn("[playerTrackingService] save failed", e);
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

  /** Lista todos los snapshots guardados. */
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
};
