/**
 * VITAS · useTracking Hook
 *
 * Hook React principal que orquesta el pipeline completo:
 *   Worker YOLO → Tracker → PoseAnalyzer → Voronoi → Métricas
 *
 * Uso:
 *   const { state, startTracking, stopTracking, focusTrackId } = useTracking({ ... })
 */

import { useState, useRef, useCallback, useEffect } from "react";
import { FrameExtractor, buildBunnyCdnUrl } from "@/lib/yolo/frameExtractor";
import { PoseAnalyzer }  from "@/lib/yolo/poseAnalyzer";
import { getActiveModel } from "@/lib/yolo/modelConfig";
import { getTilingConfig } from "@/lib/yolo/tiling";
import { getRecallConfig } from "@/lib/yolo/recallConfig";
import { computeVoronoi } from "@/lib/yolo/voronoi";
import { buildAnchors, computeHomography, invertMatrix3x3, identityHomography } from "@/lib/yolo/homography";
import {
  FIELD_ANCHOR_PRESETS,
  type Track,
  type ScanEvent,
  type DuelEvent,
  type VoronoiRegion,
  type PhysicalMetrics,
  type TrackingStatus,
  type FieldAnchorPreset,
  type WorkerEvent,
  type BallTrack,
} from "@/lib/yolo/types";
import { useBallTracking } from "./useBallTracking";
import type { BallTrackingState, PossessionTeam } from "./useBallTracking";
import { PlayerIdentityManager } from "@/lib/yolo/playerIdentityManager";
import { isTrackIdentityReliable } from "@/lib/yolo/tracker";
import { gated, derived, ORIENTATIVE_CONFIDENCE, type MetricResult } from "@/lib/metrics/MetricResult";
import { autoCalibrate as runAutoCalibrate } from "@/lib/tracking/autoCalibrationBridge";
import { autoCalibrationConfidence } from "@/lib/tracking/autoCalibrationConfidence";
import type { CalibrationConfidence } from "@/lib/yolo/fieldRegistration";
import type { PlayerIdentity } from "@/lib/yolo/playerIdentityManager";
import type { TeamLabel } from "@/lib/yolo/teamClassifier";

const TARGET_FPS     = 8;
const VORONOI_INTERVAL_MS = 500;
const FRAME_SIZE     = 640;

// ─── Tipos exportados ─────────────────────────────────────────────────────────

export interface TrackingState {
  status:          TrackingStatus;
  modelProgress:   number;
  progressMessage: string;
  currentTracks:   Track[];
  scanEvents:      ScanEvent[];
  duelEvents:      DuelEvent[];
  voronoiRegions:  VoronoiRegion[];
  focusTrackId:    number | null;
  sessionMetrics:  PhysicalMetrics | null;
  error:           string | null;
  /** Ball tracking state (Sprint 1) */
  ballTrack:       BallTrack | null;
  ballVisible:     boolean;
  ballSpeedMs:     number;
  possession:      PossessionTeam;
  /** Player identity map: trackId → PlayerIdentity (Sprint 4) */
  identities:      Map<number, PlayerIdentity>;
  /** Team assignments: trackId → "home"|"away" (Sprint 4) */
  teamAssignments: Map<number, "home" | "away">;
  /**
   * Confianza HONESTA de la calibración del campo (gate). Hoy la auto-calibración
   * es heurística → 'none'/'low' (metricsTrustworthy=false → métricas físicas "sin
   * calibrar"). Solo subirá con los validadores reales (T2) + modelo de campo (T3).
   */
  calibrationConfidence: CalibrationConfidence;
  /**
   * Cobertura de biomecánica del último frame (solo ruta detección-primero para
   * recall). Fracción de detecciones con píxeles suficientes para pose: los
   * lejanos aportan posición pero NO biomecánica. `null` fuera de esa ruta.
   * DERIVADA/orientativa. Ver `poseEligibility.ts`.
   */
  poseCoverage: MetricResult<number> | null;
}

/** Callback for fatigue integration: receives field positions each frame */
export type OnTrackingPositionCallback = (
  fx: number,
  fy: number,
  timestampMs: number,
) => void;

