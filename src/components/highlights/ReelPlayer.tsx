/**
 * VITAS · ReelPlayer
 *
 * Sequentially plays a list of clips from the same source video.
 * Listens to timeupdate and seeks to next clip when the current one ends.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  Maximize2,
} from "lucide-react";
import type { HighlightClip } from "@/lib/highlights/types";
import { MOMENT_META } from "@/lib/highlights/types";

interface Props {
  clips: HighlightClip[];
  sourceUrl: string;
  /** Optional poster image */
  posterUrl?: string | null;
  onClipChange?: (clipIndex: number, clip: HighlightClip) => void;
}

function formatTime(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

function isYouTube(url: string): boolean {
  return url.includes("youtube.com") || url.includes("youtu.be");
}
function isVimeo(url: string): boolean {
  return url.includes("vimeo.com");
}
function isDriveEmbed(url: string): boolean {
  return url.includes("drive.google.com/file/");
}

export default function ReelPlayer({
  clips,
  sourceUrl,
  posterUrl,
  onClipChange,
}: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [muted, setMuted] = useState(false);
  const [currentMs, setCurrentMs] = useState(0);

  const currentClip = clips[currentIndex];
  const totalClips = clips.length;

  // Browsers cannot programmatically seek inside YouTube/Vimeo iframes via this approach;
  // for those, we just embed the source and inform the user.
  const isEmbedOnly = isYouTube(sourceUrl) || isVimeo(sourceUrl) || isDriveEmbed(sourceUrl);

  const seekTo = useCallback((ms: number) => {
    const v = videoRef.current;
    if (!v) return;
    v.currentTime = ms / 1000;
  }, []);

  const playClip = useCallback(
    (idx: number) => {
      if (idx < 0 || idx >= clips.length) return;
      setCurrentIndex(idx);
      const clip = clips[idx];
      onClipChange?.(idx, clip);
      seekTo(clip.startMs);
      videoRef.current?.play().catch(() => {});
      setPlaying(true);
    },
    [clips, onClipChange, seekTo],
  );

  const togglePlay = () => {
    const v = videoRef.current;
    if (!v) return;
    if (v.paused) {
      v.play().catch(() => {});
      setPlaying(true);
    } else {
      v.pause();
      setPlaying(false);
    }
  };

  const handleTimeUpdate = () => {
    const v = videoRef.current;
    if (!v) return;
    const now = v.currentTime * 1000;
    setCurrentMs(now);
    const clip = clips[currentIndex];
    if (!clip) return;
    if (now >= clip.endMs) {
      // Next clip or stop
      if (currentIndex + 1 < clips.length) {
        playClip(currentIndex + 1);
      } else {
        v.pause();
        setPlaying(false);
      }
    } else if (now < clip.startMs - 500) {
      seekTo(clip.startMs);
    }
  };

  // When clips change (e.g. new reel), reset to first clip
  useEffect(() => {
    setCurrentIndex(0);
    setPlaying(false);
    setCurrentMs(0);
    const v = videoRef.current;
    if (v && clips.length > 0) {
      // Seek when metadata is loaded
      const handleMeta = () => {
        v.currentTime = clips[0].startMs / 1000;
        v.removeEventListener("loadedmetadata", handleMeta);
      };
      v.addEventListener("loadedmetadata", handleMeta);
      // If already loaded, seek immediately
      if (v.readyState >= 1) {
        v.currentTime = clips[0].startMs / 1000;
      }
    }
  }, [clips]);

  if (totalClips === 0) {
    return (
      <div className="aspect-video rounded-xl bg-black/80 flex items-center justify-center text-muted-foreground text-sm">
        Sin clips para reproducir
      </div>
    );
  }

  const clipProgress = currentClip
    ? Math.min(1, Math.max(0, (currentMs - currentClip.startMs) / (currentClip.endMs - currentClip.startMs)))
    : 0;
  const totalProgress = (currentIndex + clipProgress) / totalClips;

  return (
    <div className="space-y-2">
      <div className="relative aspect-video rounded-xl overflow-hidden bg-black group">
        {isEmbedOnly ? (
          <div className="absolute inset-0">
            <iframe
              src={sourceUrl}
              className="w-full h-full"
              allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
            <div className="absolute bottom-2 left-2 right-2 bg-amber-500/85 text-black px-2 py-1 rounded-md text-[10px] font-semibold text-center backdrop-blur-sm">
              YouTube/Vimeo/Drive no permite saltos automáticos. Usa los clips de la derecha para navegar manualmente.
            </div>
          </div>
        ) : (
          <>
            <video
              ref={videoRef}
              src={sourceUrl}
              poster={posterUrl ?? undefined}
              onTimeUpdate={handleTimeUpdate}
              onClick={togglePlay}
              muted={muted}
              playsInline
              className="w-full h-full object-contain cursor-pointer"
            />

            {/* Current clip badge */}
            {currentClip && (
              <div className="absolute top-2 left-2 flex items-center gap-1.5 px-2 py-1 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-semibold">
                <span>{MOMENT_META[currentClip.moment].emoji}</span>
                <span>{MOMENT_META[currentClip.moment].label}</span>
                {currentClip.playerName && (
                  <span className="text-white/70">· {currentClip.playerName}</span>
                )}
              </div>
            )}

            <div className="absolute top-2 right-2 px-2 py-0.5 rounded-md bg-black/60 backdrop-blur-sm text-white text-[10px] font-mono">
              {currentIndex + 1} / {totalClips}
            </div>

            {/* Controls overlay */}
            <div className="absolute bottom-0 left-0 right-0 p-3 bg-gradient-to-t from-black/85 via-black/30 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              {/* Multi-segment progress bar */}
              <div className="flex items-center gap-0.5 mb-2 h-1.5">
                {clips.map((c, i) => {
                  let fill = 0;
                  if (i < currentIndex) fill = 1;
                  else if (i === currentIndex) fill = clipProgress;
                  return (
                    <button
                      key={c.id}
                      onClick={() => playClip(i)}
                      className="flex-1 h-full bg-white/25 rounded-full overflow-hidden hover:bg-white/40 transition-colors"
                      title={`${MOMENT_META[c.moment].label}${c.playerName ? " · " + c.playerName : ""}`}
                    >
                      <motion.div
                        className="h-full bg-gradient-to-r from-primary to-amber-500 rounded-full"
                        animate={{ width: `${fill * 100}%` }}
                        transition={{ duration: 0.2 }}
                      />
                    </button>
                  );
                })}
              </div>

              <div className="flex items-center justify-between gap-2 text-white">
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => playClip(currentIndex - 1)}
                    disabled={currentIndex === 0}
                    className="p-1.5 rounded-md hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Clip anterior"
                  >
                    <SkipBack size={16} />
                  </button>
                  <button
                    onClick={togglePlay}
                    className="p-2 rounded-full bg-white/20 hover:bg-white/30 backdrop-blur"
                  >
                    {playing ? <Pause size={16} /> : <Play size={16} />}
                  </button>
                  <button
                    onClick={() => playClip(currentIndex + 1)}
                    disabled={currentIndex >= totalClips - 1}
                    className="p-1.5 rounded-md hover:bg-white/15 disabled:opacity-40 disabled:cursor-not-allowed"
                    title="Clip siguiente"
                  >
                    <SkipForward size={16} />
                  </button>
                  <span className="text-[10px] font-mono opacity-80 ml-1">
                    {formatTime(currentMs)} {currentClip && `· clip ${formatTime(currentClip.endMs - currentClip.startMs)}`}
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  <button
                    onClick={() => setMuted(!muted)}
                    className="p-1.5 rounded-md hover:bg-white/15"
                  >
                    {muted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  </button>
                  <button
                    onClick={() => videoRef.current?.requestFullscreen()}
                    className="p-1.5 rounded-md hover:bg-white/15"
                  >
                    <Maximize2 size={14} />
                  </button>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {/* Bottom progress mini-bar (always visible) */}
      <div className="space-y-1">
        <div className="h-1 bg-secondary/40 rounded-full overflow-hidden">
          <motion.div
            className="h-full bg-gradient-to-r from-primary to-amber-500"
            animate={{ width: `${totalProgress * 100}%` }}
            transition={{ duration: 0.15 }}
          />
        </div>
        <p className="text-[10px] text-muted-foreground">
          {totalClips} clips · duración total{" "}
          {formatTime(clips.reduce((s, c) => s + (c.endMs - c.startMs), 0))}
        </p>
      </div>
    </div>
  );
}
