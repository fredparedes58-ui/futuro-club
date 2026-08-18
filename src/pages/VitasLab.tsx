import { useState, useRef, useCallback, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
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
  ArrowLeft,
  Upload,
  X,
  ChevronDown,
  Loader2,
  Brain,
  Star,
  TrendingUp,
  ArrowRight,
  Target,
  CircleAlert,
  AlertTriangle,
  Activity,
  FileDown,
  History,
  Zap,
} from "lucide-react";
import TrackingMetricsPanel from "@/components/TrackingMetricsPanel";
import ModelLoadingOverlay from "@/components/tracking/ModelLoadingOverlay";
import { getActiveModel } from "@/lib/yolo/modelConfig";
import { PlayerTrackingService } from "@/services/real/playerTrackingService";
import PlayerHeatmap from "@/components/PlayerHeatmap";
import VoronoiOverlay from "@/components/VoronoiOverlay";
import { useTracking } from "@/hooks/useTracking";
import { useMediaPipePose } from "@/hooks/useMediaPipePose";
import { EventDetectionEngine } from "@/lib/tracking/eventDetectionEngine";
import type { TacticalEvent, EventSummary } from "@/lib/tracking/eventDetectionEngine";
import { metricsTrustworthy } from "@/lib/yolo/fieldRegistration";
import { AnalyticsExporter } from "@/lib/tracking/analyticsExportPipeline";
import type { SessionExportData, ExportFormat } from "@/lib/tracking/analyticsExportPipeline";
import { detectFieldLines } from "@/lib/tracking/fieldLineDetector";
import type { FieldDetectionResult } from "@/lib/tracking/fieldLineDetector";
import pitchImage from "@/assets/pitch-field.jpg";
import { toast } from "sonner";
import { useTranslation } from "react-i18next";
import { useVideos } from "@/hooks/useVideos";
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
import { usePlayerAnalysisV2 } from "@/hooks/usePlayerAnalysisV2";
import { useFatigue } from "@/hooks/useFatigue";
import FatiguePanel from "@/components/FatiguePanel";
import { useOneClickAnalysis } from "@/hooks/useOneClickAnalysis";
import VitasLabOneClick from "@/components/VitasLabOneClick";
import PlayerIdentityOverlay from "@/components/PlayerIdentityOverlay";
import XgPanel from "@/components/XgPanel";
import { XgAccumulator } from "@/lib/xg/xgAccumulator";
import type { XgSummary } from "@/lib/xg/xgAccumulator";
import TeamDashboard from "@/components/TeamDashboard";
import { useTeamAnalysis } from "@/hooks/useTeamAnalysis";
import UpgradePrompt from "@/components/UpgradePrompt";
import type { CalibrationPoint } from "./vitasLab/types";
import { mapV2ToReport } from "./vitasLab/reportMapping";
import { formatTime, container, item } from "./vitasLab/labUi";
import LabStatusBar from "./vitasLab/LabStatusBar";
import LabUploadPanel from "./vitasLab/LabUploadPanel";

const steps = [
  { id: 1, labelKey: "vitasLab.stepUpload", done: true },
  { id: 2, labelKey: "vitasLab.stepMapping", active: true },
  { id: 3, labelKey: "vitasLab.stepProcess", done: false },
];

const analysisModes = [
  {
    id: "all",
    labelKey: "vitasLab.modeAllPlayers",
    descKey: "vitasLab.modeAllPlayersDesc",
    icon: Users,
  },
  {
    id: "click",
    labelKey: "vitasLab.modeManualTracking",
    descKey: "vitasLab.modeManualTrackingDesc",
    icon: ScanSearch,
  },
  {
    id: "team",
    labelKey: "vitasLab.modeFullTeam",
    descKey: "vitasLab.modeFullTeamDesc",
    icon: Swords,
  },
  {
    id: "player",
    labelKey: "vitasLab.modeSpecificPlayer",
    descKey: "vitasLab.modeSpecificPlayerDesc",
    icon: UserRound,
  },
];

