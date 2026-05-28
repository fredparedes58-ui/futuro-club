/**
 * VITAS · GenerateReelDialog
 *
 * Choose a video + moment types + duration → run highlights detection → save reel.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Film, Wand2, CheckCircle2, Loader2, Cpu } from "lucide-react";
import { toast } from "sonner";
import { VideoService, type VideoRecord } from "@/services/real/videoService";
import {
  runHighlightsDetection,
  type DetectionProgress,
} from "@/services/real/highlightsDetector";
import type { HighlightReel } from "@/lib/highlights/types";
import { MOMENT_META, ALL_MOMENTS, type ClipMoment } from "@/lib/highlights/types";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (reel: HighlightReel) => void;
  /** Optional pre-selected video id */
  preselectedVideoId?: string;
}

const DEMO_VIDEOS = [
  { id: "demo_reel_riveralfc_2026_05_24", title: "vs Rival FC · 24 May", duration: 5400 },
  { id: "demo_reel_academiasur_2026_05_17", title: "vs Academia Sur · 17 May", duration: 5400 },
  { id: "demo_reel_tigresfc_2026_05_10", title: "vs Tigres FC · 10 May", duration: 5400 },
];

const DURATION_PRESETS = [
  { value: 30, label: "30 s", description: "Resumen flash" },
  { value: 60, label: "1 min", description: "Top momentos" },
  { value: 180, label: "3 min", description: "Reel completo" },
  { value: 300, label: "5 min", description: "Análisis extendido" },
];

