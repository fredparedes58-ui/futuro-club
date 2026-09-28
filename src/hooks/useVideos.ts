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
import i18n from "@/i18n";
import { useAuth } from "@/context/AuthContext";
import { SupabaseVideoService } from "@/services/real/supabaseVideoService";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { PushNotificationService } from "@/services/real/pushNotificationService";
import { isLocalSrc, clearStaleBlobUrls } from "@/lib/localVideoUtils";
import { getAuthHeaders } from "@/lib/apiAuth";
import { clearTusSessionsForVideo } from "@/lib/tusUploadSession";

const STALE = 2 * 60 * 1000; // 2 minutes

// Hosts de Bunny Stream (subida real): iframe.mediadelivery.net, vz-*.b-cdn.net, video.bunnycdn.com
const BUNNY_HOST_RE = /(^|\.)(mediadelivery\.net|b-cdn\.net|bunnycdn\.com)$/i;

// Metadatos que INVENTABA la antigua pestaña «URL / Cloud» (90 min, 1920×1080, 30 fps).
const LEGACY_URL_TAB_FAKE_META = { duration: 90 * 60, width: 1920, height: 1080, fps: 30 } as const;

/**
 * ¿Es un registro de «solo enlace» de la antigua pestaña «URL / Cloud»?
 *
 * Esa pestaña (ya retirada) guardaba un enlace de YouTube/Vimeo/Drive/Dropbox/URL
 * FINGIENDO una subida y con metadatos inventados. No hay fichero: ni se subió a
 * Bunny ni se puede analizar (la CSP de producción bloquea además el media externo),
 * así que no debe ofrecerse como vídeo analizable. Se reconoce por la huella EXACTA
 * de aquel código (metadatos inventados + tamaño 0 + sin fichero local + misma URL
 * externa en embed/stream), para no confundirlo con ningún vídeo real.
 */
export function isLinkOnlyVideo(v: VideoRecord): boolean {
  if (v.localPath || v.fileHash || v.thumbnailUrl) return false;
  if ((v.storageSize ?? 0) !== 0) return false;
  if (
    v.duration !== LEGACY_URL_TAB_FAKE_META.duration ||
    v.width !== LEGACY_URL_TAB_FAKE_META.width ||
    v.height !== LEGACY_URL_TAB_FAKE_META.height ||
    v.fps !== LEGACY_URL_TAB_FAKE_META.fps
  ) {
    return false;
  }
  const src = v.streamUrl;
  if (!src || src !== v.embedUrl || !/^https?:\/\//i.test(src)) return false;
  try {
    return !BUNNY_HOST_RE.test(new URL(src).hostname);
  } catch {
    return false;
  }
}

// ── Auto-heal: videos con embedUrl válido pero status stuck ──────────────────
function autoHealVideoStatuses(videos: VideoRecord[]): VideoRecord[] {
  let changed = false;
  const healed = videos.map((v) => {
    // First, clear any stale blob URLs from previous sessions
    const cleaned = clearStaleBlobUrls(v);
    if (cleaned !== v) {
      changed = true;
      VideoService.save(cleaned);
    }
    const current = cleaned;

    // Si tiene embedUrl válido (HTTP) y está reproducible pero status no es "finished"
    // Note: only count HTTP URLs as valid sources, not blob URLs (they expire on refresh)
    const hasValidSource =
      (current.embedUrl && current.embedUrl.startsWith("http")) ||
      (current.streamUrl && current.streamUrl.startsWith("http")) ||
      (isLocalSrc(current.localPath) && !current.localPath?.startsWith("blob:"));

    if (
      hasValidSource &&
      current.status !== "finished" &&
      current.status !== "error" &&
      current.status !== "upload-failed"
    ) {
      changed = true;
      const fixed = { ...current, status: "finished" as const, statusCode: 4, encodeProgress: 100 };
      VideoService.save(fixed);
      return fixed;
    }
    return current;
  });
  return changed ? healed : videos;
}

// ── List all videos ───────────────────────────────────────────────────────────
export function useVideos(playerId?: string) {
  return useQuery<VideoRecord[]>({
    queryKey: playerId ? ["videos", playerId] : ["videos"],
    queryFn: async () => {
      let all: VideoRecord[];
      if (SUPABASE_CONFIGURED) {
        // Supabase sync is handled by useSupabaseSync — just read local
        all = VideoService.getAll();
      } else {
        // Non-Supabase: sync from Bunny API
        all = await VideoService.syncFromApi(playerId);
      }

      // Auto-heal videos stuck in "processing" that already have valid embedUrl
      all = autoHealVideoStatuses(all);

      // Registros de «solo enlace» con metadatos inventados → fuera del selector del
      // Lab / Reportes (no son analizables). No se borran del almacenamiento.
      all = all.filter((v) => !isLinkOnlyVideo(v));

      return playerId ? all.filter((v) => v.playerId === playerId) : all;
    },
    staleTime: STALE,
    placeholderData: () =>
      (playerId ? VideoService.getByPlayerId(playerId) : VideoService.getAll()).filter(
        (v) => !isLinkOnlyVideo(v),
      ),
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
        const res = await fetch(`/api/videos/status?videoId=${id}`, {
          headers: await getAuthHeaders(),
        });
        if (!res.ok) {
          throw new Error(`Status API error: ${res.status}`);
        }
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
      // Una subida a medias de este vídeo ya no debe reanudarse: tras borrarlo, volver a
      // subir el mismo fichero tiene que crear un vídeo nuevo (video-init), no reanudar
      // contra un VideoId que Bunny ya no tiene.
      clearTusSessionsForVideo(videoId);
      // Delete from Bunny API
      try {
        const res = await fetch(`/api/videos/delete?videoId=${videoId}`, {
          method: "DELETE",
          headers: await getAuthHeaders(),
        });
        if (!res.ok) {
          const errText = await res.text().catch(() => `HTTP ${res.status}`);
          throw new Error(`Delete API error: ${res.status} — ${errText}`);
        }
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
      toast.success(i18n.t("toasts.videoDeleted"));
      qc.invalidateQueries({ queryKey: ["videos"] });
      qc.removeQueries({ queryKey: ["video", videoId] });
    },
    onError: (err: Error) => {
      toast.error(i18n.t("toasts.deleteError", { msg: err.message }));
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
        headers: await getAuthHeaders(),
        body: JSON.stringify({ videoId, playerId }),
      });
      if (!res.ok) {
        const errText = await res.text().catch(() => `HTTP ${res.status}`);
        throw new Error(`Pipeline API error: ${res.status} — ${errText}`);
      }
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
      toast.success(i18n.t("toasts.tacticalAnalysisComplete"));
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
      ).catch(() => {});
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