export interface UseTrackingOptions {
  videoId:          string;
  playerId:         string;
  calibrationPoints: Array<{ x: number; y: number }>;
  anchorPreset?:    FieldAnchorPreset;
  cdnHostname?:     string;
  localVideoSrc?:   string; // blob: URL for local videos (no Bunny CDN)
  /** Called every frame with the focused player's field position (for fatigue/useFatigue) */
  onTrackingPosition?: OnTrackingPositionCallback;
  /** Enable ball tracking in parallel (Sprint 1, default: true) */
  enableBallTracking?: boolean;
  /** Enable player re-identification (Sprint 4, default: true) */
  enableReId?: boolean;
  /** Enable auto-calibration via RANSAC + template matching (Sprint 5, default: false) */
  autoCalibrate?: boolean;
  /** Sprint 8: Team mode — track all players without a focus target */
  teamMode?: boolean;
}

// ─── Métricas vacías por defecto ──────────────────────────────────────────────

const EMPTY_METRICS: PhysicalMetrics = {
  maxSpeedMs: 0, avgSpeedMs: 0, distanceCoveredM: 0,
  sprintCount: 0, sprintDistanceM: 0, maxAccelMs2: 0,
  intensityZones: { walk: 0, jog: 0, run: 0, sprint: 0 },
  scanCount: 0, duelsWon: 0, duelsLost: 0, avgVoronoiAreaM2: 0,
  identityReliable: false,
  duels: gated("Sin sesión de tracking"),
  maxSpeed: gated("Sin sesión de tracking"),
  sprints: gated("Sin sesión de tracking"),
  avgSpeed: gated("Sin sesión de tracking"),
  distance: gated("Sin sesión de tracking"),
  space: gated("Sin sesión de tracking"),
  scans: gated("Sin sesión de tracking"),
  accel: gated("Sin sesión de tracking"),
};

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useTracking(options: UseTrackingOptions) {
  const { videoId, playerId, calibrationPoints, anchorPreset = "full_corners", cdnHostname, localVideoSrc, onTrackingPosition, enableBallTracking = true, enableReId = true, autoCalibrate: autoCalibOpt = false, teamMode = false } = options;
  const onTrackingPositionRef = useRef(onTrackingPosition);
  onTrackingPositionRef.current = onTrackingPosition;

  // Ball tracking (Sprint 1)
  const { ballState, startBallTracking, stopBallTracking, feedBallFrame, computePossession, ballStandaloneModeRef } = useBallTracking();
  const enableBallTrackingRef = useRef(enableBallTracking);
  enableBallTrackingRef.current = enableBallTracking;
  const feedBallFrameRef = useRef(feedBallFrame);
  feedBallFrameRef.current = feedBallFrame;

  // Auto-calibration ref (Sprint 5)
  const autoCalibrateRef = useRef(autoCalibOpt);
  autoCalibrateRef.current = autoCalibOpt;

  // Player Re-ID (Sprint 4)
  const identityManagerRef = useRef<PlayerIdentityManager>(new PlayerIdentityManager());
  const enableReIdRef = useRef(enableReId);
  enableReIdRef.current = enableReId;
  const identitiesRef = useRef<Map<number, PlayerIdentity>>(new Map());
  const teamAssignmentsRef = useRef<Map<number, "home" | "away">>(new Map());

  const [state, setState] = useState<TrackingState>({
    status:          "idle",
    modelProgress:   0,
    progressMessage: "",
    currentTracks:   [],
    scanEvents:      [],
    duelEvents:      [],
    voronoiRegions:  [],
    focusTrackId:    null,
    sessionMetrics:  null,
    error:           null,
    ballTrack:       null,
    ballVisible:     false,
    ballSpeedMs:     0,
    possession:      "none",
    identities:      new Map(),
    teamAssignments: new Map(),
    calibrationConfidence: "none",
    poseCoverage:    null,
  });

  const workerRef       = useRef<Worker | null>(null);
  const extractorRef    = useRef<FrameExtractor | null>(null);
  const analyzerRef     = useRef<PoseAnalyzer>(new PoseAnalyzer());
  const videoRef        = useRef<HTMLVideoElement | null>(null);
  const homographyRef   = useRef<Float64Array>(identityHomography());
  const homographyInvRef = useRef<Float64Array>(identityHomography());
  const voronoiTimerRef = useRef<number>(0);
  // G7: muestras de área Voronoi por track, tomadas en instantes VIVOS (roster real
  // simultáneo). Se promedian al cerrar la sesión → space por jugador, sin sesgo.
  const voronoiSamplesRef = useRef<Map<number, number[]>>(new Map());
  const scanEventsRef   = useRef<ScanEvent[]>([]);
  const duelEventsRef   = useRef<DuelEvent[]>([]);
  const allTracksRef    = useRef<Track[]>([]);
  const sessionStartRef = useRef<number>(0);
  // Refs to avoid stale closures in polling intervals
  const statusRef         = useRef<TrackingStatus>("idle");
  const errorRef          = useRef<string | null>(null);
  const focusTrackIdRef   = useRef<number | null>(null);

  // ── Actualizar homografía cuando cambian los puntos de calibración ──────────
  useEffect(() => {
    if (calibrationPoints.length < 4) return;
    const presetAnchors = FIELD_ANCHOR_PRESETS[anchorPreset];
    const vw = videoRef.current?.videoWidth  || 1280;
    const vh = videoRef.current?.videoHeight || 720;

    try {
      const anchors = buildAnchors(calibrationPoints, presetAnchors as unknown as Array<{field:{fx:number;fy:number}}>, vw, vh);
      const H    = computeHomography(anchors);
      const Hinv = invertMatrix3x3(H);
      homographyRef.current    = H;
      homographyInvRef.current = Hinv;
    } catch {
      // Si la calibración no es válida aún, mantener identidad
    }
  }, [calibrationPoints, anchorPreset]);

  // ── Inicializar Worker ───────────────────────────────────────────────────────
  const initWorker = useCallback(() => {
    if (workerRef.current) {
      workerRef.current.terminate();
    }

    const worker = new Worker(
      new URL("../workers/trackingWorker.ts", import.meta.url),
      { type: "module" }
    );

    worker.onmessage = (e: MessageEvent<WorkerEvent>) => {
      const event = e.data;

      switch (event.type) {
        case "PROGRESS":
          setState(s => ({
            ...s,
            modelProgress:   event.percent,
            progressMessage: event.message,
          }));
          break;

        case "READY":
          statusRef.current = "ready";
          setState(s => ({ ...s, status: "ready", modelProgress: 100 }));
          break;

        case "RESULT": {
          const tracks = event.tracks;
          allTracksRef.current = tracks;

          // Pose analysis (scanning + duels)
          const { scans, duels } = analyzerRef.current.analyzeTracks(
            tracks,
            event.timestampMs,
            TARGET_FPS
          );
          if (scans.length)  scanEventsRef.current  = [...scanEventsRef.current,  ...scans];
          if (duels.length)  duelEventsRef.current  = [...duelEventsRef.current,  ...duels];

          // Voronoi cada VORONOI_INTERVAL_MS
          let voronoiRegions: VoronoiRegion[] = [];
          if (event.timestampMs - voronoiTimerRef.current > VORONOI_INTERVAL_MS) {
            voronoiTimerRef.current = event.timestampMs;
            voronoiRegions = computeVoronoi(tracks, homographyInvRef.current);
            // G7: muestrea el área de cada celda en ESTE instante vivo (todos los
            // jugadores presentes) → base honesta para el promedio de sesión. NO se
            // reconstruye desde tracks muertos (sesgaría el área al alza).
            for (const r of voronoiRegions) {
              const arr = voronoiSamplesRef.current.get(r.trackId);
              if (arr) arr.push(r.areaM2);
              else voronoiSamplesRef.current.set(r.trackId, [r.areaM2]);
            }
          }

          // Emit focused player's field position to fatigue hook (every frame)
          if (onTrackingPositionRef.current && focusTrackIdRef.current !== null) {
            const focusTrack = tracks.find(t => t.id === focusTrackIdRef.current);
            if (focusTrack && focusTrack.positions.length > 0) {
              const lastPos = focusTrack.positions[focusTrack.positions.length - 1];
              onTrackingPositionRef.current(lastPos.fx, lastPos.fy, event.timestampMs);
            }
          }

          // Feed ball tracking worker with person bboxes for heuristic detection (Sprint 1)
          // FASE 2: solo en modo heurístico — en standalone el balón se alimenta
          // con imageData desde onFrame (inferencia dedicada en su worker)
          if (enableBallTrackingRef.current && !ballStandaloneModeRef.current && (event as Record<string, unknown>).personBboxes) {
            feedBallFrameRef.current({
              personBboxes: (event as Record<string, unknown>).personBboxes as Array<{ bbox: [number, number, number, number]; confidence: number }>,
              imgW: videoRef.current?.videoWidth ?? 1280,
              imgH: videoRef.current?.videoHeight ?? 720,
              homography: Array.from(homographyRef.current),
              timestampMs: event.timestampMs,
              frameIndex: event.frameIndex,
            });
          }

          // Player Re-ID: extract frame imageData and process identities (Sprint 4)
          let updatedIdentities: Map<number, PlayerIdentity> | undefined;
          if (enableReIdRef.current && videoRef.current && videoRef.current.readyState >= 2) {
            try {
              // Extract imageData from current video frame for identity processing
              // Rate-limited internally by PlayerIdentityManager (every 5th frame)
              const vid = videoRef.current;
              const idCanvas = document.createElement("canvas");
              idCanvas.width = vid.videoWidth;
              idCanvas.height = vid.videoHeight;
              const idCtx = idCanvas.getContext("2d");
              if (idCtx) {
                idCtx.drawImage(vid, 0, 0);
                const frameData = idCtx.getImageData(0, 0, idCanvas.width, idCanvas.height);
                const identityMap = identityManagerRef.current.processFrame(
                  tracks,
                  frameData,
                  event.timestampMs,
                );
                identitiesRef.current = identityMap;
                teamAssignmentsRef.current = identityManagerRef.current.getTeamMap();
                updatedIdentities = identityMap;
              }
            } catch {
              // Identity processing is non-critical — silently ignore errors
            }
          }

          setState(s => ({
            ...s,
            currentTracks:  tracks,
            scanEvents:     scanEventsRef.current,
            duelEvents:     duelEventsRef.current,
            ...(voronoiRegions.length ? { voronoiRegions } : {}),
            ...(updatedIdentities ? {
              identities: updatedIdentities,
              teamAssignments: teamAssignmentsRef.current,
            } : {}),
            // Cobertura de biomecánica del frame (solo ruta de recall)
            ...(event.poseCoverage ? { poseCoverage: event.poseCoverage } : {}),
          }));
          break;
        }

        case "ERROR":
          statusRef.current = "error";
          errorRef.current = event.message;
          setState(s => ({ ...s, status: "error", error: event.message }));
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, [ballStandaloneModeRef]);

  // ── startTracking ────────────────────────────────────────────────────────────
  const startTracking = useCallback(async (videoEl: HTMLVideoElement) => {
    videoRef.current = videoEl;
    scanEventsRef.current  = [];
    duelEventsRef.current  = [];
    allTracksRef.current   = [];
    sessionStartRef.current = Date.now();
    analyzerRef.current.reset();
    // G7: reinicia el muestreo de Voronoi (no arrastrar muestras de la sesión previa)
    voronoiTimerRef.current = 0;
    voronoiSamplesRef.current = new Map();

    setState(s => ({
      ...s,
      status:        "loading-model",
      modelProgress: 0,
      scanEvents:    [],
      duelEvents:    [],
      voronoiRegions: [],
      sessionMetrics: null,
      error:         null,
      ballTrack:     null,
      ballVisible:   false,
      ballSpeedMs:   0,
      possession:    "none",
      identities:    new Map(),
      teamAssignments: new Map(),
      poseCoverage:  null,
    }));

    // Reset identity manager (Sprint 4)
    identityManagerRef.current.reset();
    identitiesRef.current = new Map();
    teamAssignmentsRef.current = new Map();

    // Start ball tracking worker in parallel (Sprint 1)
    if (enableBallTracking) {
      startBallTracking();
    }

    // If the video is already loaded and ready, skip reload
    const isReady = videoEl.readyState >= 2 && videoEl.src && !videoEl.error;
    if (!isReady) {
      // Construir URL del video (local blob o Bunny CDN)
      let streamUrl: string;
      if (localVideoSrc) {
        streamUrl = localVideoSrc;
      } else {
        const hostname = cdnHostname || import.meta.env.VITE_BUNNY_CDN_HOSTNAME || "";
        streamUrl = buildBunnyCdnUrl(videoId, hostname, "mp4");
        videoEl.crossOrigin = "anonymous";
      }

      videoEl.src = streamUrl;
      videoEl.load();

      await new Promise<void>((resolve, reject) => {
        const onReady = () => { videoEl.removeEventListener("canplay", onReady); resolve(); };
        const onError = () => reject(new Error("No se pudo cargar el video"));
        videoEl.addEventListener("canplay", onReady);
        videoEl.addEventListener("error",   onError);
        setTimeout(() => reject(new Error("Timeout cargando video")), 15000);
      });
    }

    // Auto-calibrate via RANSAC + template matching (Sprint 5)
    if (autoCalibrateRef.current && videoEl.readyState >= 2) {
      try {
        const calibResult = await runAutoCalibrate(videoEl);
        if (calibResult.autoDetected && calibResult.confidence >= 0.5) {
          homographyRef.current = calibResult.H;
          homographyInvRef.current = calibResult.Hinv;
          console.log(`[useTracking] Auto-calibration: confidence=${calibResult.confidence.toFixed(2)}`);
        }
        // Gate HONESTO (T1): la auto-calibración es heurística → 'none'/'low', nunca
        // fiable para métricas en metros. La UI usará metricsTrustworthy para mostrar
        // "sin calibrar". El 'medium'/'high' llegará con T2 (validadores) + T3 (modelo).
        const cc = autoCalibrationConfidence(calibResult);
        setState((s) => ({ ...s, calibrationConfidence: cc }));
      } catch (err) {
        console.warn("[useTracking] Auto-calibration failed, using manual:", err);
      }
    }

    // Inicializar worker y cargar el modelo activo del registry
    // (device-aware: desktop → yolov11m-pose, móvil → yolov8n-pose;
    //  si el fichero no existe, el worker cae al nano local — nunca rompe)
    const worker = initWorker();
    const activeModel = getActiveModel();
    const modelUrl = activeModel.modelPath;
    // Tiling (SAHI) OPT-IN: null por defecto → tracking en vivo plano (sin regresión
    // de latencia). Solo se activa con override consciente en localStorage
    // `vitas_tiling` (pensado para análisis diferido; G² inferencias/frame).
    const tiling = getTilingConfig();
    // Detección-primero para recall (opt-in análisis diferido): el worker corre el
    // detector con tiling para la posición del equipo completo y la pose solo sobre
    // las cajas cercanas. null → ruta normal (sin regresión). Se coordina con el
    // tiling: si hay recall pero no tiling, el worker usa DEFAULT_RECALL_TILING.
    const recall = getRecallConfig();
    console.log(`[useTracking] Modelo activo: ${activeModel.id} (${modelUrl}, imgsz ${activeModel.inputSize})${tiling ? ` · tiling ${tiling.grid}×${tiling.grid}` : ""}${recall ? " · recall (detección-primero)" : ""}`);

    // inputSize del ModelSpec → el worker preprocessa/postprocessa a esa resolución
    // (los modelos @1280 de #26 necesitan esto; default 640 = comportamiento previo).
    worker.postMessage({ type: "INIT", modelUrl, inputSize: activeModel.inputSize, tiling, recall });

    // Esperar a que el modelo esté listo (use refs to avoid stale closure)
    await new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (statusRef.current === "ready") { clearInterval(check); resolve(); }
        if (statusRef.current === "error") { clearInterval(check); reject(new Error(errorRef.current ?? "Error")); }
      }, 200);
      setTimeout(() => { clearInterval(check); reject(new Error("Timeout cargando modelo")); }, 60000);
    });

    // Iniciar extracción de frames
    if (!extractorRef.current) extractorRef.current = new FrameExtractor();

    videoEl.play().catch(() => {});

    extractorRef.current.start({
      video:     videoEl,
      targetFps: TARGET_FPS,
      width:     FRAME_SIZE,
      height:    FRAME_SIZE,
      onFrame:   (imageData, timestampMs) => {
        if (!workerRef.current) return;
        const frameIndex = Math.round(timestampMs / (1000 / TARGET_FPS));
        workerRef.current.postMessage({
          type:       "FRAME",
          imageData,
          frameIndex,
          timestampMs,
          homography: Array.from(homographyRef.current),
        });

        // FASE 2 · balón standalone: inferencia dedicada en su propio worker.
        // Stride 2 (cada 2º frame) — el Kalman del BallTracker predice los gaps.
        if (
          enableBallTrackingRef.current &&
          ballStandaloneModeRef.current &&
          frameIndex % 2 === 0
        ) {
          feedBallFrameRef.current({
            imageData,
            imgW: imageData.width,
            imgH: imageData.height,
            // Aspecto del vídeo original: el frame se aplasta a 640×640 cuadrado
            // → el detector corrige el filtro de aspecto (bug del balón elíptico).
            srcAspect:
              (videoRef.current?.videoWidth ?? 1280) /
              (videoRef.current?.videoHeight ?? 720),
            homography: Array.from(homographyRef.current),
            timestampMs,
            frameIndex,
          });
        }
      },
    });

    setState(s => ({ ...s, status: "tracking" }));
  }, [videoId, cdnHostname, initWorker, localVideoSrc, enableBallTracking, startBallTracking, ballStandaloneModeRef]);

  // ── stopTracking ─────────────────────────────────────────────────────────────
  const stopTracking = useCallback((): PhysicalMetrics => {
    extractorRef.current?.stop();
    videoRef.current?.pause();

    // Calcular métricas de sesión para el track enfocado (use ref to avoid stale closure)
    const metrics = computeSessionMetrics(
      allTracksRef.current,
      focusTrackIdRef.current,
      scanEventsRef.current,
      duelEventsRef.current,
      voronoiSamplesRef.current
    );

    // Stop ball tracking worker (Sprint 1)
    if (enableBallTracking) {
      stopBallTracking();
    }

    setState(s => ({ ...s, status: "complete", sessionMetrics: metrics }));
    return metrics;
  }, [enableBallTracking, stopBallTracking]); // uses refs + ball tracking

  // ── pauseTracking / resumeTracking ───────────────────────────────────────────
  const pauseTracking = useCallback(() => {
    videoRef.current?.pause();
    setState(s => ({ ...s, status: "paused" }));
  }, []);

  const resumeTracking = useCallback(() => {
    videoRef.current?.play().catch(() => {});
    setState(s => ({ ...s, status: "tracking" }));
  }, []);

  // ── setFocusTrackId ──────────────────────────────────────────────────────────
  const setFocusTrackId = useCallback((id: number | null) => {
    focusTrackIdRef.current = id;
    setState(s => ({ ...s, focusTrackId: id }));
  }, []);

  // ── Sync ball state into tracking state ──────────────────────────────────────
  useEffect(() => {
    if (!enableBallTracking) return;
    setState(s => ({
      ...s,
      ballTrack: ballState.ballTrack,
      ballVisible: ballState.ballVisible,
      ballSpeedMs: ballState.ballSpeedMs,
      possession: ballState.possession.team,
    }));
  }, [ballState.ballTrack, ballState.ballVisible, ballState.ballSpeedMs, ballState.possession.team, enableBallTracking]);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      extractorRef.current?.stop();
      workerRef.current?.terminate();
      stopBallTracking();
    };
  }, [stopBallTracking]);

  /** Get the focused player's field positions for fatigue analysis */
  const getFocusPositions = useCallback(() => {
    const focusId = focusTrackIdRef.current;
    if (!focusId) return [];
    const focusTracks = allTracksRef.current.filter(t => t.id === focusId);
    return focusTracks.flatMap(t =>
      t.positions.map(p => ({ x: p.fx, y: p.fy, timestampMs: p.timestampMs })),
    );
  }, []);

  return {
    state,
    homographyInv:  homographyInvRef.current,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    setFocusTrackId,
    getFocusPositions,
    /** Ball tracking state (Sprint 1) */
    ballState,
    /** Compute possession from ball + player positions (Sprint 1) */
    computePossession,
  };
}

