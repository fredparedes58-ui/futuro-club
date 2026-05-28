import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate } from "react-router-dom";
import {
  CheckCircle2,
  RotateCcw,
  Camera,
  Play,
  Pause,
  Users,
  ScanSearch,
  Swords,
  UserRound,
  Rocket,
  ArrowLeft,
  Upload,
  X,
  Video,
  ChevronDown,
  Loader2,
  Brain,
  Star,
  TrendingUp,
  Target,
  CircleAlert,
  AlertTriangle,
  Activity,
  FileDown,
  History,
  Zap,
} from "lucide-react";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";
import { PlayerTrackingService } from "@/services/real/playerTrackingService";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import VoronoiOverlay from "@/components/VoronoiOverlay";
import { useTracking } from "@/hooks/useTracking";
import { useMediaPipePose } from "@/hooks/useMediaPipePose";
import { EventDetectionEngine } from "@/lib/tracking/eventDetectionEngine";
import type { TacticalEvent, EventSummary } from "@/lib/tracking/eventDetectionEngine";
import { AnalyticsExporter } from "@/lib/tracking/analyticsExportPipeline";
import type { SessionExportData, ExportFormat } from "@/lib/tracking/analyticsExportPipeline";
import { detectFieldLines } from "@/lib/tracking/fieldLineDetector";
import type { FieldDetectionResult } from "@/lib/tracking/fieldLineDetector";
import pitchImage from "@/assets/pitch-field.jpg";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import VideoUpload from "@/components/VideoUpload";
import { useVideos } from "@/hooks/useVideos";
import VideoCard from "@/components/VideoCard";
import VideoPlayer from "@/components/VideoPlayer";
import { getBestVideoUrl } from "@/services/real/videoService";
import { useAllPlayers } from "@/hooks/usePlayers";
import { useAuth } from "@/context/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { SubscriptionService } from "@/services/real/subscriptionService";
import { isLocalSrc } from "@/lib/localVideoUtils";
import AnalysisFocusSelector from "@/components/AnalysisFocusSelector";
import KnowledgeSearch from "@/components/KnowledgeSearch";
import DrillRecommendations from "@/components/intelligence/DrillRecommendations";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useQuery } from "@tanstack/react-query";
import { usePlayerAnalysisV2, type AnalysisV2Result } from "@/hooks/usePlayerAnalysisV2";
import { useFatigue } from "@/hooks/useFatigue";
import FatiguePanel from "@/components/FatiguePanel";
import { useOneClickAnalysis } from "@/hooks/useOneClickAnalysis";
import VitasLabOneClick from "@/components/VitasLabOneClick";
import PlayerIdentityOverlay from "@/components/PlayerIdentityOverlay";

interface CalibrationPoint {
  id: number;
  x: number;
  y: number;
  label: string;
}

const steps = [
  { id: 1, label: "SUBIR", done: true },
  { id: 2, label: "MAPEO", active: true },
  { id: 3, label: "PROCESAR", done: false },
];

const analysisModes = [
  {
    id: "all",
    label: "Todos los Jugadores",
    desc: "Cobertura global del campo y mapas de calor",
    icon: Users,
  },
  {
    id: "click",
    label: "Seguimiento Manual",
    desc: "Enfoque en selección individual manual",
    icon: ScanSearch,
  },
  {
    id: "team",
    label: "Equipo Completo",
    desc: "Comparar bloques tácticos local vs visitante",
    icon: Swords,
  },
  {
    id: "player",
    label: "Jugador Específico",
    desc: "Filtrar por dorsal y posición",
    icon: UserRound,
  },
];

// ─── Report types ─────────────────────────────────────────────────────────────

interface Dimension {
  score: number;
  observacion: string;
}

interface AnalysisReport {
  estadoActual: {
    resumenEjecutivo: string;
    nivelActual: string;
    fortalezasPrimarias: string[];
    areasDesarrollo: string[];
    dimensiones: {
      velocidadDecision:   Dimension;
      tecnicaConBalon:     Dimension;
      inteligenciaTactica: Dimension;
      capacidadFisica:     Dimension;
      liderazgoPresencia:  Dimension;
      eficaciaCompetitiva: Dimension;
    };
    ajusteVSIVideoScore: number;
  };
  adnFutbolistico: {
    estiloJuego:     string;
    arquetipoTactico: string;
    patrones: Array<{ patron: string; frecuencia: string; descripcion: string }>;
    mentalidad: string;
  };
  jugadorReferencia: {
    bestMatch: {
      nombre:   string;
      posicion: string;
      club:     string;
      score:    number;
      narrativa: string;
    };
  };
  proyeccionCarrera: {
    escenarioOptimista: { descripcion: string; nivelProyecto: string };
    escenarioRealista:  { descripcion: string; nivelProyecto: string };
    factoresClave:      string[];
    riesgos:            string[];
  };
  planDesarrollo: {
    objetivo6meses:  string;
    objetivo18meses: string;
    pilaresTrabajo:  Array<{ pilar: string; acciones: string[]; prioridad: string }>;
  };
  metricasCuantitativas?: {
    fisicas?: {
      velocidadMaxKmh:  number;
      velocidadPromKmh: number;
      distanciaM:       number;
      sprints:          number;
      zonasIntensidad:  { caminar: number; trotar: number; correr: number; sprint: number };
    };
    eventos?: {
      pasesCompletados: number;
      pasesFallados:    number;
      precisionPases:   number;
      recuperaciones:   number;
      duelosGanados:    number;
      duelosPerdidos:   number;
      disparosAlArco:   number;
      disparosFuera:    number;
    };
    fuente:     string;
    confianza:  number;
    heatmapPositions?: Array<{ fx: number; fy: number }>;
  };
  confianza: number;
}

// ── Bridge: mapea V2 reports al shape legacy que usa el panel de resultados ──
function mapV2ToReport(result: AnalysisV2Result): AnalysisReport | null {
  if (!result.reports || result.reports.length === 0) return null;
  const get = (type: string) =>
    (result.reports!.find((r) => r.report_type === type)?.content ?? {}) as Record<string, unknown>;

  const pr  = get("player-report");
  const dna = get("dna-profile");
  const bm  = get("best-match");
  const pj  = get("projection");
  const dp  = get("development-plan");

  const vsiScore = (result.vsi?.vsi as number) ?? 50;
  const strengths   = (pr.strengths as Array<{ title: string }> | undefined) ?? [];
  const areasRaw    = (pr.areas_to_improve as Array<{ title: string }> | undefined) ?? [];
  const defaultDim  = { score: 0.5, observacion: "Calculado por pipeline GPU" };

  return {
    estadoActual: {
      resumenEjecutivo:  (pr.executive_summary as string) ?? "Análisis completado · pipeline GPU + MediaPipe.",
      nivelActual:       (pr.tier_label as string) ?? (result.vsi?.tierLabel as string) ?? "talent",
      fortalezasPrimarias: strengths.map((s) => s.title),
      areasDesarrollo:   areasRaw.map((a) => a.title),
      dimensiones: {
        velocidadDecision:   defaultDim,
        tecnicaConBalon:     defaultDim,
        inteligenciaTactica: defaultDim,
        capacidadFisica:     defaultDim,
        liderazgoPresencia:  defaultDim,
        eficaciaCompetitiva: defaultDim,
      },
      ajusteVSIVideoScore: Math.round(vsiScore - 50),
    },
    adnFutbolistico: {
      estiloJuego:      (dna.playing_style as string) ?? (dna.estiloJuego as string) ?? "Perfil táctico calculado por IA",
      arquetipoTactico: (dna.archetype as string) ?? (dna.arquetipoTactico as string) ?? "DNA Análisis",
      patrones:         [],
      mentalidad:       (dna.mentality as string) ?? (dna.mentalidad as string) ?? "Determinado y competitivo",
    },
    jugadorReferencia: {
      bestMatch: (bm.nombre as string) ? {
        nombre:   bm.nombre as string,
        posicion: (bm.posicion as string) ?? "",
        club:     (bm.club as string) ?? "",
        score:    (bm.score as number) ?? 70,
        narrativa:(bm.narrativa as string) ?? "",
      } : null as never,
    },
    proyeccionCarrera: {
      escenarioOptimista: {
        descripcion:   ((pj.optimistic as Record<string,unknown>)?.description as string) ?? (pj.escenarioOptimista as Record<string,unknown>)?.descripcion as string ?? "Progresión favorable según análisis biomecánico",
        nivelProyecto: ((pj.optimistic as Record<string,unknown>)?.level as string) ?? (pj.escenarioOptimista as Record<string,unknown>)?.nivelProyecto as string ?? "Semi-pro",
      },
      escenarioRealista: {
        descripcion:   ((pj.realistic as Record<string,unknown>)?.description as string) ?? (pj.escenarioRealista as Record<string,unknown>)?.descripcion as string ?? "Desarrollo consistente con dedicación sostenida",
        nivelProyecto: ((pj.realistic as Record<string,unknown>)?.level as string) ?? (pj.escenarioRealista as Record<string,unknown>)?.nivelProyecto as string ?? "Amateur alto",
      },
      factoresClave: (pj.key_factors as string[]) ?? (pj.factoresClave as string[]) ?? [],
      riesgos:       (pj.risks as string[]) ?? (pj.riesgos as string[]) ?? [],
    },
    planDesarrollo: {
      objetivo6meses:  (dp.goal_6months as string) ?? (dp.objetivo6meses as string) ?? "Consolidar fundamentos técnicos",
      objetivo18meses: (dp.goal_18months as string) ?? (dp.objetivo18meses as string) ?? "Transición a nivel competitivo superior",
      pilaresTrabajo:  (dp.pillars as Array<{ pilar: string; acciones: string[]; prioridad: string }>) ?? (dp.pilaresTrabajo as Array<{ pilar: string; acciones: string[]; prioridad: string }>) ?? [],
    },
    confianza: Math.min(1, Math.max(0.3, vsiScore / 100)),
  };
}

