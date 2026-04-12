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

// ── Blob URL validation ─────────────────────────────────────────────────────

/**
 * Check if a blob: URL is still valid (not revoked / not from a previous session).
 * Uses a synchronous HEAD fetch to test if the blob is still accessible.
 */
export function isBlobUrlValid(url: string): boolean {
  if (!url.startsWith("blob:")) return true; // not a blob URL, skip check
  try {
    const xhr = new XMLHttpRequest();
    xhr.open("HEAD", url, false); // synchronous
    xhr.send();
    return xhr.status === 200;
  } catch {
    return false;
  }
}

/**
 * Sanitize a video record by clearing stale blob URLs.
 * If the video has CDN URLs (embedUrl/streamUrl starting with http), those are kept.
 * If only blob URLs remain and they're invalid, clear them.
 */
export function clearStaleBlobUrls(video: import("@/services/real/videoService").VideoRecord): import("@/services/real/videoService").VideoRecord {
  let changed = false;
  const result = { ...video };

  if (result.localPath?.startsWith("blob:") && !isBlobUrlValid(result.localPath)) {
    result.localPath = undefined;
    changed = true;
  }
  if (result.streamUrl?.startsWith("blob:") && !isBlobUrlValid(result.streamUrl)) {
    result.streamUrl = null;
    changed = true;
  }
  if (result.thumbnailUrl?.startsWith("blob:") && !isBlobUrlValid(result.thumbnailUrl)) {
    result.thumbnailUrl = null;
    changed = true;
  }

  return changed ? result : video;
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

// ── Video completo como base64 (para Gemini) ───────────────────────────────

export interface VideoBase64Result {
  base64: string;       // raw base64 sin prefijo data:
  mediaType: string;    // "video/mp4", "video/webm", etc.
  sizeBytes: number;
}

/**
 * Lee un video como base64 para enviarlo a Gemini.
 * Acepta rutas locales (/public/...) o blob: URLs.
 * Retorna null si el video excede maxSizeMB.
 */
export async function readVideoAsBase64(
  src: string,
  maxSizeMB = 20
): Promise<VideoBase64Result | null> {
  try {
    const response = await fetch(src);
    if (!response.ok) return null;

    const blob = await response.blob();
    if (blob.size > maxSizeMB * 1024 * 1024) {
      console.warn(`[LocalVideo] Video demasiado grande: ${(blob.size / 1024 / 1024).toFixed(1)}MB > ${maxSizeMB}MB`);
      return null;
    }

    const arrayBuffer = await blob.arrayBuffer();
    const bytes = new Uint8Array(arrayBuffer);
    // Convertir a base64 en chunks para evitar stack overflow con btoa
    let binary = "";
    const chunkSize = 8192;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize));
    }
    const base64 = btoa(binary);

    const mediaType = blob.type || "video/mp4";
    console.log(`[LocalVideo] Video leído: ${(blob.size / 1024 / 1024).toFixed(1)}MB, tipo: ${mediaType}`);

    return { base64, mediaType, sizeBytes: blob.size };
  } catch (err) {
    console.error("[LocalVideo] Error leyendo video como base64:", err);
    return null;
  }
}

// ── Frame count óptimo ──────────────────────────────────────────────────────

/** Calcula cuántos frames extraer según la duración del video (fallback Claude) */
export function getOptimalFrameCount(durationSec: number): number {
  if (durationSec < 60) return 20;       // <1min: 1 cada 3s
  if (durationSec < 300) return 60;      // 1-5min: 1 cada 5s
  return 100;                            // 5min+: máximo API (1 cada 6-9s)
}

// ── Keyframes (para Intelligence Report) ─────────────────────────────────────

export interface LocalKeyframe {
  url: string;       // data:image/jpeg;base64,...
  timestamp: number; // seconds
  frameIndex: number;
}

/**
 * Extrae N keyframes espaciados del video local.
 * Usa UN SOLO video element para todos los frames (evita recargar 8 veces).
 */
export function extractKeyframesFromVideo(
  videoSrc: string,
  durationSec: number,
  count = 8
): Promise<LocalKeyframe[]> {
  return new Promise((resolve, reject) => {
    const video = document.createElement("video");
    video.preload = "auto";
    video.muted = true;
    video.playsInline = true;
    // Solo crossOrigin para URLs externas
    if (videoSrc.startsWith("http") && !videoSrc.startsWith(window.location.origin)) {
      video.crossOrigin = "anonymous";
    }
    video.src = videoSrc;

    const keyframes: LocalKeyframe[] = [];
    const effectiveDuration = Math.max(durationSec, 5);
    const timestamps = Array.from({ length: count }, (_, i) =>
      (effectiveDuration / (count + 1)) * (i + 1)
    );
    let currentIdx = 0;

    const canvas = document.createElement("canvas");
    canvas.width = 640;
    canvas.height = 360;
    const ctx = canvas.getContext("2d");

    function captureCurrentFrame() {
      if (!ctx) return;
      try {
        ctx.drawImage(video, 0, 0, 640, 360);
        const dataUrl = canvas.toDataURL("image/jpeg", 0.7);
        // Verificar que no sea un frame vacío (todo negro/transparente)
        if (dataUrl.length > 500) {
          keyframes.push({
            url: dataUrl,
            timestamp: timestamps[currentIdx],
            frameIndex: currentIdx,
          });
        } else {
          console.warn(`[LocalVideo] Frame ${currentIdx} vacío, saltando`);
        }
      } catch (err) {
        console.warn(`[LocalVideo] Error capturando frame ${currentIdx}:`, err);
      }
    }

    function seekToNext() {
      currentIdx++;
      if (currentIdx >= timestamps.length) {
        // Terminamos — cleanup y resolver
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
        console.log(`[LocalVideo] Extraídos ${keyframes.length}/${count} keyframes`);
        resolve(keyframes);
        return;
      }
      const seekTo = Math.min(timestamps[currentIdx], Math.max(0, video.duration - 0.5));
      video.currentTime = seekTo;
    }

    video.onseeked = () => {
      captureCurrentFrame();
      seekToNext();
    };

    video.onloadeddata = () => {
      console.log(`[LocalVideo] Video cargado: ${video.duration}s, ${video.videoWidth}x${video.videoHeight}`);
      // Ajustar canvas al aspect ratio real del video
      if (video.videoWidth > 0 && video.videoHeight > 0) {
        const aspect = video.videoWidth / video.videoHeight;
        canvas.width = 640;
        canvas.height = Math.round(640 / aspect);
      }
      // Iniciar primera extracción
      const seekTo = Math.min(timestamps[0], Math.max(0, video.duration - 0.5));
      video.currentTime = seekTo;
    };

    video.onerror = () => {
      const code = video.error?.code ?? 0;
      const msg = video.error?.message ?? "desconocido";
      console.error(`[LocalVideo] Error cargando video: code=${code}, msg=${msg}`);
      video.remove();
      // Si ya extrajimos algunos frames, devolver lo que tengamos
      if (keyframes.length > 0) {
        resolve(keyframes);
      } else {
        reject(new Error(`Error cargando video (code ${code}): ${msg}`));
      }
    };

    // Timeout de seguridad global (30s para todos los frames)
    setTimeout(() => {
      if (currentIdx < timestamps.length) {
        console.warn(`[LocalVideo] Timeout global — extraídos ${keyframes.length}/${count} frames`);
        video.pause();
        video.remove();
        // Devolver lo que tengamos
        resolve(keyframes);
      }
    }, 30000);
  });
}
