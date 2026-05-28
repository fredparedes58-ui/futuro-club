/**
 * VITAS · VideoAnalyzerDialog
 *
 * Modal dialog to pick an existing video (or simulate one) and run the
 * set piece detection pipeline. Shows live progress and a summary at the end.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Video, Cpu, Sparkles, CheckCircle2, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { VideoService, type VideoRecord } from "@/services/real/videoService";
import {
  runDetection,
  type DetectionProgress,
} from "@/services/real/setPieceVideoDetector";

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: (eventsCount: number, videoId: string) => void;
}

// Demo videos used when the user has no real ones uploaded yet
const DEMO_VIDEOS: Array<{ id: string; title: string; minutes: number }> = [
  { id: "demo_match_riveralfc_2026_05_24", title: "vs Rival FC · 24 May", minutes: 90 },
  { id: "demo_match_academiasur_2026_05_17", title: "vs Academia Sur · 17 May", minutes: 90 },
  { id: "demo_match_tigresfc_2026_05_10", title: "vs Tigres FC · 10 May", minutes: 90 },
  { id: "demo_match_cdnorte_2026_05_03", title: "vs CD Norte · 03 May", minutes: 90 },
];

export default function VideoAnalyzerDialog({ open, onClose, onCompleted }: Props) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DetectionProgress | null>(null);
  const [result, setResult] = useState<{ count: number; videoTitle: string } | null>(null);
  const [userVideos, setUserVideos] = useState<VideoRecord[]>([]);

  useEffect(() => {
    if (open) {
      // Reload videos from local storage when opening
      try {
        const list = VideoService.getAll().filter((v) => v.status === "finished");
        setUserVideos(list);
      } catch {
        setUserVideos([]);
      }
      setSelectedVideoId(null);
      setProgress(null);
      setResult(null);
      setRunning(false);
    }
  }, [open]);

  const combinedVideos = useMemo(() => {
    const real = userVideos.map((v) => ({
      id: v.id,
      title: v.title,
      isReal: true,
      thumbnailUrl: v.thumbnailUrl ?? null,
      minutes: Math.round(v.duration / 60),
    }));
    const demos = DEMO_VIDEOS.map((v) => ({
      id: v.id,
      title: v.title,
      isReal: false,
      thumbnailUrl: null,
      minutes: v.minutes,
    }));
    return [...real, ...demos];
  }, [userVideos]);

  const selectedVideo = combinedVideos.find((v) => v.id === selectedVideoId) ?? null;

  const handleStart = async () => {
    if (!selectedVideo) return;
    setRunning(true);
    setResult(null);
    try {
      const events = await runDetection(selectedVideo.id, selectedVideo.title, {
        onProgress: (p) => setProgress(p),
      });
      setResult({ count: events.length, videoTitle: selectedVideo.title });
      toast.success(`${events.length} jugadas detectadas desde el video`);
      onCompleted(events.length, selectedVideo.id);
    } catch (err) {
      console.error(err);
      toast.error("Error al analizar el video");
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
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-primary/10 to-amber-500/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-purple-500 flex items-center justify-center">
              <Cpu size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-display font-bold text-foreground">
                Analizar set pieces desde video
              </h2>
              <p className="text-[11px] text-muted-foreground">
                El pipeline detecta automáticamente jugadas a balón parado, posiciones, y resultados
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
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Idle / picking state */}
            {!running && !result && (
              <>
                <p className="text-xs text-muted-foreground">
                  Selecciona un video. El análisis genera eventos, estadísticas y recomendaciones automáticamente.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {combinedVideos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVideoId(v.id)}
                      className={`flex items-center gap-3 p-3 rounded-lg text-left border transition-all ${
                        selectedVideoId === v.id
                          ? "bg-primary/10 border-primary"
                          : "bg-secondary/30 border-border hover:border-primary/40"
                      }`}
                    >
                      <div className="w-12 h-12 rounded-lg bg-gradient-to-br from-emerald-700 to-green-900 flex items-center justify-center shrink-0 overflow-hidden">
                        {v.thumbnailUrl ? (
                          <img src={v.thumbnailUrl} alt="" className="w-full h-full object-cover" />
                        ) : (
                          <Video size={18} className="text-emerald-300" />
                        )}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold text-foreground truncate">
                          {v.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {v.minutes} min · {v.isReal ? "video subido" : "partido demo"}
                        </p>
                      </div>
                      {selectedVideoId === v.id && (
                        <CheckCircle2 size={14} className="text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="rounded-lg bg-primary/5 border border-primary/20 p-3 text-[11px] text-foreground/80 space-y-1">
                  <p className="font-semibold text-primary flex items-center gap-1">
                    <Sparkles size={11} /> ¿Qué hace el pipeline?
                  </p>
                  <ul className="space-y-0.5 ml-2">
                    <li>• Tracking de los 22 jugadores (YOLO + ByteTrack)</li>
                    <li>• Detección del balón parado &gt;2s en zonas de saque</li>
                    <li>• Clasificación tipo (córner / falta / penal / saque)</li>
                    <li>• Pose estimation para posicionamiento exacto</li>
                    <li>• Clasificación del outcome (gol / tiro / despeje)</li>
                  </ul>
                </div>
              </>
            )}

            {/* Running state */}
            {running && progress && (
              <div className="space-y-4 py-4">
                <div className="flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={48} className="text-primary" />
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
                      initial={{ width: 0 }}
                      animate={{ width: `${progress.pct}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-primary to-amber-500"
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

            {/* Success state */}
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
                    ¡Análisis completado!
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-primary">{result.count} jugadas a balón parado</strong> detectadas en{" "}
                    <em>{result.videoTitle}</em>
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  Las jugadas aparecen marcadas con 🎥 en la lista de eventos. Las estadísticas y recomendaciones se actualizaron automáticamente.
                </p>
              </div>
            )}
          </div>

          {/* Footer */}
          {!result && (
            <div className="flex items-center justify-between gap-3 p-4 border-t border-border bg-secondary/20">
              <button
                onClick={onClose}
                disabled={running}
                className="px-3 py-1.5 rounded-md text-xs text-muted-foreground hover:bg-secondary disabled:opacity-50"
              >
                Cancelar
              </button>
              <button
                onClick={handleStart}
                disabled={!selectedVideo || running}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    Analizando…
                  </>
                ) : (
                  <>
                    <Cpu size={12} />
                    Iniciar análisis
                  </>
                )}
              </button>
            </div>
          )}

          {result && (
            <div className="flex items-center justify-end p-4 border-t border-border bg-secondary/20">
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90"
              >
                Cerrar y ver eventos
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