// ─── Calcular métricas de sesión ──────────────────────────────────────────────

// Umbrales de sprint (m/s / s). ENTER/EXIT con HISTÉRESIS para no contar oscilaciones
// alrededor del umbral; MIN_DURATION descarta picos de 1-2 frames. Procedencia:
// 5.83 m/s (= 21 km/h) es umbral común en fútbol juvenil; EXIT e MIN_DURATION son
// "pendiente de validar" (sin cita) → por eso `sprints` lleva confidence reducida.
// (G2 · contrato .claude/rules/metricas.md)
const SPRINT_ENTER_MS = 5.83;
const SPRINT_EXIT_MS = 5.0;
const SPRINT_MIN_DURATION_S = 1.0;

/** Cuenta EVENTOS de sprint de un track (no frames): un tramo continuo por encima
 *  del umbral que dura al menos SPRINT_MIN_DURATION_S. Corrige el bug de G1 donde
 *  `sprintCount` sumaba frames (un sprint de 2 s a 8 fps ≈ 16). (G2) */
function countSprintEvents(track: Track): number {
  let events = 0;
  let inSprint = false;
  let startMs = 0;
  const closeIfLongEnough = (endMs: number) => {
    if (inSprint && (endMs - startMs) / 1000 >= SPRINT_MIN_DURATION_S) events++;
    inSprint = false;
  };
  for (let i = 1; i < track.positions.length; i++) {
    const a = track.positions[i - 1];
    const b = track.positions[i];
    const dt = (b.timestampMs - a.timestampMs) / 1000;
    if (dt <= 0) continue;
    const v = Math.hypot(b.fx - a.fx, b.fy - a.fy) / dt;
    if (!inSprint && v >= SPRINT_ENTER_MS) {
      inSprint = true;
      startMs = a.timestampMs;
    } else if (inSprint && v < SPRINT_EXIT_MS) {
      closeIfLongEnough(a.timestampMs);
    }
  }
  if (inSprint && track.positions.length > 0) {
    closeIfLongEnough(track.positions[track.positions.length - 1].timestampMs);
  }
  return events;
}