export default function GenerateReelDialog({
  open,
  onClose,
  onCreated,
  preselectedVideoId,
}: Props) {
  const [videoId, setVideoId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [duration, setDuration] = useState(60);
  const [moments, setMoments] = useState<ClipMoment[]>([
    "goal",
    "shot",
    "assist",
    "dribble",
    "skill",
    "save",
  ]);
  const [playerName, setPlayerName] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DetectionProgress | null>(null);
  const [result, setResult] = useState<HighlightReel | null>(null);
  const [userVideos, setUserVideos] = useState<VideoRecord[]>([]);

  useEffect(() => {
    if (open) {
      try {
        setUserVideos(VideoService.getAll().filter((v) => v.status === "finished"));
      } catch {
        setUserVideos([]);
      }
      setResult(null);
      setProgress(null);
      setRunning(false);
      setVideoId(preselectedVideoId ?? "");
      setTitle("");
    }
  }, [open, preselectedVideoId]);

  const combinedVideos = useMemo(() => {
    const real = userVideos.map((v) => ({
      id: v.id,
      title: v.title,
      isReal: true,
      duration: v.duration || 5400,
      url:
        v.streamUrl ||
        v.embedUrl ||
        v.localPath ||
        "",
    }));
    const demos = DEMO_VIDEOS.map((v) => ({
      id: v.id,
      title: v.title,
      isReal: false,
      duration: v.duration,
      url: "",
    }));
    return [...real, ...demos];
  }, [userVideos]);

  const selectedVideo = combinedVideos.find((v) => v.id === videoId);

  const toggleMoment = (m: ClipMoment) => {
    setMoments((prev) =>
      prev.includes(m) ? prev.filter((x) => x !== m) : [...prev, m],
    );
  };

  const handleStart = async () => {
    if (!selectedVideo) {
      toast.error("Selecciona un video");
      return;
    }
    if (moments.length === 0) {
      toast.error("Elige al menos un tipo de momento");
      return;
    }
    setRunning(true);
    setProgress(null);
    try {
      const reel = await runHighlightsDetection(
        {
          videoId: selectedVideo.id,
          videoTitle: selectedVideo.title,
          videoUrl: selectedVideo.url || "",
          videoDurationSec: selectedVideo.duration,
          targetDurationSec: duration,
          momentTypes: moments,
          playerName: playerName.trim() || undefined,
          title: title.trim() || undefined,
        },
        (p) => setProgress(p),
      );
      setResult(reel);
      toast.success(`Reel "${reel.title}" creado con ${reel.clips.length} clips`);
      onCreated(reel);
    } catch (err) {
      console.error(err);
      toast.error("Error generando el reel");
    } finally {
      setRunning(false);
    }
  };

  if (!open) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
        onClick={() => !running && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ duration: 0.18 }}
          className="w-full max-w-2xl glass-strong rounded-2xl border border-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-emerald-500/10 to-primary/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 flex items-center justify-center">
              <Film size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-display font-bold text-foreground">
                Generar reel de highlights
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Detecta automáticamente los mejores momentos del video y los compila en un clip
              </p>
            </div>
            {!running && (
              <button
                onClick={onClose}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 max-h-[65vh] overflow-y-auto">
            {/* Idle */}
            {!running && !result && (
              <>
                {/* Video selector */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Video fuente
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {combinedVideos.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setVideoId(v.id)}
                        className={`flex items-center gap-2 p-2 rounded-lg text-left border transition-all ${
                          videoId === v.id
                            ? "bg-primary/10 border-primary"
                            : "bg-secondary/30 border-border hover:border-primary/40"
                        }`}
                      >
                        <div className="w-9 h-9 rounded-md bg-gradient-to-br from-emerald-700 to-green-900 flex items-center justify-center shrink-0">
                          <Film size={14} className="text-emerald-300" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-display font-bold text-foreground truncate">
                            {v.title}
                          </p>
                          <p className="text-[9px] text-muted-foreground">
                            {Math.round(v.duration / 60)} min ·{" "}
                            {v.isReal ? "video subido" : "partido demo"}
                          </p>
                        </div>
                        {videoId === v.id && (
                          <CheckCircle2 size={12} className="text-primary shrink-0" />
                        )}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Title */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Título (opcional)
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Top goles · vs Rival FC"
                    className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                </div>

                {/* Duration presets */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Duración objetivo
                  </label>
                  <div className="grid grid-cols-4 gap-2">
                    {DURATION_PRESETS.map((d) => (
                      <button
                        key={d.value}
                        onClick={() => setDuration(d.value)}
                        className={`flex flex-col items-center gap-0.5 p-2.5 rounded-lg border transition-all ${
                          duration === d.value
                            ? "bg-primary/10 border-primary text-foreground"
                            : "bg-secondary/30 border-border text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <span className="text-sm font-display font-bold">{d.label}</span>
                        <span className="text-[9px] text-muted-foreground">{d.description}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Moment types */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                      Tipos de momento ({moments.length}/{ALL_MOMENTS.length})
                    </label>
                    <button
                      onClick={() =>
                        setMoments(
                          moments.length === ALL_MOMENTS.length ? [] : [...ALL_MOMENTS],
                        )
                      }
                      className="text-[10px] text-primary hover:underline"
                    >
                      {moments.length === ALL_MOMENTS.length ? "Quitar todos" : "Todos"}
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {ALL_MOMENTS.map((m) => {
                      const meta = MOMENT_META[m];
                      const active = moments.includes(m);
                      return (
                        <button
                          key={m}
                          onClick={() => toggleMoment(m)}
                          className={`flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-semibold border transition-all ${
                            active
                              ? "border-primary/40 bg-primary/15 text-foreground"
                              : "border-border bg-secondary/30 text-muted-foreground"
                          }`}
                          style={
                            active
                              ? { background: `${meta.color}25`, borderColor: meta.color }
                              : undefined
                          }
                        >
                          <span>{meta.emoji}</span>
                          <span>{meta.label}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>

                {/* Player focus */}
                <div className="space-y-1.5">
                  <label className="text-[10px] uppercase tracking-wider text-muted-foreground font-bold">
                    Enfoque en jugador (opcional)
                  </label>
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Samu · Marco López"
                    className="w-full bg-secondary/40 rounded-lg px-3 py-2 text-sm border border-border focus:border-primary focus:outline-none"
                  />
                  <p className="text-[9px] text-muted-foreground">
                    Si lo rellenas, todos los clips llevarán el nombre del jugador y se filtra a momentos en los que participa.
                  </p>
                </div>
              </>
            )}

            {/* Running */}
            {running && progress && (
              <div className="space-y-4 py-6">
                <div className="flex justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={42} className="text-primary" />
                  </motion.div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-foreground">
                      {progress.message}
                    </span>
                    <span className="font-mono text-primary font-bold">{progress.pct}%</span>
                  </div>
                  <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${progress.pct}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-emerald-500 via-primary to-amber-500"
                    />
                  </div>
                </div>
                {selectedVideo && (
                  <p className="text-[11px] text-muted-foreground text-center">
                    Analizando: <strong>{selectedVideo.title}</strong>
                  </p>
                )}
              </div>
            )}

            {/* Success */}
            {result && !running && (
              <div className="text-center py-4 space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="w-16 h-16 mx-auto rounded-full bg-emerald-500/20 flex items-center justify-center"
                >
                  <CheckCircle2 size={32} className="text-emerald-500" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-display font-bold text-foreground">
                    ¡Reel creado!
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-primary">{result.clips.length} clips</strong> ·
                    duración total{" "}
                    {Math.round(result.totalDurationMs / 1000)}s
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Footer */}
          {!result && !running && (
            <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-secondary/20">
              <button
                onClick={onClose}
                className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary"
              >
                Cancelar
              </button>
              <button
                onClick={handleStart}
                disabled={!selectedVideo || moments.length === 0}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-gradient-to-r from-emerald-500 to-primary text-white text-xs font-display font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Wand2 size={12} />
                Generar reel
              </button>
            </div>
          )}

          {result && (
            <div className="flex items-center justify-end p-4 border-t border-border bg-secondary/20">
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90"
              >
                Cerrar y ver reel
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
