/**
 * VITAS Phase 2 — useVideoUpload hook
 *
 * Manages the full upload lifecycle:
 *   1. POST /api/upload/video-init  → get uploadUrl + videoId + accessKey
 *   2. PUT file directly to Bunny   → XHR for real progress %
 *   3. Poll /api/videos/{id}/status → wait for encode to finish
 *   4. POST /api/pipeline/start     → run Roboflow + TacticalLabel
 *
 * Returns upload state + controls.
 */

import { useState, useRef, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import * as tus from "tus-js-client";
import { VideoService } from "@/services/real/videoService";
import type { VideoRecord, VideoAnalysis } from "@/services/real/videoService";
import { useAuth } from "@/context/AuthContext";
import { SupabaseVideoService } from "@/services/real/supabaseVideoService";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/apiAuth";
import {
  generateLocalVideoId,
  extractVideoMetadata,
  extractThumbnailFromVideo,
} from "@/lib/localVideoUtils";
import { getErrorDetails } from "@/services/errorDiagnosticService";

export type UploadPhase =
  | "idle"
  | "init"         // creating Bunny entry
  | "uploading"    // XHR PUT to Bunny
  | "processing"   // Bunny encoding
  | "analyzing"    // pipeline (Roboflow + Claude)
  | "done"
  | "error";

export interface UploadState {
  phase: UploadPhase;
  progress: number;        // 0-100 (upload %)
  encodeProgress: number;  // 0-100 (Bunny encoding %)
  videoId: string | null;
  error: string | null;
  video: VideoRecord | null;
  analysis: VideoAnalysis | null;
  phase2Pending: boolean;
  uploadSpeed: number;     // bytes per second
  etaSeconds: number;      // estimated time remaining
}

const INITIAL: UploadState = {
  phase: "idle",
  progress: 0,
  encodeProgress: 0,
  videoId: null,
  error: null,
  video: null,
  analysis: null,
  phase2Pending: false,
  uploadSpeed: 0,
  etaSeconds: 0,
};

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 60; // 4 min max wait

// Auth headers from shared utility
const authHeaders = getAuthHeaders;

export function useVideoUpload(playerId?: string) {
  const [state, setState] = useState<UploadState>(INITIAL);
  const tusRef = useRef<tus.Upload | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const setPhase = (phase: UploadPhase, extra?: Partial<UploadState>) =>
    setState((prev) => ({ ...prev, phase, ...extra }));

  const reset = useCallback(() => {
    tusRef.current?.abort();
    if (pollTimerRef.current) clearTimeout(pollTimerRef.current);
    setState(INITIAL);
  }, []);

  const upload = useCallback(
    async (file: File, title?: string) => {
      reset();
      setPhase("init");

      try {
        // ── Step 1: Init ────────────────────────────────────────────────────
        const initRes = await fetch("/api/upload/video-init", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({
            title: title ?? file.name,
            playerId,
          }),
        });

        if (!initRes.ok) {
          if (initRes.status === 401 || initRes.status === 403) {
            throw new Error("Sesión expirada. Por favor, cierra sesión y vuelve a iniciar sesión.");
          }
          const errText = await initRes.text().catch(() => `HTTP ${initRes.status}`);
          let errMsg = `HTTP ${initRes.status}`;
          try {
            const errJson = JSON.parse(errText) as { error?: string };
            errMsg = errJson.error ?? errMsg;
          } catch { /* not JSON */ }
          throw new Error(`video-init: ${errMsg}`);
        }

        const initData = (await initRes.json()) as {
          success: boolean;
          phase2Pending?: boolean;
          error?: string;
          data?: {
            videoId:       string;
            uploadUrl:     string;
            authSignature: string;
            authExpire:    number;
            libraryId:     number;
          };
        };

        if (!initData.success) {
          if (initData.phase2Pending) {
            // ── LOCAL FALLBACK: Bunny CDN no configurado ────────────────────
            // Procesar el video localmente sin necesidad de CDN
            setPhase("uploading", { progress: 10 });

            const localId = generateLocalVideoId();
            const blobUrl = URL.createObjectURL(file);

            let meta = { duration: 0, width: 1280, height: 720 };
            try {
              meta = await extractVideoMetadata(file);
              setState((prev) => ({ ...prev, progress: 40 }));
            } catch {
              // Si falla metadata, usar defaults
            }

            let thumbnailUrl: string | null = null;
            try {
              thumbnailUrl = await extractThumbnailFromVideo(
                blobUrl,
                Math.min(2, (meta.duration || 10) / 2)
              );
              setState((prev) => ({ ...prev, progress: 70 }));
            } catch {
              // Thumbnail opcional
            }

            const localVideo: VideoRecord = {
              id: localId,
              title: title ?? file.name,
              playerId: playerId ?? null,
              status: "finished",
              statusCode: 4,
              encodeProgress: 100,
              duration: Math.round(meta.duration),
              width: meta.width,
              height: meta.height,
              fps: 30,
              storageSize: file.size,
              thumbnailUrl,
              embedUrl: "",
              streamUrl: blobUrl,
              dateUploaded: new Date().toISOString(),
              localPath: blobUrl,
              analysisResult: null,
            };

            VideoService.save(localVideo);
            if (user && SUPABASE_CONFIGURED) {
              SupabaseVideoService.pushOne(user.id, localVideo).catch((err) => {
                console.warn("[useVideoUpload] pushOne local video failed:", err);
              });
            }

            setState({
              ...INITIAL,
              phase: "done",
              progress: 100,
              videoId: localId,
              video: localVideo,
            });

            queryClient.invalidateQueries({ queryKey: ["videos"] });
            if (playerId) {
              queryClient.invalidateQueries({ queryKey: ["videos", playerId] });
            }
            return;
          }
          throw new Error(initData.error ?? "Init failed");
        }

        const { videoId, authSignature, authExpire } = initData.data!;
        const libraryId = initData.data!.libraryId;

        // Create local stub
        const stubParams = {
          id: videoId,
          title: title ?? file.name,
          playerId: playerId ?? null,
          localPath: URL.createObjectURL(file),
        };
        if (user && SUPABASE_CONFIGURED) {
          const stub = VideoService.createStub(stubParams);
          SupabaseVideoService.pushOne(user.id, stub).catch((err) => {
            console.warn("[useVideoUpload] pushOne stub failed:", err);
          });
        } else {
          VideoService.createStub(stubParams);
        }

        setState((prev) => ({ ...prev, videoId, phase: "uploading" }));

        // ── Step 2: Upload to Bunny via TUS protocol (signed, resumable) ────
        const uploadStartTime = Date.now();
        await new Promise<void>((resolve, reject) => {
          const tusUpload = new tus.Upload(file, {
            endpoint: "https://video.bunnycdn.com/tusupload",
            retryDelays: [0, 1000, 3000, 5000],
            headers: {
              AuthorizationSignature: authSignature,
              AuthorizationExpire: String(authExpire),
              VideoId: videoId,
              LibraryId: String(libraryId),
            },
            metadata: {
              filetype: file.type,
              title: title ?? file.name,
            },
            onError: (error) => {
              reject(new Error(`Upload failed: ${error.message || error}`));
            },
            onProgress: (bytesUploaded, bytesTotal) => {
              const pct = Math.round((bytesUploaded / bytesTotal) * 100);
              const now = Date.now();
              const elapsed = (now - uploadStartTime) / 1000; // seconds
              const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
              const remaining = bytesTotal - bytesUploaded;
              const eta = speed > 0 ? Math.round(remaining / speed) : 0;
              setState((prev) => ({ ...prev, progress: pct, uploadSpeed: speed, etaSeconds: eta }));
            },
            onSuccess: () => {
              resolve();
            },
          });

          // Store reference for cancel support
          tusRef.current = tusUpload;
          tusUpload.start();
        });

        // Construir embedUrl inmediatamente usando libraryId (no esperar polling)
        const embedUrl = `https://iframe.mediadelivery.net/embed/${initData.data!.libraryId}/${videoId}`;
        const uploadedStub = VideoService.getById(videoId);
        if (uploadedStub) {
          VideoService.save({ ...uploadedStub, status: "uploaded", statusCode: 1, encodeProgress: 0, embedUrl });
          if (user && SUPABASE_CONFIGURED) {
            const updated = VideoService.getById(videoId);
            if (updated) SupabaseVideoService.pushOne(user.id, updated).catch((err) => {
              console.warn("[useVideoUpload] pushOne uploaded stub failed:", err);
            });
          }
        }
        setState((prev) => ({ ...prev, phase: "processing", progress: 100 }));

        // ── Step 3: Poll encoding status ─────────────────────────────────────
        const MAX_CONSECUTIVE_ERRORS = 5;
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;
          let consecutiveErrors = 0;

          const poll = async () => {
            if (attempts++ >= POLL_MAX_ATTEMPTS) {
              reject(new Error("Timeout: video encoding took too long"));
              return;
            }

            try {
              const statusRes = await fetch(`/api/videos/status?videoId=${videoId}`, {
                headers: await authHeaders(),
              });
              const statusData = (await statusRes.json()) as {
                success: boolean;
                data?: {
                  status: string;
                  encodeProgress: number;
                  isReady: boolean;
                  thumbnailUrl: string | null;
                  embedUrl: string;
                  streamUrl: string | null;
                  duration: number;
                  width: number;
                  height: number;
                  fps: number;
                  storageSize: number;
                };
              };

              if (statusData.success && statusData.data) {
                consecutiveErrors = 0; // reset on success
                const d = statusData.data;
                setState((prev) => ({
                  ...prev,
                  encodeProgress: d.encodeProgress,
                }));

                if (d.isReady) {
                  // Update local record with CDN data, clear expired blob URL
                  const local = VideoService.getById(videoId);
                  if (local) {
                    // Revoke blob URL to free memory (it will expire on refresh anyway)
                    if (local.localPath?.startsWith("blob:")) {
                      URL.revokeObjectURL(local.localPath);
                    }
                    VideoService.save({
                      ...local,
                      status: "finished",
                      statusCode: 4,
                      encodeProgress: 100,
                      thumbnailUrl: d.thumbnailUrl,
                      embedUrl: d.embedUrl,
                      streamUrl: d.streamUrl,
                      duration: d.duration,
                      width: d.width,
                      height: d.height,
                      fps: d.fps,
                      storageSize: d.storageSize,
                      localPath: undefined, // CDN URLs replace blob
                    });
                  }
                  resolve();
                  return;
                }

                if (d.status === "error" || d.status === "upload-failed") {
                  reject(new Error(`Bunny encoding failed: ${d.status}`));
                  return;
                }
              }
            } catch (pollErr) {
              // Poll failed — count consecutive failures
              consecutiveErrors++;
              console.warn(`[useVideoUpload] poll error (${consecutiveErrors}/${MAX_CONSECUTIVE_ERRORS}):`, pollErr);
              if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                reject(new Error("Polling falló repetidamente — verifica tu conexión a internet"));
                return;
              }
            }

            pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          };

          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        });

        // ── Step 4: Run analysis pipeline ────────────────────────────────────
        setPhase("analyzing");

        const pipelineRes = await fetch("/api/pipeline/start", {
          method: "POST",
          headers: await authHeaders(),
          body: JSON.stringify({ videoId, playerId }),
        });

        // pipeline/start ahora retorna { success, report, pipelineMeta }
        // (ya no retorna HTML — consume SSE internamente y devuelve JSON)
        let pipelineData: {
          success?: boolean;
          report?: VideoAnalysis;
          error?: string;
        } = {};
        try {
          pipelineData = (await pipelineRes.json()) as typeof pipelineData;
        } catch {
          // JSON parse falló → continuar con analysis null (upload sigue exitoso)
          console.warn("[useVideoUpload] pipeline response no es JSON válido");
        }

        let analysis: VideoAnalysis | null = null;
        if (pipelineData.success && pipelineData.report) {
          analysis = pipelineData.report;
          VideoService.saveAnalysis(videoId, analysis);
        }

        const finalVideo = VideoService.getById(videoId);

        setState((prev) => ({
          ...prev,
          phase: "done",
          video: finalVideo,
          analysis,
        }));

        // Invalidate queries so UI refreshes
        queryClient.invalidateQueries({ queryKey: ["videos"] });
        if (playerId) {
          queryClient.invalidateQueries({ queryKey: ["videos", playerId] });
        }
      } catch (err) {
        // Clean up blob URLs to prevent memory leaks
        const currentVideo = state.videoId ? VideoService.getById(state.videoId) : null;
        if (currentVideo?.localPath?.startsWith("blob:")) {
          URL.revokeObjectURL(currentVideo.localPath);
        }

        console.error("[useVideoUpload] Upload failed:", err);
        const { title, description } = getErrorDetails(err, "upload");
        const rawMsg = err instanceof Error ? err.message : String(err);
        // Show diagnostic message + raw error for debugging
        const errorMsg = rawMsg.length > 80 ? rawMsg : `${title}. ${description}`;
        setState((prev) => ({ ...prev, phase: "error", error: errorMsg }));
      }
    },
    [playerId, reset, queryClient, user]
  );

  const cancel = useCallback(() => {
    tusRef.current?.abort();
    reset();
  }, [reset]);

  return { state, upload, cancel, reset };
}
