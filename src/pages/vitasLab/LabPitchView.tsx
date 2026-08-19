import { type RefObject, type MutableRefObject, type Dispatch, type SetStateAction, type MouseEvent } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { RotateCcw, Camera, ChevronDown, Upload, Brain, CircleAlert, Loader2, Pause, Play } from "lucide-react";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import pitchImage from "@/assets/pitch-field.jpg";
import VoronoiOverlay from "@/components/VoronoiOverlay";
import PlayerIdentityOverlay from "@/components/PlayerIdentityOverlay";
import ModelLoadingOverlay from "@/components/tracking/ModelLoadingOverlay";
import { getActiveModel } from "@/lib/yolo/modelConfig";
import type { VideoRecord } from "@/services/real/videoService";
import type { useTracking } from "@/hooks/useTracking";
import type { usePlayerAnalysisV2 } from "@/hooks/usePlayerAnalysisV2";
import { formatTime, item } from "./labUi";
import type { CalibrationPoint } from "./types";

interface LabPitchViewProps {
  containerRef: RefObject<HTMLDivElement>;
  labVideoRef: MutableRefObject<HTMLVideoElement | null>;
  canvasRef: RefObject<HTMLCanvasElement>;
  trackingVideoRef: MutableRefObject<HTMLVideoElement | null>;
  tracking: ReturnType<typeof useTracking>;
  v2: ReturnType<typeof usePlayerAnalysisV2>;
  labVideoUrl: string | null;
  selectedVideo: VideoRecord | undefined;
  draggingPoint: number | null;
  showVoronoi: boolean;
  showTracking: boolean;
  showCalibPresets: boolean;
  CALIBRATION_PRESETS: Record<string, { label: string; points: CalibrationPoint[] }>;
  actionLog: Array<{ time: number; text: string; type: "positive" | "negative" | "neutral" }>;
  points: CalibrationPoint[];
  videoDuration: number;
  isPlaying: boolean;
  effectiveDuration: number;
  progressPercent: number;
  currentTime: number;
  resetPoints: () => void;
  handleAutoDetect: () => void;
  handleCanvasMouseDown: (e: MouseEvent<HTMLCanvasElement>) => void;
  handleCanvasMouseMove: (e: MouseEvent<HTMLCanvasElement>) => void;
  handleCanvasMouseUp: () => void;
  setPoints: Dispatch<SetStateAction<CalibrationPoint[]>>;
  setShowCalibPresets: Dispatch<SetStateAction<boolean>>;
  setShowUploadPanel: Dispatch<SetStateAction<boolean>>;
  setShowResultsPanel: Dispatch<SetStateAction<boolean>>;
  setIsPlaying: Dispatch<SetStateAction<boolean>>;
  setCurrentTime: Dispatch<SetStateAction<number>>;
}

/** Centro del laboratorio: título + acciones, área de vídeo/canvas con overlays de
 *  tracking, y timeline. Presentacional: el PADRE es dueño de las refs (canvasRef/
 *  containerRef/labVideoRef/trackingVideoRef) y de los efectos (drawOverlay/rAF/play-
 *  pausa); aquí solo se enganchan a los elementos y se renderiza. */
