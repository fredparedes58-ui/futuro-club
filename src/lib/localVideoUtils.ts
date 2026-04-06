/**
 * VITAS · Local Video Utilities
 *
 * Funciones para manejar videos locales cuando Bunny CDN no está configurado.
 * Usa blob URLs + Canvas para extraer thumbnails y keyframes.
 */

import type { VideoRecord } from "@/services/real/videoService";

// ── Detección ────────────────────────────────────────────────────────────────

/** ¿Está Bunny CDN configurado en el cliente? */
export function isBunnyCdnConfigured(): boolean {
  const hostname = import.meta.env.VITE_BUNNY_CDN_HOSTNAME ?? "";
  return hostname.length > 0 && !hostname.includes("REEMPLAZA");
}

/** ¿Es un video local (no subido a Bunny)? */
export function isLocalVideo(video: VideoRecord): boolean {
  return (
    video.id.startsWith("local-") ||
    isLocalSrc(video.localPath) ||
    isLocalSrc(video.streamUrl)
  );
}

/** ¿Es una URL de video local? (blob:, /, data:) */
export function isLocalSrc(src?: string | null): boolean {
  if (!src) return false;
  return src.startsWith("blob:") || src.startsWith("data:") || (src.startsWith("/") && !src.startsWith("//"));
}

// ── IDs ──────────────────────────────────────────────────────────────────────

/** Genera un ID único para videos locales */
export function generateLocalVideoId(): string {
  const ts = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 8);
  return `local-${ts}-${rand}`;
}

// ── Metadata ─────────────────────────────────────────────────────────────────

/** Extrae metadata de un archivo de video (duration, width, height) */
export function extractVideoMetadata(
  file: File
): Promise<{ duration: number; width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "metadata";
    video.muted = true;

    const blobUrl = URL.createObjectURL(file);
    video.src = blobUrl;

    video.onloadedmetadata = () => {
      // Algunos navegadores necesitan un frame cargado para width/height
      video.currentTime = 0.1;
    };

    video.onseeked = () => {
      const result = {
        duration: video.duration || 0,
        width: video.videoWidth || 1280,
        height: video.videoHeight || 720,
      };
      URL.revokeObjectURL(blobUrl);
      video.remove();
      resolve(result);
    };

    video.onerror = () => {
      URL.revokeObjectURL(blobUrl);
      video.remove();
      reject(new Error("No se pudo leer el video"));
    };

    // Timeout safety
    setTimeout(() => {
      URL.revokeObjectURL(blobUrl);
      video.remove();
      reject(new Error("Timeout leyendo metadata del video"));
    }, 10000);
  });
}

// ── Thumbnails ───────────────────────────────────────────────────────────────

/** Extrae un frame del video como data URL (JPEG) */
export function extractThumbnailFromVideo(
  videoSrc: string,
  timestampSec: number,
  width = 320,
  height = 180
): Promise<string> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    // Solo usar crossOrigin para URLs externas; locales no lo necesitan
    if (videoSrc.startsWith("http") && !videoSrc.startsWith(window.location.origin)) {
      video.crossOrigin = "anonymous";
    }
    video.src = videoSrc;

    let resolved = false;

    video.onloadedmetadata = () => {
      // Clamp timestamp to video duration
      const seekTo = Math.min(timestampSec, Math.max(0, video.duration - 0.5));
      video.currentTime = seekTo;
    };

    video.onseeked = () => {
      if (resolved) return;
      resolved = true;
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) {
          reject(new Error("Canvas 2D no soportado"));
          return;
        }
        ctx.drawImage(video, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        video.remove();
        resolve(dataUrl);
      } catch (err) {
        video.remove();
        reject(err);
      }
    };

    video.onerror = () => {
      video.remove();
      reject(new Error("Error cargando video para thumbnail"));
    };

    setTimeout(() => {
      if (!resolved) {
        resolved = true;
        video.remove();
        reject(new Error("Timeout extrayendo thumbnail"));
      }
    }, 15000);
  });
}

// ── Keyframes (para Intelligence Report) ─────────────────────────────────────

export interface LocalKeyframe {
  url: string;       // data:image/jpeg;base64,...
  timestamp: number; // seconds
  frameIndex: number;
}

/** Extrae N keyframes espaciados del video local */
export async function extractKeyframesFromVideo(
  videoSrc: string,
  durationSec: number,
  count = 8
): Promise<LocalKeyframe[]> {
  const keyframes: LocalKeyframe[] = [];
  const effectiveDuration = Math.max(durationSec, 5);

  for (let i = 0; i < count; i++) {
    const timestamp = (effectiveDuration / (count + 1)) * (i + 1);
    try {
      const url = await extractThumbnailFromVideo(videoSrc, timestamp, 640, 360);
      keyframes.push({ url, timestamp, frameIndex: i });
    } catch {
      // Si falla un frame, continuar con los demás
      console.warn(`[LocalVideo] No se pudo extraer frame ${i} @ ${timestamp}s`);
    }
  }

  return keyframes;
}
