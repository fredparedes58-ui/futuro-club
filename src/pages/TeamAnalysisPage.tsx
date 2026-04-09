/**
 * VITAS · Team Analysis Page
 * /team-analysis
 *
 * Análisis táctico de equipo completo:
 *   - Formación detectada
 *   - Posesión y fases de juego
 *   - Métricas colectivas
 *   - Breakdown por jugador (tappable → heatmap)
 *   - Evaluación y recomendaciones
 */

import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Zap, Play, Users, Target, TrendingUp,
  Shield, AlertTriangle, CheckCircle, Loader2,
  ChevronDown, ChevronUp, Swords, MapPin, Activity,
  GitCompare, ArrowUpRight, ArrowDownRight, Minus, Video,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";

import { VideoService, type VideoRecord } from "@/services/real/videoService";
import { useTeamIntelligence, useAllTeamAnalyses } from "@/hooks/useTeamIntelligence";
import VideoUpload from "@/components/VideoUpload";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import type { TeamIntelligenceOutput } from "@/agents/contracts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { getErrorDetails } from "@/services/errorDiagnosticService";
import AnalysisFocusSelector from "@/components/AnalysisFocusSelector";

// ─── Helpers UI ──────────────────────────────────────────────────

const RENDIMIENTO_COLORS: Record<string, string> = {
  destacado: "#FFD700",
  bueno:     "#22C55E",
  regular:   "#F59E0B",
  bajo:      "#EF4444",
};

function SectionHeader({ icon: Icon, title, subtitle }: {
  icon: React.ElementType; title: string; subtitle?: string;
}) {
  return (
    <div className="flex items-start gap-3 mb-4">
      <div className="w-8 h-8 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
        <Icon size={16} className="text-primary" />
      </div>
      <div>
        <h3 className="text-sm font-display font-bold text-foreground">{title}</h3>
        {subtitle && <p className="text-[11px] text-muted-foreground mt-0.5">{subtitle}</p>}
      </div>
    </div>
  );
}

function GaugeRing({ value, max, label }: { value: number; max: number; label: string }) {
  const radius = 18;
  const circ = 2 * Math.PI * radius;
  const dash = (value / max) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="48" height="48" viewBox="0 0 48 48">
        <circle cx="24" cy="24" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="3.5" />
        <circle cx="24" cy="24" r={radius} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="3.5"
          strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
          transform="rotate(-90 24 24)" />
        <text x="24" y="28" textAnchor="middle" fontSize="11" fontWeight="bold" fill="currentColor" className="text-foreground">
          {value}
        </text>
      </svg>
      <span className="text-[8px] text-center text-muted-foreground leading-tight max-w-[50px]">{label}</span>
    </div>
  );
}

// ─── Secciones del informe ───────────────────────────────────────

function ResumenFormacion({ report }: { report: TeamIntelligenceOutput }) {
  const { t } = useTranslation();
  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Users} title={t("teamAnalysis.teamSummary")} subtitle={t("teamAnalysis.playersAnalyzed", { count: report.equipoAnalizado.jugadoresDetectados })} />

      <div className="flex items-center gap-2 mb-3">
        <Badge className="text-xs font-display">{report.formacion.sistema}</Badge>
        <Badge variant="secondary" className="text-[9px]">
          {t("teamAnalysis.possession")} {report.posesion.porcentaje}%
        </Badge>
        {report.formacion.rigidez >= 7 && (
          <Badge variant="outline" className="text-[9px]">{t("teamAnalysis.rigid")}</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{report.resumenEjecutivo}</p>

      {report.formacion.variantes.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">{t("teamAnalysis.variants")}: </span>
          {report.formacion.variantes.join("; ")}
        </div>
      )}
    </div>
  );
}

