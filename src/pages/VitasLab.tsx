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
} from "lucide-react";
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
  confianza: number;
}

type AnalysisState = "idle" | "running" | "done" | "error";

const VitasLab = () => {
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { canRunAnalysis, analysesUsed, limits } = usePlan();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [selectedMode, setSelectedMode]         = useState("all");
  const [isPlaying, setIsPlaying]               = useState(false);
  const [currentTime, setCurrentTime]           = useState(862);
  const totalTime = 5400;
  const [showUploadPanel, setShowUploadPanel]   = useState(false);
  const [showResultsPanel, setShowResultsPanel] = useState(false);
  const [selectedVideoId, setSelectedVideoId]   = useState<string | null>(null);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [analysisState, setAnalysisState]       = useState<AnalysisState>("idle");
  const [analysisReport, setAnalysisReport]     = useState<AnalysisReport | null>(null);
  const [showPlayerDropdown, setShowPlayerDropdown] = useState(false);
  const [jerseyNumber, setJerseyNumber]         = useState<string>("");
  const [teamColor, setTeamColor]               = useState<string>("");

  const { data: videos = [] } = useVideos();
  const { data: players = [] } = useAllPlayers();

  const [points, setPoints] = useState<CalibrationPoint[]>([
    { id: 1, x: 28, y: 62, label: "P1" },
    { id: 2, x: 72, y: 62, label: "P2" },
    { id: 3, x: 80, y: 92, label: "P3" },
    { id: 4, x: 20, y: 92, label: "P4" },
  ]);

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
      description: "Procesando keyframes y generando informe con IA",
    });

    try {
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      // Pass auth token if available
      const token = user
        ? (() => {
            try {
              const stored = localStorage.getItem("sb-tloadypygzqyfefanrza-auth-token");
              if (stored) {
                const parsed = JSON.parse(stored) as { access_token?: string };
                return parsed.access_token;
              }
            } catch { return null; }
            return null;
          })()
        : null;
      if (token) headers["Authorization"] = `Bearer ${token}`;

      const res = await fetch("/api/pipeline/start", {
        method: "POST",
        headers,
        body: JSON.stringify({
          videoId:          selectedVideoId,
          playerId:         selectedPlayerId,
          analysisMode:     selectedMode,
          homographyPoints: points,
          jerseyNumber:     jerseyNumber.trim() || undefined,
          teamColor:        teamColor.trim() || undefined,
        }),
      });

      const data = await res.json() as { success?: boolean; report?: AnalysisReport; error?: string; phase2Pending?: boolean };

      if (data.phase2Pending) {
        toast.dismiss(toastId);
        toast.warning("Configura las variables de Bunny Stream", {
          description: "BUNNY_STREAM_LIBRARY_ID y BUNNY_STREAM_API_KEY en Vercel para activar el pipeline completo.",
          duration: 6000,
        });
        setAnalysisState("idle");
        return;
      }

      if (!res.ok || !data.success || !data.report) {
        throw new Error(data.error ?? "Error desconocido en el pipeline");
      }

      setAnalysisReport(data.report);
      setAnalysisState("done");
      SubscriptionService.incrementAnalysisCount();
      toast.dismiss(toastId);
      toast.success("¡Análisis completado!", {
        description: `Informe VITAS Intelligence generado. Confianza: ${Math.round((data.report.confianza ?? 0) * 100)}%`,
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
            {["DASHBOARD", "NEW ANALYSIS", "ARCHIVE", "MODELS"].map((link, i) => (
              <span key={link} className={`text-xs font-display font-semibold tracking-wider cursor-pointer transition-colors ${i === 1 ? "text-foreground" : "text-muted-foreground hover:text-foreground"}`}>
                {link}
              </span>
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
        <motion.div variants={item} className="hidden lg:flex flex-col w-72 border-l border-border p-5 gap-5">

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
                      onClick={() => { setSelectedPlayerId(p.id); setShowPlayerDropdown(false); }}
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

          {/* Identificación del jugador */}
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
              Analysis Mode
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
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${active ? "bg-primary/10" : "bg-secondary"}`}>
                      <Icon size={18} className={active ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div>
                      <h4 className="font-display font-bold text-sm text-foreground">{mode.label}</h4>
                      <p className="text-[10px] text-muted-foreground leading-tight">{mode.desc}</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Start Analysis */}
          <div className="mt-auto space-y-2">
            <button
              onClick={handleStartAnalysis}
              disabled={analysisState === "running"}
              className="w-full flex items-center justify-center gap-2 px-6 py-4 rounded-xl bg-primary text-primary-foreground font-display font-bold text-sm uppercase tracking-wider hover:bg-primary/90 transition-colors disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {analysisState === "running" ? (
                <><Loader2 size={16} className="animate-spin" /> ANALIZANDO…</>
              ) : (
                <><Rocket size={16} /> START ANALYSIS</>
              )}
            </button>
            <p className="text-center text-[10px] font-display text-muted-foreground tracking-wider">
              {analysisState === "done"
                ? `ÚLTIMO ANÁLISIS: CONFIANZA ${Math.round((analysisReport?.confianza ?? 0) * 100)}%`
                : "ESTIMATED_TIME: ~12m por video"}
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
                  <span className="font-display font-bold text-foreground">VITAS Intelligence Report</span>
                  <span className="text-[10px] font-display px-2 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                    {Math.round(analysisReport.confianza * 100)}% confianza
                  </span>
                </div>
                <button onClick={() => setShowResultsPanel(false)} className="text-muted-foreground hover:text-foreground transition-colors">
                  <X size={18} />
                </button>
              </div>

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
