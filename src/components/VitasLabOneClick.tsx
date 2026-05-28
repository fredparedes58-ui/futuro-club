/**
 * VITAS · VitasLabOneClick (Sprint 0 — UX 1-Click)
 *
 * Replaces the complex right sidebar in VitasLab with a streamlined
 * 1-click analysis flow:
 *   1. Select player (dropdown)
 *   2. Upload/select video (dropzone or library)
 *   3. Click "ANALIZAR" → everything automatic
 *
 * Manual calibration, mode selection, jersey/color inputs are moved
 * to a collapsible "Ajustes Avanzados" section.
 */

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Rocket,
  ChevronDown,
  ChevronUp,
  Upload,
  User,
  CheckCircle2,
  Loader2,
  Settings,
  Activity,
  AlertTriangle,
  Zap,
} from "lucide-react";
import type { OneClickState, OneClickStep } from "@/hooks/useOneClickAnalysis";

// ─── Types ──────────────────────────────────────────────────────────────────

export interface PlayerOption {
  id: string;
  name: string;
  position: string;
  vsi: number;
  age: number;
}

export interface VideoOption {
  id: string;
  title: string;
  thumbnailUrl?: string;
}

export interface VitasLabOneClickProps {
  /** Available players */
  players: PlayerOption[];
  /** Available videos */
  videos: VideoOption[];
  /** Selected player ID */
  selectedPlayerId: string | null;
  /** Selected video ID */
  selectedVideoId: string | null;
  /** One-click analysis state */
  oneClickState: OneClickState;
  /** Whether tracking is active */
  isTracking: boolean;
  /** Whether IA analysis is processing */
  isIAProcessing: boolean;
  /** Whether IA analysis is complete */
  isIAComplete: boolean;
  /** Callbacks */
  onSelectPlayer: (playerId: string) => void;
  onSelectVideo: (videoId: string) => void;
  onStartAnalysis: () => void;
  onStopTracking: () => void;
  onOpenUploadPanel: () => void;
  onViewResults: () => void;
  /** Children: manual override section content */
  children?: React.ReactNode;
}

// ─── Step display config ────────────────────────────────────────────────────

interface StepDisplay {
  label: string;
  icon: "check" | "loading" | "pending" | "error";
}

function getStepDisplays(step: OneClickStep): StepDisplay[] {
  const steps: Array<{ id: OneClickStep[]; label: string }> = [
    { id: ["loading_video"], label: "Cargando video" },
    { id: ["auto_calibrating"], label: "Auto-calibración" },
    { id: ["starting_tracking", "tracking"], label: "Detección YOLO" },
    { id: ["analyzing_biomechanics"], label: "Biomecánica" },
    { id: ["generating_fatigue"], label: "Análisis fatiga" },
    { id: ["running_ia_pipeline"], label: "Pipeline IA" },
  ];

  const currentIdx = steps.findIndex((s) => s.id.includes(step));

  return steps.map((s, i) => ({
    label: s.label,
    icon:
      step === "error"
        ? i <= currentIdx
          ? "error"
          : "pending"
        : step === "complete"
          ? "check"
          : i < currentIdx
            ? "check"
            : i === currentIdx
              ? "loading"
              : "pending",
  }));
}

// ─── Component ──────────────────────────────────────────────────────────────

