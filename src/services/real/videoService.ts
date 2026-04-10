/**
 * VITAS Phase 2 — Video Service
 * DETERMINISTA — no IA.
 *
 * Manages video metadata in localStorage (mirrors Bunny Stream data).
 * On first load it syncs from /api/videos/list if network is available.
 */

import { StorageService } from "./storageService";

export type VideoStatus =
  | "created"
  | "uploaded"
  | "processing"
  | "transcoding"
  | "finished"
  | "error"
  | "upload-failed"
  | "unknown";

export interface VideoRecord {
  id: string;
  title: string;
  playerId: string | null;
  status: VideoStatus;
  statusCode: number;
  encodeProgress: number;
  duration: number;
  width: number;
  height: number;
  fps: number;
  storageSize: number;
  thumbnailUrl: string | null;
  embedUrl: string;
  streamUrl: string | null;
  dateUploaded: string;
  analysisResult?: VideoAnalysis | null;
  localPath?: string; // only set during upload (blob URL)
}

export interface VideoAnalysis {
  formationHint: string;
  pressureZone: string;
  keyMovements: string[];
  playerCount: number;
  ballDetected: boolean;
  tacticalPhase: "attack" | "defense" | "transition" | "set-piece" | "unknown";
  confidence: number;
  notes: string;
  analyzedAt: string;
}

const STORAGE_KEY = "videos";

/**
 * Returns the best playable URL for a video, prioritizing persistent CDN URLs
 * over ephemeral blob: URLs that expire on page refresh.
 *
 * Priority: streamUrl (HTTP) > localPath (HTTP) > streamUrl (blob) > localPath (blob)
 */
export function getBestVideoUrl(video: VideoRecord): string | null {
  const isHttp = (url?: string | null) => !!url && url.startsWith("http");
  // Prefer persistent HTTP URLs from Bunny CDN
  if (isHttp(video.streamUrl)) return video.streamUrl!;
  if (isHttp(video.localPath)) return video.localPath!;
  // Fallback to blob URLs (only work in current session)
  if (video.streamUrl) return video.streamUrl;
  if (video.localPath) return video.localPath;
  return null;
}

export const VideoService = {
  // ── Read ──────────────────────────────────────────────────────────────────
  getAll(): VideoRecord[] {
    return StorageService.get<VideoRecord[]>(STORAGE_KEY, []);
  },

  getById(id: string): VideoRecord | null {
    return this.getAll().find((v) => v.id === id) ?? null;
  },

  getByPlayerId(playerId: string): VideoRecord[] {
    return this.getAll().filter((v) => v.playerId === playerId);
  },

  getFinished(): VideoRecord[] {
    return this.getAll().filter((v) => v.status === "finished");
  },

  // ── Write ─────────────────────────────────────────────────────────────────
  save(video: VideoRecord): void {
    const all = this.getAll();
    const idx = all.findIndex((v) => v.id === video.id);
    if (idx >= 0) {
      all[idx] = video;
    } else {
      all.unshift(video); // newest first
    }
    StorageService.set(STORAGE_KEY, all);
  },

  updateStatus(
    id: string,
    status: VideoStatus,
    progress?: number
  ): VideoRecord | null {
    const all = this.getAll();
    const idx = all.findIndex((v) => v.id === id);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      status,
      statusCode: statusToCode(status),
      encodeProgress: progress ?? all[idx].encodeProgress,
    };
    StorageService.set(STORAGE_KEY, all);
    return all[idx];
  },

  saveAnalysis(id: string, analysis: Omit<VideoAnalysis, "analyzedAt">): VideoRecord | null {
    const all = this.getAll();
    const idx = all.findIndex((v) => v.id === id);
    if (idx < 0) return null;
    all[idx] = {
      ...all[idx],
      analysisResult: { ...analysis, analyzedAt: new Date().toISOString() },
    };
    StorageService.set(STORAGE_KEY, all);
    return all[idx];
  },

  delete(id: string): void {
    const all = this.getAll().filter((v) => v.id !== id);
    StorageService.set(STORAGE_KEY, all);
  },

  // ── Sync from API ─────────────────────────────────────────────────────────
  async syncFromApi(playerId?: string): Promise<VideoRecord[]> {
    try {
      const qs = playerId ? `?playerId=${playerId}` : "";
      const res = await fetch(`/api/videos/list${qs}`);
      if (!res.ok) return this.getAll();

      const data = (await res.json()) as {
        success: boolean;
        phase2Pending?: boolean;
        data?: { items: VideoRecord[] };
      };

      if (!data.success || data.phase2Pending || !data.data) {
        return this.getAll();
      }

      // Merge: API is source of truth; keep local analysisResult
      const localMap = new Map(this.getAll().map((v) => [v.id, v]));
      const merged = data.data.items.map((apiV) => ({
        ...apiV,
        analysisResult: localMap.get(apiV.id)?.analysisResult ?? null,
      }));

      StorageService.set(STORAGE_KEY, merged);
      return merged;
    } catch {
      return this.getAll();
    }
  },

  // ── Upload helpers ────────────────────────────────────────────────────────

  /** Creates a stub entry locally while upload is in progress */
  createStub(params: {
    id: string;
    title: string;
    playerId: string | null;
    localPath?: string;
  }): VideoRecord {
    const stub: VideoRecord = {
      id: params.id,
      title: params.title,
      playerId: params.playerId,
      status: "created",
      statusCode: 0,
      encodeProgress: 0,
      duration: 0,
      width: 0,
      height: 0,
      fps: 0,
      storageSize: 0,
      thumbnailUrl: null,
      embedUrl: "",
      streamUrl: null,
      dateUploaded: new Date().toISOString(),
      analysisResult: null,
      localPath: params.localPath,
    };
    this.save(stub);
    return stub;
  },
};

function statusToCode(status: VideoStatus): number {
  const map: Record<VideoStatus, number> = {
    created: 0,
    uploaded: 1,
    processing: 2,
    transcoding: 3,
    finished: 4,
    error: 5,
    "upload-failed": 6,
    unknown: -1,
  };
  return map[status] ?? -1;
}