/** Percentil p (0-100) sobre una lista de valores. Robusto a outliers para el pico
 *  de velocidad de la sesión (G2). Devuelve 0 si no hay muestras. */
function percentile(values: number[], p: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

export function computeSessionMetrics(
  tracks:       Track[],
  focusId:      number | null,
  scans:        ScanEvent[],
  duels:        DuelEvent[],
  voronoiSamples: Map<number, number[]> = new Map()
): PhysicalMetrics {
  // Si hay un track enfocado, usar sus métricas; si no, promediar todos
  const focusTracks = focusId
    ? tracks.filter(t => t.id === focusId)
    : tracks;

  if (focusTracks.length === 0) return EMPTY_METRICS;

  // Gate fail-closed de atribución (#24): las métricas solo son atribuibles a un
  // jugador si la identidad del/los track(s) fue fiable (asociación mayormente IoU
  // fuerte). Si no, un ID-switch pudo mezclar jugadores → no presentar como medidas.
  const identityReliable = focusTracks.every(isTrackIdentityReliable);

  // Velocidad máx/media desde las MUESTRAS de velocidad de la sesión (derivadas de las
  // posiciones de campo), no del último frame. Corrige el bug de agregación de G1:
  //  · máx = percentil 95 (rechaza spikes de jitter), NO Math.max del frame final.
  //  · media = media temporal de las muestras, NO la velocidad suavizada al final.
  // Clamp fisiológico 12.5 m/s (= 45 km/h, el mismo tope del tracker) contra outliers. (G2)
  const speedSamples: number[] = [];
  for (const track of focusTracks) {
    for (let i = 1; i < track.positions.length; i++) {
      const a = track.positions[i - 1], b = track.positions[i];
      const dt = (b.timestampMs - a.timestampMs) / 1000;
      if (dt <= 0) continue;
      speedSamples.push(Math.min(12.5, Math.hypot(b.fx - a.fx, b.fy - a.fy) / dt));
    }
  }
  const maxSpeed = percentile(speedSamples, 95);
  const avgSpeed = speedSamples.length
    ? speedSamples.reduce((s, v) => s + v, 0) / speedSamples.length
    : 0;
  const distance = focusTracks.reduce((s, t) => s + t.distanceM, 0);
  // Sprints como EVENTOS (no frames): tramos continuos sobre umbral con duración
  // mínima e histéresis. Antes sumaba t.sprintCount (frames) → inflaba x10-x16. (G2)
  const sprints  = focusTracks.reduce((s, t) => s + countSprintEvents(t), 0);

  const focusScans = scans.filter(s => !focusId || s.trackId === focusId);
  const focusDuels = duels.filter(d => !focusId || d.trackIds.includes(focusId));

  // ¿Se pudo medir biomecánica del jugador enfocado en ALGÚN frame? En la ruta
  // detección-primero (recall, opt-in) un jugador siempre lejano es solo-posición:
  // keypoints:[] en TODOS los frames → poseFrameCount === 0. Entonces focusScans está
  // vacío no porque no escaneara, sino porque NUNCA se pudo mirar → un `scans` de 0
  // sería "el 0 que significa no-medido", prohibido por el invariante #2. Fail-closed:
  // solo se considera medible si algún focusTrack tuvo al menos un frame con keypoints.
  const poseNeverMeasured = focusTracks.every(t => (t.poseFrameCount ?? 0) === 0);

  // G7: espacio = área media de la celda Voronoi del jugador enfocado, muestreada en
  // instantes VIVOS (roster real simultáneo, en useTracking.onFrame). Sin muestras
  // para ese jugador → null (se gatea; nunca un 0 que signifique "no medido").
  const focusVoronoi = focusId ? (voronoiSamples.get(focusId) ?? []) : [];
  const avgVoronoi = focusVoronoi.length
    ? focusVoronoi.reduce((s, v) => s + v, 0) / focusVoronoi.length
    : null;

  // Calcular zonas de intensidad desde posiciones
  const zones = { walk: 0, jog: 0, run: 0, sprint: 0 };
  for (const track of focusTracks) {
    for (let i = 1; i < track.positions.length; i++) {
      const p1 = track.positions[i - 1];
      const p2 = track.positions[i];
      const dt = (p2.timestampMs - p1.timestampMs) / 1000;
      const dx = p2.fx - p1.fx;
      const dy = p2.fy - p1.fy;
      const d  = Math.sqrt(dx*dx + dy*dy);
      const v  = dt > 0 ? d / dt : 0;
      if      (v < 2)    zones.walk   += d;
      else if (v < 4)    zones.jog    += d;
      else if (v < 5.83) zones.run    += d;
      else               zones.sprint += d;
    }
  }

  return {
    maxSpeedMs:       maxSpeed,
    avgSpeedMs:       avgSpeed,
    distanceCoveredM: distance,
    sprintCount:      sprints,
    sprintDistanceM:  zones.sprint,
    maxAccelMs2:      Math.max(...focusTracks.map(t => t.accelMs2), 0),
    intensityZones:   zones,
    scanCount:        focusScans.length,
    duelsWon:         focusDuels.filter(d => d.winnerId === focusId).length,
    duelsLost:        focusDuels.filter(d => d.winnerId !== null && d.winnerId !== focusId).length,
    avgVoronoiAreaM2: avgVoronoi ?? 0, // vivo: componente; sesión: media muestreada (G7)
    identityReliable,
    // Duelos G/P BLOQUEADOS: winnerId nunca se resuelve en la ruta tracking (poseAnalyzer
    // deja winnerId=null) → won/lost serían siempre 0. Honesto: gated, no "0G/0P". (G3)
    duels:            gated("Ganador de duelo no calculado (pendiente G3)"),
    // Físicas envueltas en MetricResult (G1). DERIVADA + orientativa (confidence baja):
    // sin calibración certificada son píxeles reescalados. Valores idénticos a los
    // campos numéricos de arriba; el gate por calibración y el pico p95 son G2.
    maxSpeed:         derived(maxSpeed, { units: "m/s", calibrated: false, confidence: ORIENTATIVE_CONFIDENCE }),
    sprints:          derived(sprints,  { units: null,  calibrated: false, confidence: ORIENTATIVE_CONFIDENCE }),
    avgSpeed:         derived(avgSpeed, { units: "m/s", calibrated: false, confidence: ORIENTATIVE_CONFIDENCE }),
    distance:         derived(distance, { units: "m",   calibrated: false, confidence: ORIENTATIVE_CONFIDENCE }),
    // Espacio/Voronoi de sesión (G7): media de las muestras vivas del jugador enfocado.
    // DERIVADA orientativa (depende de homografía, calibrated:false). Sin muestras (ej.
    // jugador nunca presente en un instante Voronoi, o sin enfocado) → gated, nunca 0.
    space:            avgVoronoi !== null
      ? derived(avgVoronoi, { units: "m²", calibrated: false, confidence: ORIENTATIVE_CONFIDENCE })
      : gated("Voronoi de sesión sin muestras para este jugador"),
    // Escaneos BLOQUEADOS si el jugador enfocado nunca tuvo frames con keypoints (siempre
    // lejano en la ruta recall): la biomecánica no fue medible, solo la posición. NO se
    // emite derived(0) — sería el "0 que significa no-medido" (invariante #2). En la ruta
    // pose normal poseFrameCount>0 siempre → se mantiene el valor derivado. (kill-58 recall)
    scans:            poseNeverMeasured
      ? gated("Jugador sin frames cercanos: biomecánica no medible, solo posición")
      : derived(focusScans.length, { units: null, calibrated: false, confidence: ORIENTATIVE_CONFIDENCE }),
    accel:            derived(Math.max(...focusTracks.map(t => t.accelMs2), 0), { units: "m/s²", calibrated: false, confidence: ORIENTATIVE_CONFIDENCE }),
  };
}
