/**
 * VITAS · ScanningAnalyzerDialog
 *
 * Modal to pick a video + player and run the scanning-detection pipeline.
 * Independent from set pieces / highlights / behavioral analyzers.
 */

import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, Eye, Cpu, CheckCircle2, Loader2, Video as VideoIcon } from "lucide-react";
import { toast } from "sonner";
import { VideoService, type VideoRecord } from "@/services/real/videoService";
import {
  runScanningDetection,
  type ScanningDetectionProgress,
  type ScanningAnalysisResult,
} from "@/services/real/scanningVideoDetector";

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: (result: ScanningAnalysisResult) => void;
  /** Pre-selected player */
  playerId: string;
  playerName: string;
  /** Optional pre-selected video (e.g. just uploaded) */
  preselectedVideoId?: string;
}

const DEMO_VIDEOS = [
  { id: "demo_scan_rivalfc_2026_05_24", title: "vs Rival FC · 24 May", minutes: 90 },
  { id: "demo_scan_academiasur_2026_05_17", title: "vs Academia Sur · 17 May", minutes: 90 },
  { id: "demo_scan_tigresfc_2026_05_10", title: "vs Tigres FC · 10 May", minutes: 90 },
];

export default function ScanningAnalyzerDialog({
  open,
  onClose,
  onCompleted,
  playerId,
  playerName,
  preselectedVideoId,
}: Props) {
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<ScanningDetectionProgress | null>(null);
  const [result, setResult] = useState<ScanningAnalysisResult | null>(null);
  const [userVideos, setUserVideos] = useState<VideoRecord[]>([]);

  useEffect(() => {
    if (open) {
      try {
        setUserVideos(VideoService.getAll().filter((v) => v.status === "finished"));
      } catch {
        setUserVideos([]);
      }
      setSelectedVideoId(preselectedVideoId ?? null);
      setProgress(null);
      setResult(null);
      setRunning(false);
    }
  }, [open, preselectedVideoId]);

  const combinedVideos = useMemo(() => {
    const real = userVideos.map((v) => ({
      id: v.id,
      title: v.title,
      isReal: true,
      minutes: Math.round(v.duration / 60),
    }));
    const demos = DEMO_VIDEOS.map((v) => ({
      id: v.id,
      title: v.title,
      isReal: false,
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
      const r = await runScanningDetection(
        {
          playerId,
          playerName,
          videoId: selectedVideo.id,
          videoTitle: selectedVideo.title,
        },
        (p) => setProgress(p),
      );
      setResult(r);
      toast.success(`Scanning analizado · Scan IQ ${r.scanIQ}/100`);
      onCompleted(r);
    } catch (err) {
      console.error(err);
      toast.error("Error analizando el scanning");
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
          className="w-full max-w-xl glass-strong rounded-2xl border border-border shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center gap-3 p-4 border-b border-border bg-gradient-to-r from-pink-500/10 to-fuchsia-500/10">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-pink-500 to-fuchsia-600 flex items-center justify-center">
              <Eye size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-display font-bold text-foreground">
                Analizar scanning desde video
              </h2>
              <p className="text-[11px] text-muted-foreground">
                Jugador: <strong className="text-foreground">{playerName}</strong> · cuenta scans en los 10s previos a cada recepción
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
            {!running && !result && (
              <>
                <p className="text-xs text-muted-foreground">
                  Selecciona un video. El pipeline corre pose estimation sobre el jugador objetivo y cuenta los giros de cabeza antes de cada recepción.
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {combinedVideos.map((v) => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVideoId(v.id)}
                      className={`flex items-center gap-3 p-2.5 rounded-lg text-left border transition-all ${
                        selectedVideoId === v.id
                          ? "bg-pink-500/10 border-pink-500"
                          : "bg-secondary/30 border-border hover:border-pink-500/40"
                      }`}
                    >
                      <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-pink-700 to-fuchsia-900 flex items-center justify-center shrink-0">
                        <VideoIcon size={14} className="text-pink-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-[11px] font-display font-bold text-foreground truncate">
                          {v.title}
                        </p>
                        <p className="text-[9px] text-muted-foreground">
                          {v.minutes} min · {v.isReal ? "video subido" : "partido demo"}
                        </p>
                      </div>
                      {selectedVideoId === v.id && (
                        <CheckCircle2 size={12} className="text-pink-500 shrink-0" />
                      )}
                    </button>
                  ))}
                </div>

                <div className="rounded-lg bg-pink-500/5 border border-pink-500/20 p-3 text-[11px] text-foreground/80 space-y-1">
                  <p className="font-semibold text-pink-500">¿Qué hace el pipeline?</p>
                  <ul className="space-y-0.5 ml-2">
                    <li>• Tracking del jugador objetivo durante todo el partido</li>
                    <li>• Pose estimation · detecta giros de cabeza &gt;30°</li>
                    <li>• Identifica cada recepción del balón</li>
                    <li>• Cuenta scans en los 10 segundos previos a cada recepción</li>
                    <li>• Correlaciona con la calidad de la decisión posterior</li>
                  </ul>
                </div>
              </>
            )}

            {running && progress && (
              <div className="space-y-4 py-6">
                <div className="flex items-center justify-center">
                  <motion.div
                    animate={{ rotate: 360 }}
                    transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}
                  >
                    <Loader2 size={42} className="text-pink-500" />
                  </motion.div>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-display font-bold text-foreground">{progress.message}</span>
                    <span className="font-mono text-pink-500 font-bold">{progress.pct}%</span>
                  </div>
                  <div className="h-2 bg-secondary/50 rounded-full overflow-hidden">
                    <motion.div
                      animate={{ width: `${progress.pct}%` }}
                      transition={{ duration: 0.4, ease: "easeOut" }}
                      className="h-full bg-gradient-to-r from-pink-500 to-fuchsia-600"
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

            {result && !running && (
              <div className="text-center py-4 space-y-3">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="w-16 h-16 mx-auto rounded-full bg-pink-500/20 flex items-center justify-center"
                >
                  <CheckCircle2 size={32} className="text-pink-500" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-display font-bold text-foreground">
                    Análisis completado
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-pink-500">Scan IQ {result.scanIQ}/100</strong> ·{" "}
                    {result.receptionsAnalyzed} recepciones analizadas
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-2 max-w-md mx-auto text-left">
                  <div className="glass rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                      Scans / recepción
                    </p>
                    <p className="text-lg font-display font-bold text-pink-500">
                      {result.avgScansPreReception.toFixed(1)}
                    </p>
                  </div>
                  <div className="glass rounded-lg p-2.5">
                    <p className="text-[9px] uppercase tracking-wider text-muted-foreground font-bold">
                      Éxito con scan
                    </p>
                    <p className="text-lg font-display font-bold text-emerald-500">
                      {Math.round(result.successWithScan * 100)}%
                    </p>
                  </div>
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
                disabled={!selectedVideo}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-gradient-to-r from-pink-500 to-fuchsia-600 text-white text-xs font-display font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <Cpu size={12} />
                Analizar
              </button>
            </div>
          )}

          {result && (
            <div className="flex items-center justify-end p-4 border-t border-border bg-secondary/20">
              <button
                onClick={onClose}
                className="px-4 py-1.5 rounded-md bg-pink-500 text-white text-xs font-display font-semibold hover:bg-pink-600"
              >
                Cerrar y ver informe
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