const VitasLab = () => {
  const { t } = useTranslation();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { canRunAnalysis, analysesUsed, limits } = usePlan();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showHistorial, setShowHistorial]       = useState(false);

  const [selectedMode, setSelectedMode]         = useState("all");
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentTime, setCurrentTime]           = useState(0);
  const totalTime = 5400;
  const [showUploadPanel, setShowUploadPanel]   = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedVideoId, setSelectedVideoId]   = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [playedPosition, setPlayedPosition] = useState<string>("");
  const v2 = usePlayerAnalysisV2();
  const analysisReport = v2.isCompleted ? mapV2ToReport(v2.result) : null;

  // ── Fatigue Detection ──
  const selectedPlayerObj = undefined as { phvOffset?: number } | undefined; // resolved below after players load
  const fatigue = useFatigue({
    playerId: selectedPlayerId ?? "",
    phvOffset: null, // Will be populated from player data when available
  });

  // ── One-Click Analysis Orchestrator ──
  const oneClick = useOneClickAnalysis({
    onCalibrationComplete: (result) => {
      // Map auto-calibration corners to calibration points
      if (result.corners.length >= 4) {
        setPoints(result.corners.slice(0, 4).map((c, i) => ({
          id: i + 1,
          x: c.x,
          y: c.y,
          label: `P${i + 1}`,
        })));
        toast.success(
          result.autoDetected
            ? `Auto-calibración exitosa (${Math.round(result.confidence * 100)}%)`
            : "Calibración por heurística aplicada",
          { duration: 3000 },
        );
      }
    },
    onStartTracking: (videoEl) => {
      setShowTracking(true);
      mediaPipe.reset();
      eventEngineRef.current.reset();
      setEventSummary(null);
      setTacticalEvents([]);
      videoEl.crossOrigin = "anonymous";
      trackingVideoRef.current = videoEl;
      tracking.startTracking(videoEl).then(() => {
        oneClick.advanceStep("tracking");
      }).catch((err) => {
        oneClick.markError("Error iniciando tracking: " + err.message);
      });
    },
    onError: (error) => {
      toast.error("Error en análisis 1-Click", { description: error });
    },
    onComplete: () => {
      toast.success("Análisis 1-Click completado");
    },
  });

  // Historial: análisis completados previos del jugador (tabla analyses)
  const { data: savedAnalyses = [] } = useQuery<Array<{ id: string; created_at: string; vsi: Record<string, unknown> | null }>>({
    queryKey: ["saved-analyses-v2", selectedPlayerId],
    queryFn: async () => {
      if (!selectedPlayerId || !SUPABASE_CONFIGURED) return [];
      const { data } = await supabase
        .from("analyses")
        .select("id, created_at, vsi")
        .eq("player_id", selectedPlayerId)
        .eq("status", "completed")
        .order("created_at", { ascending: false })
        .limit(10);
      return data ?? [];
    },
    enabled: !!selectedPlayerId && SUPABASE_CONFIGURED,
  });
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [jerseyNumber, setJerseyNumber]         = useState<string>("");
  const [teamColor, setTeamColor]               = useState<string>("");
  const [showTracking, setShowTracking]         = useState(false);
  const [showVoronoi, setShowVoronoi]           = useState(false);
  // Configuración por modo de análisis
  const [homeTeamColor, setHomeTeamColor]       = useState<string>("");
  const [awayTeamColor, setAwayTeamColor]       = useState<string>("");
  const [analysisFocus, setAnalysisFocus]       = useState<string[]>([]);
  const [homeFormation, setHomeFormation]       = useState<string>("4-3-3");
  const [awayFormation, setAwayFormation]       = useState<string>("4-4-2");
  const [playerName, setPlayerName]             = useState<string>("");
  const [playerPosition, setPlayerPosition]     = useState<string>("");
  const trackingVideoRef = useRef<HTMLVideoElement | null>(null);
  const labVideoRef = useRef<HTMLVideoElement | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [actionLog, setActionLog] = useState<Array<{ time: number; text: string; type: "positive" | "negative" | "neutral" }>>([]);

  // ── MediaPipe Pose (biomechanics real) ──
  const mediaPipe = useMediaPipePose({
    targetFps: 8,
    modelComplexity: 1,
    offlineMode: false,
    onFrame: (poses, frameIndex) => {
      // Feed pose data to fatigue posture detector
      if (poses.length > 0 && poses[0]) {
        const timestampMs = (labVideoRef.current?.currentTime ?? 0) * 1000;
        fatigue.addPoseFrame(poses[0], timestampMs);
      }
      if (poses.length > 0 && frameIndex % 30 === 0) {
        setActionLog(prev => [...prev.slice(-10), {
          time: Math.floor((labVideoRef.current?.currentTime ?? 0)),
          text: `MediaPipe: ${poses.length} poses · ${poses[0]?.jointAngles?.trunkLean?.toFixed(1) ?? "?"}° trunk`,
          type: "neutral" as const,
        }]);
      }
    },
    onComplete: (bio) => {
      toast.success("Biomecánica completada", {
        description: `DrillScore: ${bio.drillScore}/100 · Simetría: ${bio.bilateralSymmetry}% · ${bio.framesAnalyzed} frames`,
        duration: 6000,
      });
    },
  });

  // ── Event Detection Engine ──
  const eventEngineRef = useRef(new EventDetectionEngine({ trackingFps: 8 }));
  const [eventSummary, setEventSummary] = useState<EventSummary | null>(null);
  const [tacticalEvents, setTacticalEvents] = useState<TacticalEvent[]>([]);

  // ── Auto-calibration via field line detection ──
  const [autoCalibResult, setAutoCalibResult] = useState<FieldDetectionResult | null>(null);
  const [autoCalibRunning, setAutoCalibRunning] = useState(false);

  const runAutoCalibration = useCallback(async () => {
    const video = labVideoRef.current;
    if (!video || video.readyState < 2) return;
    setAutoCalibRunning(true);
    try {
      // Capture a frame from the video
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(video, 0, 0);
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);

      const result = await detectFieldLines(imageData);
      setAutoCalibResult(result);

      if (result.autoCalibrationReady && result.corners.length >= 4) {
        // Map detected corners to % coordinates for the calibration overlay
        const vw = video.videoWidth;
        const vh = video.videoHeight;
        const newPoints = result.corners.slice(0, 4).map((corner, i) => ({
          id: i + 1,
          x: (corner[0] / vw) * 100,
          y: (corner[1] / vh) * 100,
          label: `P${i + 1}`,
        }));
        setPoints(newPoints);
        toast.success("Auto-calibración exitosa", {
          description: `${result.lines.length} líneas detectadas · Confianza ${Math.round(result.confidence * 100)}%`,
          duration: 5000,
        });
      } else {
        toast.info("Auto-calibración parcial", {
          description: `Confianza ${Math.round(result.confidence * 100)}% (necesita ≥60%). Ajusta manualmente.`,
          duration: 4000,
        });
      }
    } catch (err) {
      toast.error("Error en auto-detección de líneas");
      console.error("[FieldLineDetector]", err);
    } finally {
      setAutoCalibRunning(false);
    }
  }, []);

  // points DEBE declararse ANTES de useTracking (que lo usa en calibrationPoints)
  const [points, setPoints] = useState<CalibrationPoint[]>([
    { id: 1, x: 28, y: 62, label: "P1" },
    { id: 2, x: 72, y: 62, label: "P2" },
    { id: 3, x: 80, y: 92, label: "P3" },
    { id: 4, x: 20, y: 92, label: "P4" },
  ]);

  // Videos y players DEBEN declararse ANTES de useTracking para poder pasar localVideoSrc
  const { data: videos = [] } = useVideos();
  const { data: players = [] } = useAllPlayers();

  // Detectar video local para pasarlo al tracking
  const trackingVideo = videos.find(v => v.id === selectedVideoId);
  const localVideoSrc = trackingVideo?.localPath && !trackingVideo.localPath.startsWith("http")
    ? trackingVideo.localPath
    : trackingVideo?.streamUrl && !trackingVideo.streamUrl.startsWith("http")
      ? trackingVideo.streamUrl
      : undefined;

  // Extract CDN hostname from the video's streamUrl when available
  const trackingCdnHostname = (() => {
    const envHost = import.meta.env.VITE_BUNNY_CDN_HOSTNAME;
    if (envHost) return envHost;
    if (trackingVideo?.streamUrl) {
      try { return new URL(trackingVideo.streamUrl).hostname; } catch { /* fallback */ }
    }
    return undefined;
  })();

  const tracking = useTracking({
    videoId:           selectedVideoId ?? "",
    playerId:          selectedPlayerId ?? "",
    calibrationPoints: points.map(p => ({ x: p.x, y: p.y })),
    anchorPreset:      "full_corners",
    cdnHostname:       trackingCdnHostname,
    localVideoSrc,
  });

  // ── Auto-start MediaPipe cuando tracking empieza ──
  useEffect(() => {
    if (tracking.state.status === "tracking" && mediaPipe.status === "idle" && labVideoRef.current) {
      mediaPipe.start(labVideoRef.current).catch(err => {
        console.warn("[MediaPipe] Auto-start failed:", err.message);
      });
    }
    if (tracking.state.status === "complete" && mediaPipe.status === "processing") {
      mediaPipe.stop();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.state.status]);

  // ── Feed YOLO tracks into Event Detection Engine each frame ──
  useEffect(() => {
    if (tracking.state.status !== "tracking") return;
    const tracks = tracking.state.currentTracks;
    if (tracks.length === 0) return;

    const videoEl = labVideoRef.current;
    const timestampMs = videoEl ? videoEl.currentTime * 1000 : Date.now();
    const frameIndex = Math.round(timestampMs / 125);

    eventEngineRef.current.processFrame(
      tracks,
      timestampMs,
      frameIndex,
      tracking.state.focusTrackId,
      tracking.state.ballTrack ?? null,
    );

    // Update summary periodically (every 30 frames ≈ 3.75s)
    if (frameIndex % 30 === 0) {
      setEventSummary(eventEngineRef.current.summarize(tracking.state.focusTrackId ?? undefined));
      setTacticalEvents(eventEngineRef.current.getEvents());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.state.currentTracks]);

  // Auto-guardar snapshot cuando tracking termina · disponible en perfil + role
  useEffect(() => {
    if (tracking.state.status !== "complete" || !selectedPlayerId) return;
    if (!tracking.state.sessionMetrics) return;
    const focusTrack = tracking.state.focusTrackId
      ? tracking.state.currentTracks.find(t => t.id === tracking.state.focusTrackId)
      : null;
    // Final event summary
    const finalEventSummary = eventEngineRef.current.summarize(tracking.state.focusTrackId ?? undefined);
    setEventSummary(finalEventSummary);
    setTacticalEvents(eventEngineRef.current.getEvents());

    // Collect tactical events for the focused player (VAEP input)
    const focusEvents = tracking.state.focusTrackId
      ? eventEngineRef.current.getPlayerEvents(tracking.state.focusTrackId)
      : eventEngineRef.current.getEvents();

    PlayerTrackingService.save({
      playerId:       selectedPlayerId,
      videoId:        selectedVideoId ?? null,
      savedAt:        new Date().toISOString(),
      durationSec:    tracking.state.sessionMetrics.distanceCoveredM > 0
                        ? tracking.state.sessionMetrics.distanceCoveredM / Math.max(0.1, tracking.state.sessionMetrics.avgSpeedMs)
                        : 0,
      sessionMetrics: tracking.state.sessionMetrics,
      scanCount:      tracking.state.scanEvents.length,
      duelCount:      tracking.state.duelEvents.length,
      tracksCount:    tracking.state.currentTracks.length,
      focusTrackId:   tracking.state.focusTrackId,
      scanEvents:     tracking.state.scanEvents,
      duelEvents:     tracking.state.duelEvents,
      focusPositions: focusTrack?.positions.map(p => ({ fx: p.fx, fy: p.fy, tMs: p.tMs })),
      tacticalEvents:     focusEvents,
      biomechanicsScore:  mediaPipe.biomechanics ?? undefined,
    });

    // ── Generate fatigue report from tracking positions ──
    if (focusTrack && focusTrack.positions.length > 0) {
      const durationSec = tracking.state.sessionMetrics.distanceCoveredM > 0
        ? tracking.state.sessionMetrics.distanceCoveredM / Math.max(0.1, tracking.state.sessionMetrics.avgSpeedMs)
        : 0;
      fatigue.addPositions(
        focusTrack.positions.map(p => ({ x: p.fx, y: p.fy, timestampMs: p.tMs })),
      );
      if (durationSec > 0) {
        fatigue.generateReport(durationSec);
      }
    }

    const bioMsg = mediaPipe.biomechanics
      ? ` · DrillScore ${mediaPipe.biomechanics.drillScore}`
      : "";
    const evtMsg = finalEventSummary
      ? ` · ${finalEventSummary.totalEvents} eventos`
      : "";
    toast.success(`📊 Snapshot guardado${bioMsg}${evtMsg}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.state.status, selectedPlayerId, selectedVideoId]);

  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

  const formatTime = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const drawOverlay = useCallback(() => {
    const canvas    = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container) return;

    const rect = container.getBoundingClientRect();
    canvas.width  = rect.width;
    canvas.height = rect.height;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // ── Draw YOLO tracks (bounding boxes + keypoints) ──
    const tracks = tracking.state.currentTracks;
    const videoEl = trackingVideoRef.current;
    if (tracks.length > 0 && videoEl && videoEl.videoWidth > 0) {
      const scaleX = canvas.width  / videoEl.videoWidth;
      const scaleY = canvas.height / videoEl.videoHeight;

      for (const track of tracks) {
        const isFocused = track.id === tracking.state.focusTrackId;
        const color = isFocused ? "hsl(45, 100%, 60%)" : "hsl(120, 80%, 55%)";

        // Bounding box
        const [bx, by, bw, bh] = track.bbox;
        ctx.strokeStyle = color;
        ctx.lineWidth   = isFocused ? 3 : 2;
        ctx.setLineDash([]);
        ctx.strokeRect(bx * scaleX, by * scaleY, bw * scaleX, bh * scaleY);

        // Track ID label
        ctx.fillStyle = color;
        ctx.font      = "bold 12px Rajdhani";
        ctx.fillText(`#${track.id}`, bx * scaleX + 2, by * scaleY - 4);

        // Speed label
        if (track.smoothSpeedMs > 0.5) {
          const speedKmh = (track.smoothSpeedMs * 3.6).toFixed(1);
          ctx.font = "10px Rajdhani";
          ctx.fillText(`${speedKmh} km/h`, bx * scaleX + 2, (by + bh) * scaleY + 12);
        }

        // Keypoints skeleton (COCO-17 pairs)
        if (track.keypoints && track.keypoints.length === 17) {
          const kps = track.keypoints;
          const pairs = [[5,6],[5,7],[7,9],[6,8],[8,10],[5,11],[6,12],[11,12],[11,13],[13,15],[12,14],[14,16]];
          ctx.strokeStyle = isFocused ? "hsla(45, 100%, 60%, 0.6)" : "hsla(120, 80%, 55%, 0.5)";
          ctx.lineWidth   = 1.5;
          for (const [a, b] of pairs) {
            if (kps[a].confidence > 0.3 && kps[b].confidence > 0.3) {
              ctx.beginPath();
              ctx.moveTo(kps[a].x * scaleX, kps[a].y * scaleY);
              ctx.lineTo(kps[b].x * scaleX, kps[b].y * scaleY);
              ctx.stroke();
            }
          }
          // Keypoint dots
          for (const kp of kps) {
            if (kp.confidence > 0.3) {
              ctx.fillStyle = color;
              ctx.beginPath();
              ctx.arc(kp.x * scaleX, kp.y * scaleY, 2.5, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
    }

    // ── Draw calibration grid ──
    if (points.length < 2) return;

    ctx.strokeStyle = "hsl(180, 100%, 60%)";
    ctx.lineWidth   = 2;
    ctx.setLineDash([]);
    ctx.beginPath();
    const orderedPts = [...points].sort((a, b) => a.id - b.id);
    orderedPts.forEach((pt, i) => {
      const px = (pt.x / 100) * canvas.width;
      const py = (pt.y / 100) * canvas.height;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    });
    ctx.closePath();
    ctx.stroke();

    ctx.fillStyle = "hsla(180, 100%, 60%, 0.06)";
    ctx.fill();

    points.forEach((pt) => {
      const px = (pt.x / 100) * canvas.width;
      const py = (pt.y / 100) * canvas.height;
      ctx.shadowColor = "hsl(0, 80%, 55%)";
      ctx.shadowBlur  = 10;
      ctx.fillStyle   = "hsl(0, 80%, 55%)";
      ctx.beginPath();
      ctx.arc(px, py, 6, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle  = "hsl(180, 100%, 70%)";
      ctx.font       = "11px Rajdhani";
      const coordLabel = `${pt.label}: ${Math.round((pt.x / 100) * 1050)}, ${Math.round((pt.y / 100) * 680)}`;
      ctx.fillText(coordLabel, px - 30, py - 12);
    });
  }, [points, tracking.state.currentTracks, tracking.state.focusTrackId]);

  useEffect(() => {
    drawOverlay();
    window.addEventListener("resize", drawOverlay);
    return () => window.removeEventListener("resize", drawOverlay);
  }, [drawOverlay]);

  // Redraw overlay continuously during tracking (requestAnimationFrame loop)
  useEffect(() => {
    if (tracking.state.status !== "tracking") return;
    let raf: number;
    const loop = () => { drawOverlay(); raf = requestAnimationFrame(loop); };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [tracking.state.status, drawOverlay]);

  const handleCanvasMouseDown = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = ((e.clientX - rect.left) / rect.width) * 100;
    const my = ((e.clientY - rect.top) / rect.height) * 100;
    const closest = points.find((pt) => {
      const dx = pt.x - mx;
      const dy = pt.y - my;
      return Math.sqrt(dx * dx + dy * dy) < 4;
    });
    if (closest) setDraggingPoint(closest.id);
  };

  const handleCanvasMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (draggingPoint === null) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
    const my = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));
    setPoints((prev) =>
      prev.map((pt) => (pt.id === draggingPoint ? { ...pt, x: mx, y: my } : pt))
    );
  };

  const handleCanvasMouseUp = () => setDraggingPoint(null);

  const handleStartAnalysis = async () => {
    if (!canRunAnalysis) {
      const limitLabel = limits.analyses >= 9999 ? "∞" : limits.analyses;
      toast.error(t("lab.analysisLimitReached", { used: analysesUsed, limit: limitLabel }), {
        action: { label: t("lab.upgradePlan"), onClick: () => navigate("/billing") },
        duration: 5000,
      });
      return;
    }
    if (!selectedVideoId) {
      toast.info(t("lab.selectVideoFirst"), { description: t("lab.selectVideoDesc"), duration: 4000 });
      return;
    }
    if (!selectedPlayerId) {
      toast.info(t("lab.selectPlayerFirst"), { description: t("lab.selectPlayerDesc"), duration: 4000 });
      return;
    }

    const video = videos.find((v) => v.id === selectedVideoId);
    if (!video) { toast.error("Video no encontrado"); return; }

    // Extraer bunnyVideoId desde embedUrl: https://iframe.mediadelivery.net/embed/{libId}/{guid}
    const bunnyVideoId = video.embedUrl?.split("/").pop() ?? selectedVideoId;

    setActionLog([]);
    v2.reset();
    const toastId = toast.loading("Iniciando análisis GPU (MediaPipe + Claude)...");

    try {
      const selectedPlayer = players?.find((p) => p.id === selectedPlayerId);
      const finalPlayedPosition = playedPosition || selectedPlayer?.position || undefined;

      // ── Prefer client-side data path when MediaPipe/tracking data exists ──
      const hasClientData = mediaPipe.biomechanics || tracking.state.sessionMetrics || eventSummary;
      if (hasClientData) {
        // Build physical metrics from YOLO tracking
        const physicalMetrics: Record<string, unknown> = {};
        if (tracking.state.sessionMetrics) {
          const sm = tracking.state.sessionMetrics;
          physicalMetrics.maxSpeedMs = sm.maxSpeedMs;
          physicalMetrics.avgSpeedMs = sm.avgSpeedMs;
          physicalMetrics.distanceCoveredM = sm.distanceCoveredM;
          physicalMetrics.sprintCount = sm.sprintCount;
          physicalMetrics.scanCount = tracking.state.scanEvents.length;
          physicalMetrics.duelCount = tracking.state.duelEvents.length;
          physicalMetrics.tracksDetected = tracking.state.currentTracks.length;
        }

        await v2.analyzeWithClientData({
          videoId: selectedVideoId,
          playerId: selectedPlayerId,
          playedPosition: finalPlayedPosition,
          biomechanics: mediaPipe.biomechanics ? {
            drillScore: mediaPipe.biomechanics.drillScore,
            bilateralSymmetry: mediaPipe.biomechanics.bilateralSymmetry,
            injuryRiskFlags: mediaPipe.biomechanics.injuryRiskFlags,
            jointAngles: mediaPipe.biomechanics.avgJointAngles,
            framesAnalyzed: mediaPipe.biomechanics.framesAnalyzed,
            source: "client_mediapipe",
          } : null,
          physicalMetrics: Object.keys(physicalMetrics).length > 0 ? physicalMetrics : null,
          eventSummary: eventSummary ? {
            totalEvents: eventSummary.totalEvents,
            passCompletionPct: eventSummary.passCompletionPct,
            passesAttempted: eventSummary.passesAttempted,
            passesCompleted: eventSummary.passesCompleted,
            duelsWon: eventSummary.duelsWon,
            duelsLost: eventSummary.duelsLost,
            recoveries: eventSummary.recoveries,
            sprintBursts: eventSummary.sprintBursts,
            shots: eventSummary.shots,
            xgContributions: eventSummary.xgContributions,
            vaepApprox: eventSummary.vaepApprox,
            source: "client_event_engine",
          } : null,
        });
      } else {
        // Fallback: standard pipeline via Bunny → Modal → Claude
        await v2.analyzeExistingVideo({
          videoId: selectedVideoId,
          bunnyVideoId,
          playerId: selectedPlayerId,
          playedPosition: finalPlayedPosition,
        });
      }

      SubscriptionService.incrementAnalysisCount();
      toast.dismiss(toastId);
      toast.success(t("lab.analysisComplete"), {
        description: hasClientData
          ? "Client-side pipeline completado · biomecánica + eventos + reportes IA"
          : "Pipeline GPU completado · 6 reportes generados",
        duration: 5000,
      });
      setShowResultsPanel(true);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(t("lab.analysisError"), {
        description: err instanceof Error ? err.message : "Error desconocido",
      });
    }
  };

  // Presets de perspectiva comunes para calibración rápida
  const CALIBRATION_PRESETS: Record<string, { label: string; points: CalibrationPoint[] }> = {
    lateral: {
      label: "Vista Lateral",
      points: [
        { id: 1, x: 15, y: 55, label: "P1" },
        { id: 2, x: 85, y: 55, label: "P2" },
        { id: 3, x: 92, y: 90, label: "P3" },
        { id: 4, x: 8, y: 90, label: "P4" },
      ],
    },
    aerial: {
      label: "Vista Aérea",
      points: [
        { id: 1, x: 10, y: 10, label: "P1" },
        { id: 2, x: 90, y: 10, label: "P2" },
        { id: 3, x: 90, y: 90, label: "P3" },
        { id: 4, x: 10, y: 90, label: "P4" },
      ],
    },
    tribuna: {
      label: "Vista Tribuna",
      points: [
        { id: 1, x: 20, y: 45, label: "P1" },
        { id: 2, x: 80, y: 45, label: "P2" },
        { id: 3, x: 88, y: 85, label: "P3" },
        { id: 4, x: 12, y: 85, label: "P4" },
      ],
    },
  };

  const [showCalibPresets, setShowCalibPresets] = useState(false);

  const handleAutoDetect = () => {
    // If video is loaded, try auto field line detection first
    if (labVideoRef.current && labVideoRef.current.readyState >= 2) {
      runAutoCalibration();
    } else {
      setShowCalibPresets(v => !v);
    }
  };

  const resetPoints = () => {
    setPoints([
      { id: 1, x: 28, y: 62, label: "P1" },
      { id: 2, x: 72, y: 62, label: "P2" },
      { id: 3, x: 80, y: 92, label: "P3" },
      { id: 4, x: 20, y: 92, label: "P4" },
    ]);
  };

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const selectedVideo  = videos.find((v) => v.id === selectedVideoId);
  const labVideoUrl    = selectedVideo ? getBestVideoUrl(selectedVideo) : null;

  // Sync play/pause with real video element
  useEffect(() => {
    const vid = labVideoRef.current;
    if (!vid) {
      // Fallback: timer-based when no video element
      if (!isPlaying) return;
      const interval = setInterval(() => {
        setCurrentTime((t) => (t >= (videoDuration || totalTime) ? 0 : t + 1));
      }, 1000);
      return () => clearInterval(interval);
    }
    if (isPlaying) {
      vid.play().catch(() => {});
    } else {
      vid.pause();
    }
  }, [isPlaying, videoDuration]);

  // Update currentTime from video timeupdate events
  useEffect(() => {
    const vid = labVideoRef.current;
    if (!vid) return;
    const onTimeUpdate = () => setCurrentTime(Math.floor(vid.currentTime));
    const onLoadedMeta = () => {
      setVideoDuration(Math.floor(vid.duration));
      setCurrentTime(0);
    };
    const onEnded = () => setIsPlaying(false);
    vid.addEventListener("timeupdate", onTimeUpdate);
    vid.addEventListener("loadedmetadata", onLoadedMeta);
    vid.addEventListener("ended", onEnded);
    return () => {
      vid.removeEventListener("timeupdate", onTimeUpdate);
      vid.removeEventListener("loadedmetadata", onLoadedMeta);
      vid.removeEventListener("ended", onEnded);
    };
  }, [labVideoUrl]);

  const effectiveDuration = videoDuration || totalTime;
  const progressPercent = (currentTime / effectiveDuration) * 100;

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  // Dimension labels
  const dimLabels: Record<string, string> = {
    velocidadDecision:   t("lab.dimensions.velocidadDecision"),
    tecnicaConBalon:     t("lab.dimensions.tecnicaConBalon"),
    inteligenciaTactica: t("lab.dimensions.inteligenciaTactica"),
    capacidadFisica:     t("lab.dimensions.capacidadFisica"),
    liderazgoPresencia:  t("lab.dimensions.liderazgoPresencia"),
    eficaciaCompetitiva: t("lab.dimensions.eficaciaCompetitiva"),
  };

  return (
    <motion.div variants={container} initial="hidden" animate="show" className="min-h-screen flex flex-col">

      {/* Top Nav */}
      <motion.div variants={item} className="glass-strong px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button onClick={() => navigate(-1)} className="text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft size={18} />
          </button>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center">
              <Camera size={16} className="text-primary" />
            </div>
            <span className="font-display font-bold text-foreground text-lg">
              VITAS<span className="text-muted-foreground">.LAB</span>
            </span>
          </div>
          <nav className="hidden md:flex items-center gap-6 ml-6">
            {[
              { label: "PANEL",    action: () => navigate("/")         },
              { label: "NUEVO ANÁLISIS", action: () => setShowUploadPanel(true) },
              { label: "ARCHIVO",      action: () => navigate("/reports")  },
              { label: "MODELOS",       action: () => toast.info(t("lab.modelsComingSoon"), { description: t("lab.modelsComingSoonDesc") }) },
            ].map(({ label, action }, i) => (
              <button key={label} onClick={action} className={`text-xs font-display font-semibold tracking-wider transition-colors ${i === 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {label}
              </button>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right hidden sm:block">
            <span className="text-[10px] font-display text-primary uppercase tracking-wider">
              ESTADO_SISTEMA: <span className="text-primary">{v2.isProcessing ? "ANALIZANDO" : "ACTIVO"}</span>
            </span>
            <br />
            <span className="text-[10px] font-display text-muted-foreground tracking-wider">
              {selectedVideo ? `VIDEO: ${selectedVideo.title.slice(0, 20)}` : "Sin video seleccionado"}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <UserRound size={14} className="text-muted-foreground" />
          </div>
        </div>
      </motion.div>

      {/* ── Degradation Banners: warn when features are unavailable ── */}
      {!SUPABASE_CONFIGURED && (
        <div className="px-4 py-1.5 bg-yellow-500/10 border-b border-yellow-500/30 flex items-center gap-2">
          <AlertTriangle size={14} className="text-yellow-500 shrink-0" />
          <span className="text-[11px] font-display text-yellow-500">
            Supabase no configurado — análisis IA y persistencia deshabilitados. Tracking + biomecánica client-side disponible.
          </span>
        </div>
      )}
      {SUPABASE_CONFIGURED && !import.meta.env.VITE_BUNNY_CDN_HOSTNAME && videos.length === 0 && (
        <div className="px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/30 flex items-center gap-2">
          <Activity size={14} className="text-blue-400 shrink-0" />
          <span className="text-[11px] font-display text-blue-400">
            Bunny CDN no configurado — sube videos locales o configura VITE_BUNNY_CDN_HOSTNAME para streaming.
          </span>
        </div>
      )}

      {/* Main Content */}
      <div className="flex-1 flex">

        {/* Left Stepper */}
        <motion.div variants={item} className="hidden md:flex flex-col items-center py-8 px-4 gap-2 border-r border-border">
          {steps.map((step, i) => (
            <div key={step.id} className="flex flex-col items-center">
              <div className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-display font-bold border-2 ${step.done ? "border-primary bg-primary/10 text-primary" : step.active ? "border-primary text-primary" : "border-border text-muted-foreground"}`}>
                {step.done ? <CheckCircle2 size={18} /> : step.id}
              </div>
              <span className={`text-[9px] font-display font-semibold uppercase tracking-widest mt-1 ${step.done || step.active ? "text-primary" : "text-muted-foreground"}`}>
                {step.label}
              </span>
              {i < steps.length - 1 && (
                <div className={`w-0.5 h-10 my-1 ${step.done ? "bg-primary" : "bg-border"}`} />
              )}
            </div>
          ))}
        </motion.div>

        {/* Center - Pitch + Video */}
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
            {/* Calibration Status */}
            <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${v2.isProcessing ? "bg-yellow-400" : labVideoUrl ? "bg-green-400" : "bg-destructive"} animate-pulse`} />
              <span className="text-[11px] font-display font-semibold text-foreground tracking-wider">
                {v2.isProcessing
                  ? `ANALIZANDO… ${v2.state.message || "GPU PIPELINE"}`
                  : labVideoUrl
                  ? `VIDEO CARGADO · ${points.length} PUNTOS DE CALIBRACIÓN · ${formatTime(videoDuration)}`
                  : `CALIBRACI\u00d3N ACTIVA: ${points.length} DE 4 PUNTOS ASIGNADOS`}
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

        {/* Right Sidebar — 1-Click Mode */}
        <motion.div variants={item} className="hidden lg:flex flex-col w-72 border-l border-border p-5 overflow-y-auto max-h-screen">
          <VitasLabOneClick
            players={players.map(p => ({ id: p.id, name: p.name, position: p.position, vsi: p.vsi, age: p.age }))}
            videos={videos.map(v => ({ id: v.id, title: v.title }))}
            selectedPlayerId={selectedPlayerId}
            selectedVideoId={selectedVideoId}
            oneClickState={oneClick.state}
            isTracking={tracking.state.status === "tracking" || tracking.state.status === "loading-model"}
            isIAProcessing={v2.isProcessing}
            isIAComplete={v2.isCompleted}
            onSelectPlayer={(id) => {
              setSelectedPlayerId(id);
              const p = players.find(pl => pl.id === id);
              if (p?.name) setPlayerName(p.name);
              if (p?.position) setPlayerPosition(p.position);
            }}
            onSelectVideo={(id) => setSelectedVideoId(id)}
            onStartAnalysis={() => {
              if (!selectedVideoId || !selectedPlayerId || !labVideoRef.current) {
                toast.error("Selecciona jugador y video primero");
                return;
              }
              if (!canRunAnalysis) {
                const limitLabel = limits.analyses >= 9999 ? "∞" : limits.analyses;
                toast.error(t("lab.analysisLimitReached", { used: analysesUsed, limit: limitLabel }));
                return;
              }
              setActionLog([]);
              oneClick.startOneClick(labVideoRef.current);
            }}
            onStopTracking={() => {
              tracking.stopTracking();
              if (mediaPipe.status === "processing") mediaPipe.stop();
              setEventSummary(eventEngineRef.current.summarize(tracking.state.focusTrackId ?? undefined));
              setTacticalEvents(eventEngineRef.current.getEvents());
              oneClick.advanceStep("analyzing_biomechanics");
              // Auto-trigger IA analysis after tracking stops
              setTimeout(() => {
                oneClick.advanceStep("running_ia_pipeline");
                handleStartAnalysis();
              }, 500);
            }}
            onOpenUploadPanel={() => setShowUploadPanel(true)}
            onViewResults={() => setShowResultsPanel(true)}
          >
            {/* ── Advanced Settings (collapsed by default) ── */}

          {/* Auto-detected player identity (Sprint 4 — Re-ID replaces manual dorsal input) */}
          {(selectedMode === "all" || selectedMode === "team") && (
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("lab.identifyPlayer")}
            </span>
            {tracking.state.identities.size > 0 ? (
              <div className="mt-2 space-y-1.5">
                <div className="flex items-center gap-2">
                  <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
                  <span className="text-[10px] font-display text-green-400 font-semibold">
                    Re-ID activo · {tracking.state.identities.size} jugadores identificados
                  </span>
                </div>
                <div className="flex flex-wrap gap-1">
                  {[...tracking.state.identities.entries()].slice(0, 8).map(([trackId, identity]) => (
                    <span
                      key={trackId}
                      className={`text-[9px] px-1.5 py-0.5 rounded font-display font-semibold ${
                        identity.team === "home" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                        identity.team === "away" ? "bg-red-500/10 text-red-400 border border-red-500/20" :
                        "bg-muted text-muted-foreground border border-border"
                      }`}
                    >
                      {identity.dorsalNumber ? `#${identity.dorsalNumber}` : identity.stableId.replace("pid_", "P")}
                      {identity.team !== "unknown" ? ` (${identity.team})` : ""}
                    </span>
                  ))}
                </div>
                <p className="text-[9px] text-muted-foreground leading-tight">
                  Dorsales y equipos detectados automáticamente · OCR + color histogram
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2 mt-2">
                <div>
                  <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("lab.jerseyNumber")}</label>
                  <input
                    type="text"
                    maxLength={3}
                    value={jerseyNumber}
                    onChange={(e) => setJerseyNumber(e.target.value)}
                    placeholder={t("lab.jerseyPlaceholder")}
                    className="w-full mt-1 px-2 py-2 rounded-lg border border-border bg-secondary/50 text-sm font-display font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
                <div>
                  <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("lab.uniformColor")}</label>
                  <input
                    type="text"
                    value={teamColor}
                    onChange={(e) => setTeamColor(e.target.value)}
                    placeholder={t("lab.uniformPlaceholder")}
                    className="w-full mt-1 px-2 py-2 rounded-lg border border-border bg-secondary/50 text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                  />
                </div>
              </div>
            )}
            {tracking.state.identities.size === 0 && (
              <p className="mt-1.5 text-[9px] text-muted-foreground leading-tight">
                {t("lab.jerseyHint")} · Se detectará automáticamente al iniciar tracking.
              </p>
            )}
          </div>
          )}

          {/* Coordinate Realtime */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("lab.coordinateRealtime")}
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div className="glass rounded-lg p-3">
                <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">FIELD_X</span>
                <p className="font-display font-bold text-xl text-primary">105.00m</p>
              </div>
              <div className="glass rounded-lg p-3">
                <span className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">FIELD_Y</span>
                <p className="font-display font-bold text-xl text-primary">68.00m</p>
              </div>
            </div>
          </div>

          {/* Analysis Mode */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              {t("lab.analysisMode")}
            </span>
            <div className="flex flex-col gap-2 mt-3">
              {analysisModes.map((mode) => {
                const Icon   = mode.icon;
                const active = selectedMode === mode.id;
                return (
                  <button
                    key={mode.id}
                    onClick={() => setSelectedMode(mode.id)}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary/10" : "bg-secondary"}`}>
                      <Icon size={15} className={active ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-xs text-foreground">{mode.label}</h4>
                      <p className="text-[9px] text-muted-foreground leading-tight">{mode.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>

            {/* Panel de configuración según el modo seleccionado */}
            <div className="mt-3 space-y-2">

              {/* ALL PLAYERS — colores de equipos */}
              {selectedMode === "all" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">Configuración equipos</p>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Color equipo local</label>
                    <input value={homeTeamColor} onChange={e => setHomeTeamColor(e.target.value)}
                      placeholder="Ej: Blanco, Azul..." className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Color equipo visitante</label>
                    <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                      placeholder="Ej: Rojo, Granate..." className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                </div>
              )}

              {/* CLICK-TO-TRACK — jugador específico manual */}
              {selectedMode === "click" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">Jugador a seguir</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">Nº Camiseta</label>
                      <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                        placeholder="10" maxLength={3} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display font-bold focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Color uniforme</label>
                      <input value={teamColor} onChange={e => setTeamColor(e.target.value)}
                        placeholder="Rojo" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Nombre del jugador (opcional)</label>
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                      placeholder="Ej: Samu García" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Posición en campo</label>
                    <select value={playerPosition} onChange={e => setPlayerPosition(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                      <option value="">Seleccionar...</option>
                      {["POR","LI","LD","CB","MCD","MC","MCO","EI","ED","DC","SD"].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[9px] text-muted-foreground">El sistema rastreará automáticamente a este jugador durante todo el video.</p>
                </div>
              )}

              {/* FULL TEAM — formaciones de ambos equipos */}
              {selectedMode === "team" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">Contexto táctico</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">Formación local</label>
                      <select value={homeFormation} onChange={e => setHomeFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-1-4-1","3-4-3"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Formación visitante</label>
                      <select value={awayFormation} onChange={e => setAwayFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-1-4-1","3-4-3"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">Color local</label>
                      <input value={homeTeamColor} onChange={e => setHomeTeamColor(e.target.value)}
                        placeholder="Blanco" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Color visitante</label>
                      <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                        placeholder="Rojo" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">Analiza bloques tácticos, presión, líneas defensivas y transiciones de ambos equipos.</p>
                </div>
              )}

              {/* SPECIFIC PLAYER — jugador identificado por dorsal */}
              {selectedMode === "player" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">Perfil del jugador</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">Nº Camiseta *</label>
                      <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                        placeholder="10" maxLength={3} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display font-bold focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Color uniforme *</label>
                      <input value={teamColor} onChange={e => setTeamColor(e.target.value)}
                        placeholder="Granate" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Nombre</label>
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                      placeholder="Nombre del jugador" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">Posición</label>
                    <select value={playerPosition} onChange={e => setPlayerPosition(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                      <option value="">Seleccionar...</option>
                      {["POR","LI","LD","CB","MCD","MC","MCO","EI","ED","DC","SD"].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">Equipo rival (color)</label>
                      <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                        placeholder="Azul" className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">Formación propia</label>
                      <select value={homeFormation} onChange={e => setHomeFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">* Obligatorio para identificar al jugador en el video con precisión.</p>
                </div>
              )}

              {/* Selector de posición jugada en este video · multi-posición */}
              {selectedPlayerId && (() => {
                const selPlayer = players?.find((p) => p.id === selectedPlayerId);
                if (!selPlayer) return null;
                const declared = [selPlayer.position, ...(selPlayer.secondaryPositions ?? [])].filter(Boolean);
                const POSITIONS_FULL = [
                  "Portero", "Defensa Central", "Lateral Derecho", "Lateral Izquierdo",
                  "Pivote", "Mediocentro", "Mediapunta", "Extremo Derecho",
                  "Extremo Izquierdo", "Delantero",
                ];
                return (
                  <div className="space-y-2">
                    <p className="text-[10px] uppercase tracking-wider font-display font-bold text-muted-foreground">
                      Posición jugada en este video
                    </p>
                    <div className="flex flex-wrap gap-1.5">
                      {declared.map((p) => (
                        <button
                          key={`d-${p}`}
                          type="button"
                          onClick={() => setPlayedPosition(p)}
                          className={`px-2.5 py-1 rounded-md text-[11px] font-display border transition-colors ${
                            playedPosition === p
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-secondary text-foreground border-border hover:border-primary/40"
                          }`}
                        >
                          {p === selPlayer.position ? `⭐ ${p}` : p}
                        </button>
                      ))}
                      <select
                        value={!declared.includes(playedPosition) ? playedPosition : ""}
                        onChange={(e) => setPlayedPosition(e.target.value)}
                        className="px-2 py-1 rounded-md text-[11px] font-display bg-secondary border border-border text-foreground"
                      >
                        <option value="">+ Otra posición</option>
                        {POSITIONS_FULL.filter((p) => !declared.includes(p)).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      Default: posición principal (⭐). Selecciona otra si jugó en posición diferente.
                    </p>
                  </div>
                );
              })()}

              {/* Selector de enfoque del análisis */}
              <AnalysisFocusSelector value={analysisFocus} onChange={setAnalysisFocus} />
            </div>
          </div>

          {/* Tracking YOLO en vivo */}
          {showTracking && (
            <div className="border-t border-border pt-3 space-y-3">
              <TrackingMetricsPanel
                status={tracking.state.status}
                tracks={tracking.state.currentTracks}
                focusTrackId={tracking.state.focusTrackId}
                metrics={tracking.state.sessionMetrics}
                scanCount={tracking.state.scanEvents.length}
                duelCount={tracking.state.duelEvents.length}
                onFocusTrack={tracking.setFocusTrackId}
                voronoiRegions={tracking.state.voronoiRegions}
                showVoronoi={showVoronoi}
                onToggleVoronoi={() => setShowVoronoi(v => !v)}
              />

              {/* MediaPipe + Event Detection Status */}
              <div className="glass rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground">MediaPipe Pose</span>
                  <span className={`text-[9px] font-display px-1.5 py-0.5 rounded-full ${
                    mediaPipe.status === "processing" ? "bg-green-500/10 text-green-500 border border-green-500/20" :
                    mediaPipe.status === "loading" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                    mediaPipe.status === "complete" ? "bg-primary/10 text-primary border border-primary/20" :
                    "bg-muted text-muted-foreground border border-border"
                  }`}>
                    {mediaPipe.status === "processing" ? `${mediaPipe.fps} FPS` :
                     mediaPipe.status === "loading" ? "Cargando..." :
                     mediaPipe.status === "complete" ? "Completado" :
                     mediaPipe.status === "error" ? "Error" : "Esperando"}
                  </span>
                </div>
                {mediaPipe.biomechanics && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="text-center">
                      <p className="text-[8px] text-muted-foreground uppercase">DrillScore</p>
                      <p className="text-sm font-display font-black text-primary">{mediaPipe.biomechanics.drillScore}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] text-muted-foreground uppercase">Simetría</p>
                      <p className="text-sm font-display font-black text-green-500">{mediaPipe.biomechanics.bilateralSymmetry}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] text-muted-foreground uppercase">Riesgo</p>
                      <p className={`text-sm font-display font-black ${mediaPipe.biomechanics.injuryRisk > 50 ? "text-red-500" : "text-green-500"}`}>{mediaPipe.biomechanics.injuryRisk}</p>
                    </div>
                  </div>
                )}
                {eventSummary && eventSummary.totalEvents > 0 && (
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1">Eventos Tácticos</p>
                    <div className="flex flex-wrap gap-1.5">
                      {eventSummary.passesAttempted > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                          Pases {eventSummary.passesCompleted}/{eventSummary.passesAttempted}
                        </span>
                      )}
                      {eventSummary.duelsWon + eventSummary.duelsLost > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
                          Duelos {eventSummary.duelsWon}G/{eventSummary.duelsLost}P
                        </span>
                      )}
                      {eventSummary.recoveries > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                          Recup. {eventSummary.recoveries}
                        </span>
                      )}
                      {eventSummary.sprintBursts > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                          Sprints {eventSummary.sprintBursts}
                        </span>
                      )}
                      {eventSummary.shots > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                          Tiros {eventSummary.shots}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {/* Mapa de calor — jugador individual o equipo completo */}
              {(() => {
                if (tracking.state.focusTrackId) {
                  // Modo jugador individual
                  const focusTrack = tracking.state.currentTracks.find(
                    t => t.id === tracking.state.focusTrackId
                  );
                  const positions = focusTrack?.positions ?? [];
                  return positions.length > 0 ? (
                    <PlayerHeatmap
                      positions={positions}
                      title={`Mapa de Calor — Jugador #${tracking.state.focusTrackId}`}
                    />
                  ) : null;
                }
                // Modo equipo: unir posiciones de todos los tracks
                const allPositions = tracking.state.currentTracks.flatMap(t => t.positions);
                return allPositions.length > 0 ? (
                  <PlayerHeatmap
                    positions={allPositions}
                    title={`Mapa de Calor — Equipo (${tracking.state.currentTracks.length} jugadores)`}
                  />
                ) : null;
              })()}
            </div>
          )}

          {/* Export Data — available after tracking completes (in advanced section) */}
          {tracking.state.status === "complete" && tracking.state.sessionMetrics && (
            <div className="flex gap-1.5">
              {(["csv", "json", "html_report"] as ExportFormat[]).map(fmt => (
                <button
                  key={fmt}
                  onClick={() => {
                    const focusTrack = tracking.state.focusTrackId
                      ? tracking.state.currentTracks.find(t => t.id === tracking.state.focusTrackId)
                      : null;
                    const exportData: SessionExportData = {
                      metadata: {
                        sessionId: `session_${Date.now()}`,
                        playerId: selectedPlayerId ?? "unknown",
                        playerName: selectedPlayer?.name ?? "Jugador",
                        videoId: selectedVideoId,
                        date: new Date().toISOString().slice(0, 10),
                        durationSec: tracking.state.sessionMetrics!.distanceCoveredM / Math.max(0.1, tracking.state.sessionMetrics!.avgSpeedMs),
                        trackingFps: 8,
                        fieldDimensions: { lengthM: 105, widthM: 68 },
                      },
                      physicalMetrics: tracking.state.sessionMetrics!,
                      biomechanics: mediaPipe.biomechanics,
                      tracks: tracking.state.currentTracks,
                      focusTrackId: tracking.state.focusTrackId,
                      events: tacticalEvents,
                      eventSummary: eventSummary ?? {
                        totalEvents: 0, byType: {} as Record<string, number>,
                        passCompletionPct: 0, passesAttempted: 0, passesCompleted: 0,
                        duelsWon: 0, duelsLost: 0, recoveries: 0, sprintBursts: 0,
                        pressTriggers: 0, shots: 0, xgContributions: 0, vaepApprox: 0,
                      } as EventSummary,
                      scanEvents: tracking.state.scanEvents,
                      duelEvents: tracking.state.duelEvents,
                      focusPositions: focusTrack?.positions.map(p => ({ fx: p.fx, fy: p.fy, tMs: p.tMs })) ?? [],
                    };
                    const exporter = new AnalyticsExporter(exportData);
                    exporter.download(fmt);
                    toast.success(`Exportado como ${fmt.toUpperCase()}`);
                  }}
                  className="flex-1 py-1.5 rounded-lg border border-border text-[10px] font-display font-semibold text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-colors uppercase"
                >
                  {fmt === "html_report" ? "HTML" : fmt.toUpperCase()}
                </button>
              ))}
            </div>
          )}

          </VitasLabOneClick>
        </motion.div>
      </div>

      {/* ── Upload Panel ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showUploadPanel && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => setShowUploadPanel(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="fixed top-0 right-0 h-full w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
            >
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Video size={16} className="text-primary" />
                  <span className="font-display font-bold text-foreground">Videos VITAS.LAB</span>
                </div>
                <button onClick={() => setShowUploadPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={18} />
                </button>
              </div>
              <div className="flex-1 overflow-y-auto p-5 space-y-6">
                <div>
                  <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-3">Subir nuevo video</p>
                  <VideoUpload onDone={(id) => { setSelectedVideoId(id); toast.success("Video listo para análisis"); }} />
                </div>
                {videos.length > 0 && (
                  <div>
                    <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-3">
                      Videos guardados ({videos.length})
                    </p>
                    <div className="grid grid-cols-2 gap-3">
                      {videos.map((video) => (
                        <div key={video.id}
                          onClick={() => { setSelectedVideoId(video.id); setShowUploadPanel(false); toast.info(`Video seleccionado: ${video.title}`); }}
                          className={`cursor-pointer rounded-xl border-2 transition-all ${selectedVideoId === video.id ? "border-primary" : "border-transparent"}`}
                        >
                          <VideoCard video={video} playerName={video.playerId ? players?.find(p => p.id === video.playerId)?.name : undefined} />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {selectedVideoId && (() => {
                  const vid = videos.find((v) => v.id === selectedVideoId);
                  if (!vid) return null;
                  return (
                    <div>
                      <p className="text-xs font-display font-semibold text-muted-foreground uppercase tracking-wider mb-3">Preview seleccionado</p>
                      <VideoPlayer video={vid} />
                      <button
                        onClick={() => { setShowUploadPanel(false); handleStartAnalysis(); }}
                        className="w-full mt-3 flex items-center justify-center gap-2 px-4 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors"
                      >
                        <Rocket size={14} />
                        Analizar este video
                      </button>
                    </div>
                  );
                })()}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* ── Results Panel ─────────────────────────────────────────────────────── */}
      <AnimatePresence>
        {showResultsPanel && v2.isCompleted && analysisReport && (
          <>
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="fixed inset-0 bg-background/60 backdrop-blur-sm z-40"
              onClick={() => setShowResultsPanel(false)}
            />
            <motion.div
              initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
              transition={{ type: "spring", stiffness: 260, damping: 30 }}
              className="fixed top-0 right-0 h-full w-full max-w-lg bg-card border-l border-border z-50 flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="flex items-center gap-2">
                  <Brain size={16} className="text-primary" />
                  <span className="font-display font-bold text-foreground text-sm">VITAS Report</span>
                  <span className="text-[10px] font-display px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                    {Math.round(analysisReport.confianza * 100)}%
                  </span>
                </div>
                <div className="flex items-center gap-1.5">
                  {/* Historial */}
                  <button
                    onClick={() => setShowHistorial(!showHistorial)}
                    className="flex items-center gap-1 text-[10px] font-display px-2 py-1 rounded-lg bg-muted/50 hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <History size={12} />
                    {t("lab.historial").toUpperCase()}{savedAnalyses.length > 0 ? ` (${savedAnalyses.length})` : ""}
                  </button>
                  {/* Exportar PDF */}
                  <button
                    onClick={() => {
                      const tempId = `temp-${Date.now()}`;
                      sessionStorage.setItem(`vitas-analysis-report-${tempId}`, JSON.stringify({
                        report: analysisReport,
                        playerName: playerName || "Jugador",
                        playerPosition: playerPosition || "Sin posición",
                      }));
                      window.open(`/analysis-report/${tempId}`, "_blank");
                    }}
                    className="flex items-center gap-1 text-[10px] font-display px-2 py-1 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary transition-colors"
                  >
                    <FileDown size={12} />
                    PDF
                  </button>
                  <button onClick={() => setShowResultsPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors ml-1">
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* Dropdown Historial */}
              {showHistorial && savedAnalyses.length > 0 && (
                <div className="border-b border-border bg-muted/30 px-5 py-3 max-h-48 overflow-y-auto">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">Análisis Guardados</p>
                  <div className="space-y-1.5">
                    {savedAnalyses.map((sa) => (
                      <button
                        key={sa.id}
                        onClick={() => {
                          v2.loadAnalysis(sa.id).then(() => setShowHistorial(false));
                        }}
                        className="w-full text-left glass rounded-lg px-3 py-2 hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-display font-semibold text-foreground">
                            VSI {(sa.vsi as Record<string, unknown>)?.vsi ?? "—"}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(sa.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          Análisis completado · cargar resultados…
                        </p>
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Scrollable content */}
              <div className="flex-1 overflow-y-auto p-5 space-y-5">

                {/* Resumen ejecutivo */}
                <div className="glass rounded-xl p-4">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1">Resumen Ejecutivo</p>
                  <p className="text-sm text-foreground leading-relaxed">{analysisReport.estadoActual.resumenEjecutivo}</p>
                  <div className="mt-2 flex items-center gap-2">
                    <span className="text-[10px] font-display px-2 py-0.5 rounded-full bg-primary/10 text-primary border border-primary/20">
                      {analysisReport.estadoActual.nivelActual.replace("_", " ").toUpperCase()}
                    </span>
                    <span className={`text-[10px] font-display px-2 py-0.5 rounded-full ${analysisReport.estadoActual.ajusteVSIVideoScore >= 0 ? "bg-green-500/10 text-green-600 border border-green-500/20" : "bg-red-500/10 text-red-500 border border-red-500/20"}`}>
                      VSI {analysisReport.estadoActual.ajusteVSIVideoScore >= 0 ? "+" : ""}{analysisReport.estadoActual.ajusteVSIVideoScore} pts
                    </span>
                  </div>
                </div>

                {/* Dimensiones */}
                <div>
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">Dimensiones de Análisis</p>
                  <div className="space-y-2">
                    {Object.entries(analysisReport.estadoActual.dimensiones).map(([key, dim]) => (
                      <div key={key} className="glass rounded-lg px-4 py-3">
                        <div className="flex items-center justify-between mb-1">
                          <span className="text-xs font-display font-semibold text-foreground">{dimLabels[key] ?? key}</span>
                          <span className="text-xs font-display font-bold text-primary">{dim.score.toFixed(1)}</span>
                        </div>
                        <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${(dim.score / 10) * 100}%` }}
                            transition={{ duration: 0.8, delay: 0.1 }}
                            className={`h-full rounded-full ${dim.score >= 8 ? "bg-green-500" : dim.score >= 6 ? "bg-primary" : "bg-yellow-500"}`}
                          />
                        </div>
                        <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{dim.observacion}</p>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Métricas Cuantitativas (YOLO tracking) */}
                {analysisReport.metricasCuantitativas?.fisicas && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Activity size={14} className="text-green-500" />
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Métricas Físicas</p>
                      <span className="text-[9px] font-display px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                        YOLO Tracking
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Vel. Máx</p>
                        <p className="text-lg font-display font-black text-yellow-500">{analysisReport.metricasCuantitativas.fisicas.velocidadMaxKmh}</p>
                        <p className="text-[9px] text-muted-foreground">km/h</p>
                      </div>
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Distancia</p>
                        <p className="text-lg font-display font-black text-blue-500">{analysisReport.metricasCuantitativas.fisicas.distanciaM}</p>
                        <p className="text-[9px] text-muted-foreground">metros</p>
                      </div>
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Sprints</p>
                        <p className="text-lg font-display font-black text-orange-500">{analysisReport.metricasCuantitativas.fisicas.sprints}</p>
                        <p className="text-[9px] text-muted-foreground">&gt;21 km/h</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Vel. Prom</p>
                        <p className="text-base font-display font-bold text-foreground">{analysisReport.metricasCuantitativas.fisicas.velocidadPromKmh} <span className="text-[9px] text-muted-foreground">km/h</span></p>
                      </div>
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">Intensidad</p>
                        <div className="flex h-2 rounded-full overflow-hidden gap-px">
                          {(() => {
                            const z = analysisReport.metricasCuantitativas!.fisicas!.zonasIntensidad;
                            const total = z.caminar + z.trotar + z.correr + z.sprint || 1;
                            return <>
                              <div className="bg-slate-400" style={{ width: `${(z.caminar / total) * 100}%` }} />
                              <div className="bg-blue-400"  style={{ width: `${(z.trotar  / total) * 100}%` }} />
                              <div className="bg-orange-400" style={{ width: `${(z.correr / total) * 100}%` }} />
                              <div className="bg-red-400"   style={{ width: `${(z.sprint / total) * 100}%` }} />
                            </>;
                          })()}
                        </div>
                        <div className="flex justify-between mt-1">
                          {[{l:"Cam",c:"bg-slate-400"},{l:"Tro",c:"bg-blue-400"},{l:"Cor",c:"bg-orange-400"},{l:"Spr",c:"bg-red-400"}].map(z => (
                            <div key={z.l} className="flex items-center gap-0.5">
                              <div className={`w-1 h-1 rounded-full ${z.c}`} />
                              <span className="text-[7px] text-muted-foreground">{z.l}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* Heatmap del jugador (si hay posiciones) */}
                {analysisReport.metricasCuantitativas?.heatmapPositions &&
                 analysisReport.metricasCuantitativas.heatmapPositions.length > 0 && (
                  <PlayerHeatmap
                    positions={analysisReport.metricasCuantitativas.heatmapPositions}
                    title="Mapa de Calor — Sesión Analizada"
                  />
                )}

                {/* ── Fatigue Analysis Panel ── */}
                <FatiguePanel report={fatigue.report} />

                {/* Métricas de Eventos (Gemini observation) */}
                {analysisReport.metricasCuantitativas?.eventos && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Target size={14} className="text-blue-500" />
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Eventos del Partido</p>
                      <span className="text-[9px] font-display px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        {analysisReport.metricasCuantitativas.fuente === "yolo+gemini" ? "Tracking + IA" : "Observación IA"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Pases */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Pases</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-lg font-display font-black text-green-500">
                            {analysisReport.metricasCuantitativas.eventos.pasesCompletados}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            / {analysisReport.metricasCuantitativas.eventos.pasesCompletados + analysisReport.metricasCuantitativas.eventos.pasesFallados}
                          </span>
                        </div>
                        <div className="h-1 bg-muted rounded-full mt-1 overflow-hidden">
                          <div className="h-full bg-green-500 rounded-full" style={{ width: `${analysisReport.metricasCuantitativas.eventos.precisionPases}%` }} />
                        </div>
                        <p className="text-[8px] text-muted-foreground mt-0.5">{analysisReport.metricasCuantitativas.eventos.precisionPases}% precisión</p>
                      </div>
                      {/* Duelos */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Duelos</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-lg font-display font-black text-orange-500">
                            {analysisReport.metricasCuantitativas.eventos.duelosGanados}G
                          </span>
                          <span className="text-[9px] text-red-400">
                            / {analysisReport.metricasCuantitativas.eventos.duelosPerdidos}P
                          </span>
                        </div>
                      </div>
                      {/* Recuperaciones */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Recuperaciones</p>
                        <span className="text-lg font-display font-black text-blue-500">
                          {analysisReport.metricasCuantitativas.eventos.recuperaciones}
                        </span>
                      </div>
                      {/* Disparos */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Disparos</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-lg font-display font-black text-purple-500">
                            {analysisReport.metricasCuantitativas.eventos.disparosAlArco}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            al arco / {analysisReport.metricasCuantitativas.eventos.disparosFuera} fuera
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VAEP: disponible en future sprint con datos biomecánicos del pipeline GPU */}

                {/* ADN Futbolístico */}
                <div className="glass rounded-xl p-4">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">ADN Futbolístico</p>
                  <div className="flex flex-wrap gap-2 mb-2">
                    <span className="text-[10px] font-display px-2 py-1 rounded-lg bg-primary/10 text-primary border border-primary/20">
                      {analysisReport.adnFutbolistico.arquetipoTactico}
                    </span>
                  </div>
                  <p className="text-xs text-muted-foreground">{analysisReport.adnFutbolistico.estiloJuego}</p>
                  <p className="text-xs text-foreground mt-1 italic">"{analysisReport.adnFutbolistico.mentalidad}"</p>
                </div>

                {/* Best Match */}
                {analysisReport.jugadorReferencia?.bestMatch && (
                  <div className="glass rounded-xl p-4 border border-primary/20">
                    <div className="flex items-center gap-2 mb-2">
                      <Star size={14} className="text-yellow-500" />
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Jugador Referencia</p>
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="font-display font-bold text-foreground">{analysisReport.jugadorReferencia.bestMatch.nombre}</p>
                        <p className="text-xs text-muted-foreground">{analysisReport.jugadorReferencia.bestMatch.posicion} · {analysisReport.jugadorReferencia.bestMatch.club}</p>
                      </div>
                      <span className="text-2xl font-display font-black text-primary">{analysisReport.jugadorReferencia.bestMatch.score.toFixed(0)}%</span>
                    </div>
                    <p className="text-xs text-muted-foreground mt-2 leading-relaxed">{analysisReport.jugadorReferencia.bestMatch.narrativa}</p>
                  </div>
                )}

                {/* Proyección */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <TrendingUp size={14} className="text-primary" />
                    <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Proyección de Carrera</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass rounded-xl p-3 border border-green-500/20">
                      <p className="text-[9px] font-display uppercase tracking-wider text-green-600 mb-1">Optimista</p>
                      <p className="text-xs font-display font-bold text-foreground">{analysisReport.proyeccionCarrera.escenarioOptimista.nivelProyecto}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{analysisReport.proyeccionCarrera.escenarioOptimista.descripcion}</p>
                    </div>
                    <div className="glass rounded-xl p-3 border border-border">
                      <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">Realista</p>
                      <p className="text-xs font-display font-bold text-foreground">{analysisReport.proyeccionCarrera.escenarioRealista.nivelProyecto}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{analysisReport.proyeccionCarrera.escenarioRealista.descripcion}</p>
                    </div>
                  </div>
                </div>

                {/* Plan de Desarrollo */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target size={14} className="text-primary" />
                    <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Plan de Desarrollo</p>
                  </div>
                  <div className="space-y-2 mb-3">
                    <div className="glass rounded-lg px-3 py-2">
                      <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Objetivo 6 meses</p>
                      <p className="text-xs text-foreground mt-0.5">{analysisReport.planDesarrollo.objetivo6meses}</p>
                    </div>
                    <div className="glass rounded-lg px-3 py-2">
                      <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Objetivo 18 meses</p>
                      <p className="text-xs text-foreground mt-0.5">{analysisReport.planDesarrollo.objetivo18meses}</p>
                    </div>
                  </div>
                  {analysisReport.planDesarrollo.pilaresTrabajo?.slice(0, 3).map((pilar, i) => (
                    <div key={i} className="glass rounded-lg px-3 py-2 mb-2">
                      <div className="flex items-center gap-2 mb-1">
                        <span className={`text-[9px] font-display px-1.5 py-0.5 rounded ${pilar.prioridad === "alta" ? "bg-red-500/10 text-red-500" : pilar.prioridad === "media" ? "bg-yellow-500/10 text-yellow-600" : "bg-green-500/10 text-green-600"}`}>
                          {pilar.prioridad.toUpperCase()}
                        </span>
                        <p className="text-xs font-display font-semibold text-foreground">{pilar.pilar}</p>
                      </div>
                      <ul className="space-y-0.5">
                        {pilar.acciones.slice(0, 3).map((a, j) => (
                          <li key={j} className="text-[10px] text-muted-foreground flex items-start gap-1">
                            <span className="text-primary mt-0.5">›</span> {a}
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>

                {/* Ejercicios Recomendados (RAG con feedback) */}
                {analysisReport.estadoActual.areasDesarrollo?.length > 0 && (
                  <DrillRecommendations areasDesarrollo={analysisReport.estadoActual.areasDesarrollo} />
                )}

                {/* Búsqueda manual de ejercicios */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Zap size={14} className="text-electric" />
                    <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Buscar Ejercicios</p>
                  </div>
                  <KnowledgeSearch
                    compact
                    className="mb-2"
                    onSelectResult={(r) => toast.info(`Drill: ${r.content.slice(0, 80)}...`)}
                  />
                </div>

                {/* Riesgos */}
                {analysisReport.proyeccionCarrera.riesgos?.length > 0 && (
                  <div className="glass rounded-xl p-4 border border-yellow-500/20">
                    <div className="flex items-center gap-2 mb-2">
                      <AlertTriangle size={14} className="text-yellow-500" />
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">Riesgos Identificados</p>
                    </div>
                    <ul className="space-y-1">
                      {analysisReport.proyeccionCarrera.riesgos.map((r, i) => (
                        <li key={i} className="text-xs text-muted-foreground flex items-start gap-1">
                          <span className="text-yellow-500 mt-0.5">›</span> {r}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Status Bar */}
      <motion.div variants={item} className="px-4 py-2 border-t border-border flex items-center justify-between text-[10px] font-display text-muted-foreground tracking-wider">
        <div className="flex items-center gap-6">
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${v2.isProcessing ? "bg-yellow-400 animate-pulse" : "bg-primary"}`} />
            {v2.isProcessing ? `PIPELINE: ${v2.state.step.toUpperCase()}` : "GPU_READY"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className={`w-1.5 h-1.5 rounded-full ${mediaPipe.status === "processing" ? "bg-green-400 animate-pulse" : mediaPipe.status === "complete" ? "bg-green-400" : "bg-muted-foreground"}`} />
            MEDIAPIPE: {mediaPipe.status === "processing" ? `${mediaPipe.fps}FPS` : mediaPipe.status === "complete" ? `DONE·${mediaPipe.framesProcessed}f` : "STANDBY"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            ENGINE: YOLO+MediaPipe{eventSummary ? ` · ${eventSummary.totalEvents}evt` : ""}
          </span>
        </div>
        <span>VITAS_STATION_004 // BUILD_3.0.0</span>
      </motion.div>
    </motion.div>
  );
};

export default VitasLab;
