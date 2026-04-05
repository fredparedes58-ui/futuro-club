/**
 * VITAS · Player Intelligence Page
 * /players/:id/intelligence
 *
 * Muestra el análisis completo de inteligencia de un jugador:
 *   - Estado Actual (6 dimensiones)
 *   - ADN Futbolístico
 *   - Jugador Referencia / Clon (ProPlayerMatch)
 *   - Proyección de Carrera
 *   - Plan de Desarrollo
 *
 * También permite lanzar un análisis nuevo con video.
 */

import { useParams, useNavigate } from "react-router-dom";
import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Zap, Play, Brain, Target, TrendingUp,
  ClipboardList, Star, AlertTriangle, CheckCircle, Clock,
  ChevronDown, ChevronUp, RefreshCw, Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { PlayerService, type Player } from "@/services/real/playerService";
import { VideoService, type VideoRecord } from "@/services/real/videoService";
import { usePlayerIntelligence, useSavedAnalyses } from "@/hooks/usePlayerIntelligence";
import ProPlayerMatch from "@/components/ProPlayerMatch";
import VitasCard from "@/components/VitasCard";
import AnalysisTimeline from "@/components/AnalysisTimeline";
import VideoUpload from "@/components/VideoUpload";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { SimilarityMatch } from "@/services/real/similarityService";
import type { VideoIntelligenceOutput } from "@/agents/contracts";

// ─── Helpers UI ───────────────────────────────────────────────────────────────

const LEVEL_LABELS: Record<string, string> = {
  elite:       "Élite",
  alto:        "Alto",
  medio_alto:  "Medio-Alto",
  medio:       "Medio",
  desarrollo:  "En Desarrollo",
};

const LEVEL_COLORS: Record<string, string> = {
  elite:       "#FFD700",
  alto:        "#22C55E",
  medio_alto:  "#3B82F6",
  medio:       "#F59E0B",
  desarrollo:  "#8B5CF6",
};

function ScoreRing({ score, label }: { score: number; label: string }) {
  const radius = 20;
  const circ   = 2 * Math.PI * radius;
  const dash   = (score / 10) * circ;

  return (
    <div className="flex flex-col items-center gap-1">
      <svg width="56" height="56" viewBox="0 0 56 56">
        <circle cx="28" cy="28" r={radius} fill="none" stroke="hsl(var(--secondary))" strokeWidth="4" />
        <circle
          cx="28" cy="28" r={radius} fill="none"
          stroke="hsl(var(--primary))" strokeWidth="4"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          transform="rotate(-90 28 28)"
        />
        <text x="28" y="32" textAnchor="middle" fontSize="12" fontWeight="bold" fill="currentColor" className="text-foreground">
          {score.toFixed(1)}
        </text>
      </svg>
      <span className="text-[9px] text-center text-muted-foreground leading-tight max-w-[52px]">{label}</span>
    </div>
  );
}

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

// ─── Secciones del informe ────────────────────────────────────────────────────

