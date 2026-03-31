/**
 * VITAS Phase 2 — VideoPlayer component
 *
 * Renders a Bunny Stream video via their iframe embed URL.
 * Shows a placeholder when the video is still processing or unavailable.
 */

import { useState } from "react";
import { motion } from "framer-motion";
import { Play, Loader2, AlertCircle, Film } from "lucide-react";
import type { VideoRecord } from "@/services/real/videoService";

interface VideoPlayerProps {
  video: VideoRecord;
  autoplay?: boolean;
  className?: string;
}

export default function VideoPlayer({
  video,
  autoplay = false,
  className = "",
}: VideoPlayerProps) {
  const [playing, setPlaying] = useState(autoplay);

  const isReady = video.status === "finished";
  const isProcessing =
    video.status === "processing" || video.status === "transcoding";
  const isError =
    video.status === "error" || video.status === "upload-failed";

  const embedUrl = video.embedUrl
    ? `${video.embedUrl}?autoplay=${autoplay ? 1 : 0}&responsive=true&preload=true`
    : null;

  // ── Processing state ───────────────────────────────────────────────────────
  if (isProcessing) {
    return (
      <div
        className={`relative aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center ${className}`}
      >
        {video.thumbnailUrl && (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="absolute inset-0 w-full h-full object-cover opacity-30"
          />
        )}
        <div className="relative flex flex-col items-center gap-3">
          <Loader2 size={28} className="text-primary animate-spin" />
          <div className="text-center">
            <p className="text-sm font-display font-semibold text-foreground">
              Procesando video
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {video.encodeProgress}% completado
            </p>
          </div>
          {/* Encode progress */}
          <div className="w-32 h-1 rounded-full bg-muted overflow-hidden">
            <motion.div
              className="h-full bg-primary rounded-full"
              animate={{ width: `${video.encodeProgress}%` }}
            />
          </div>
        </div>
      </div>
    );
  }

  // ── Error state ────────────────────────────────────────────────────────────
  if (isError) {
    return (
      <div
        className={`relative aspect-video rounded-xl overflow-hidden bg-destructive/10 border border-destructive/20 flex items-center justify-center ${className}`}
      >
        <div className="flex flex-col items-center gap-2 text-center p-4">
          <AlertCircle size={28} className="text-destructive" />
          <p className="text-sm font-display font-semibold text-foreground">
            Error al procesar
          </p>
          <p className="text-xs text-muted-foreground">
            El video no pudo ser procesado. Intenta subir de nuevo.
          </p>
        </div>
      </div>
    );
  }

  // ── Not ready / no embed URL ───────────────────────────────────────────────
  if (!isReady || !embedUrl) {
    return (
      <div
        className={`relative aspect-video rounded-xl overflow-hidden bg-secondary flex items-center justify-center ${className}`}
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover opacity-50"
          />
        ) : (
          <Film size={32} className="text-muted-foreground" />
        )}
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="bg-background/60 backdrop-blur-sm rounded-full p-3">
            <Film size={20} className="text-muted-foreground" />
          </div>
        </div>
      </div>
    );
  }

  // ── Ready: show thumbnail with play button → iframe on click ──────────────
  if (!playing) {
    return (
      <div
        className={`relative aspect-video rounded-xl overflow-hidden bg-secondary cursor-pointer group ${className}`}
        onClick={() => setPlaying(true)}
      >
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        ) : (
          <div className="w-full h-full bg-secondary flex items-center justify-center">
            <Film size={32} className="text-muted-foreground" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/60 via-transparent to-transparent" />
        <div className="absolute inset-0 flex items-center justify-center">
          <motion.div
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="w-16 h-16 rounded-full bg-primary/90 backdrop-blur-sm flex items-center justify-center shadow-lg"
          >
            <Play size={28} className="text-primary-foreground ml-1" />
          </motion.div>
        </div>
        {/* Duration badge */}
        {video.duration > 0 && (
          <div className="absolute bottom-2 right-2 px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-display text-foreground">
            {formatDuration(video.duration)}
          </div>
        )}
      </div>
    );
  }

  // ── Iframe embed ───────────────────────────────────────────────────────────
  return (
    <div className={`relative aspect-video rounded-xl overflow-hidden bg-black ${className}`}>
      <iframe
        src={embedUrl}
        title={video.title}
        className="absolute inset-0 w-full h-full"
        allow="accelerometer; gyroscope; autoplay; encrypted-media; picture-in-picture"
        allowFullScreen
        loading="lazy"
      />
    </div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
