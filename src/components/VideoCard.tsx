/**
 * VITAS Phase 2 — VideoCard component
 *
 * Thumbnail card for a video in a grid/list.
 * Shows title, duration, status badge, and analysis indicator.
 */

import { motion } from "framer-motion";
import { Play, Loader2, AlertCircle, Zap, Trash2 } from "lucide-react";
import type { VideoRecord } from "@/services/real/videoService";

interface VideoCardProps {
  video: VideoRecord;
  onClick?: (video: VideoRecord) => void;
  onDelete?: (videoId: string) => void;
  showDelete?: boolean;
  className?: string;
}

const statusBadge: Record<string, { label: string; class: string }> = {
  created:       { label: "Creado",       class: "bg-muted text-muted-foreground" },
  uploaded:      { label: "Subido",       class: "bg-blue-500/10 text-blue-400" },
  processing:    { label: "Procesando",   class: "bg-gold/10 text-gold" },
  transcoding:   { label: "Codificando",  class: "bg-gold/10 text-gold" },
  finished:      { label: "Listo",        class: "bg-primary/10 text-primary" },
  error:         { label: "Error",        class: "bg-destructive/10 text-destructive" },
  "upload-failed": { label: "Falló",      class: "bg-destructive/10 text-destructive" },
  unknown:       { label: "Desconocido",  class: "bg-muted text-muted-foreground" },
};

export default function VideoCard({
  video,
  onClick,
  onDelete,
  showDelete = false,
  className = "",
}: VideoCardProps) {
  const badge = statusBadge[video.status] ?? statusBadge.unknown;
  const isProcessing = video.status === "processing" || video.status === "transcoding";
  const isError = video.status === "error" || video.status === "upload-failed";
  const isReady = video.status === "finished";

  return (
    <motion.div
      whileTap={{ scale: 0.97 }}
      className={`group cursor-pointer ${className}`}
      onClick={() => onClick?.(video)}
    >
      {/* Thumbnail */}
      <div className="relative aspect-video rounded-xl overflow-hidden bg-secondary mb-2">
        {video.thumbnailUrl ? (
          <img
            src={video.thumbnailUrl}
            alt={video.title}
            className="w-full h-full object-cover group-hover:opacity-90 transition-opacity"
          />
        ) : (
          <div className="w-full h-full bg-gradient-to-br from-secondary to-card" />
        )}

        {/* Overlay */}
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />

        {/* Play / Status icon */}
        <div className="absolute inset-0 flex items-center justify-center">
          {isProcessing ? (
            <Loader2 size={24} className="text-primary animate-spin" />
          ) : isError ? (
            <AlertCircle size={24} className="text-destructive" />
          ) : (
            <div className="w-10 h-10 rounded-full bg-primary/80 backdrop-blur-sm flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
              <Play size={18} className="text-primary-foreground ml-0.5" />
            </div>
          )}
        </div>

        {/* Duration badge */}
        {isReady && video.duration > 0 && (
          <div className="absolute bottom-1.5 right-1.5 px-1.5 py-0.5 rounded bg-background/80 text-[10px] font-display text-foreground">
            {formatDuration(video.duration)}
          </div>
        )}

        {/* Encode progress */}
        {isProcessing && (
          <div className="absolute bottom-0 left-0 right-0 h-1 bg-muted">
            <motion.div
              className="h-full bg-gold"
              animate={{ width: `${video.encodeProgress}%` }}
            />
          </div>
        )}

        {/* Status badge */}
        <div className="absolute top-1.5 left-1.5">
          <span
            className={`text-[9px] font-display font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${badge.class}`}
          >
            {badge.label}
          </span>
        </div>

        {/* Delete button */}
        {showDelete && (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onDelete?.(video.id);
            }}
            className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-background/80 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity hover:bg-destructive/20"
          >
            <Trash2 size={10} className="text-muted-foreground hover:text-destructive" />
          </button>
        )}
      </div>

      {/* Info */}
      <div className="space-y-0.5">
        <p className="text-xs font-display font-semibold text-foreground leading-tight line-clamp-2">
          {video.title}
        </p>
        <div className="flex items-center gap-2">
          {video.analysisResult && (
            <div className="flex items-center gap-0.5">
              <Zap size={9} className="text-primary" />
              <span className="text-[9px] font-display text-primary">Analizado</span>
            </div>
          )}
          <span className="text-[9px] text-muted-foreground font-display">
            {new Date(video.dateUploaded).toLocaleDateString("es-ES", {
              day: "numeric",
              month: "short",
            })}
          </span>
        </div>
      </div>
    </motion.div>
  );
}

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}