export default function VitasLabOneClick({
  players,
  videos,
  selectedPlayerId,
  selectedVideoId,
  oneClickState,
  isTracking,
  isIAProcessing,
  isIAComplete,
  onSelectPlayer,
  onSelectVideo,
  onStartAnalysis,
  onStopTracking,
  onOpenUploadPanel,
  onViewResults,
  children,
}: VitasLabOneClickProps) {
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [showVideoDropdown, setShowVideoDropdown] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const selectedVideo = videos.find((v) => v.id === selectedVideoId);

  const canStart =
    !!selectedPlayerId &&
    !!selectedVideoId &&
    !oneClickState.isRunning &&
    !isTracking &&
    !isIAProcessing;

  const isRunning = oneClickState.isRunning || isTracking || isIAProcessing;

  return (
    <div className="flex flex-col gap-4 h-full">
      {/* ── Header ── */}
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
          <Zap size={16} className="text-primary" />
        </div>
        <div>
          <h3 className="font-display font-bold text-sm text-foreground">
            Análisis 1-Click
          </h3>
          <p className="text-[9px] text-muted-foreground">
            Selecciona jugador + video y listo
          </p>
        </div>
      </div>

      {/* ── Step 1: Player Selector ── */}
      <div>
        <label className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <User size={10} />
          Jugador
        </label>
        <div className="relative mt-1.5">
          <button
            onClick={() => setShowPlayerDropdown((v) => !v)}
            disabled={isRunning}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary transition-colors text-left disabled:opacity-60"
          >
            <span
              className={`text-sm font-display font-semibold ${
                selectedPlayer ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {selectedPlayer ? selectedPlayer.name : "Seleccionar jugador..."}
            </span>
            <ChevronDown size={14} className="text-muted-foreground" />
          </button>
          {showPlayerDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl border border-border z-20 max-h-48 overflow-y-auto">
              {players.length === 0 && (
                <p className="text-xs text-muted-foreground px-3 py-2">
                  No hay jugadores registrados
                </p>
              )}
              {players.map((p) => (
                <button
                  key={p.id}
                  onClick={() => {
                    onSelectPlayer(p.id);
                    setShowPlayerDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between ${
                    selectedPlayerId === p.id
                      ? "text-primary font-semibold"
                      : "text-foreground"
                  }`}
                >
                  <span>{p.name}</span>
                  <span className="text-[10px] text-muted-foreground">
                    {p.position} · VSI {p.vsi}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
        {selectedPlayer && (
          <div className="mt-1.5 flex items-center gap-2 px-3 py-1 rounded-lg bg-primary/5 border border-primary/20">
            <div className="w-1.5 h-1.5 rounded-full bg-primary" />
            <span className="text-[10px] font-display text-primary">
              VSI {selectedPlayer.vsi} · {selectedPlayer.position} ·{" "}
              {selectedPlayer.age}a
            </span>
          </div>
        )}
      </div>

      {/* ── Step 2: Video Selector ── */}
      <div>
        <label className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
          <Activity size={10} />
          Video
        </label>
        <div className="relative mt-1.5">
          <button
            onClick={() =>
              videos.length > 0
                ? setShowVideoDropdown((v) => !v)
                : onOpenUploadPanel()
            }
            disabled={isRunning}
            className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary transition-colors text-left disabled:opacity-60"
          >
            <span
              className={`text-sm font-display font-semibold truncate ${
                selectedVideo ? "text-foreground" : "text-muted-foreground"
              }`}
            >
              {selectedVideo
                ? selectedVideo.title
                : "Seleccionar o subir video..."}
            </span>
            <ChevronDown size={14} className="text-muted-foreground shrink-0" />
          </button>
          {showVideoDropdown && (
            <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl border border-border z-20 max-h-48 overflow-y-auto">
              {videos.map((v) => (
                <button
                  key={v.id}
                  onClick={() => {
                    onSelectVideo(v.id);
                    setShowVideoDropdown(false);
                  }}
                  className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors ${
                    selectedVideoId === v.id
                      ? "text-primary font-semibold"
                      : "text-foreground"
                  }`}
                >
                  {v.title}
                </button>
              ))}
              <button
                onClick={() => {
                  setShowVideoDropdown(false);
                  onOpenUploadPanel();
                }}
                className="w-full text-left px-3 py-2 text-sm text-primary hover:bg-primary/5 transition-colors flex items-center gap-1.5 border-t border-border"
              >
                <Upload size={12} /> Subir nuevo video
              </button>
            </div>
          )}
        </div>
      </div>

      {/* ── Progress Steps (visible when running) ── */}
      <AnimatePresence>
        {isRunning && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="space-y-1.5 overflow-hidden"
          >
            <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Progreso
            </p>
            {getStepDisplays(oneClickState.step).map((s, i) => (
              <div
                key={i}
                className="flex items-center gap-2 px-2 py-1 rounded-lg"
              >
                {s.icon === "check" && (
                  <CheckCircle2
                    size={14}
                    className="text-green-500 shrink-0"
                  />
                )}
                {s.icon === "loading" && (
                  <Loader2
                    size={14}
                    className="text-primary animate-spin shrink-0"
                  />
                )}
                {s.icon === "pending" && (
                  <div className="w-3.5 h-3.5 rounded-full border-2 border-muted-foreground/30 shrink-0" />
                )}
                {s.icon === "error" && (
                  <AlertTriangle
                    size={14}
                    className="text-red-500 shrink-0"
                  />
                )}
                <span
                  className={`text-[11px] font-display ${
                    s.icon === "check"
                      ? "text-green-500"
                      : s.icon === "loading"
                        ? "text-primary font-semibold"
                        : s.icon === "error"
                          ? "text-red-500"
                          : "text-muted-foreground"
                  }`}
                >
                  {s.label}
                </span>
              </div>
            ))}
            {/* Progress bar */}
            <div className="h-1.5 bg-muted rounded-full overflow-hidden mt-1">
              <motion.div
                className="h-full bg-primary rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${oneClickState.progress}%` }}
                transition={{ duration: 0.5 }}
              />
            </div>
            <p className="text-[10px] text-muted-foreground text-center">
              {oneClickState.message}
            </p>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Error display ── */}
      {oneClickState.step === "error" && (
        <div className="px-3 py-2 rounded-xl bg-red-500/10 border border-red-500/30">
          <p className="text-xs text-red-400 font-display">
            {oneClickState.error}
          </p>
        </div>
      )}

      {/* ── Action Buttons ── */}
      <div className="mt-auto space-y-2">
        {/* Main 1-Click button */}
        {!isRunning && !isIAComplete && (
          <button
            onClick={onStartAnalysis}
            disabled={!canStart}
            className="w-full flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-lg shadow-primary/20"
          >
            <Rocket size={18} />
            ANALIZAR
          </button>
        )}

        {/* Stop button during tracking */}
        {isTracking && (
          <button
            onClick={onStopTracking}
            className="w-full py-2.5 rounded-xl border border-red-500 text-red-400 text-sm font-display font-semibold hover:bg-red-500/10 transition-colors"
          >
            Detener análisis
          </button>
        )}

        {/* View results button */}
        {isIAComplete && (
          <button
            onClick={onViewResults}
            className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white font-display font-bold text-sm uppercase tracking-wider hover:bg-green-700 transition-colors"
          >
            <CheckCircle2 size={16} />
            VER RESULTADOS
          </button>
        )}

        {/* Hint text */}
        {!isRunning && !isIAComplete && (
          <p className="text-center text-[10px] font-display text-muted-foreground">
            {!selectedPlayerId && !selectedVideoId
              ? "Selecciona un jugador y un video para empezar"
              : !selectedPlayerId
                ? "Selecciona un jugador"
                : !selectedVideoId
                  ? "Selecciona o sube un video"
                  : "Todo listo — pulsa ANALIZAR"}
          </p>
        )}
      </div>

      {/* ── Advanced Settings (collapsible) ── */}
      <div className="border-t border-border pt-3">
        <button
          onClick={() => setShowAdvanced((v) => !v)}
          className="w-full flex items-center justify-between text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
        >
          <span className="flex items-center gap-1.5">
            <Settings size={10} />
            Ajustes Avanzados
          </span>
          {showAdvanced ? (
            <ChevronUp size={12} />
          ) : (
            <ChevronDown size={12} />
          )}
        </button>
        <AnimatePresence>
          {showAdvanced && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: "auto" }}
              exit={{ opacity: 0, height: 0 }}
              className="overflow-hidden mt-3 space-y-3"
            >
              {children}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
