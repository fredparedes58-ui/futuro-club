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
  AlertTriangle,
  Activity,
  FileDown,
  History,
  Zap,
} from "lucide-react";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import { useTracking } from "@/hooks/useTracking";
import pitchImage from "@/assets/pitch-field.jpg";
import { toast } from "sonner";
import VideoUpload from "@/components/VideoUpload";
import { useVideos } from "@/hooks/useVideos";
import VideoCard from "@/components/VideoCard";
import VideoPlayer from "@/components/VideoPlayer";
import { useAllPlayers } from "@/hooks/usePlayers";
import { useAuth } from "@/context/AuthContext";
import { usePlan } from "@/hooks/usePlan";
import { SubscriptionService } from "@/services/real/subscriptionService";
import { extractKeyframesFromVideo, isLocalSrc, readVideoAsBase64 } from "@/lib/localVideoUtils";
import AnalysisFocusSelector from "@/components/AnalysisFocusSelector";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { useSavedAnalyses } from "@/hooks/usePlayerIntelligence";
import { calculateVAEPFromGemini } from "@/lib/geminiToVaep";

interface CalibrationPoint {
  id: number;
  x: number;
  y: number;
  label: string;
}

const steps = [
  { id: 1, label: "UPLOAD", done: true },
  { id: 2, label: "MAPPING", active: true },
  { id: 3, label: "PROCESS", done: false },
];

