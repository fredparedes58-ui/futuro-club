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
import { VideoService } from "@/services/real/videoService";
import type { VideoRecord, VideoAnalysis } from "@/services/real/videoService";
import { useAuth } from "@/context/AuthContext";
import { SupabaseVideoService } from "@/services/real/supabaseVideoService";
import { SUPABASE_CONFIGURED } from "@/lib/supabase";

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
};

const POLL_INTERVAL_MS = 4000;
const POLL_MAX_ATTEMPTS = 60; // 4 min max wait

export function useVideoUpload(playerId?: string) {
  const [state, setState] = useState<UploadState>(INITIAL);
  const xhrRef = useRef<XMLHttpRequest | null>(null);
  const pollTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const setPhase = (phase: UploadPhase, extra?: Partial<UploadState>) =>
    setState((prev) => ({ ...prev, phase, ...extra }));

  const reset = useCallback(() => {
    xhrRef.current?.abort();
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
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            title: title ?? file.name,
            playerId,
          }),
        });

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
            setState((prev) => ({
              ...prev,
              phase: "error",
              phase2Pending: true,
              error: initData.error ?? "Bunny Stream no configurado (Fase 2 pendiente)",
            }));
            return;
          }
          throw new Error(initData.error ?? "Init failed");
        }

        const { videoId, uploadUrl, authSignature, authExpire } = initData.data!;

        // Create local stub
        const stubParams = {
          id: videoId,
          title: title ?? file.name,
          playerId: playerId ?? null,
          localPath: URL.createObjectURL(file),
        };
        if (user && SUPABASE_CONFIGURED) {
          const stub = VideoService.createStub(stubParams);
          SupabaseVideoService.pushOne(user.id, stub).catch(console.warn);
        } else {
          VideoService.createStub(stubParams);
        }

        setState((prev) => ({ ...prev, videoId, phase: "uploading" }));

        // ── Step 2: Direct upload to Bunny via XHR ──────────────────────────
        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;

          xhr.open("PUT", uploadUrl);
          // Use one-time signature instead of permanent API key
          xhr.setRequestHeader("AuthorizationSignature", authSignature);
          xhr.setRequestHeader("AuthorizationExpire", String(authExpire));
          xhr.setRequestHeader("Content-Type", "video/*");

          xhr.upload.onprogress = (e) => {
            if (e.lengthComputable) {
              const pct = Math.round((e.loaded / e.total) * 100);
              setState((prev) => ({ ...prev, progress: pct }));
            }
          };

          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve();
            } else {
              reject(new Error(`Upload failed: HTTP ${xhr.status}`));
            }
          };

          xhr.onerror = () => reject(new Error("XHR network error"));
          xhr.onabort = () => reject(new Error("Upload cancelled"));

          xhr.send(file);
        });

        VideoService.updateStatus(videoId, "uploaded", 0);
        setState((prev) => ({ ...prev, phase: "processing", progress: 100 }));

        // ── Step 3: Poll encoding status ─────────────────────────────────────
        await new Promise<void>((resolve, reject) => {
          let attempts = 0;

          const poll = async () => {
            if (attempts++ >= POLL_MAX_ATTEMPTS) {
              reject(new Error("Timeout: video encoding took too long"));
              return;
            }

            try {
              const statusRes = await fetch(`/api/videos/${videoId}/status`);
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
                const d = statusData.data;
                setState((prev) => ({
                  ...prev,
                  encodeProgress: d.encodeProgress,
                }));

                if (d.isReady) {
                  // Update local record with full data
                  const local = VideoService.getById(videoId);
                  if (local) {
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
            } catch {
              // Poll silently fails → keep trying
            }

            pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
          };

          pollTimerRef.current = setTimeout(poll, POLL_INTERVAL_MS);
        });

        // ── Step 4: Run analysis pipeline ────────────────────────────────────
        setPhase("analyzing");

        const pipelineRes = await fetch("/api/pipeline/start", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ videoId, playerId }),
        });

        const pipelineData = (await pipelineRes.json()) as {
          success: boolean;
          phase2Pending?: boolean;
          error?: string;
          data?: {
            tacticalAnalysis: VideoAnalysis;
          };
        };

        let analysis: VideoAnalysis | null = null;
        if (pipelineData.success && pipelineData.data) {
          analysis = pipelineData.data.tacticalAnalysis;
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
        const message = err instanceof Error ? err.message : "Upload error";
        setState((prev) => ({ ...prev, phase: "error", error: message }));
      }
    },
    [playerId, reset, queryClient]
  );

  const cancel = useCallback(() => {
    xhrRef.current?.abort();
    reset();
  }, [reset]);

  return { state, upload, cancel, reset };
}