const LabPitchView = ({
  containerRef,
  labVideoRef,
  canvasRef,
  trackingVideoRef,
  tracking,
  v2,
  labVideoUrl,
  selectedVideo,
  draggingPoint,
  showVoronoi,
  showTracking,
  showCalibPresets,
  CALIBRATION_PRESETS,
  actionLog,
  points,
  videoDuration,
  isPlaying,
  effectiveDuration,
  progressPercent,
  currentTime,
  resetPoints,
  handleAutoDetect,
  handleCanvasMouseDown,
  handleCanvasMouseMove,
  handleCanvasMouseUp,
  setPoints,
  setShowCalibPresets,
  setShowUploadPanel,
  setShowResultsPanel,
  setIsPlaying,
  setCurrentTime,
}: LabPitchViewProps) => {
  const { t } = useTranslation();

  return (
        <div className="flex-1 flex flex-col p-4 md:p-6 gap-4 overflow-hidden">
          {/* Title + Actions */}
          <motion.div variants={item} className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <h1 className="font-display font-bold text-2xl text-foreground">{t("lab.pitchSetup")}</h1>
              <p className="text-sm text-muted-foreground">
                {t("lab.pitchSetupDesc")}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={resetPoints} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground hover:bg-secondary transition-colors">
                <RotateCcw size={14} />
                {t("lab.resetPoints")}
              </button>
              <div className="relative">
                <button onClick={handleAutoDetect} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground hover:bg-secondary transition-colors">
                  <Camera size={14} />
                  {t("lab.presets")}
                  <ChevronDown size={12} />
                </button>
                {showCalibPresets && (
                  <div className="absolute top-full left-0 mt-1 glass rounded-xl border border-border z-20 min-w-[160px] overflow-hidden">
                    {Object.entries(CALIBRATION_PRESETS).map(([key, preset]) => (
                      <button
                        key={key}
                        onClick={() => {
                          setPoints(preset.points);
                          setShowCalibPresets(false);
                          toast.success(t("lab.presetApplied", { name: preset.label }), {
                            description: t("lab.presetAppliedDesc"),
                            duration: 3000,
                          });
                        }}
                        className="w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors text-foreground font-display"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              <button onClick={() => setShowUploadPanel(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs font-display font-semibold text-primary hover:bg-primary/20 transition-colors">
                <Upload size={14} />
                {t("lab.uploadVideo")}
              </button>
              {v2.isCompleted && (
                <button onClick={() => setShowResultsPanel(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs font-display font-semibold text-green-600 hover:bg-green-500/20 transition-colors">
                  <Brain size={14} />
                  {t("lab.viewReport")}
                </button>
              )}
            </div>
          </motion.div>

          {/* Pitch Canvas / Video Area */}
          <motion.div variants={item} ref={containerRef} className="relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-border bg-black">
            {labVideoUrl ? (
              <video
                ref={labVideoRef}
                src={labVideoUrl}
                className="w-full h-full object-contain"
                playsInline
                preload="metadata"
                crossOrigin="anonymous"
              />
            ) : selectedVideo && !labVideoUrl ? (
              <div className="w-full h-full flex flex-col items-center justify-center gap-3 bg-black/80">
                <CircleAlert size={32} className="text-yellow-400" />
                <p className="text-sm font-display text-yellow-400 font-semibold">{t("lab.videoNotReady")}</p>
                <p className="text-xs text-muted-foreground text-center max-w-xs">{t("lab.videoNotReadyDesc")}</p>
              </div>
            ) : (
              <img src={pitchImage} alt="Football pitch" className="w-full h-full object-cover" />
            )}
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              style={{ pointerEvents: draggingPoint !== null || !labVideoUrl ? "auto" : "auto" }}
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
            {/* Voronoi Overlay */}
            {showVoronoi && showTracking && tracking.state.voronoiRegions.length >= 2 && containerRef.current && (
              <VoronoiOverlay
                regions={tracking.state.voronoiRegions}
                width={containerRef.current.clientWidth}
                height={containerRef.current.clientHeight}
                focusTrackId={tracking.state.focusTrackId}
              />
            )}
            {/* Player Identity Overlay (Sprint 4 — Re-ID badges + dorsals) */}
            {showTracking && tracking.state.identities.size > 0 && containerRef.current && trackingVideoRef.current && (
              <PlayerIdentityOverlay
                width={containerRef.current.clientWidth}
                height={containerRef.current.clientHeight}
                tracks={tracking.state.currentTracks}
                identities={tracking.state.identities}
                focusTrackId={tracking.state.focusTrackId}
                videoWidth={trackingVideoRef.current.videoWidth || 1280}
                videoHeight={trackingVideoRef.current.videoHeight || 720}
                showDorsals={true}
                showTeamColors={true}
              />
            )}
            {/* Action Log Overlay — appears during analysis & playback */}
            {actionLog.length > 0 && (
              <div className="absolute top-3 right-3 w-64 max-h-[200px] overflow-y-auto space-y-1 z-10 pointer-events-none">
                <AnimatePresence>
                  {actionLog.slice(-6).map((a, i) => (
                    <motion.div
                      key={`${a.time}-${i}`}
                      initial={{ opacity: 0, x: 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0 }}
                      className={`glass rounded-lg px-3 py-1.5 flex items-center gap-2 text-[10px] font-display ${
                        a.type === "positive" ? "border-l-2 border-green-500 text-green-300" :
                        a.type === "negative" ? "border-l-2 border-red-500 text-red-300" :
                        "border-l-2 border-blue-400 text-blue-300"
                      }`}
                    >
                      <span className="text-[9px] text-muted-foreground tabular-nums">{formatTime(a.time)}</span>
                      <span>{a.text}</span>
                    </motion.div>
                  ))}
                </AnimatePresence>
              </div>
            )}
            {/* Descarga del modelo, narrada (primera vez ~84 MB, luego cacheado) */}
            {tracking.state.status === "loading-model" && (
              <ModelLoadingOverlay
                progress={tracking.state.modelProgress}
                message={tracking.state.progressMessage}
                sizeMb={getActiveModel().sizeMb}
              />
            )}
            {/* Calibration Status */}
            <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${v2.isProcessing ? "bg-yellow-400" : labVideoUrl ? "bg-green-400" : "bg-destructive"} animate-pulse`} />
              <span className="text-[11px] font-display font-semibold text-foreground tracking-wider">
                {v2.isProcessing
                  ? `${t("vitasLab.analyzingEllipsis")} ${v2.state.message || "GPU PIPELINE"}`
                  : labVideoUrl
                  ? `${t("vitasLab.videoLoaded")} · ${t("vitasLab.calibPointsCount", { count: points.length })} · ${formatTime(videoDuration)}`
                  : t("vitasLab.calibActive", { count: points.length })}
              </span>
            </div>
            {/* Analysis running overlay */}
            {v2.isProcessing && (
              <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
                <div className="glass rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
                  <Loader2 size={32} className="text-primary animate-spin" />
                  <p className="font-display font-bold text-foreground text-sm tracking-wider">{t("lab.processingIA")}</p>
                  <p className="text-xs text-muted-foreground">{t("lab.processingDesc")}</p>
                </div>
              </div>
            )}
          </motion.div>

          {/* Video Timeline */}
          <motion.div variants={item} className="glass rounded-xl px-4 py-3 flex items-center gap-4">
            <button onClick={() => setIsPlaying(!isPlaying)} className="w-8 h-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 transition-colors">
              {isPlaying ? <Pause size={16} /> : <Play size={16} />}
            </button>
            <div className="flex-1 relative h-2 bg-muted rounded-full overflow-hidden cursor-pointer"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                const pct  = (e.clientX - rect.left) / rect.width;
                const newTime = Math.round(pct * effectiveDuration);
                setCurrentTime(newTime);
                if (labVideoRef.current) {
                  labVideoRef.current.currentTime = newTime;
                }
              }}
            >
              <div className="absolute inset-y-0 left-0 bg-primary/30 rounded-full" style={{ width: `${Math.min(progressPercent + 15, 100)}%` }} />
              <motion.div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-xs font-display text-muted-foreground tabular-nums min-w-[120px] text-right">
              {formatTime(currentTime)} / {formatTime(effectiveDuration)}
            </span>
          </motion.div>
        </div>
  );
};

export default LabPitchView;
