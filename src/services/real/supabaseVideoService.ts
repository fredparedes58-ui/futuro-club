/**
 * VITAS — Supabase Video Sync Service
 * DETERMINISTA — sin IA.
 *
 * Estrategia Supabase-first (Semana 4):
 *   - Supabase es la fuente de verdad
 *   - localStorage como caché de lectura rápida
 *   - Writes: localStorage optimistic → Supabase sync (await cuando online, queue cuando offline)
 *   - Pull: Supabase reemplaza localStorage (cloud es autoritativo)
 */
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { VideoService, type VideoRecord } from "./videoService";
import { SyncQueueService } from "./syncQueueService";
import { OrganizationService } from "./organizationService";

// ── Helper: extraer columnas relacionales de un VideoRecord (025_normalize_videos) ─
function videoToColumns(v: VideoRecord) {
  return {
    title: v.title ?? null,
    status: v.status ?? "unknown",
    status_code: v.statusCode ?? -1,
    encode_progress: v.encodeProgress ?? 0,
    duration: v.duration ?? 0,
    vid_width: v.width ?? 0,
    vid_height: v.height ?? 0,
    fps: v.fps ?? 0,
    storage_size: v.storageSize ?? 0,
    thumbnail_url: v.thumbnailUrl ?? null,
    embed_url: v.embedUrl ?? "",
    stream_url: v.streamUrl ?? null,
    local_path: v.localPath ?? null,
    date_uploaded: v.dateUploaded ?? null,
    analysis_result: v.analysisResult ?? null,
  };
}

export const SupabaseVideoService = {

  // ── PULL: Supabase → localStorage (Supabase-first: cloud es autoritativo) ──
  async pullAll(userId: string): Promise<VideoRecord[]> {
    if (!SUPABASE_CONFIGURED) return VideoService.getAll();
    try {
      const { data, error } = await supabase
        .from("videos")
        .select("id, data")
        .eq("user_id", userId)
        .order("updated_at", { ascending: false });
      if (error) throw error;

      if (!data || data.length === 0) {
        // Cloud vacío — verificar si hay videos locales pendientes de sync
        const localVideos = VideoService.getAll();
        const pending = SyncQueueService.pendingCount();
        if (localVideos.length > 0 && pending > 0) {
          return localVideos;
        }
        const { StorageService } = await import("./storageService");
        StorageService.set("videos", []);
        return [];
      }

      // Supabase-first: cloud reemplaza localStorage
      const cloudVideos = data.map((row) => row.data as VideoRecord);

      // Excepción: preservar analysisResult local si cloud no lo tiene
      const localVideos = VideoService.getAll();
      const localMap = new Map(localVideos.map((v) => [v.id, v]));

      const result = cloudVideos.map((cv) => {
        const lv = localMap.get(cv.id);
        if (lv?.analysisResult && !cv.analysisResult) {
          return { ...cv, analysisResult: lv.analysisResult };
        }
        return cv;
      });

      // Preservar videos locales con operaciones pendientes
      const pending = SyncQueueService.getQueue().filter(
        (op) => op.entity === "video" && op.status === "pending"
      );
      const pendingIds = new Set(pending.map((op) => op.entityId));
      const cloudIds = new Set(cloudVideos.map((v) => v.id));
      for (const lv of localVideos) {
        if (pendingIds.has(lv.id) && !cloudIds.has(lv.id)) {
          result.push(lv);
        }
      }

      const { StorageService } = await import("./storageService");
      StorageService.set("videos", result);
      return result;
    } catch (err) {
      console.warn("[SupabaseVideoService] pullAll failed — using local cache:", err);
      return VideoService.getAll();
    }
  },

  async pushAll(userId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    const videos = VideoService.getAll();
    if (!videos.length) return;
    try {
      // Check which players exist in Supabase to avoid FK violations
      const playerIds = [...new Set(videos.map(v => v.playerId).filter(Boolean))];
      const existingPlayerIds = new Set<string>();
      if (playerIds.length) {
        const { data } = await supabase
          .from("players")
          .select("id")
          .in("id", playerIds as string[]);
        (data ?? []).forEach(r => existingPlayerIds.add(r.id));
      }
      const orgId = OrganizationService.getOrgId();
      const rows = videos.map((v) => ({
        id: v.id,
        user_id: userId,
        ...(orgId ? { org_id: orgId } : {}),
        player_id: v.playerId && existingPlayerIds.has(v.playerId) ? v.playerId : null,
        data: v,
        updated_at: new Date().toISOString(),
        ...videoToColumns(v),
      }));
      const { error } = await supabase
        .from("videos")
        .upsert(rows, { onConflict: "id" });
      if (error) throw error;
    } catch (err) {
      console.warn("[SupabaseVideoService] pushAll failed:", err);
    }
  },

  async pushOne(userId: string, video: VideoRecord): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    try {
      // Verify player exists in Supabase if video has playerId
      let safePlayerId: string | null = null;
      if (video.playerId) {
        const { data } = await supabase
          .from("players")
          .select("id")
          .eq("id", video.playerId)
          .maybeSingle();
        safePlayerId = data ? video.playerId : null;
      }
      const orgId = OrganizationService.getOrgId();
      const { error } = await supabase
        .from("videos")
        .upsert({
          id: video.id,
          user_id: userId,
          ...(orgId ? { org_id: orgId } : {}),
          player_id: safePlayerId,
          data: video,
          updated_at: new Date().toISOString(),
          ...videoToColumns(video),
        }, { onConflict: "id" });
      if (error) throw error;
    } catch (err) {
      console.warn("[SupabaseVideoService] pushOne failed:", err);
    }
  },

  async deleteOne(userId: string, videoId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    try {
      const { error } = await supabase
        .from("videos")
        .delete()
        .eq("id", videoId)
        .eq("user_id", userId);
      if (error) throw error;
    } catch (err) {
      console.warn("[SupabaseVideoService] deleteOne failed:", err);
    }
  },

  // ── Supabase-first: localStorage optimistic + await Supabase sync ──

  save(userId: string, video: VideoRecord): void {
    // Optimistic: localStorage primero para UI inmediata
    VideoService.save(video);
    // Sync a Supabase (await si online, queue si offline)
    this.pushOne(userId, video).catch((err) => {
      console.warn("[SupabaseVideoService] save: Supabase failed, queuing:", err);
      SyncQueueService.enqueue("update", "video", video.id, video);
    });
  },

  updateStatus(userId: string, id: string, status: VideoRecord["status"], progress?: number): VideoRecord | null {
    const updated = VideoService.updateStatus(id, status, progress);
    if (updated) {
      this.pushOne(userId, updated).catch((err) => {
        console.warn("[SupabaseVideoService] updateStatus: Supabase failed, queuing:", err);
        SyncQueueService.enqueue("update", "video", id, updated);
      });
    }
    return updated;
  },

  saveAnalysis(userId: string, id: string, analysis: Parameters<typeof VideoService.saveAnalysis>[1]): VideoRecord | null {
    const updated = VideoService.saveAnalysis(id, analysis);
    if (updated) {
      this.pushOne(userId, updated).catch((err) => {
        console.warn("[SupabaseVideoService] saveAnalysis: Supabase failed, queuing:", err);
        SyncQueueService.enqueue("update", "video", id, updated);
      });
    }
    return updated;
  },

  delete(userId: string, id: string): void {
    VideoService.delete(id);
    this.deleteOne(userId, id).catch((err) => {
      console.warn("[SupabaseVideoService] delete: Supabase failed, queuing:", err);
      SyncQueueService.enqueue("delete", "video", id, null);
    });
  },
};