const analysisModes = [
  {
    id: "all",
    label: "All Players",
    desc: "Global pitch coverage & team heatmaps",
    icon: Users,
  },
  {
    id: "click",
    label: "Click-to-Track",
    desc: "Focus on individual manual selection",
    icon: ScanSearch,
  },
  {
    id: "team",
    label: "Full Team",
    desc: "Compare Home vs Away tactical blocks",
    icon: Swords,
  },
  {
    id: "player",
    label: "Specific Player",
    desc: "Filter by jersey number and position",
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

type AnalysisState = "idle" | "running" | "done" | "error";

const VitasLab = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { canRunAnalysis, analysesUsed, limits } = usePlan();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [showHistorial, setShowHistorial]       = useState(false);

  const [selectedMode, setSelectedMode]         = useState("all");
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentTime, setCurrentTime]           = useState(862);
  const totalTime = 5400;
  const [showUploadPanel, setShowUploadPanel]   = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedVideoId, setSelectedVideoId]   = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const { data: savedAnalyses = [], refetch: refetchAnalyses } = useSavedAnalyses(selectedPlayerId ?? "");
  const [analysisState, setAnalysisState]       = useState<AnalysisState>("idle");
  const [analysisReport, setAnalysisReport]     = useState<AnalysisReport | null>(null);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [jerseyNumber, setJerseyNumber]         = useState<string>("");
  const [teamColor, setTeamColor]               = useState<string>("");
  const [showTracking, setShowTracking]         = useState(false);
  // Configuración por modo de análisis
  const [homeTeamColor, setHomeTeamColor]       = useState<string>("");
  const [awayTeamColor, setAwayTeamColor]       = useState<string>("");
  const [analysisFocus, setAnalysisFocus]       = useState<string[]>([]);
  const [homeFormation, setHomeFormation]       = useState<string>("4-3-3");
  const [awayFormation, setAwayFormation]       = useState<string>("4-4-2");
  const [playerName, setPlayerName]             = useState<string>("");
  const [playerPosition, setPlayerPosition]     = useState<string>("");
  const trackingVideoRef = useRef<HTMLVideoElement | null>(null);

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

  const tracking = useTracking({
    videoId:           selectedVideoId ?? "",
    playerId:          selectedPlayerId ?? "",
    calibrationPoints: points.map(p => ({ x: p.x, y: p.y })),
    anchorPreset:      "full_corners",
    cdnHostname:       import.meta.env.VITE_BUNNY_CDN_HOSTNAME,
    localVideoSrc,
  });

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
  }, [points]);

  useEffect(() => {
    drawOverlay();
    window.addEventListener("resize", drawOverlay);
    return () => window.removeEventListener("resize", drawOverlay);
  }, [drawOverlay]);

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
      toast.error(`Límite de análisis alcanzado: ${analysesUsed}/${limitLabel} este mes.`, {
        action: { label: "Actualizar plan", onClick: () => navigate("/billing") },
        duration: 5000,
      });
      return;
    }
    if (!selectedVideoId) {
      toast.info("Selecciona un video primero", {
        description: "Haz clic en 'SUBIR VIDEO' para cargar o seleccionar un partido.",
        duration: 4000,
      });
      return;
    }
    if (!selectedPlayerId) {
      toast.info("Selecciona un jugador", {
        description: "Elige el jugador a analizar en el panel derecho.",
        duration: 4000,
      });
      return;
    }

    setAnalysisState("running");
    const toastId = toast.loading("Iniciando análisis VITAS Intelligence…", {
      description: "Extrayendo keyframes y enviando a IA",
    });

    try {
      const video = videos.find(v => v.id === selectedVideoId);
      const playerData = players.find(p => p.id === selectedPlayerId);
      if (!video || !playerData) throw new Error("Video o jugador no encontrado");

      // 1. Extraer keyframes (local o Bunny CDN)
      const videoSrc = isLocalSrc(video.localPath) ? video.localPath!
        : isLocalSrc(video.streamUrl) ? video.streamUrl!
        : undefined;

      let keyframes: Array<{ url: string; timestamp: number; frameIndex: number }>;
      if (videoSrc) {
        toast.loading("Extrayendo fotogramas del video…", { id: toastId });
        keyframes = await extractKeyframesFromVideo(videoSrc, (video.duration as number) || 90, 8);
        if (keyframes.length === 0) throw new Error("No se pudieron extraer frames del video");
      } else {
        // Bunny CDN thumbnails
        const hostname = import.meta.env.VITE_BUNNY_CDN_HOSTNAME || "vz-b1fc8d2f-960.b-cdn.net";
        const duration = (video.duration as number) || 90;
        keyframes = Array.from({ length: 8 }, (_, i) => {
          const ts = Math.floor((duration / 9) * (i + 1));
          return { url: `https://${hostname}/${video.id}/thumbnails/thumbnail_${String(ts).padStart(4, "0")}.jpg`, timestamp: ts, frameIndex: i };
        });
      }

      // 2. Intentar observación Gemini (video base64) — opcional, fallback a keyframes
      let geminiObservations: Record<string, unknown> | null = null;
      let geminiEventCounts: Record<string, number> | null = null;

      if (videoSrc) {
        try {
          toast.loading("Preparando video para observación IA…", { id: toastId });
          const videoData = await readVideoAsBase64(videoSrc, 20);
          if (videoData) {
            toast.loading("Observando video con Gemini…", { id: toastId });
            const geminiRes = await fetch("/api/agents/video-observation", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                videoBase64: videoData.base64,
                mediaType: videoData.mediaType,
                playerContext: {
                  name: playerData.name,
                  age: playerData.age,
                  position: playerData.position,
                  foot: playerData.foot,
                  height: playerData.height,
                  weight: playerData.weight,
                  jerseyNumber: jerseyNumber.trim() || undefined,
                  teamColor: teamColor.trim() || undefined,
                },
              }),
            });
            if (geminiRes.ok) {
              const geminiData = await geminiRes.json();
              if (geminiData.observations && !geminiData.fallback) {
                geminiObservations = geminiData.observations;
                geminiEventCounts = (geminiData.observations as Record<string, unknown>).eventosContados as Record<string, number> ?? null;
                console.log("[VitasLab] Gemini observaciones recibidas:", Object.keys(geminiData.observations));
              }
            } else {
              console.warn("[VitasLab] Gemini respondió con HTTP", geminiRes.status, "— continuando sin observaciones");
            }
          } else {
            console.warn("[VitasLab] Video demasiado grande para Gemini (>20MB) — usando solo keyframes");
          }
        } catch (geminiErr) {
          console.warn("[VitasLab] Gemini falló, continuando sin observaciones:", geminiErr);
        }
      }

      toast.loading("Analizando con IA…", { id: toastId });

      // 3. Recoger métricas YOLO si hay sesión de tracking completada o activa
      let physicalMetrics: Record<string, unknown> | undefined;
      let heatmapPositions: Array<{ fx: number; fy: number }> | undefined;

      const yoloMetrics = tracking.state.sessionMetrics;
      if (yoloMetrics && yoloMetrics.distanceCoveredM > 0) {
        // Convertir m/s → km/h para Claude
        physicalMetrics = {
          maxSpeedKmh:    +(yoloMetrics.maxSpeedMs * 3.6).toFixed(1),
          avgSpeedKmh:    +(yoloMetrics.avgSpeedMs * 3.6).toFixed(1),
          distanceM:      +yoloMetrics.distanceCoveredM.toFixed(0),
          sprints:        yoloMetrics.sprintCount,
          duelsWon:       yoloMetrics.duelsWon,
          duelsLost:      yoloMetrics.duelsLost,
          intensityZones: yoloMetrics.intensityZones,
        };

        // Recoger posiciones del track enfocado para heatmap (subsample: 1 por segundo)
        const focusTrack = tracking.state.currentTracks.find(
          t => t.id === tracking.state.focusTrackId
        );
        const allPos = focusTrack?.positions
          ?? tracking.state.currentTracks.flatMap(t => t.positions);
        if (allPos.length > 0) {
          // Subsamplear a ~1 posición por segundo para no enviar demasiados datos
          const step = Math.max(1, Math.floor(allPos.length / Math.min(allPos.length, 600)));
          heatmapPositions = allPos
            .filter((_, i) => i % step === 0)
            .map(p => ({ fx: p.fx, fy: p.fy }));
        }
      }

      // 3. Llamar al agente via SSE (con métricas YOLO si disponibles)
      const res = await fetch("/api/agents/video-intelligence", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playerId: playerData.id,
          videoId: selectedVideoId,
          playerContext: {
            name: playerData.name,
            age: playerData.age,
            position: playerData.position,
            foot: playerData.foot,
            height: playerData.height,
            weight: playerData.weight,
            currentVSI: playerData.vsi,
            jerseyNumber: jerseyNumber.trim() || undefined,
            teamColor: teamColor.trim() || undefined,
          },
          keyframes,
          videoDuration: (video.duration as number) || 90,
          analysisFocus: analysisFocus.length > 0 ? analysisFocus : null,
          physicalMetrics: physicalMetrics || undefined,
          geminiObservations: geminiObservations || undefined,
          geminiEventCounts: geminiEventCounts || undefined,
        }),
      });

      if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);

      // 3. Leer SSE stream
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let report: AnalysisReport | null = null;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const chunks = buffer.split("\n\n");
        buffer = chunks.pop() ?? "";

        for (const chunk of chunks) {
          if (!chunk.trim()) continue;
          const eventMatch = chunk.match(/^event:\s*(.+)$/m);
          const dataMatch = chunk.match(/^data:\s*(.+)$/m);
          const eventType = eventMatch?.[1]?.trim();
          const jsonStr = dataMatch?.[1]?.trim();
          if (!jsonStr) continue;
          try {
            const parsed = JSON.parse(jsonStr) as Record<string, unknown>;
            if (eventType === "progress") {
              toast.loading(parsed.step as string, { id: toastId });
            } else if (eventType === "complete") {
              report = parsed.report as AnalysisReport;
            } else if (eventType === "error") {
              throw new Error(parsed.message as string);
            }
          } catch (e) {
            if (e instanceof Error && e.message !== jsonStr) throw e;
          }
        }
      }
      reader.releaseLock();

      if (!report) throw new Error("El análisis no produjo resultado");

      // 4. Enriquecer el reporte con métricas cuantitativas (YOLO + Gemini)
      const hasYolo = !!physicalMetrics;
      const hasGemini = !!geminiEventCounts;

      if (hasYolo || hasGemini) {
        const fuente = hasYolo && hasGemini ? "yolo+gemini" : hasYolo ? "yolo_only" : "gemini_only";
        const confianza = hasYolo && hasGemini ? 0.85 : hasGemini ? 0.7 : 0.6;

        // Métricas físicas (YOLO)
        const fisicas = hasYolo ? {
          velocidadMaxKmh:  physicalMetrics!.maxSpeedKmh as number,
          velocidadPromKmh: physicalMetrics!.avgSpeedKmh as number,
          distanciaM:       physicalMetrics!.distanceM as number,
          sprints:          physicalMetrics!.sprints as number,
          zonasIntensidad:  physicalMetrics!.intensityZones as { caminar: number; trotar: number; correr: number; sprint: number },
        } : undefined;

        // Métricas de eventos (Gemini)
        const eventos = hasGemini ? (() => {
          const ec = geminiEventCounts!;
          const totalPases = (ec.pasesCompletados ?? 0) + (ec.pasesFallados ?? 0);
          return {
            pasesCompletados: ec.pasesCompletados ?? 0,
            pasesFallados:    ec.pasesFallados ?? 0,
            precisionPases:   totalPases > 0 ? Math.round(((ec.pasesCompletados ?? 0) / totalPases) * 100) : 0,
            recuperaciones:   ec.recuperaciones ?? 0,
            duelosGanados:    ec.duelosGanados ?? 0,
            duelosPerdidos:   ec.duelosPerdidos ?? 0,
            disparosAlArco:   ec.disparosAlArco ?? 0,
            disparosFuera:    ec.disparosFuera ?? 0,
          };
        })() : undefined;

        report.metricasCuantitativas = {
          fisicas,
          eventos,
          fuente,
          confianza,
          heatmapPositions,
        };
      }

      setAnalysisReport(report);
      setAnalysisState("done");
      SubscriptionService.incrementAnalysisCount();

      // 5. Persistir en Supabase (si configurado)
      if (SUPABASE_CONFIGURED && user) {
        try {
          await supabase.from("player_analyses").insert({
            user_id:        user.id,
            player_id:      selectedPlayerId,
            video_id:       selectedVideoId,
            report:         report,
            similarity_top5: null,
            projection:     report.proyeccionCarrera ?? null,
          });
          refetchAnalyses();
        } catch (saveErr) {
          console.warn("[VitasLab] No se pudo guardar en Supabase:", saveErr);
        }
      }

      toast.dismiss(toastId);
      toast.success("¡Análisis completado!", {
        description: `Informe VITAS Intelligence generado. Confianza: ${Math.round((report.confianza ?? 0) * 100)}%`,
        duration: 5000,
      });
      setShowResultsPanel(true);

    } catch (err) {
      const msg = err instanceof Error ? err.message : "Error desconocido";
      setAnalysisState("error");
      toast.dismiss(toastId);
      toast.error("Error en el análisis", { description: msg });
    }
  };

  const handleAutoDetect = () => {
    toast.info("Auto-detección disponible en Fase 3 con YOLOv11M", {
      description: "El modelo detectará los puntos del campo automáticamente.",
      duration: 4000,
    });
  };

  const resetPoints = () => {
    setPoints([
      { id: 1, x: 28, y: 62, label: "P1" },
      { id: 2, x: 72, y: 62, label: "P2" },
      { id: 3, x: 80, y: 92, label: "P3" },
      { id: 4, x: 20, y: 92, label: "P4" },
    ]);
  };

  useEffect(() => {
    if (!isPlaying) return;
    const interval = setInterval(() => {
      setCurrentTime((t) => (t >= totalTime ? 0 : t + 1));
    }, 1000);
    return () => clearInterval(interval);
  }, [isPlaying]);

  const progressPercent = (currentTime / totalTime) * 100;

  const selectedPlayer = players.find((p) => p.id === selectedPlayerId);
  const selectedVideo  = videos.find((v) => v.id === selectedVideoId);

  const container = { hidden: {}, show: { transition: { staggerChildren: 0.06 } } };
  const item = {
    hidden: { opacity: 0, y: 16 },
    show:   { opacity: 1, y: 0, transition: { duration: 0.4 } },
  };

  // Dimension labels
  const dimLabels: Record<string, string> = {
    velocidadDecision:   "Velocidad Decisión",
    tecnicaConBalon:     "Técnica con Balón",
    inteligenciaTactica: "Inteligencia Táctica",
    capacidadFisica:     "Capacidad Física",
    liderazgoPresencia:  "Liderazgo",
    eficaciaCompetitiva: "Eficacia Competitiva",
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
              { label: "DASHBOARD",    action: () => navigate("/")         },
              { label: "NEW ANALYSIS", action: () => setShowUploadPanel(true) },
              { label: "ARCHIVE",      action: () => navigate("/videos")   },
              { label: "MODELS",       action: () => toast.info("Modelos disponibles próximamente", { description: "YOLOv8n-pose entrenado con SoccerNet estará disponible en Fase 3." }) },
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
              SYSTEM_STATUS: <span className="text-primary">{analysisState === "running" ? "ANALYZING" : "ACTIVE"}</span>
            </span>
            <br />
            <span className="text-[10px] font-display text-muted-foreground tracking-wider">
              {selectedVideo ? `VIDEO: ${selectedVideo.title.slice(0, 20)}` : "NO_VIDEO_SELECTED"}
            </span>
          </div>
          <div className="w-8 h-8 rounded-full bg-secondary border border-border flex items-center justify-center">
            <UserRound size={14} className="text-muted-foreground" />
          </div>
        </div>
      </motion.div>

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
              <h1 className="font-display font-bold text-2xl text-foreground">Pitch Homography Setup</h1>
              <p className="text-sm text-muted-foreground">
                Define reference points for 2D perspective mapping.
              </p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={resetPoints} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground hover:bg-secondary transition-colors">
                <RotateCcw size={14} />
                RESET POINTS
              </button>
              <button onClick={handleAutoDetect} className="flex items-center gap-2 px-4 py-2 rounded-lg border border-border text-xs font-display font-semibold text-foreground hover:bg-secondary transition-colors">
                <Camera size={14} />
                AUTO-DETECT
              </button>
              <button onClick={() => setShowUploadPanel(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 border border-primary/30 text-xs font-display font-semibold text-primary hover:bg-primary/20 transition-colors">
                <Upload size={14} />
                SUBIR VIDEO
              </button>
              {analysisState === "done" && (
                <button onClick={() => setShowResultsPanel(true)} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-green-500/10 border border-green-500/30 text-xs font-display font-semibold text-green-600 hover:bg-green-500/20 transition-colors">
                  <Brain size={14} />
                  VER INFORME
                </button>
              )}
            </div>
          </motion.div>

          {/* Pitch Canvas */}
          <motion.div variants={item} ref={containerRef} className="relative flex-1 min-h-[300px] rounded-xl overflow-hidden border border-border">
            <img src={pitchImage} alt="Football pitch" className="w-full h-full object-cover" />
            <canvas
              ref={canvasRef}
              className="absolute inset-0 w-full h-full cursor-crosshair"
              onMouseDown={handleCanvasMouseDown}
              onMouseMove={handleCanvasMouseMove}
              onMouseUp={handleCanvasMouseUp}
              onMouseLeave={handleCanvasMouseUp}
            />
            {/* Calibration Status */}
            <div className="absolute bottom-4 left-4 glass rounded-lg px-4 py-2 flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${analysisState === "running" ? "bg-yellow-400" : "bg-destructive"} animate-pulse`} />
              <span className="text-[11px] font-display font-semibold text-foreground tracking-wider">
                {analysisState === "running"
                  ? "ANALYZING… CLAUDE VISION PROCESSING"
                  : `CALIBRATION ACTIVE: ${points.length} OF 4 POINTS ASSIGNED. PERSPECTIVE SOLVED.`}
              </span>
            </div>
            {/* Analysis running overlay */}
            {analysisState === "running" && (
              <div className="absolute inset-0 bg-background/40 backdrop-blur-[2px] flex items-center justify-center">
                <div className="glass rounded-2xl px-8 py-6 flex flex-col items-center gap-3">
                  <Loader2 size={32} className="text-primary animate-spin" />
                  <p className="font-display font-bold text-foreground text-sm tracking-wider">PROCESANDO CON IA</p>
                  <p className="text-xs text-muted-foreground">Claude Sonnet analizando keyframes…</p>
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
                setCurrentTime(Math.round(pct * totalTime));
              }}
            >
              <div className="absolute inset-y-0 left-0 bg-primary/30 rounded-full" style={{ width: `${Math.min(progressPercent + 15, 100)}%` }} />
              <motion.div className="absolute inset-y-0 left-0 bg-primary rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-xs font-display text-muted-foreground tabular-nums min-w-[120px] text-right">
              {formatTime(currentTime)} / {formatTime(totalTime)}
            </span>
          </motion.div>
        </div>

        {/* Right Sidebar */}
        <motion.div variants={item} className="hidden lg:flex flex-col w-72 border-l border-border p-5 gap-5 overflow-y-auto max-h-screen">

          {/* Player Selector */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Jugador a Analizar
            </span>
            <div className="relative mt-2">
              <button
                onClick={() => setShowPlayerDropdown((v) => !v)}
                className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl border border-border bg-secondary/50 hover:bg-secondary transition-colors text-left"
              >
                <span className={`text-sm font-display font-semibold ${selectedPlayer ? "text-foreground" : "text-muted-foreground"}`}>
                  {selectedPlayer ? selectedPlayer.name : "Seleccionar jugador…"}
                </span>
                <ChevronDown size={14} className="text-muted-foreground" />
              </button>
              {showPlayerDropdown && (
                <div className="absolute top-full left-0 right-0 mt-1 glass rounded-xl border border-border z-20 max-h-48 overflow-y-auto">
                  {players.length === 0 && (
                    <p className="text-xs text-muted-foreground px-3 py-2">No hay jugadores</p>
                  )}
                  {players.map((p) => (
                    <button
                      key={p.id}
                      onClick={() => {
                        setSelectedPlayerId(p.id);
                        setShowPlayerDropdown(false);
                        // Auto-rellenar campos del jugador para evitar redundancia
                        if (p.name) setPlayerName(p.name);
                        if (p.position) setPlayerPosition(p.position);
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-primary/5 transition-colors flex items-center justify-between ${selectedPlayerId === p.id ? "text-primary font-semibold" : "text-foreground"}`}
                    >
                      <span>{p.name}</span>
                      <span className="text-[10px] text-muted-foreground">{p.position}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {selectedPlayer && (
              <div className="mt-2 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-primary/5 border border-primary/20">
                <div className="w-1.5 h-1.5 rounded-full bg-primary" />
                <span className="text-[10px] font-display text-primary">VSI {selectedPlayer.vsi} · {selectedPlayer.position} · {selectedPlayer.age}a</span>
              </div>
            )}
          </div>

          {/* Identificación del jugador — solo visible en modos que NO tienen su propio panel de config */}
          {(selectedMode === "all" || selectedMode === "team") && (
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Identificar Jugador
            </span>
            <div className="grid grid-cols-2 gap-2 mt-2">
              <div>
                <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Nº Camiseta</label>
                <input
                  type="text"
                  maxLength={3}
                  value={jerseyNumber}
                  onChange={(e) => setJerseyNumber(e.target.value)}
                  placeholder="Ej: 10"
                  className="w-full mt-1 px-2 py-2 rounded-lg border border-border bg-secondary/50 text-sm font-display font-semibold text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
              </div>
              <div>
                <label className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Color Uniforme</label>
                <input
                  type="text"
                  value={teamColor}
                  onChange={(e) => setTeamColor(e.target.value)}
                  placeholder="Ej: Rojo"
                  className="w-full mt-1 px-2 py-2 rounded-lg border border-border bg-secondary/50 text-sm font-display text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50"
                />
              </div>
            </div>
            <p className="mt-1.5 text-[9px] text-muted-foreground leading-tight">
              La IA buscará ese dorsal y color para centrar el análisis en ese jugador.
            </p>
          </div>
          )}

          {/* Coordinate Realtime */}
          <div>
            <span className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">
              Coordinate Realtime
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
              Modo de Análisis
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
              />

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

          {/* Botones de acción */}
          <div className="mt-auto space-y-2">
            {/* START TRACKING — YOLO real */}
            <button
              onClick={() => {
                if (!selectedVideoId) { toast.error("Selecciona un video primero"); return; }
                setShowTracking(true);
                // El video element se crea dinámicamente
                const videoEl = document.createElement("video");
                videoEl.style.display = "none";
                document.body.appendChild(videoEl);
                trackingVideoRef.current = videoEl;
                tracking.startTracking(videoEl).catch(err => {
                  toast.error("Error iniciando tracking: " + err.message);
                });
              }}
              disabled={tracking.state.status === "tracking" || tracking.state.status === "loading-model"}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-green-600 text-white font-display font-bold text-sm uppercase tracking-wider hover:bg-green-700 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {tracking.state.status === "loading-model" ? (
                <><Loader2 size={14} className="animate-spin" /> CARGANDO YOLO {tracking.state.modelProgress}%</>
              ) : tracking.state.status === "tracking" ? (
                <><Activity size={14} className="animate-pulse" /> TRACKING ACTIVO</>
              ) : (
                <><Activity size={14} /> START TRACKING</>
              )}
            </button>

            {tracking.state.status === "tracking" && (
              <button
                onClick={() => { tracking.stopTracking(); }}
                className="w-full py-2 rounded-xl border border-red-500 text-red-400 text-sm font-display font-semibold hover:bg-red-500/10 transition-colors"
              >
                Detener tracking
              </button>
            )}

            {/* START ANALYSIS — Claude Vision */}
            <button
              onClick={handleStartAnalysis}
              disabled={analysisState === "running"}
              className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {analysisState === "running" ? (
                <><Loader2 size={16} className="animate-spin" /> ANALIZANDO…</>
              ) : (
                <><Rocket size={16} /> ANALYSIS IA</>
              )}
            </button>
            <p className="text-center text-[10px] font-display text-muted-foreground tracking-wider">
              {analysisState === "done"
                ? `ÚLTIMO ANÁLISIS: CONFIANZA ${Math.round((analysisReport?.confianza ?? 0) * 100)}%`
                : "TRACKING = métricas físicas · IA = táctica"}
            </p>
          </div>
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
                          <VideoCard video={video} />
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
        {showResultsPanel && analysisReport && (
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
                    HISTORIAL{savedAnalyses.length > 0 ? ` (${savedAnalyses.length})` : ""}
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
                    {savedAnalyses.map((sa: { id: string; created_at: string; report: AnalysisReport }) => (
                      <button
                        key={sa.id}
                        onClick={() => {
                          setAnalysisReport(sa.report);
                          setShowHistorial(false);
                        }}
                        className="w-full text-left glass rounded-lg px-3 py-2 hover:bg-primary/5 transition-colors"
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-display font-semibold text-foreground">
                            {sa.report?.estadoActual?.nivelActual?.replace("_", " ").toUpperCase() ?? "Análisis"}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {new Date(sa.created_at).toLocaleDateString("es-ES", { day: "2-digit", month: "short", year: "numeric" })}
                          </span>
                        </div>
                        <p className="text-[10px] text-muted-foreground truncate mt-0.5">
                          {sa.report?.estadoActual?.resumenEjecutivo?.slice(0, 80)}…
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

                {/* VAEP Estimado (si hay eventos Gemini) */}
                {analysisReport.metricasCuantitativas?.eventos && (() => {
                  const vaepResult = calculateVAEPFromGemini(
                    analysisReport.metricasCuantitativas.eventos,
                    playerPosition || "mediocampista",
                    90, // asumimos 90 min si no hay dato exacto
                  );
                  if (vaepResult.status !== "calculated") return null;
                  return (
                    <div className="glass rounded-xl p-4 border border-purple-500/20">
                      <div className="flex items-center gap-2 mb-3">
                        <Zap size={14} className="text-purple-500" />
                        <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">VAEP Estimado</p>
                        <span className="text-[9px] font-display px-1.5 py-0.5 rounded-full bg-purple-500/10 text-purple-400 border border-purple-500/20">
                          Aproximado
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div className="text-center">
                          <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">VAEP Total</p>
                          <p className={`text-2xl font-display font-black ${(vaepResult.vaepTotal ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {(vaepResult.vaepTotal ?? 0) >= 0 ? "+" : ""}{vaepResult.vaepTotal?.toFixed(3)}
                          </p>
                        </div>
                        <div className="text-center">
                          <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">VAEP / 90 min</p>
                          <p className={`text-2xl font-display font-black ${(vaepResult.vaep90 ?? 0) >= 0 ? "text-green-500" : "text-red-500"}`}>
                            {(vaepResult.vaep90 ?? 0) >= 0 ? "+" : ""}{vaepResult.vaep90?.toFixed(3)}
                          </p>
                        </div>
                      </div>
                      {vaepResult.topActions.length > 0 && (
                        <div className="mt-3">
                          <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">Top Acciones</p>
                          <div className="flex flex-wrap gap-1">
                            {vaepResult.topActions.slice(0, 4).map((a, i) => (
                              <span key={i} className={`text-[9px] font-display px-1.5 py-0.5 rounded ${a.impact >= 0 ? "bg-green-500/10 text-green-600" : "bg-red-500/10 text-red-500"}`}>
                                {a.actionId.replace("synth-", "").split("-")[0]} {a.impact >= 0 ? "+" : ""}{a.impact.toFixed(3)}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                      <p className="text-[8px] text-muted-foreground mt-2 italic">
                        Calculado a partir de observación de video IA. Valores aproximados basados en conteos de eventos.
                      </p>
                    </div>
                  );
                })()}

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
            <span className={`w-1.5 h-1.5 rounded-full ${analysisState === "running" ? "bg-yellow-400 animate-pulse" : "bg-primary"}`} />
            {analysisState === "running" ? "PIPELINE: RUNNING" : "GPU_LOAD: 42%"}
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-primary" />
            RAM_USAGE: 4.8GB
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground" />
            ENGINE: YOLOv11M
          </span>
        </div>
        <span>VITAS_STATION_004 // BUILD_3.0.0</span>
      </motion.div>
    </motion.div>
  );
};

export default VitasLab;