function FasesJuego({ data }: { data: TeamIntelligenceOutput["fasesJuego"] }) {
  const { t } = useTranslation();
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Target} title={t("teamAnalysis.gamePhases")} subtitle={t("teamAnalysis.gamePhasesDesc")} />

      <div className="space-y-3">
        {/* Pressing */}
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-display uppercase tracking-wider text-red-400">{t("teamAnalysis.pressing")}</span>
            <div className="flex items-center gap-1.5">
              <Badge variant="outline" className="text-[8px]">{data.pressing.alturaLinea}</Badge>
              <span className="text-[9px] text-muted-foreground">{data.pressing.intensidad}/10</span>
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground">{data.pressing.descripcion}</p>
        </div>

        {/* Transiciones */}
        <div className="grid grid-cols-2 gap-2">
          <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3">
            <span className="text-[9px] font-display uppercase tracking-wider text-green-400">{t("teamAnalysis.offensiveTransition")}</span>
            <Badge variant="secondary" className="text-[8px] ml-1">{data.transiciones.ofensiva.velocidad}</Badge>
            <p className="text-[10px] text-muted-foreground mt-1">{data.transiciones.ofensiva.descripcion}</p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <span className="text-[9px] font-display uppercase tracking-wider text-blue-400">{t("teamAnalysis.defensiveTransition")}</span>
            <Badge variant="secondary" className="text-[8px] ml-1">{data.transiciones.defensiva.velocidad}</Badge>
            <p className="text-[10px] text-muted-foreground mt-1">{data.transiciones.defensiva.descripcion}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricasColectivas({ data }: { data: TeamIntelligenceOutput["metricasColectivas"] }) {
  const { t } = useTranslation();
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Shield} title={t("teamAnalysis.collectiveMetrics")} subtitle={t("teamAnalysis.collectiveMetricsDesc")} />

      <div className="grid grid-cols-4 gap-2 justify-items-center mb-3">
        <GaugeRing value={data.compacidad} max={10} label={t("teamAnalysis.compactness")} />
        <GaugeRing value={data.amplitud} max={10} label={t("teamAnalysis.width")} />
        <GaugeRing value={data.sincronizacion} max={10} label={t("teamAnalysis.synchronization")} />
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full border-[3.5px] border-primary/30 flex items-center justify-center">
            <span className="text-[10px] font-display font-bold text-foreground capitalize">{data.alturaLineaDefensiva}</span>
          </div>
          <span className="text-[8px] text-center text-muted-foreground">{t("teamAnalysis.defensiveLine")}</span>
        </div>
      </div>

      <p className="text-[11px] text-muted-foreground leading-relaxed">{data.descripcion}</p>
    </div>
  );
}

// ─── Tabla de jugadores ──────────────────────────────────────────

type PlayerRow = TeamIntelligenceOutput["jugadores"][number];

