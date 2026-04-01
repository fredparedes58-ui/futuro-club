/**
 * VITAS Phase 2 — useVideos hooks
 *
 * Video CRUD via React Query.
 * Falls back to localStorage when API is not configured (phase2Pending).
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { VideoService } from "@/services/real/videoService";
import type { VideoRecord, VideoAnalysis } from "@/services/real/videoService";
import { toast } from "sonner";
import { useAuth } from "@/context/AuthContext";
import { SupabaseVideoService } from "@/services/real/supabaseVideoService";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { PushNotificationService } from "@/services/real/pushNotificationService";

const STALE = 2 * 60 * 1000; // 2 minutes

// ── List all videos ───────────────────────────────────────────────────────────
export function useVideos(playerId?: string) {
  return useQuery<VideoRecord[]>({
    queryKey: playerId ? ["videos", playerId] : ["videos"],
    queryFn: async () => {
      if (SUPABASE_CONFIGURED) {
        // Supabase sync is handled by useSupabaseSync — just read local
        const all = VideoService.getAll();
        return playerId ? all.filter((v) => v.playerId === playerId) : all;
      }
      // Non-Supabase: sync from Bunny API
      const synced = await VideoService.syncFromApi(playerId);
      return playerId ? synced.filter((v) => v.playerId === playerId) : synced;
    },
    staleTime: STALE,
    placeholderData: () =>
      playerId ? VideoService.getByPlayerId(playerId) : VideoService.getAll(),
  });
}

// ── Single video ──────────────────────────────────────────────────────────────
export function useVideo(id: string | null | undefined) {
  const { user } = useAuth();
  return useQuery<VideoRecord | null>({
    queryKey: ["video", id],
    queryFn: async () => {
      if (!id) return null;
      // Try local first
      const local = VideoService.getById(id);
      if (local?.status === "finished") return local;
      // Fetch from API
      try {
        const res = await fetch(`/api/videos/${id}/status`);
        const data = (await res.json()) as {
          success: boolean;
          data?: VideoRecord;
        };
        if (data.success && data.data) {
          if (user && SUPABASE_CONFIGURED) {
            SupabaseVideoService.save(user.id, data.data);
          } else {
            VideoService.save(data.data);
          }
          return data.data;
        }
      } catch {
        // fallback to local
      }
      return local ?? null;
    },
    enabled: !!id,
    staleTime: STALE,
  });
}

// ── Delete video ──────────────────────────────────────────────────────────────
export function useDeleteVideo() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async (videoId: string) => {
      // Delete from Bunny API
      try {
        const res = await fetch(`/api/videos/${videoId}/delete`, { method: "DELETE" });
        const data = (await res.json()) as { success: boolean; phase2Pending?: boolean; error?: string };
        if (!data.success && !data.phase2Pending) throw new Error(data.error ?? "Delete failed");
      } catch (err) {
        // If API delete fails, still remove locally
        console.warn("[useDeleteVideo] API delete failed:", err);
      }
      // Always remove locally + Supabase
      if (user && SUPABASE_CONFIGURED) {
        SupabaseVideoService.delete(user.id, videoId);
      } else {
        VideoService.delete(videoId);
      }
    },
    onSuccess: (_, videoId) => {
      toast.success("Video eliminado");
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.removeQueries({ queryKey: ["video", videoId] });
    },
    onError: (err: Error) => {
      toast.error(`Error al eliminar: ${err.message}`);
    },
  });
}

// ── Run analysis pipeline on existing video ───────────────────────────────────
export function useRunPipeline() {
  const qc = useQueryClient();
  const { user } = useAuth();

  return useMutation({
    mutationFn: async ({
      videoId,
      playerId,
    }: {
      videoId: string;
      playerId?: string;
    }) => {
      const res = await fetch("/api/pipeline/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoId, playerId }),
      });
      const data = (await res.json()) as {
        success: boolean;
        phase2Pending?: boolean;
        error?: string;
        data?: { tacticalAnalysis: Omit<VideoAnalysis, "analyzedAt"> };
      };

      if (data.phase2Pending) {
        throw new Error("Pipeline disponible en Fase 2 (env vars pendientes)");
      }
      if (!data.success) {
        throw new Error(data.error ?? "Pipeline failed");
      }
      return data.data!;
    },
    onSuccess: (data, { videoId, playerId: _pid }) => {
      toast.success("Análisis táctico completado");
      if (data?.tacticalAnalysis) {
        if (user && SUPABASE_CONFIGURED) {
          SupabaseVideoService.saveAnalysis(user.id, videoId, data.tacticalAnalysis);
        } else {
          VideoService.saveAnalysis(videoId, data.tacticalAnalysis);
        }
      }
      PushNotificationService.showLocal(
        "Análisis completado",
        `El análisis táctico del video está listo`,
        "/pwa-192x192.png"
      ).catch(console.warn);
      qc.invalidateQueries({ queryKey: ["video", videoId] });
      qc.invalidateQueries({ queryKey: ["videos"] });
    },
    onError: (err: Error) => {
      toast.error(err.message);
    },
  });
}

// ── Finished videos count (for stats) ────────────────────────────────────────
export function useVideoCount(playerId?: string) {
  const { data = [] } = useVideos(playerId);
  return {
    total: data.length,
    finished: data.filter((v) => v.status === "finished").length,
    processing: data.filter(
      (v) => v.status === "processing" || v.status === "transcoding"
    ).length,
    analyzed: data.filter((v) => !!v.analysisResult).length,
  };
}
