/**
 * VITAS · Frame Extractor
 *
 * Extrae frames de un HTMLVideoElement a la frecuencia objetivo
 * usando requestAnimationFrame + OffscreenCanvas (o Canvas normal como fallback).
 *
 * El video debe tener crossOrigin="anonymous" y la URL debe tener CORS habilitado
 * (Bunny CDN ya lo tiene con Access-Control-Allow-Origin: *).
 */

export interface FrameExtractorConfig {
  video:       HTMLVideoElement;
  targetFps:   number;                                             // e.g. 8
  width:       number;                                             // canvas resize width
  height:      number;                                             // canvas resize height
  onFrame:     (imageData: ImageData, timestampMs: number) => void;
  onError?:    (err: Error) => void;
}

export class FrameExtractor {
  private rafId:         number | null = null;
  private lastExtractMs: number = -1;
  private canvas:        HTMLCanvasElement;
  private ctx:           CanvasRenderingContext2D;
  private config:        FrameExtractorConfig | null = null;

  constructor() {
    this.canvas = document.createElement("canvas");
    const ctx   = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Canvas 2D no disponible");
    this.ctx = ctx;
  }

  start(config: FrameExtractorConfig): void {
    this.stop();
    this.config         = config;
    this.lastExtractMs  = -1;
    this.canvas.width   = config.width;
    this.canvas.height  = config.height;
    this.loop();
  }

  stop(): void {
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
    this.config = null;
  }

  private loop = (): void => {
    this.rafId = requestAnimationFrame(this.loop);
    if (!this.config) return;

    const { video, targetFps, onFrame, onError } = this.config;
    if (video.paused || video.ended || video.readyState < 2) return;

    const nowMs   = video.currentTime * 1000;
    const interval = 1000 / targetFps;

    if (nowMs - this.lastExtractMs < interval) return;
    this.lastExtractMs = nowMs;

    try {
      this.ctx.drawImage(video, 0, 0, this.canvas.width, this.canvas.height);
      const imageData = this.ctx.getImageData(0, 0, this.canvas.width, this.canvas.height);
      onFrame(imageData, nowMs);
    } catch (err) {
      onError?.(err instanceof Error ? err : new Error(String(err)));
    }
  };
}

/**
 * Construye la URL de stream directo de Bunny CDN desde el videoId.
 * Requiere que el video esté codificado (status = uploaded/finished).
 */
export function buildBunnyCdnUrl(
  videoId:     string,
  cdnHostname: string,
  format:      "hls" | "mp4" = "mp4"
): string {
  if (format === "hls") {
    return `https://${cdnHostname}/${videoId}/playlist.m3u8`;
  }
  // MP4 directo (resolución original)
  return `https://${cdnHostname}/${videoId}/play_720p.mp4`;
}