function JugadoresTable({ jugadores, onSelect }: {
  jugadores: PlayerRow[];
  onSelect: (j: PlayerRow) => void;
}) {
  const { t } = useTranslation();
  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Activity} title={t("teamAnalysis.playersTitle")} subtitle={t("teamAnalysis.playersDesc")} />

      <div className="space-y-1.5">
        {jugadores.map((j, i) => {
          const rendColor = RENDIMIENTO_COLORS[j.rendimiento] ?? "#6B7280";
          const totalPases = j.pases.completados + j.pases.fallados;
          const precPases = totalPases > 0 ? Math.round((j.pases.completados / totalPases) * 100) : 0;

          return (
            <button
              key={i}
              onClick={() => onSelect(j)}
              className="w-full flex items-center gap-2.5 p-2.5 rounded-xl border border-border hover:border-primary/50 transition-all text-left"
            >
              {/* Dorsal */}
              <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center shrink-0">
                <span className="text-[10px] font-display font-bold text-foreground">
                  {j.dorsalEstimado ?? "?"}
                </span>
              </div>

              {/* Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1.5">
                  <span className="text-[11px] font-display font-bold text-foreground truncate">{j.posicion}</span>
                  <span className="w-1.5 h-1.5 rounded-full shrink-0" style={{ backgroundColor: rendColor }} />
                </div>
                <p className="text-[9px] text-muted-foreground truncate">{j.rol}</p>
              </div>

              {/* Stats compactos */}
              <div className="flex items-center gap-2 shrink-0">
                <div className="text-center">
                  <span className="text-[10px] font-display font-bold text-foreground">{precPases}%</span>
                  <p className="text-[7px] text-muted-foreground">{t("teamAnalysis.passes")}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-display font-bold text-foreground">{j.duelos.ganados}</span>
                  <p className="text-[7px] text-muted-foreground">{t("teamAnalysis.duels")}</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-display font-bold text-foreground">{j.recuperaciones}</span>
                  <p className="text-[7px] text-muted-foreground">{t("teamAnalysis.recoveries")}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ─── Evaluación general ──────────────────────────────────────────

function EvaluacionGeneral({ data }: { data: TeamIntelligenceOutput["evaluacionGeneral"] }) {
  const { t } = useTranslation();
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={TrendingUp} title={t("teamAnalysis.generalEvaluation")} subtitle={t("teamAnalysis.generalEvalDesc")} />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle size={11} className="text-green-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-green-400">{t("teamAnalysis.teamStrengths")}</span>
          </div>
          {data.fortalezasEquipo.map((f, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {f}</p>
          ))}
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={11} className="text-amber-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-amber-400">{t("teamAnalysis.toWork")}</span>
          </div>
          {data.areasTrabajar.map((a, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {a}</p>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
          {t("teamAnalysis.coachRecommendations")}
        </p>
        {data.recomendaciones.map((r, i) => (
          <p key={i} className="text-[11px] text-foreground leading-relaxed mb-1">→ {r}</p>
        ))}
      </div>
    </div>
  );
}

// ─── Página principal ────────────────────────────────────────────

export default function TeamAnalysisPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [activeTab, setActiveTab] = useState<"nuevo" | "informe">("nuevo");
  const [teamColor, setTeamColor] = useState("");
  const [opponentColor, setOpponentColor] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);
  const [analysisFocus, setAnalysisFocus] = useState<string[]>([]);
  const [selectedAnalysisIdx, setSelectedAnalysisIdx] = useState(0);
  const [compareMode, setCompareMode] = useState(false);
  const [compareIdx, setCompareIdx] = useState(1);

  const {
    state,
    isAnalyzing,
    analysisResult,
    runAnalysis,
  } = useTeamIntelligence();

  const { data: savedAnalyses } = useAllTeamAnalyses();

  const allVideos = VideoService.getAll();
  const savedReport = savedAnalyses && savedAnalyses[selectedAnalysisIdx]
    ? (savedAnalyses[selectedAnalysisIdx].report as TeamIntelligenceOutput)
    : null;
  const report = analysisResult ?? savedReport;
  const compareReport: TeamIntelligenceOutput | null =
    compareMode && savedAnalyses && savedAnalyses[compareIdx]
      ? (savedAnalyses[compareIdx].report as TeamIntelligenceOutput)
      : null;

  const handleRunAnalysis = async () => {
    if (!selectedVideoId) {
      toast.error(t("reports.selectVideoFirst", "Selecciona un video primero"));
      return;
    }
    if (!teamColor.trim()) {
      toast.error(t("reports.selectVideoFirst", "Indica el color del uniforme del equipo"));
      return;
    }
    const video = allVideos.find(v => v.id === selectedVideoId);
    if (!video) return;

    try {
      const localSrc = video.localPath && !video.localPath.startsWith("http") ? video.localPath
        : video.streamUrl && !video.streamUrl.startsWith("http") ? video.streamUrl
        : undefined;

      await runAnalysis({
        videoId: selectedVideoId,
        videoDuration: (video.duration as number) || 120,
        teamColor: teamColor.trim(),
        opponentColor: opponentColor.trim() || undefined,
        localVideoSrc: localSrc,
        analysisFocus: analysisFocus.length > 0 ? analysisFocus : undefined,
      });
      toast.success("¡Análisis de equipo completado!");
      setActiveTab("informe");
    } catch (err) {
      const { title, description } = getErrorDetails(err, "team-analysis");
      toast.error(title, { description });
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-strong safe-area-top">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(-1)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-black text-foreground">Análisis de Equipo</h1>
            <p className="text-[10px] text-muted-foreground">Team Intelligence Report</p>
          </div>
          <div className="flex items-center gap-1">
            <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
            <span className="text-[9px] font-display uppercase tracking-widest text-primary">AI</span>
          </div>
        </div>
      </div>

      <div className="px-4 py-4 space-y-4">

        {/* Tabs */}
        <div className="flex gap-1 p-1 glass rounded-xl">
          {(["informe", "nuevo"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider transition-all ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "informe" ? "Informe" : "Nuevo Análisis"}
            </button>
          ))}
        </div>

        {/* ── NUEVO ANÁLISIS ── */}
        {activeTab === "nuevo" && (
          <div className="space-y-4">
            {/* Upload */}
            <div className="glass rounded-2xl p-4">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-3">
                Subir video del partido
              </p>
              <VideoUpload
                onDone={(videoId) => {
                  toast.success("Video listo");
                  setSelectedVideoId(videoId);
                }}
              />
            </div>

            {/* Selector de video */}
            {allVideos.length > 0 && (
              <div className="glass rounded-2xl p-4">
                <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-3">
                  Selecciona video
                </p>
                <div className="space-y-2">
                  {allVideos.filter(v => v.status === "finished" || v.status === "uploaded" || !!v.embedUrl || (v.localPath && !v.localPath.startsWith("http"))).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVideoId(v.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedVideoId === v.id ? "border-primary bg-primary/10" : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Play size={14} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">{v.title ?? v.id}</p>
                        <p className="text-[10px] text-muted-foreground">{v.duration ? `${Math.round(v.duration)}s` : "Listo"}</p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Identificación del equipo */}
            <div className="glass rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                Identificar equipo en el video
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    Color equipo *
                  </label>
                  <input
                    type="text"
                    value={teamColor}
                    onChange={(e) => setTeamColor(e.target.value)}
                    placeholder="ej: rojo, blanco"
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    Color rival
                  </label>
                  <input
                    type="text"
                    value={opponentColor}
                    onChange={(e) => setOpponentColor(e.target.value)}
                    placeholder="ej: azul"
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                La IA analizará a todo el equipo con ese color de uniforme: formación, posesión, pressing, métricas por jugador.
              </p>
            </div>

            {/* Progress */}
            {state.step !== "idle" && state.step !== "done" && state.step !== "error" && (
              <div className="glass rounded-2xl p-4">
                <div className="flex items-center gap-3 mb-2">
                  <Loader2 size={14} className="text-primary animate-spin" />
                  <span className="text-xs text-foreground">{state.message}</span>
                </div>
                <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
                  <motion.div
                    className="h-full bg-primary rounded-full"
                    animate={{ width: `${state.progress}%` }}
                    transition={{ duration: 0.4 }}
                  />
                </div>
              </div>
            )}

            {state.step === "error" && (
              <div className="glass rounded-2xl p-4 border border-destructive/30">
                <div className="flex items-center gap-2">
                  <AlertTriangle size={14} className="text-destructive" />
                  <p className="text-xs text-destructive">{state.message}</p>
                </div>
              </div>
            )}

            {/* Selector de enfoque */}
            <AnalysisFocusSelector value={analysisFocus} onChange={setAnalysisFocus} />

            <Button
              className="w-full h-12 text-sm font-display font-bold gap-2"
              onClick={handleRunAnalysis}
              disabled={!selectedVideoId || !teamColor.trim() || isAnalyzing}
            >
              {isAnalyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Analizando equipo...</>
              ) : (
                <><Users size={16} /> Analizar Equipo Completo</>
              )}
            </Button>
          </div>
        )}

        {/* ── INFORME ── */}
        {activeTab === "informe" && (
          <>
            {report ? (
              <div className="space-y-4">

                {/* Selector de análisis guardados */}
                {savedAnalyses && savedAnalyses.length > 1 && (
                  <div className="glass rounded-2xl p-4 space-y-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Video size={14} className="text-primary" />
                        <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                          Análisis guardados ({savedAnalyses.length})
                        </span>
                      </div>
                      <button
                        onClick={() => setCompareMode(m => !m)}
                        className={`flex items-center gap-1 text-[10px] font-bold px-2 py-1 rounded-lg transition-all ${
                          compareMode ? "bg-primary text-primary-foreground" : "text-primary hover:bg-primary/10"
                        }`}
                      >
                        <GitCompare size={10} />
                        {compareMode ? "Cerrar" : "Comparar"}
                      </button>
                    </div>
                    <div className="space-y-1.5">
                      {savedAnalyses.map((a: { video_id?: string; created_at?: string; report?: unknown }, idx: number) => {
                        const r = a.report as TeamIntelligenceOutput | null;
                        const videoTitle = a.video_id
                          ? VideoService.getById(a.video_id)?.title ?? a.video_id
                          : `Análisis ${savedAnalyses.length - idx}`;
                        const date = a.created_at ? new Date(a.created_at).toLocaleDateString("es", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "";
                        const isSelected = selectedAnalysisIdx === idx;
                        const isCompare = compareMode && compareIdx === idx;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              if (compareMode && idx !== selectedAnalysisIdx) {
                                setCompareIdx(idx);
                              } else if (!compareMode) {
                                setSelectedAnalysisIdx(idx);
                              }
                            }}
                            className={`w-full flex items-center gap-3 p-2.5 rounded-xl border transition-all text-left ${
                              isSelected ? "border-primary bg-primary/10" :
                              isCompare ? "border-amber-500 bg-amber-500/10" :
                              "border-border hover:border-primary/50"
                            }`}
                          >
                            <div className={`w-6 h-6 rounded-full flex items-center justify-center text-[9px] font-bold ${
                              isSelected ? "bg-primary text-primary-foreground" :
                              isCompare ? "bg-amber-500 text-white" :
                              "bg-secondary text-muted-foreground"
                            }`}>
                              {isSelected ? "A" : isCompare ? "B" : idx + 1}
                            </div>
                            <div className="flex-1 min-w-0">
                              <p className="text-[11px] font-medium text-foreground truncate">
                                {r?.equipoAnalizado?.colorUniforme ? `Equipo ${r.equipoAnalizado.colorUniforme}` : videoTitle}
                              </p>
                              <p className="text-[9px] text-muted-foreground">
                                {date} · {r?.formacion?.sistema ?? "?"} · Confianza {Math.round((r?.confianza ?? 0) * 100)}%
                              </p>
                            </div>
                            {isSelected && <Badge variant="secondary" className="text-[8px]">Actual</Badge>}
                            {isCompare && <Badge className="text-[8px] bg-amber-500">Comparar</Badge>}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Comparativa equipo */}
                {compareReport && (
                  <div className="glass rounded-2xl p-4 space-y-3">
                    <div className="flex items-center gap-2">
                      <GitCompare size={14} className="text-primary" />
                      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                        Comparativa entre análisis
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {[
                        { label: "Compacidad", cur: report.metricasColectivas?.compacidad, prev: compareReport.metricasColectivas?.compacidad },
                        { label: "Amplitud", cur: report.metricasColectivas?.amplitud, prev: compareReport.metricasColectivas?.amplitud },
                        { label: "Sincronización", cur: report.metricasColectivas?.sincronizacion, prev: compareReport.metricasColectivas?.sincronizacion },
                        { label: "Posesión %", cur: report.posesion?.porcentaje, prev: compareReport.posesion?.porcentaje },
                      ].map(({ label, cur, prev }) => {
                        const delta = (cur ?? 0) - (prev ?? 0);
                        const DeltaIcon = delta > 0 ? ArrowUpRight : delta < 0 ? ArrowDownRight : Minus;
                        const color = delta > 0 ? "text-green-400" : delta < 0 ? "text-red-400" : "text-muted-foreground";
                        return (
                          <div key={label} className="rounded-lg bg-secondary/50 p-2 flex items-center justify-between">
                            <span className="text-[10px] text-muted-foreground">{label}</span>
                            <div className="flex items-center gap-1">
                              <span className="text-[10px] font-mono">{prev ?? "?"}</span>
                              <DeltaIcon size={10} className={color} />
                              <span className={`text-[10px] font-mono font-bold ${color}`}>{cur ?? "?"}</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <div className="rounded-lg bg-secondary/50 p-2">
                        <p className="text-[9px] text-muted-foreground">Formación anterior</p>
                        <p className="text-[11px] font-bold">{compareReport.formacion?.sistema ?? "?"}</p>
                      </div>
                      <div className="rounded-lg bg-primary/10 border border-primary/30 p-2">
                        <p className="text-[9px] text-primary">Formación actual</p>
                        <p className="text-[11px] font-bold">{report.formacion?.sistema ?? "?"}</p>
                      </div>
                    </div>
                  </div>
                )}

                <ResumenFormacion report={report} />
                <FasesJuego data={report.fasesJuego} />
                <MetricasColectivas data={report.metricasColectivas} />
                <JugadoresTable
                  jugadores={report.jugadores}
                  onSelect={(j) => setSelectedPlayer(j)}
                />
                <EvaluacionGeneral data={report.evaluacionGeneral} />

                {/* Meta */}
                <div className="glass rounded-xl p-3 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Confianza: {Math.round((report.confianza ?? 0) * 100)}%
                  </span>
                  <button
                    onClick={() => setActiveTab("nuevo")}
                    className="flex items-center gap-1.5 text-[10px] text-primary"
                  >
                    <Zap size={10} /> Nuevo análisis
                  </button>
                </div>
              </div>
            ) : (
              <div className="glass rounded-2xl p-8 text-center">
                <Users size={32} className="mx-auto mb-3 text-primary/50" />
                <h3 className="text-sm font-display font-bold text-foreground mb-1">
                  Sin análisis de equipo
                </h3>
                <p className="text-xs text-muted-foreground mb-4">
                  Sube un video de partido y genera el primer informe táctico
                </p>
                <Button size="sm" onClick={() => setActiveTab("nuevo")} className="gap-2">
                  <Zap size={14} /> Nuevo Análisis
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Sheet: detalle de jugador */}
      <Sheet open={!!selectedPlayer} onOpenChange={(open) => !open && setSelectedPlayer(null)}>
        <SheetContent side="bottom" className="max-h-[85vh] overflow-y-auto rounded-t-2xl">
          {selectedPlayer && (
            <div className="space-y-4 pb-6">
              <SheetHeader>
                <SheetTitle className="font-display text-sm flex items-center gap-2">
                  <div className="w-8 h-8 rounded-lg bg-secondary flex items-center justify-center">
                    <span className="text-xs font-bold">{selectedPlayer.dorsalEstimado ?? "?"}</span>
                  </div>
                  {selectedPlayer.posicion}
                  <Badge
                    className="text-[8px] ml-auto"
                    style={{
                      color: RENDIMIENTO_COLORS[selectedPlayer.rendimiento],
                      backgroundColor: `${RENDIMIENTO_COLORS[selectedPlayer.rendimiento]}15`,
                    }}
                  >
                    {selectedPlayer.rendimiento}
                  </Badge>
                </SheetTitle>
              </SheetHeader>

              {/* Rol y resumen */}
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-1">Rol</p>
                <p className="text-xs text-foreground">{selectedPlayer.rol}</p>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">{selectedPlayer.resumen}</p>

              {/* Métricas individuales */}
              <div className="grid grid-cols-2 gap-2">
                <div className="glass rounded-xl p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Target size={10} className="text-green-400" />
                    <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">Pases</span>
                  </div>
                  <span className="font-display font-bold text-lg text-foreground">
                    {(selectedPlayer.pases.completados + selectedPlayer.pases.fallados) > 0
                      ? Math.round((selectedPlayer.pases.completados / (selectedPlayer.pases.completados + selectedPlayer.pases.fallados)) * 100)
                      : 0}%
                  </span>
                  <p className="text-[9px] text-muted-foreground">{selectedPlayer.pases.completados}✓ / {selectedPlayer.pases.fallados}✗</p>
                </div>

                <div className="glass rounded-xl p-3">
                  <div className="flex items-center gap-1 mb-1">
                    <Swords size={10} className="text-red-400" />
                    <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">Duelos</span>
                  </div>
                  <span className="font-display font-bold text-lg text-foreground">
                    {selectedPlayer.duelos.ganados}G / {selectedPlayer.duelos.perdidos}P
                  </span>
                  <p className="text-[9px] text-muted-foreground">{selectedPlayer.recuperaciones} recuperaciones</p>
                </div>

                {selectedPlayer.velocidadMaxKmh != null && (
                  <div className="glass rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <Zap size={10} className="text-yellow-400" />
                      <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">Velocidad</span>
                    </div>
                    <span className="font-display font-bold text-lg text-foreground">
                      {selectedPlayer.velocidadMaxKmh.toFixed(1)}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-1">km/h</span>
                  </div>
                )}

                {selectedPlayer.distanciaM != null && (
                  <div className="glass rounded-xl p-3">
                    <div className="flex items-center gap-1 mb-1">
                      <MapPin size={10} className="text-blue-400" />
                      <span className="text-[8px] font-display uppercase tracking-wider text-muted-foreground">Distancia</span>
                    </div>
                    <span className="font-display font-bold text-lg text-foreground">
                      {selectedPlayer.distanciaM.toFixed(0)}
                    </span>
                    <span className="text-[9px] text-muted-foreground ml-1">m</span>
                  </div>
                )}
              </div>

              {/* Heatmap */}
              {selectedPlayer.heatmapPositions && selectedPlayer.heatmapPositions.length > 0 && (
                <PlayerHeatmap
                  positions={selectedPlayer.heatmapPositions}
                  title={`Mapa de Calor — #${selectedPlayer.dorsalEstimado ?? "?"}`}
                />
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>
    </div>
  );
}
