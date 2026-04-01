/**
 * VITAS — Supabase Video Sync Service
 * DETERMINISTA — sin IA.
 * Mismo patrón que SupabasePlayerService.
 */
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { VideoService, type VideoRecord } from "./videoService";

export const SupabaseVideoService = {

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
        await this.pushAll(userId);
        return VideoService.getAll();
      }
      const cloudVideos = data.map((row) => row.data as VideoRecord);
      const localVideos = VideoService.getAll();
      const localMap = new Map(localVideos.map((v) => [v.id, v]));
      const cloudMap = new Map(cloudVideos.map((v) => [v.id, v]));
      const merged: VideoRecord[] = [];
      for (const cv of cloudVideos) {
        const lv = localMap.get(cv.id);
        // Prefer whichever has analysisResult; otherwise prefer cloud
        if (lv?.analysisResult && !cv.analysisResult) {
          merged.push({ ...cv, analysisResult: lv.analysisResult });
        } else {
          merged.push(cv);
        }
      }
      for (const lv of localVideos) {
        if (!cloudMap.has(lv.id)) {
          merged.push(lv);
          this.pushOne(userId, lv).catch(console.warn);
        }
      }
      const { StorageService } = await import("./storageService");
      StorageService.set("videos", merged);
      return merged;
    } catch (err) {
      console.warn("[SupabaseVideoService] pullAll failed:", err);
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
      const rows = videos.map((v) => ({
        id: v.id,
        user_id: userId,
        player_id: v.playerId && existingPlayerIds.has(v.playerId) ? v.playerId : null,
        data: v,
        updated_at: v.dateUploaded,
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
          .single();
        safePlayerId = data ? video.playerId : null;
      }
      const { error } = await supabase
        .from("videos")
        .upsert({
          id: video.id,
          user_id: userId,
          player_id: safePlayerId,
          data: video,
          updated_at: video.dateUploaded,
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

  save(userId: string, video: VideoRecord): void {
    VideoService.save(video);
    this.pushOne(userId, video).catch(console.warn);
  },

  updateStatus(userId: string, id: string, status: VideoRecord["status"], progress?: number): VideoRecord | null {
    const updated = VideoService.updateStatus(id, status, progress);
    if (updated) this.pushOne(userId, updated).catch(console.warn);
    return updated;
  },

  saveAnalysis(userId: string, id: string, analysis: Parameters<typeof VideoService.saveAnalysis>[1]): VideoRecord | null {
    const updated = VideoService.saveAnalysis(id, analysis);
    if (updated) this.pushOne(userId, updated).catch(console.warn);
    return updated;
  },

  delete(userId: string, id: string): void {
    VideoService.delete(id);
    this.deleteOne(userId, id).catch(console.warn);
  },
};
