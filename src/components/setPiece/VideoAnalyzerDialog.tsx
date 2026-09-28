/**
 * VITAS · VideoAnalyzerDialog — jugadas de EJEMPLO (sin análisis de vídeo)
 *
 * HONESTIDAD (CLAUDE.md inv. 1-3): VITAS todavía no detecta jugadas a balón parado
 * en un vídeo. Antes este diálogo prometía «Tracking YOLO + ByteTrack / pose» y
 * «analizaba» también los vídeos reales del usuario con datos inventados. Ahora:
 *  - los vídeos del usuario no se listan: la detección está bloqueada y se explica
 *    por qué (gate_reason visible);
 *  - solo los partidos demo generan jugadas de EJEMPLO, rotuladas MOCK con el
 *    DemoDataBanner canónico.
 */

import { useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { X, Video, FlaskConical, CheckCircle2, Loader2, Info } from "lucide-react";
import { toast } from "sonner";
import DemoDataBanner from "@/components/DemoDataBanner";
import {
  runDetection,
  type DetectionProgress,
} from "@/services/real/setPieceVideoDetector";

interface Props {
  open: boolean;
  onClose: () => void;
  onCompleted: (eventsCount: number, videoId: string) => void;
}

// Partidos DEMO: los únicos para los que se generan jugadas de ejemplo (MOCK).
const DEMO_VIDEOS: Array<{ id: string; title: string; minutes: number }> = [
  { id: "demo_match_riveralfc_2026_05_24", title: "vs Rival FC · 24 May", minutes: 90 },
  { id: "demo_match_academiasur_2026_05_17", title: "vs Academia Sur · 17 May", minutes: 90 },
  { id: "demo_match_tigresfc_2026_05_10", title: "vs Tigres FC · 10 May", minutes: 90 },
  { id: "demo_match_cdnorte_2026_05_03", title: "vs CD Norte · 03 May", minutes: 90 },
];

export default function VideoAnalyzerDialog({ open, onClose, onCompleted }: Props) {
  const { t } = useTranslation();
  const [selectedVideoId, setSelectedVideoId] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<DetectionProgress | null>(null);
  const [result, setResult] = useState<{ count: number; videoTitle: string } | null>(null);

  useEffect(() => {
    if (open) {
      setSelectedVideoId(null);
      setProgress(null);
      setResult(null);
      setRunning(false);
    }
  }, [open]);

  const selectedVideo = DEMO_VIDEOS.find((v) => v.id === selectedVideoId) ?? null;

  const handleStart = async () => {
    if (!selectedVideo) return;
    setRunning(true);
    setResult(null);
    try {
      const detection = await runDetection(selectedVideo.id, selectedVideo.title, {
        onProgress: (p) => setProgress(p),
      });
      if (detection.status === "gated") {
        toast.error(detection.gate_reason);
        return;
      }
      setResult({ count: detection.events.length, videoTitle: selectedVideo.title });
      toast.success(t("videoAnalyzerDialog.toastDetected", { count: detection.events.length }));
      onCompleted(detection.events.length, selectedVideo.id);
    } catch (err) {
      console.error(err);
      toast.error(t("videoAnalyzerDialog.toastError"));
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
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-amber-500 to-orange-500 flex items-center justify-center">
              <FlaskConical size={18} className="text-white" />
            </div>
            <div className="flex-1">
              <h2 className="text-base font-display font-bold text-foreground">
                {t("videoAnalyzerDialog.title")}
              </h2>
              <p className="text-[11px] text-muted-foreground">
                {t("videoAnalyzerDialog.subtitle")}
              </p>
            </div>
            {!running && (
              <button
                onClick={onClose}
                aria-label={t("videoAnalyzerDialog.cancel")}
                className="p-1.5 rounded-md text-muted-foreground hover:bg-secondary"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {/* Body */}
          <div className="p-4 space-y-4 max-h-[60vh] overflow-y-auto">
            {/* Banner canónico MOCK: todo lo que genera este diálogo es de ejemplo */}
            <DemoDataBanner messageKey="setPiecePage.demoNotice" />

            {/* Idle / picking state */}
            {!running && !result && (
              <>
                {/* Por qué NO se analizan los vídeos del usuario (gate_reason visible) */}
                <div className="rounded-lg bg-secondary/40 border border-border p-3 text-[11px] text-foreground/80 space-y-1">
                  <p className="font-semibold text-foreground flex items-center gap-1">
                    <Info size={11} /> {t("videoAnalyzerDialog.pipelineHeading")}
                  </p>
                  <p>{t("videoAnalyzerDialog.gateRealVideos")}</p>
                </div>

                <p className="text-xs text-muted-foreground">
                  {t("videoAnalyzerDialog.pickPrompt")}
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {DEMO_VIDEOS.map((v) => (
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
                        <Video size={18} className="text-emerald-300" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-display font-bold text-foreground truncate">
                          {v.title}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {v.minutes} min · {t("videoAnalyzerDialog.demoMatch")}
                        </p>
                      </div>
                      {selectedVideoId === v.id && (
                        <CheckCircle2 size={14} className="text-primary shrink-0" />
                      )}
                    </button>
                  ))}
                </div>
              </>
            )}

            {/* Running state (generación local, sin análisis) */}
            {running && (
              <div className="flex items-center justify-center gap-2 py-6 text-xs text-muted-foreground">
                <Loader2 size={16} className="animate-spin text-primary" />
                <span>{progress?.message || t("videoAnalyzerDialog.analyzing")}</span>
              </div>
            )}

            {/* Success state */}
            {result && !running && (
              <div className="text-center py-4 space-y-4">
                <motion.div
                  initial={{ scale: 0 }}
                  animate={{ scale: 1 }}
                  transition={{ type: "spring", stiffness: 200, damping: 12 }}
                  className="w-16 h-16 mx-auto rounded-full bg-amber-500/20 flex items-center justify-center"
                >
                  <CheckCircle2 size={32} className="text-amber-500" />
                </motion.div>
                <div>
                  <h3 className="text-lg font-display font-bold text-foreground">
                    {t("videoAnalyzerDialog.successHeading")}
                  </h3>
                  <p className="text-sm text-muted-foreground mt-1">
                    <strong className="text-primary">{t("videoAnalyzerDialog.successSetPieces", { count: result.count })}</strong> {t("videoAnalyzerDialog.successDetectedIn")}{" "}
                    <em>{result.videoTitle}</em>
                  </p>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {t("videoAnalyzerDialog.successNote")}
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
                {t("videoAnalyzerDialog.cancel")}
              </button>
              <button
                onClick={handleStart}
                disabled={!selectedVideo || running}
                className="flex items-center gap-1.5 px-4 py-1.5 rounded-md bg-primary text-primary-foreground text-xs font-display font-semibold hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {running ? (
                  <>
                    <Loader2 size={12} className="animate-spin" />
                    {t("videoAnalyzerDialog.analyzing")}
                  </>
                ) : (
                  <>
                    <FlaskConical size={12} />
                    {t("videoAnalyzerDialog.startAnalysis")}
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
                {t("videoAnalyzerDialog.closeAndView")}
              </button>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}
