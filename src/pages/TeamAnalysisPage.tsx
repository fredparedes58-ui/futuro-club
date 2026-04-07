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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

import { VideoService, type VideoRecord } from "@/services/real/videoService";
import { useTeamIntelligence } from "@/hooks/useTeamIntelligence";
import VideoUpload from "@/components/VideoUpload";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import type { TeamIntelligenceOutput } from "@/agents/contracts";
import {
  Sheet, SheetContent, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { getErrorDetails } from "@/services/errorDiagnosticService";

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
  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Users} title="Resumen del Equipo" subtitle={`${report.equipoAnalizado.jugadoresDetectados} jugadores analizados`} />

      <div className="flex items-center gap-2 mb-3">
        <Badge className="text-xs font-display">{report.formacion.sistema}</Badge>
        <Badge variant="secondary" className="text-[9px]">
          Posesión {report.posesion.porcentaje}%
        </Badge>
        {report.formacion.rigidez >= 7 && (
          <Badge variant="outline" className="text-[9px]">Rígida</Badge>
        )}
      </div>

      <p className="text-xs text-muted-foreground leading-relaxed mb-3">{report.resumenEjecutivo}</p>

      {report.formacion.variantes.length > 0 && (
        <div className="text-[11px] text-muted-foreground">
          <span className="font-medium text-foreground">Variantes: </span>
          {report.formacion.variantes.join("; ")}
        </div>
      )}
    </div>
  );
}

function FasesJuego({ data }: { data: TeamIntelligenceOutput["fasesJuego"] }) {
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Target} title="Fases de Juego" subtitle="Pressing, transiciones, posesión" />

      <div className="space-y-3">
        {/* Pressing */}
        <div className="rounded-xl border border-border p-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] font-display uppercase tracking-wider text-red-400">Pressing</span>
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
            <span className="text-[9px] font-display uppercase tracking-wider text-green-400">Trans. Ofensiva</span>
            <Badge variant="secondary" className="text-[8px] ml-1">{data.transiciones.ofensiva.velocidad}</Badge>
            <p className="text-[10px] text-muted-foreground mt-1">{data.transiciones.ofensiva.descripcion}</p>
          </div>
          <div className="rounded-xl border border-blue-500/30 bg-blue-500/5 p-3">
            <span className="text-[9px] font-display uppercase tracking-wider text-blue-400">Trans. Defensiva</span>
            <Badge variant="secondary" className="text-[8px] ml-1">{data.transiciones.defensiva.velocidad}</Badge>
            <p className="text-[10px] text-muted-foreground mt-1">{data.transiciones.defensiva.descripcion}</p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MetricasColectivas({ data }: { data: TeamIntelligenceOutput["metricasColectivas"] }) {
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Shield} title="Métricas Colectivas" subtitle="Organización táctica del equipo" />

      <div className="grid grid-cols-4 gap-2 justify-items-center mb-3">
        <GaugeRing value={data.compacidad} max={10} label="Compacidad" />
        <GaugeRing value={data.amplitud} max={10} label="Amplitud" />
        <GaugeRing value={data.sincronizacion} max={10} label="Sincronización" />
        <div className="flex flex-col items-center gap-1">
          <div className="w-12 h-12 rounded-full border-[3.5px] border-primary/30 flex items-center justify-center">
            <span className="text-[10px] font-display font-bold text-foreground capitalize">{data.alturaLineaDefensiva}</span>
          </div>
          <span className="text-[8px] text-center text-muted-foreground">Línea def.</span>
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
  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={Activity} title="Jugadores" subtitle="Toca un jugador para ver detalle y mapa de calor" />

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
                  <p className="text-[7px] text-muted-foreground">Pases</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-display font-bold text-foreground">{j.duelos.ganados}</span>
                  <p className="text-[7px] text-muted-foreground">Duelos</p>
                </div>
                <div className="text-center">
                  <span className="text-[10px] font-display font-bold text-foreground">{j.recuperaciones}</span>
                  <p className="text-[7px] text-muted-foreground">Recup.</p>
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
  if (!data) return null;

  return (
    <div className="glass rounded-2xl p-4">
      <SectionHeader icon={TrendingUp} title="Evaluación General" subtitle="Conclusiones y recomendaciones" />

      <div className="grid grid-cols-2 gap-3 mb-4">
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <CheckCircle size={11} className="text-green-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-green-400">Fortalezas</span>
          </div>
          {data.fortalezasEquipo.map((f, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {f}</p>
          ))}
        </div>
        <div>
          <div className="flex items-center gap-1.5 mb-2">
            <Target size={11} className="text-amber-400" />
            <span className="text-[10px] font-display uppercase tracking-wider text-amber-400">A trabajar</span>
          </div>
          {data.areasTrabajar.map((a, i) => (
            <p key={i} className="text-[11px] text-foreground leading-relaxed">• {a}</p>
          ))}
        </div>
      </div>

      <div className="border-t border-border pt-3">
        <p className="text-[10px] font-display uppercase tracking-wider text-muted-foreground mb-2">
          Recomendaciones para el entrenador
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
  const navigate = useNavigate();
  const [selectedVideoId, setSelectedVideoId] = useState("");
  const [activeTab, setActiveTab] = useState<"nuevo" | "informe">("nuevo");
  const [teamColor, setTeamColor] = useState("");
  const [opponentColor, setOpponentColor] = useState("");
  const [selectedPlayer, setSelectedPlayer] = useState<PlayerRow | null>(null);

  const {
    state,
    isAnalyzing,
    analysisResult,
    runAnalysis,
  } = useTeamIntelligence();

  const allVideos = VideoService.getAll();
  const report = analysisResult;

  const handleRunAnalysis = async () => {
    if (!selectedVideoId) {
      toast.error("Selecciona un video primero");
      return;
    }
    if (!teamColor.trim()) {
      toast.error("Indica el color del uniforme del equipo");
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
