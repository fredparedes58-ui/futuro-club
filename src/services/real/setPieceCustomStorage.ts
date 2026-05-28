/**
 * VITAS · Set Piece Custom Storage
 *
 * Persists user-created set piece events and recommendations in localStorage.
 */

import type {
  SetPieceEvent,
  SetPieceRecommendation,
} from "@/lib/setPiece/types";
import type { Drawing, TextNote } from "@/components/setPiece/TacticalBoardEditor";

const EVENTS_KEY = "vitas_setpiece_custom_events";
const RECOMMENDATIONS_KEY = "vitas_setpiece_custom_recs";

/** Custom event = SetPieceEvent + editor decorations */
export interface CustomSetPieceEvent extends SetPieceEvent {
  drawings: Drawing[];
  texts: TextNote[];
  isCustom: true;
  createdAt: string;
}

export interface CustomSetPieceRecommendation extends SetPieceRecommendation {
  drawings: Drawing[];
  texts: TextNote[];
  isCustom: true;
  createdAt: string;
}

function safeRead<T>(key: string): T[] {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function safeWrite<T>(key: string, items: T[]): void {
  try {
    localStorage.setItem(key, JSON.stringify(items));
  } catch (err) {
    console.error("[setPieceCustomStorage] write failed", err);
  }
}

export const SetPieceCustomStorage = {
  // ── Events ────────────────────────────────────────────────────────
  getCustomEvents(): CustomSetPieceEvent[] {
    return safeRead<CustomSetPieceEvent>(EVENTS_KEY).sort(
      (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
  },

  saveCustomEvent(event: CustomSetPieceEvent): void {
    const all = safeRead<CustomSetPieceEvent>(EVENTS_KEY);
    const idx = all.findIndex((e) => e.id === event.id);
    if (idx >= 0) {
      all[idx] = event;
    } else {
      all.push(event);
    }
    safeWrite(EVENTS_KEY, all);
  },

  deleteCustomEvent(id: string): void {
    const all = safeRead<CustomSetPieceEvent>(EVENTS_KEY).filter((e) => e.id !== id);
    safeWrite(EVENTS_KEY, all);
  },

  getCustomEvent(id: string): CustomSetPieceEvent | null {
    return safeRead<CustomSetPieceEvent>(EVENTS_KEY).find((e) => e.id === id) ?? null;
  },

  // ── Recommendations ───────────────────────────────────────────────
  getCustomRecommendations(): CustomSetPieceRecommendation[] {
    return safeRead<CustomSetPieceRecommendation>(RECOMMENDATIONS_KEY).sort(
      (a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
  },

  saveCustomRecommendation(rec: CustomSetPieceRecommendation): void {
    const all = safeRead<CustomSetPieceRecommendation>(RECOMMENDATIONS_KEY);
    const idx = all.findIndex((r) => r.id === rec.id);
    if (idx >= 0) {
      all[idx] = rec;
    } else {
      all.push(rec);
    }
    safeWrite(RECOMMENDATIONS_KEY, all);
  },

  deleteCustomRecommendation(id: string): void {
    const all = safeRead<CustomSetPieceRecommendation>(RECOMMENDATIONS_KEY).filter(
      (r) => r.id !== id,
    );
    safeWrite(RECOMMENDATIONS_KEY, all);
  },

  getCustomRecommendation(id: string): CustomSetPieceRecommendation | null {
    return (
      safeRead<CustomSetPieceRecommendation>(RECOMMENDATIONS_KEY).find((r) => r.id === id) ?? null
    );
  },
};
