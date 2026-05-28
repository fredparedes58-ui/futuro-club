/**
 * VITAS · Highlights Storage
 *
 * Persist user reels in localStorage. Each reel references a source video
 * by id and stores its clips with relative timestamps.
 */

import type { HighlightReel, HighlightClip } from "@/lib/highlights/types";

const REELS_KEY = "vitas_highlight_reels";

function readAll(): HighlightReel[] {
  try {
    const raw = localStorage.getItem(REELS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeAll(reels: HighlightReel[]): void {
  try {
    localStorage.setItem(REELS_KEY, JSON.stringify(reels));
  } catch (err) {
    console.error("[highlightsStorage] write failed", err);
  }
}

function genId(): string {
  return `reel_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

function genClipId(): string {
  return `clip_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
}

export const HighlightsStorage = {
  getAll(): HighlightReel[] {
    return readAll().sort((a, b) =>
      (b.createdAt || "").localeCompare(a.createdAt || ""),
    );
  },

  getById(reelId: string): HighlightReel | null {
    return readAll().find((r) => r.id === reelId) ?? null;
  },

  getByVideo(videoId: string): HighlightReel[] {
    return readAll().filter((r) => r.sourceVideoId === videoId);
  },

  save(reel: HighlightReel): HighlightReel {
    const all = readAll();
    const idx = all.findIndex((r) => r.id === reel.id);
    const updated: HighlightReel = {
      ...reel,
      updatedAt: new Date().toISOString(),
      totalDurationMs: reel.clips.reduce(
        (s, c) => s + Math.max(0, c.endMs - c.startMs),
        0,
      ),
    };
    if (idx >= 0) all[idx] = updated;
    else all.unshift(updated);
    writeAll(all);
    return updated;
  },

  create(
    partial: Omit<HighlightReel, "id" | "createdAt" | "updatedAt" | "totalDurationMs">,
  ): HighlightReel {
    const now = new Date().toISOString();
    const reel: HighlightReel = {
      ...partial,
      id: genId(),
      createdAt: now,
      updatedAt: now,
      totalDurationMs: partial.clips.reduce(
        (s, c) => s + Math.max(0, c.endMs - c.startMs),
        0,
      ),
    };
    const all = readAll();
    all.unshift(reel);
    writeAll(all);
    return reel;
  },

  delete(reelId: string): void {
    writeAll(readAll().filter((r) => r.id !== reelId));
  },

  // ── Clip operations on a specific reel ──────────────────────────────
  addClip(
    reelId: string,
    clip: Omit<HighlightClip, "id">,
  ): HighlightReel | null {
    const reel = this.getById(reelId);
    if (!reel) return null;
    const newClip: HighlightClip = { ...clip, id: genClipId() };
    return this.save({
      ...reel,
      clips: [...reel.clips, newClip].sort((a, b) => a.startMs - b.startMs),
    });
  },

  updateClip(
    reelId: string,
    clipId: string,
    patch: Partial<HighlightClip>,
  ): HighlightReel | null {
    const reel = this.getById(reelId);
    if (!reel) return null;
    return this.save({
      ...reel,
      clips: reel.clips
        .map((c) => (c.id === clipId ? { ...c, ...patch } : c))
        .sort((a, b) => a.startMs - b.startMs),
    });
  },

  removeClip(reelId: string, clipId: string): HighlightReel | null {
    const reel = this.getById(reelId);
    if (!reel) return null;
    return this.save({
      ...reel,
      clips: reel.clips.filter((c) => c.id !== clipId),
    });
  },

  reorderClips(reelId: string, clipIds: string[]): HighlightReel | null {
    const reel = this.getById(reelId);
    if (!reel) return null;
    const map = new Map(reel.clips.map((c) => [c.id, c]));
    const ordered = clipIds
      .map((id) => map.get(id))
      .filter((c): c is HighlightClip => !!c);
    return this.save({ ...reel, clips: ordered });
  },
};