function EstadoActual({ data }: { data: VideoIntelligenceOutput["estadoActual"] }) {
  const levelColor = LEVEL_COLORS[data.nivelActual] ?? "#3B82F6";

  return (
    <div className="space-y-4">
      {/* Nivel y resumen */}
      <div className="glass rounded-2xl p-4">
        <SectionHeader icon={Brain} title="Estado Actual" subtitle="Evaluación observacional del video" />

        <div className="flex items-center gap-2 mb-3">
          <span className="text-xs font-display font-bold"
            style={{ color: levelColor }}>
            ● {LEVEL_LABELS[data.nivelActual] ?? data.nivelActual}
          </span>
          {data.ajusteVSIVideoScore !== 0 && (
            <Badge
              variant={data.ajusteVSIVideoScore > 0 ? "default" : "destructive"}
              className="text-[9px]"
            >
              VSI {data.ajusteVSIVideoScore > 0 ? "+" : ""}{data.ajusteVSIVideoScore}
            </Badge>
          )}
        </div>

        <p className="text-xs text-muted-foreground leading-relaxed">{data.resumenEjecutivo}</p>
      </div>

      {/* 6 dimensiones */}
      <div className="glass rounded-2xl p-4">
        <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-4">
          6 Dimensiones observadas
        </p>
        <div className="grid grid-cols-3 gap-3 justify-items-center">
          {Object.entries({
            "Decisión":  data.dimensiones.velocidadDecision,
            "Técnica":   data.dimensiones.tecnicaConBalon,
            "Táctica":   data.dimensiones.inteligenciaTactica,
            "Físico":    data.dimensiones.capacidadFisica,
            "Liderazgo": data.dimensiones.liderazgoPresencia,
            "Eficacia":  data.dimensiones.eficaciaCompetitiva,
          }).map(([label, dim]) => (
            <ScoreRing key={label} score={dim.score} label={label} />
          ))}
        </div>
        {/* Observaciones expandibles */}
        <div className="mt-4 space-y-2">
          {Object.entries({
            "Velocidad de decisión":  data.dimensiones.velocidadDecision.observacion,
            "Técnica con balón":      data.dimensiones.tecnicaConBalon.observacion,
            "Inteligencia táctica":   data.dimensiones.inteligenciaTactica.observacion,
          }).map(([k, obs]) => (
            <div key={k} className="text-[11px] text-muted-foreground leading-relaxed">
              <span className="font-medium text-foreground">{k}: </span>{obs}
            </div>
          ))}
        </div>
      </div>

      {/* Fortalezas y áreas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle size={11} className="text-green-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-green-400">Fortalezas</span>
          </div>
          {data.fortalezasPrimarias.map((f, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {f}</p>
          ))}
        </div>
        <div className="glass rounded-xl p-3">
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={11} className="text-amber-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-amber-400">A trabajar</span>
          </div>
          {data.areasDesarrollo.map((a, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {a}</p>
          ))}
        </div>
      </div>
    </div>
  );
}

function ADNFutbolistico({ data }: { data: VideoIntelligenceOutput["adnFutbolistico"] }) {
  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Zap} title="ADN Futbolístico" subtitle="Identidad y patrones de juego" />

      <div className="mb-3">
        <Badge className="text-xs mb-2">{data.arquetipoTactico}</Badge>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.estiloJuego}</p>
      </div>

      <div className="space-y-2 mb-3">
        {data.patrones.map((pat, i) => {
          const freqColor = pat.frecuencia === "alto" ? "#22C55E" : pat.frecuencia === "medio" ? "#F59E0B" : "#6B7280";
          return (
            <div key={i} className="flex items-start gap-2 text-[11px]">
              <span className="mt-0.5 shrink-0" style={{ color: freqColor }}>●</span>
              <span>
                <span className="font-medium text-foreground">{pat.patron}</span>
                <span className="text-muted-foreground"> — {pat.descripcion}</span>
              </span>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed italic border-t border-border pt-3">
        {data.mentalidad}
      </p>
    </div>
  );
}

function ProyeccionCarrera({ data }: { data: VideoIntelligenceOutput["proyeccionCarrera"] }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={TrendingUp} title="Proyección de Carrera" subtitle="Escenarios a largo plazo" />

      {/* Optimista */}
      <div className="rounded-xl border border-green-500/30 bg-green-500/5 p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Star size={11} className="text-green-400" />
          <span className="text-[10px] font-display uppercase tracking-wider text-green-400">Escenario óptimo</span>
          <Badge variant="secondary" className="text-[9px] ml-auto">{data.escenarioOptimista.nivelProyecto}</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.escenarioOptimista.descripcion}</p>
        {data.escenarioOptimista.edadPeak && (
          <p className="text-[10px] text-green-400 mt-1.5">Peak proyectado: {data.escenarioOptimista.edadPeak} años</p>
        )}
      </div>

      {/* Realista */}
      <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3 mb-3">
        <div className="flex items-center gap-1.5 mb-1.5">
          <Target size={11} className="text-blue-400" />
          <span className="text-[10px] font-display uppercase tracking-wider text-blue-400">Escenario realista</span>
          <Badge variant="secondary" className="text-[9px] ml-auto">{data.escenarioRealista.nivelProyecto}</Badge>
        </div>
        <p className="text-xs text-muted-foreground leading-relaxed">{data.escenarioRealista.descripcion}</p>
      </div>

      {/* Factores y riesgos */}
      <button
        onClick={() => setExpanded(e => !e)}
        className="flex items-center gap-1.5 text-[10px] text-muted-foreground w-full"
      >
        {expanded ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
        Factores clave y riesgos
      </button>

      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 gap-3 mt-3">
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-green-400 mb-1">Factores +</p>
                {data.factoresClave.map((f, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">• {f}</p>
                ))}
              </div>
              <div>
                <p className="text-[10px] font-display uppercase tracking-wider text-red-400 mb-1">Riesgos</p>
                {data.riesgos.map((r, i) => (
                  <p key={i} className="text-[11px] text-muted-foreground leading-relaxed">• {r}</p>
                ))}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function PlanDesarrollo({ data }: { data: VideoIntelligenceOutput["planDesarrollo"] }) {
  const prioColor = (p: string) =>
    p === "crítica" ? "#EF4444" : p === "alta" ? "#F59E0B" : "#3B82F6";

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={ClipboardList} title="Plan de Desarrollo" subtitle="Hoja de ruta personalizada" />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div className="rounded-xl border border-border p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <Clock size={10} className="text-primary" />
            <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">6 meses</span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{data.objetivo6meses}</p>
        </div>
        <div className="rounded-xl border border-border p-2.5">
          <div className="flex items-center gap-1.5 mb-1">
            <TrendingUp size={10} className="text-gold" />
            <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">18 meses</span>
          </div>
          <p className="text-[11px] text-foreground leading-relaxed">{data.objetivo18meses}</p>
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {data.pilaresTrabajo.map((pilar, i) => (
          <div key={i} className="rounded-xl border border-border p-3">
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-display font-bold text-foreground">{pilar.pilar}</span>
              <span className="text-[9px] font-bold px-1.5 py-0.5 rounded"
                style={{ color: prioColor(pilar.prioridad), backgroundColor: `${prioColor(pilar.prioridad)}15` }}>
                {pilar.prioridad.toUpperCase()}
              </span>
            </div>
            {pilar.acciones.map((acc, j) => (
              <p key={j} className="text-[11px] text-muted-foreground">→ {acc}</p>
            ))}
          </div>
        ))}
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-1">
          Para el entrenador
        </p>
        <p className="text-xs text-foreground leading-relaxed italic">
          "{data.recomendacionEntrenador}"
        </p>
      </div>
    </div>
  );
}

// ─── Página principal ─────────────────────────────────────────────────────────

export default function PlayerIntelligencePage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [selectedVideoId, setSelectedVideoId] = useState<string>("");
  const [activeTab, setActiveTab] = useState<"nuevo" | "guardado" | "historial">("guardado");
  const [showCard, setShowCard] = useState(false);
  const [jerseyNumber, setJerseyNumber] = useState<string>("");
  const [teamColor, setTeamColor] = useState<string>("");

  const player = id ? PlayerService.getById(id) : null;
  const { data: analyses, isLoading: loadingAnalyses } = useSavedAnalyses(id ?? "");

  const {
    state,
    isAnalyzing,
    isSimilarityLoading,
    analysisResult,
    similarityData,
    runAnalysis,
    refetchSimilarity,
  } = usePlayerIntelligence(player ?? ({} as Player));

  if (!player) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 p-6">
        <AlertTriangle size={32} className="text-destructive" />
        <p className="text-sm text-muted-foreground">Jugador no encontrado</p>
        <Button variant="outline" size="sm" onClick={() => navigate(-1)}>Volver</Button>
      </div>
    );
  }

  // Obtener videos disponibles — primero los del jugador, si no hay, mostrar todos
  const playerVideos = (() => {
    const byPlayer = VideoService.getByPlayerId(player.id);
    if (byPlayer.length > 0) return byPlayer;
    // Fallback: mostrar todos los videos disponibles para análisis
    return VideoService.getAll();
  })();

  // Informe a mostrar: último análisis guardado o el recién generado
  const latestReport: VideoIntelligenceOutput | null =
    analysisResult ??
    (analyses && analyses[0]?.report as VideoIntelligenceOutput) ??
    null;

  // Construir SimilarityMatch[] desde el informe
  const top5Matches: SimilarityMatch[] = latestReport?.jugadorReferencia?.top5?.map(m => ({
    player: {
      id:            m.proPlayerId,
      name:          m.nombre,
      short_name:    m.nombre.split(" ").pop() ?? m.nombre,
      overall:       0,
      potential:     0,
      age:           0,
      nationality:   "",
      club:          m.club,
      league:        "",
      position:      m.posicion,
      positions:     [m.posicion],
      foot:          "right" as const,
      height:        0,
      pace:          0, shooting: 0, passing: 0,
      dribbling:     0, defending: 0, physic: 0,
    },
    score:         m.score,
    positionMatch: true,
  })) ?? similarityData?.top5 ?? [];

  const bestMatchData: SimilarityMatch | null =
    top5Matches[0] ?? similarityData?.bestMatch ?? null;

  const handleRunAnalysis = async () => {
    if (!selectedVideoId) {
      toast.error("Selecciona un video primero");
      return;
    }
    const video = playerVideos.find(v => v.id === selectedVideoId);
    if (!video) return;
    const duration = (video.duration as number) || 34;
    try {
      await runAnalysis({
        videoId: selectedVideoId,
        videoDuration: duration,
        jerseyNumber: jerseyNumber.trim() || undefined,
        teamColor: teamColor.trim() || undefined,
      });
      toast.success("¡Análisis completado!");
      setActiveTab("guardado");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Error en el análisis");
    }
  };

  return (
    <div className="min-h-screen pb-24">
      {/* Header */}
      <div className="sticky top-0 z-10 glass-strong safe-area-top">
        <div className="flex items-center gap-3 px-4 h-14">
          <button onClick={() => navigate(`/player/${id}`)} className="p-1.5 rounded-lg hover:bg-secondary transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex-1 min-w-0">
            <h1 className="text-sm font-display font-black text-foreground truncate">{player.name}</h1>
            <p className="text-[10px] text-muted-foreground">Intelligence Report</p>
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
          {(["guardado", "historial", "nuevo"] as const).map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={`flex-1 py-1.5 rounded-lg text-[10px] font-display font-bold uppercase tracking-wider transition-all ${
                activeTab === tab
                  ? "bg-primary text-primary-foreground shadow-sm"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {tab === "guardado" ? "Informe" : tab === "historial" ? "Historial" : "Nuevo"}
            </button>
          ))}
        </div>

        {/* ── HISTORIAL ── */}
        {activeTab === "historial" && id && (
          <AnalysisTimeline playerId={id} />
        )}

        {/* ── NUEVO ANÁLISIS ── */}
        {activeTab === "nuevo" && (
          <div className="space-y-4">
            {/* Upload de video */}
            <div className="glass rounded-2xl p-4">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-3">
                Subir nuevo video
              </p>
              <VideoUpload
                playerId={player.id}
                onDone={(videoId) => {
                  toast.success("Video listo para analizar");
                  setSelectedVideoId(videoId);
                }}
              />
            </div>

            {/* Selector de video */}
            {playerVideos.length > 0 ? (
              <div className="glass rounded-2xl p-4">
                <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground mb-3">
                  Selecciona el video a analizar
                </p>
                <div className="space-y-2">
                  {playerVideos.filter(v => v.status === "finished" || v.status === "uploaded" || !!v.embedUrl).map(v => (
                    <button
                      key={v.id}
                      onClick={() => setSelectedVideoId(v.id)}
                      className={`w-full flex items-center gap-3 p-3 rounded-xl border transition-all text-left ${
                        selectedVideoId === v.id
                          ? "border-primary bg-primary/10"
                          : "border-border hover:border-primary/50"
                      }`}
                    >
                      <Play size={14} className="text-primary shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {v.title ?? v.id}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {v.embedUrl ? "Listo para análisis" : v.status}
                        </p>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ) : (
              <div className="glass rounded-2xl p-6 text-center">
                <Play size={24} className="mx-auto mb-2 text-muted-foreground" />
                <p className="text-sm text-muted-foreground mb-2">Sin videos disponibles</p>
                <p className="text-xs text-muted-foreground">
                  Sube un video desde el perfil del jugador primero
                </p>
              </div>
            )}

            {/* Botón de análisis */}
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

            {/* Identificación del jugador en video */}
            <div className="glass rounded-2xl p-4 space-y-3">
              <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                Identificar jugador en el video
              </p>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    Nº Camiseta
                  </label>
                  <input
                    type="text"
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder="ej: 7, 10, 23"
                    maxLength={3}
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] font-display font-semibold text-muted-foreground uppercase tracking-wider">
                    Color uniforme
                  </label>
                  <input
                    type="text"
                    value={teamColor}
                    onChange={(e) => setTeamColor(e.target.value)}
                    placeholder="ej: rojo, verde"
                    className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 transition-colors"
                  />
                </div>
              </div>
              <p className="text-[9px] text-muted-foreground leading-relaxed">
                La IA buscará específicamente ese dorsal y color en los fotogramas del video para centrar el análisis en ese jugador.
              </p>
            </div>

            <Button
              className="w-full h-12 text-sm font-display font-bold gap-2"
              onClick={handleRunAnalysis}
              disabled={!selectedVideoId || isAnalyzing}
            >
              {isAnalyzing ? (
                <><Loader2 size={16} className="animate-spin" /> Analizando con IA...</>
              ) : (
                <><Zap size={16} /> Generar Informe VITAS</>
              )}
            </Button>

            {/* Similitud sin video */}
            {!latestReport && (
              <Button
                variant="outline"
                className="w-full h-10 text-xs gap-2"
                onClick={() => refetchSimilarity()}
                disabled={isSimilarityLoading}
              >
                {isSimilarityLoading ? (
                  <><Loader2 size={12} className="animate-spin" /> Calculando...</>
                ) : (
                  <><RefreshCw size={12} /> Solo similitud (sin video)</>
                )}
              </Button>
            )}
          </div>
        )}

        {/* ── ÚLTIMO INFORME ── */}
        {activeTab === "guardado" && (
          <>
            {loadingAnalyses ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 size={24} className="animate-spin text-primary" />
              </div>
            ) : latestReport ? (
              <div className="space-y-4">
                {/* Estado Actual */}
                <EstadoActual data={latestReport.estadoActual} />

                {/* ADN */}
                <ADNFutbolistico data={latestReport.adnFutbolistico} />

                {/* Clon */}
                {top5Matches.length > 0 && bestMatchData && (
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <Star size={12} className="text-gold" />
                      <span className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                        Jugadores Referencia
                      </span>
                    </div>
                    <ProPlayerMatch top5={top5Matches} bestMatch={bestMatchData} />
                  </div>
                )}

                {/* Proyección */}
                <ProyeccionCarrera data={latestReport.proyeccionCarrera} />

                {/* Plan */}
                <PlanDesarrollo data={latestReport.planDesarrollo} />

                {/* Meta + VITAS Card */}
                <div className="glass rounded-xl p-3 flex items-center justify-between">
                  <span className="text-[10px] text-muted-foreground">
                    Confianza: {Math.round((latestReport.confianza ?? 0) * 100)}%
                  </span>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setShowCard(true)}
                      className="flex items-center gap-1.5 text-[10px] text-gold font-bold"
                    >
                      <Star size={10} /> Exportar Card
                    </button>
                    <button
                      onClick={() => setActiveTab("nuevo")}
                      className="flex items-center gap-1.5 text-[10px] text-primary"
                    >
                      <RefreshCw size={10} /> Nuevo
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              /* Sin informe todavía */
              <div className="space-y-4">
                <div className="glass rounded-2xl p-8 text-center">
                  <Brain size={32} className="mx-auto mb-3 text-primary/50" />
                  <h3 className="text-sm font-display font-bold text-foreground mb-1">
                    Sin análisis todavía
                  </h3>
                  <p className="text-xs text-muted-foreground mb-4">
                    Genera el primer informe de inteligencia para {player.name}
                  </p>
                  <Button size="sm" onClick={() => setActiveTab("nuevo")} className="gap-2">
                    <Zap size={14} /> Generar Informe
                  </Button>
                </div>

                {/* Similitud rápida sin video */}
                {similarityData && bestMatchData && (
                  <div className="space-y-3">
                    <p className="text-[10px] font-display uppercase tracking-widest text-muted-foreground">
                      Similitud por métricas (sin video)
                    </p>
                    <ProPlayerMatch top5={similarityData.top5} bestMatch={similarityData.bestMatch} />
                  </div>
                )}

                {!similarityData && (
                  <Button
                    variant="outline"
                    className="w-full gap-2"
                    onClick={() => refetchSimilarity()}
                    disabled={isSimilarityLoading}
                  >
                    {isSimilarityLoading ? (
                      <><Loader2 size={14} className="animate-spin" /> Calculando similitud...</>
                    ) : (
                      <><Star size={14} /> Ver jugadores similares ahora</>
                    )}
                  </Button>
                )}
              </div>
            )}
          </>
        )}
      </div>

      {/* Modal VITAS Card */}
      <Dialog open={showCard} onOpenChange={setShowCard}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle className="font-display text-sm">VITAS Card — {player.name}</DialogTitle>
          </DialogHeader>
          <VitasCard
            player={player}
            bestMatch={bestMatchData}
            projection={latestReport?.proyeccionCarrera?.escenarioRealista?.nivelProyecto}
            onClose={() => setShowCard(false)}
          />
        </DialogContent>
      </Dialog>
    </div>
  );
}