const VitasLab = () => {
  const { t } = useTranslation();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { canRunAnalysis, analysesUsed, limits, isClub, plan } = usePlan();
  const [showUpgradePrompt, setShowUpgradePrompt] = useState(false);
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
  const { data: players = [] } = useAllPlayers();

  // ── Fatigue Detection ──
  // phvOffset real del jugador seleccionado (antes quedaba fijo en null y la
  // corrección por madurez nunca se aplicaba — ni aquí ni en el panel xG).
  const fatigue = useFatigue({
    playerId: selectedPlayerId ?? "",
    phvOffset: players.find((p) => p.id === selectedPlayerId)?.phvOffset ?? null,
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
            ? t("vitasLab.autoCalibSuccessPct", { pct: Math.round(result.confidence * 100) })
            : t("vitasLab.calibHeuristicApplied"),
          { duration: 3000 },
        );
      }
    },
    onStartTracking: (videoEl) => {
      setShowTracking(true);
      mediaPipe.reset();
      eventEngineRef.current.reset();
      xgAccumulatorRef.current.reset();
      setEventSummary(null);
      setTacticalEvents([]);
      setXgSummary(null);
      videoEl.crossOrigin = "anonymous";
      trackingVideoRef.current = videoEl;
      tracking.startTracking(videoEl).then(() => {
        oneClick.advanceStep("tracking");
      }).catch((err) => {
        oneClick.markError(t("vitasLab.trackingStartError") + " " + err.message);
      });
    },
    onError: (error) => {
      toast.error(t("vitasLab.oneClickError"), { description: error });
    },
    onComplete: () => {
      toast.success(t("vitasLab.oneClickComplete"));
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

  // ── Preselección por URL (?playerId=…) ──
  // 12 vistas ya enlazan a /lab?playerId=X (ficha, FAB, IDP, informes…); hasta
  // ahora el Lab ignoraba el parámetro. Replica los 3 setters del selector manual
  // (id + nombre + posición, que alimentan el PDF) y solo actúa si el usuario no
  // ha elegido ya un jugador. En móvil es la ÚNICA vía de selección (el selector
  // visual es desktop-only).
  const [searchParams] = useSearchParams();
  useEffect(() => {
    if (selectedPlayerId !== null) return;
    const urlPlayerId = searchParams.get("playerId");
    if (!urlPlayerId) return;
    const p = players.find((pl) => pl.id === urlPlayerId);
    if (!p) return;
    setSelectedPlayerId(p.id);
    if (p.name) setPlayerName(p.name);
    if (p.position) setPlayerPosition(p.position);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [players, searchParams]);

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
      toast.success(t("vitasLab.biomechanicsComplete"), {
        description: `DrillScore: ${bio.drillScore}/100 · ${t("vitasLab.symmetry")}: ${bio.bilateralSymmetry}% · ${bio.framesAnalyzed} frames`,
        duration: 6000,
      });
    },
  });

  // ── Event Detection Engine ──
  const eventEngineRef = useRef(new EventDetectionEngine({ trackingFps: 8 }));
  const [eventSummary, setEventSummary] = useState<EventSummary | null>(null);
  const [tacticalEvents, setTacticalEvents] = useState<TacticalEvent[]>([]);

  // ── xG Accumulator (Sprint 6) ──
  const xgAccumulatorRef = useRef(new XgAccumulator());
  const [xgSummary, setXgSummary] = useState<XgSummary | null>(null);

  // ── Analysis View Mode (Sprint 8): Jugador / Equipo / Rival Scout ──
  const [analysisViewMode, setAnalysisViewMode] = useState<"player" | "team" | "rival">("player");

  // ── Team Analysis (Sprint 8) ──
  const teamAnalysis = useTeamAnalysis({
    enabled: analysisViewMode === "team" || analysisViewMode === "rival",
    rivalTeam: "away",
  });

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
        toast.success(t("vitasLab.autoCalibSuccess"), {
          description: t("vitasLab.autoCalibSuccessDesc", { lines: result.lines.length, pct: Math.round(result.confidence * 100) }),
          duration: 5000,
        });
      } else {
        toast.info(t("vitasLab.autoCalibPartial"), {
          description: t("vitasLab.autoCalibPartialDesc", { pct: Math.round(result.confidence * 100) }),
          duration: 4000,
        });
      }
    } catch (err) {
      toast.error(t("vitasLab.fieldLineDetectError"));
      console.error("[FieldLineDetector]", err);
    } finally {
      setAutoCalibRunning(false);
    }
  }, [t]);

  // points DEBE declararse ANTES de useTracking (que lo usa en calibrationPoints)
  const [points, setPoints] = useState<CalibrationPoint[]>([
    { id: 1, x: 28, y: 62, label: "P1" },
    { id: 2, x: 72, y: 62, label: "P2" },
    { id: 3, x: 80, y: 92, label: "P3" },
    { id: 4, x: 20, y: 92, label: "P4" },
  ]);

  // Videos DEBEN declararse ANTES de useTracking para poder pasar localVideoSrc
  // (players se declara arriba, junto al resto de datos del jugador seleccionado)
  const { data: videos = [] } = useVideos();

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

    // Los motores táctico/equipo son ESPACIALES (posiciones en metros). Solo son
    // fiables con una calibración fiable; si no, no se les alimenta → no producen
    // eventos/posesión falsos (anti-fallo-silencioso). Ver #21.
    const calibReliable = metricsTrustworthy(tracking.state.calibrationConfidence);

    eventEngineRef.current.processFrame(
      tracks,
      timestampMs,
      frameIndex,
      tracking.state.focusTrackId,
      tracking.state.ballTrack ?? null,
      calibReliable,
    );

    // Sprint 8: Feed team analysis engine
    if (analysisViewMode !== "player" && tracking.state.identities.size > 0) {
      teamAnalysis.processFrame(
        tracks,
        tracking.state.identities,
        tracking.state.ballTrack ?? null,
        tracking.state.possession as "home" | "away" | "contested" | "none",
        timestampMs,
        calibReliable,
      );
    }

    // Update summary periodically (every 30 frames ≈ 3.75s)
    if (frameIndex % 30 === 0) {
      setEventSummary(eventEngineRef.current.summarize(tracking.state.focusTrackId ?? undefined));
      const events = eventEngineRef.current.getEvents();
      setTacticalEvents(events);

      // Feed shot events into xG accumulator (Sprint 6)
      const shotEvents = events.filter(e => e.type === "shot");
      if (shotEvents.length > xgAccumulatorRef.current.shotCount) {
        // New shots detected — add them
        const newShots = shotEvents.slice(xgAccumulatorRef.current.shotCount);
        for (const shot of newShots) {
          xgAccumulatorRef.current.addShotSimple(
            shot.timestampMs,
            shot.startPosition,
            Number(shot.metadata.xgApprox) || 0.05,
            shot.outcome === "success",
            shot.actorTrackId,
            { distanceM: Number(shot.metadata.distanceToGoalM) || 20 },
          );
        }
        setXgSummary(xgAccumulatorRef.current.summarize());
      }
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
      calibrationConfidence: tracking.state.calibrationConfidence,
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

    // Sprint 8: Generate team analysis report when tracking completes
    if (analysisViewMode !== "player") {
      teamAnalysis.generateReports();
    }

    const bioMsg = mediaPipe.biomechanics
      ? ` · DrillScore ${mediaPipe.biomechanics.drillScore}`
      : "";
    const evtMsg = finalEventSummary
      ? ` · ${finalEventSummary.totalEvents} ${t("vitasLab.events")}`
      : "";
    toast.success(`📊 ${t("vitasLab.snapshotSaved")}${bioMsg}${evtMsg}`);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tracking.state.status, selectedPlayerId, selectedVideoId]);

  const [draggingPoint, setDraggingPoint] = useState<number | null>(null);

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
      setShowUpgradePrompt(true);
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
    if (!video) { toast.error(t("vitasLab.videoNotFound")); return; }

    // Extraer bunnyVideoId desde embedUrl: https://iframe.mediadelivery.net/embed/{libId}/{guid}
    const bunnyVideoId = video.embedUrl?.split("/").pop() ?? selectedVideoId;

    setActionLog([]);
    v2.reset();
    const toastId = toast.loading(t("vitasLab.startingGpuAnalysis"));

    try {
      const selectedPlayer = players?.find((p) => p.id === selectedPlayerId);
      const finalPlayedPosition = playedPosition || selectedPlayer?.position || undefined;

      // ── Prefer client-side data path when MediaPipe/tracking data exists ──
      const hasClientData = mediaPipe.biomechanics || tracking.state.sessionMetrics || eventSummary;
      if (hasClientData) {
        // Build physical metrics from YOLO tracking. DOS gates fail-closed:
        //  - CALIBRACIÓN: las cifras en metros (velocidad/distancia/sprints/duelos)
        //    sin calibración fiable serían píxeles disfrazados.
        //  - IDENTIDAD (#24): sin identidad fiable del track enfocado, las métricas
        //    por-jugador pudieron acumularse tras un ID-switch → atribuidas al jugador
        //    equivocado. Solo se envían al LLM si AMBOS gates pasan.
        const physicalMetrics: Record<string, unknown> = {};
        if (tracking.state.sessionMetrics) {
          const sm = tracking.state.sessionMetrics;
          const calibReliable = metricsTrustworthy(tracking.state.calibrationConfidence);
          const identityReliable = sm.identityReliable ?? false;
          physicalMetrics.calibrationReliable = calibReliable;
          physicalMetrics.calibrationConfidence = tracking.state.calibrationConfidence;
          physicalMetrics.identityReliable = identityReliable;
          if (calibReliable && identityReliable) {
            physicalMetrics.maxSpeedMs = sm.maxSpeedMs;
            physicalMetrics.avgSpeedMs = sm.avgSpeedMs;
            physicalMetrics.distanceCoveredM = sm.distanceCoveredM;
            physicalMetrics.sprintCount = sm.sprintCount;
            // Duelos: distancia en metros (≤1.8 m) + por-jugador → calibración + identidad.
            physicalMetrics.duelCount = tracking.state.duelEvents.length;
          }
          // Escaneo (ángulo de cabeza): indep. de calibración pero SÍ de identidad
          // (es del jugador enfocado) → gatea solo por identidad.
          if (identityReliable) physicalMetrics.scanCount = tracking.state.scanEvents.length;
          // Conteo bruto de tracks: ni calibración ni identidad → siempre.
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
          ? t("vitasLab.clientPipelineDone")
          : t("vitasLab.gpuPipelineDone"),
        duration: 5000,
      });
      setShowResultsPanel(true);
    } catch (err) {
      toast.dismiss(toastId);
      toast.error(t("lab.analysisError"), {
        description: err instanceof Error ? err.message : t("vitasLab.unknownError"),
      });
    }
  };

  // Presets de perspectiva comunes para calibración rápida
  const CALIBRATION_PRESETS: Record<string, { label: string; points: CalibrationPoint[] }> = {
    lateral: {
      label: t("vitasLab.viewLateral"),
      points: [
        { id: 1, x: 15, y: 55, label: "P1" },
        { id: 2, x: 85, y: 55, label: "P2" },
        { id: 3, x: 92, y: 90, label: "P3" },
        { id: 4, x: 8, y: 90, label: "P4" },
      ],
    },
    aerial: {
      label: t("vitasLab.viewAerial"),
      points: [
        { id: 1, x: 10, y: 10, label: "P1" },
        { id: 2, x: 90, y: 10, label: "P2" },
        { id: 3, x: 90, y: 90, label: "P3" },
        { id: 4, x: 10, y: 90, label: "P4" },
      ],
    },
    tribuna: {
      label: t("vitasLab.viewStand"),
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
    <>
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
              { label: t("vitasLab.navPanel"),    action: () => navigate("/")         },
              { label: t("vitasLab.navNewAnalysis"), action: () => setShowUploadPanel(true) },
              { label: t("vitasLab.navArchive"),      action: () => navigate("/reports")  },
              { label: t("vitasLab.navModels"),       action: () => toast.info(t("lab.modelsComingSoon"), { description: t("lab.modelsComingSoonDesc") }) },
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
              {t("vitasLab.systemStatus")}: <span className="text-primary">{v2.isProcessing ? t("vitasLab.statusAnalyzing") : t("vitasLab.statusActive")}</span>
            </span>
            <br />
            <span className="text-[10px] font-display text-muted-foreground tracking-wider">
              {selectedVideo ? `${t("vitasLab.videoLabel")}: ${selectedVideo.title.slice(0, 20)}` : t("vitasLab.noVideoSelected")}
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
            {t("vitasLab.supabaseNotConfigured")}
          </span>
        </div>
      )}
      {SUPABASE_CONFIGURED && !import.meta.env.VITE_BUNNY_CDN_HOSTNAME && videos.length === 0 && (
        <div className="px-4 py-1.5 bg-blue-500/10 border-b border-blue-500/30 flex items-center gap-2">
          <Activity size={14} className="text-blue-400 shrink-0" />
          <span className="text-[11px] font-display text-blue-400">
            {t("vitasLab.bunnyCdnNotConfigured")}
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
                {t(step.labelKey)}
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
                toast.error(t("vitasLab.selectPlayerAndVideoFirst"));
                return;
              }
              if (!canRunAnalysis) {
                setShowUpgradePrompt(true);
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
                    {t("vitasLab.reIdActive", { count: tracking.state.identities.size })}
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
                  {t("vitasLab.dorsalsAutoDetected")}
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
                {t("lab.jerseyHint")} · {t("vitasLab.autoDetectOnTracking")}
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
                const isTeamMode = mode.id === "team";
                const locked = isTeamMode && !isClub;
                return (
                  <button
                    key={mode.id}
                    onClick={() => {
                      if (locked) {
                        setShowUpgradePrompt(true);
                        return;
                      }
                      setSelectedMode(mode.id);
                    }}
                    className={`flex items-center gap-3 p-3 rounded-xl border text-left transition-all ${locked ? "opacity-60 border-border" : active ? "border-primary bg-primary/5" : "border-border hover:border-muted-foreground/30"}`}
                  >
                    <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${active ? "bg-primary/10" : "bg-secondary"}`}>
                      <Icon size={15} className={active ? "text-primary" : "text-muted-foreground"} />
                    </div>
                    <div className="flex-1">
                      <h4 className="font-display font-bold text-xs text-foreground">{t(mode.labelKey)}</h4>
                      <p className="text-[9px] text-muted-foreground leading-tight">{t(mode.descKey)}</p>
                    </div>
                    {locked && (
                      <span className="text-[8px] font-display font-bold uppercase tracking-wider text-primary bg-primary/10 px-1.5 py-0.5 rounded-full shrink-0">Club</span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* Panel de configuración según el modo seleccionado */}
            <div className="mt-3 space-y-2">

              {/* ALL PLAYERS — colores de equipos */}
              {selectedMode === "all" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.teamsConfig")}</p>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.homeTeamColor")}</label>
                    <input value={homeTeamColor} onChange={e => setHomeTeamColor(e.target.value)}
                      placeholder={t("vitasLab.homeColorPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.awayTeamColor")}</label>
                    <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                      placeholder={t("vitasLab.awayColorPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                </div>
              )}

              {/* CLICK-TO-TRACK — jugador específico manual */}
              {selectedMode === "click" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.playerToTrack")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.jerseyNumber")}</label>
                      <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                        placeholder="10" maxLength={3} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display font-bold focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.uniformColor")}</label>
                      <input value={teamColor} onChange={e => setTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorRedPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.playerNameOptional")}</label>
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                      placeholder={t("vitasLab.playerNamePlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.fieldPosition")}</label>
                    <select value={playerPosition} onChange={e => setPlayerPosition(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                      <option value="">{t("vitasLab.selectOption")}</option>
                      {["POR","LI","LD","CB","MCD","MC","MCO","EI","ED","DC","SD"].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{t("vitasLab.autoTrackHint")}</p>
                </div>
              )}

              {/* FULL TEAM — formaciones de ambos equipos */}
              {selectedMode === "team" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.tacticalContext")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.homeFormation")}</label>
                      <select value={homeFormation} onChange={e => setHomeFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2","4-1-4-1","3-4-3"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.awayFormation")}</label>
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
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.homeColor")}</label>
                      <input value={homeTeamColor} onChange={e => setHomeTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorWhitePlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.awayColor")}</label>
                      <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorRedPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{t("vitasLab.fullTeamHint")}</p>
                </div>
              )}

              {/* SPECIFIC PLAYER — jugador identificado por dorsal */}
              {selectedMode === "player" && (
                <div className="p-3 rounded-xl bg-secondary/40 border border-border space-y-2">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-wider text-muted-foreground">{t("vitasLab.playerProfile")}</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.jerseyNumberRequired")}</label>
                      <input value={jerseyNumber} onChange={e => setJerseyNumber(e.target.value)}
                        placeholder="10" maxLength={3} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display font-bold focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.uniformColorRequired")}</label>
                      <input value={teamColor} onChange={e => setTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorMaroonPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.name")}</label>
                    <input value={playerName} onChange={e => setPlayerName(e.target.value)}
                      placeholder={t("vitasLab.playerNameFieldPlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                  </div>
                  <div>
                    <label className="text-[9px] text-muted-foreground">{t("vitasLab.position")}</label>
                    <select value={playerPosition} onChange={e => setPlayerPosition(e.target.value)}
                      className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                      <option value="">{t("vitasLab.selectOption")}</option>
                      {["POR","LI","LD","CB","MCD","MC","MCO","EI","ED","DC","SD"].map(p => (
                        <option key={p} value={p}>{p}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.rivalTeamColor")}</label>
                      <input value={awayTeamColor} onChange={e => setAwayTeamColor(e.target.value)}
                        placeholder={t("vitasLab.colorBluePlaceholder")} className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50" />
                    </div>
                    <div>
                      <label className="text-[9px] text-muted-foreground">{t("vitasLab.ownFormation")}</label>
                      <select value={homeFormation} onChange={e => setHomeFormation(e.target.value)}
                        className="w-full mt-1 px-2 py-1.5 rounded-lg border border-border bg-background text-xs font-display focus:outline-none focus:border-primary/50">
                        {["4-3-3","4-4-2","4-2-3-1","3-5-2","5-3-2"].map(f => (
                          <option key={f} value={f}>{f}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <p className="text-[9px] text-muted-foreground">{t("vitasLab.specificPlayerRequiredHint")}</p>
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
                      {t("vitasLab.playedPositionInVideo")}
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
                        <option value="">{t("vitasLab.otherPosition")}</option>
                        {POSITIONS_FULL.filter((p) => !declared.includes(p)).map((p) => (
                          <option key={p} value={p}>{p}</option>
                        ))}
                      </select>
                    </div>
                    <p className="text-[9px] text-muted-foreground">
                      {t("vitasLab.defaultPositionHint")}
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
                calibrationConfidence={tracking.state.calibrationConfidence}
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
                     mediaPipe.status === "loading" ? t("vitasLab.loading") :
                     mediaPipe.status === "complete" ? t("vitasLab.completed") :
                     mediaPipe.status === "error" ? t("vitasLab.error") : t("vitasLab.waiting")}
                  </span>
                </div>
                {mediaPipe.biomechanics && (
                  <div className="grid grid-cols-3 gap-1.5">
                    <div className="text-center">
                      <p className="text-[8px] text-muted-foreground uppercase">DrillScore</p>
                      <p className="text-sm font-display font-black text-primary">{mediaPipe.biomechanics.drillScore}</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] text-muted-foreground uppercase">{t("vitasLab.symmetry")}</p>
                      <p className="text-sm font-display font-black text-green-500">{mediaPipe.biomechanics.bilateralSymmetry}%</p>
                    </div>
                    <div className="text-center">
                      <p className="text-[8px] text-muted-foreground uppercase">{t("vitasLab.risk")}</p>
                      <p className={`text-sm font-display font-black ${mediaPipe.biomechanics.injuryRisk > 50 ? "text-red-500" : "text-green-500"}`}>{mediaPipe.biomechanics.injuryRisk}</p>
                    </div>
                  </div>
                )}
                {eventSummary && eventSummary.totalEvents > 0 && (
                  <div className="pt-1 border-t border-border/50">
                    <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1">{t("vitasLab.tacticalEvents")}</p>
                    <div className="flex flex-wrap gap-1.5">
                      {eventSummary.passesAttempted > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-blue-500/10 text-blue-400">
                          {t("vitasLab.passesLabel")} {eventSummary.passesCompleted}/{eventSummary.passesAttempted}
                        </span>
                      )}
                      {eventSummary.duelsWon + eventSummary.duelsLost > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-orange-500/10 text-orange-400">
                          {t("vitasLab.duelsLabel")} {eventSummary.duelsWon}{t("vitasLab.wonAbbr")}/{eventSummary.duelsLost}{t("vitasLab.lostAbbr")}
                        </span>
                      )}
                      {eventSummary.recoveries > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-green-500/10 text-green-400">
                          {t("vitasLab.recoveriesAbbr")} {eventSummary.recoveries}
                        </span>
                      )}
                      {eventSummary.sprintBursts > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-red-500/10 text-red-400">
                          Sprints {eventSummary.sprintBursts}
                        </span>
                      )}
                      {eventSummary.shots > 0 && (
                        <span className="text-[9px] px-1.5 py-0.5 rounded bg-purple-500/10 text-purple-400">
                          {t("vitasLab.shotsLabel")} {eventSummary.shots}
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
                      title={t("vitasLab.heatmapPlayer", { id: tracking.state.focusTrackId })}
                    />
                  ) : null;
                }
                // Modo equipo: unir posiciones de todos los tracks
                const allPositions = tracking.state.currentTracks.flatMap(t => t.positions);
                return allPositions.length > 0 ? (
                  <PlayerHeatmap
                    positions={allPositions}
                    title={t("vitasLab.heatmapTeam", { count: tracking.state.currentTracks.length })}
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
                        playerName: selectedPlayer?.name ?? t("vitasLab.playerFallback"),
                        videoId: selectedVideoId,
                        date: new Date().toISOString().slice(0, 10),
                        durationSec: tracking.state.sessionMetrics!.distanceCoveredM / Math.max(0.1, tracking.state.sessionMetrics!.avgSpeedMs),
                        trackingFps: 8,
                        fieldDimensions: { lengthM: 105, widthM: 68 },
                        calibrationReliable: metricsTrustworthy(tracking.state.calibrationConfidence),
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
                    toast.success(t("vitasLab.exportedAs", { format: fmt.toUpperCase() }));
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
      <LabUploadPanel
        open={showUploadPanel}
        onClose={() => setShowUploadPanel(false)}
        videos={videos}
        players={players}
        selectedVideoId={selectedVideoId}
        onSelectVideo={setSelectedVideoId}
        onStartAnalysis={handleStartAnalysis}
      />

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
                        playerName: playerName || t("vitasLab.playerFallback"),
                        playerPosition: playerPosition || t("vitasLab.noPosition"),
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
                  <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("vitasLab.savedAnalyses")}</p>
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
                          {t("vitasLab.analysisCompletedLoad")}
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
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-1">{t("vitasLab.executiveSummary")}</p>
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
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-3">{t("vitasLab.analysisDimensions")}</p>
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
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.physicalMetrics")}</p>
                      <span className="text-[9px] font-display px-1.5 py-0.5 rounded-full bg-green-500/10 text-green-600 border border-green-500/20">
                        YOLO Tracking
                      </span>
                    </div>
                    <div className="grid grid-cols-3 gap-2">
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.maxSpeed")}</p>
                        <p className="text-lg font-display font-black text-yellow-500">{analysisReport.metricasCuantitativas.fisicas.velocidadMaxKmh}</p>
                        <p className="text-[9px] text-muted-foreground">km/h</p>
                      </div>
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.distance")}</p>
                        <p className="text-lg font-display font-black text-blue-500">{analysisReport.metricasCuantitativas.fisicas.distanciaM}</p>
                        <p className="text-[9px] text-muted-foreground">{t("vitasLab.meters")}</p>
                      </div>
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">Sprints</p>
                        <p className="text-lg font-display font-black text-orange-500">{analysisReport.metricasCuantitativas.fisicas.sprints}</p>
                        <p className="text-[9px] text-muted-foreground">&gt;21 km/h</p>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2 mt-2">
                      <div className="glass rounded-lg p-3 text-center">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.avgSpeed")}</p>
                        <p className="text-base font-display font-bold text-foreground">{analysisReport.metricasCuantitativas.fisicas.velocidadPromKmh} <span className="text-[9px] text-muted-foreground">km/h</span></p>
                      </div>
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">{t("vitasLab.intensity")}</p>
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
                          {[{l:t("vitasLab.zoneWalk"),c:"bg-slate-400"},{l:t("vitasLab.zoneJog"),c:"bg-blue-400"},{l:t("vitasLab.zoneRun"),c:"bg-orange-400"},{l:t("vitasLab.zoneSprint"),c:"bg-red-400"}].map(z => (
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
                    title={t("vitasLab.heatmapSession")}
                  />
                )}

                {/* ── Fatigue Analysis Panel ── */}
                <FatiguePanel report={fatigue.report} />

                {/* ── xG Panel (Sprint 6) ── */}
                <XgPanel
                  summary={xgSummary}
                  phvActive={!!selectedPlayer?.phvOffset}
                  phvOffset={selectedPlayer?.phvOffset ?? null}
                />

                {/* ── Analysis View Mode Toggle (Sprint 8) ── */}
                <div className="glass rounded-xl p-3">
                  <p className="text-[9px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">
                    {t("vitasLab.analysisMode")}
                  </p>
                  <div className="flex gap-1">
                    {([
                      { id: "player" as const, label: t("vitasLab.viewModePlayer"), icon: "👤" },
                      { id: "team" as const, label: t("vitasLab.viewModeTeam"), icon: "👥" },
                      { id: "rival" as const, label: t("vitasLab.viewModeRivalScout"), icon: "🔍" },
                    ]).map(m => (
                      <button
                        key={m.id}
                        onClick={() => {
                          setAnalysisViewMode(m.id);
                          if (m.id !== "player" && tracking.state.status === "complete") {
                            teamAnalysis.generateReports();
                          }
                        }}
                        className={`flex-1 flex items-center justify-center gap-1.5 py-2 rounded-lg text-[10px] font-display font-semibold transition-colors ${
                          analysisViewMode === m.id
                            ? "bg-primary/10 text-primary border border-primary/30"
                            : "bg-secondary/50 text-muted-foreground border border-border hover:text-foreground"
                        }`}
                      >
                        <span>{m.icon}</span>
                        {m.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* ── Team Dashboard (Sprint 8) ── */}
                {analysisViewMode !== "player" && (
                  <TeamDashboard
                    teamReport={teamAnalysis.teamReport}
                    homeFormation={teamAnalysis.homeFormation}
                    awayFormation={teamAnalysis.awayFormation}
                    rivalReport={teamAnalysis.rivalReport}
                    mode={analysisViewMode === "rival" ? "rival" : "team"}
                  />
                )}

                {/* Métricas de Eventos (Gemini observation) */}
                {analysisReport.metricasCuantitativas?.eventos && (
                  <div>
                    <div className="flex items-center gap-2 mb-3">
                      <Target size={14} className="text-blue-500" />
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.matchEvents")}</p>
                      <span className="text-[9px] font-display px-1.5 py-0.5 rounded-full bg-blue-500/10 text-blue-600 border border-blue-500/20">
                        {analysisReport.metricasCuantitativas.fuente === "yolo+gemini" ? t("vitasLab.trackingPlusIa") : t("vitasLab.iaObservation")}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      {/* Pases */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.passes")}</p>
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
                        <p className="text-[8px] text-muted-foreground mt-0.5">{analysisReport.metricasCuantitativas.eventos.precisionPases}% {t("vitasLab.accuracy")}</p>
                      </div>
                      {/* Duelos */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.duels")}</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-lg font-display font-black text-orange-500">
                            {analysisReport.metricasCuantitativas.eventos.duelosGanados}{t("vitasLab.wonAbbr")}
                          </span>
                          <span className="text-[9px] text-red-400">
                            / {analysisReport.metricasCuantitativas.eventos.duelosPerdidos}{t("vitasLab.lostAbbr")}
                          </span>
                        </div>
                      </div>
                      {/* Recuperaciones */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.recoveries")}</p>
                        <span className="text-lg font-display font-black text-blue-500">
                          {analysisReport.metricasCuantitativas.eventos.recuperaciones}
                        </span>
                      </div>
                      {/* Disparos */}
                      <div className="glass rounded-lg p-3">
                        <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.shots")}</p>
                        <div className="flex items-baseline gap-1 mt-1">
                          <span className="text-lg font-display font-black text-purple-500">
                            {analysisReport.metricasCuantitativas.eventos.disparosAlArco}
                          </span>
                          <span className="text-[9px] text-muted-foreground">
                            {t("vitasLab.onTarget")} / {analysisReport.metricasCuantitativas.eventos.disparosFuera} {t("vitasLab.offTarget")}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                {/* VAEP: disponible en future sprint con datos biomecánicos del pipeline GPU */}

                {/* ADN Futbolístico */}
                <div className="glass rounded-xl p-4">
                  <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground mb-2">{t("vitasLab.footballDna")}</p>
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
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.referencePlayer")}</p>
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
                    <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.careerProjection")}</p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="glass rounded-xl p-3 border border-green-500/20">
                      <p className="text-[9px] font-display uppercase tracking-wider text-green-600 mb-1">{t("vitasLab.optimistic")}</p>
                      <p className="text-xs font-display font-bold text-foreground">{analysisReport.proyeccionCarrera.escenarioOptimista.nivelProyecto}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{analysisReport.proyeccionCarrera.escenarioOptimista.descripcion}</p>
                    </div>
                    <div className="glass rounded-xl p-3 border border-border">
                      <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground mb-1">{t("vitasLab.realistic")}</p>
                      <p className="text-xs font-display font-bold text-foreground">{analysisReport.proyeccionCarrera.escenarioRealista.nivelProyecto}</p>
                      <p className="text-[10px] text-muted-foreground mt-1 leading-tight">{analysisReport.proyeccionCarrera.escenarioRealista.descripcion}</p>
                    </div>
                  </div>
                </div>

                {/* Plan de Desarrollo */}
                <div>
                  <div className="flex items-center gap-2 mb-3">
                    <Target size={14} className="text-primary" />
                    <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.developmentPlan")}</p>
                  </div>
                  <div className="space-y-2 mb-3">
                    <div className="glass rounded-lg px-3 py-2">
                      <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.goal6Months")}</p>
                      <p className="text-xs text-foreground mt-0.5">{analysisReport.planDesarrollo.objetivo6meses}</p>
                    </div>
                    <div className="glass rounded-lg px-3 py-2">
                      <p className="text-[9px] font-display uppercase tracking-wider text-muted-foreground">{t("vitasLab.goal18Months")}</p>
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
                    <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.searchDrills")}</p>
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
                      <p className="text-[10px] font-display font-semibold uppercase tracking-widest text-muted-foreground">{t("vitasLab.identifiedRisks")}</p>
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

                {/* CTA: el análisis no muere en el Lab — continúa en la ficha */}
                {selectedPlayerId && (
                  <motion.div
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ delay: 0.3, duration: 0.4 }}
                  >
                    <Button
                      onClick={() => navigate(`/players/${selectedPlayerId}?tab=stats`)}
                      className="w-full gap-2 font-display font-bold"
                    >
                      <TrendingUp size={15} />
                      {t("vitasLab.viewInProfile", {
                        name: selectedPlayer?.name ?? (playerName || t("vitasLab.playerFallback")),
                      })}
                      <ArrowRight size={15} />
                    </Button>
                  </motion.div>
                )}
              </div>
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Bottom Status Bar */}
      <LabStatusBar
        isProcessing={v2.isProcessing}
        pipelineStep={v2.state.step}
        mediaPipeStatus={mediaPipe.status}
        mediaPipeFps={mediaPipe.fps}
        mediaPipeFramesProcessed={mediaPipe.framesProcessed}
        totalEvents={eventSummary?.totalEvents}
      />
    </motion.div>

    {/* ── Upgrade Prompt Modal ── */}
    <UpgradePrompt
      feature={!canRunAnalysis ? t("vitasLab.featureIaAnalysis") : t("vitasLab.featureFullTeamMode")}
      requiredPlan={!canRunAnalysis ? (plan === "free" ? "pro" : "club") : "club"}
      currentUsage={!canRunAnalysis ? t("vitasLab.analysesUsed", { used: analysesUsed, total: limits.analyses >= 9999 ? "∞" : limits.analyses }) : undefined}
      variant="modal"
      open={showUpgradePrompt}
      onClose={() => setShowUpgradePrompt(false)}
    />
    </>
  );
};

export default VitasLab;
