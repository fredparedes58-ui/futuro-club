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
} from "@/lib/yolo/types";

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
}

export interface UseTrackingOptions {
  videoId:          string;
  playerId:         string;
  calibrationPoints: Array<{ x: number; y: number }>;
  anchorPreset?:    FieldAnchorPreset;
  cdnHostname?:     string;
}

// ─── Métricas vacías por defecto ──────────────────────────────────────────────

const EMPTY_METRICS: PhysicalMetrics = {
  maxSpeedMs: 0, avgSpeedMs: 0, distanceCoveredM: 0,
  sprintCount: 0, sprintDistanceM: 0, maxAccelMs2: 0,
  intensityZones: { walk: 0, jog: 0, run: 0, sprint: 0 },
  scanCount: 0, duelsWon: 0, duelsLost: 0, avgVoronoiAreaM2: 0,
};

// ─── Hook principal ───────────────────────────────────────────────────────────

export function useTracking(options: UseTrackingOptions) {
  const { videoId, playerId, calibrationPoints, anchorPreset = "full_corners", cdnHostname } = options;

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
  });

  const workerRef       = useRef<Worker | null>(null);
  const extractorRef    = useRef<FrameExtractor | null>(null);
  const analyzerRef     = useRef<PoseAnalyzer>(new PoseAnalyzer());
  const videoRef        = useRef<HTMLVideoElement | null>(null);
  const homographyRef   = useRef<Float64Array>(identityHomography());
  const homographyInvRef = useRef<Float64Array>(identityHomography());
  const voronoiTimerRef = useRef<number>(0);
  const scanEventsRef   = useRef<ScanEvent[]>([]);
  const duelEventsRef   = useRef<DuelEvent[]>([]);
  const allTracksRef    = useRef<Track[]>([]);
  const sessionStartRef = useRef<number>(0);

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
          }

          setState(s => ({
            ...s,
            currentTracks:  tracks,
            scanEvents:     scanEventsRef.current,
            duelEvents:     duelEventsRef.current,
            ...(voronoiRegions.length ? { voronoiRegions } : {}),
          }));
          break;
        }

        case "ERROR":
          setState(s => ({ ...s, status: "error", error: event.message }));
          break;
      }
    };

    workerRef.current = worker;
    return worker;
  }, []);

  // ── startTracking ────────────────────────────────────────────────────────────
  const startTracking = useCallback(async (videoEl: HTMLVideoElement) => {
    videoRef.current = videoEl;
    scanEventsRef.current  = [];
    duelEventsRef.current  = [];
    allTracksRef.current   = [];
    sessionStartRef.current = Date.now();
    analyzerRef.current.reset();

    setState(s => ({
      ...s,
      status:        "loading-model",
      modelProgress: 0,
      scanEvents:    [],
      duelEvents:    [],
      voronoiRegions: [],
      sessionMetrics: null,
      error:         null,
    }));

    // Construir URL del video
    const hostname = cdnHostname || import.meta.env.VITE_BUNNY_CDN_HOSTNAME || "";
    const streamUrl = buildBunnyCdnUrl(videoId, hostname, "mp4");

    // Configurar el video element
    videoEl.crossOrigin = "anonymous";
    videoEl.src         = streamUrl;
    videoEl.load();

    // Esperar a que el video esté listo
    await new Promise<void>((resolve, reject) => {
      const onReady = () => { videoEl.removeEventListener("canplay", onReady); resolve(); };
      const onError = () => reject(new Error("No se pudo cargar el video desde Bunny CDN"));
      videoEl.addEventListener("canplay", onReady);
      videoEl.addEventListener("error",   onError);
      setTimeout(() => reject(new Error("Timeout cargando video")), 15000);
    });

    // Inicializar worker y cargar modelo
    // Prioridad: 1) Bunny CDN, 2) public/ local, 3) HuggingFace público
    const worker = initWorker();
    const modelUrl = hostname
      ? `https://${hostname}/models/yolov8n-pose.onnx`
      : "/models/yolov8n-pose.onnx";
    // Nota: si el modelo no existe en Bunny ni en public/, usar fallback público
    // El usuario debe subir yolov8n-pose.onnx a Bunny CDN /models/ o a public/models/

    worker.postMessage({ type: "INIT", modelUrl });

    // Esperar a que el modelo esté listo
    await new Promise<void>((resolve, reject) => {
      const check = setInterval(() => {
        if (state.status === "ready") { clearInterval(check); resolve(); }
        if (state.status === "error") { clearInterval(check); reject(new Error(state.error ?? "Error")); }
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
        workerRef.current.postMessage({
          type:       "FRAME",
          imageData,
          frameIndex: Math.round(timestampMs / (1000 / TARGET_FPS)),
          timestampMs,
          homography: Array.from(homographyRef.current),
        });
      },
    });

    setState(s => ({ ...s, status: "tracking" }));
  }, [videoId, cdnHostname, initWorker, state.status, state.error]);

  // ── stopTracking ─────────────────────────────────────────────────────────────
  const stopTracking = useCallback((): PhysicalMetrics => {
    extractorRef.current?.stop();
    videoRef.current?.pause();

    // Calcular métricas de sesión para el track enfocado
    const metrics = computeSessionMetrics(
      allTracksRef.current,
      state.focusTrackId,
      scanEventsRef.current,
      duelEventsRef.current
    );

    setState(s => ({ ...s, status: "complete", sessionMetrics: metrics }));
    return metrics;
  }, [state.focusTrackId]);

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
    setState(s => ({ ...s, focusTrackId: id }));
  }, []);

  // ── Cleanup ──────────────────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      extractorRef.current?.stop();
      workerRef.current?.terminate();
    };
  }, []);

  return {
    state,
    homographyInv:  homographyInvRef.current,
    startTracking,
    stopTracking,
    pauseTracking,
    resumeTracking,
    setFocusTrackId,
  };
}

// ─── Calcular métricas de sesión ──────────────────────────────────────────────

function computeSessionMetrics(
  tracks:       Track[],
  focusId:      number | null,
  scans:        ScanEvent[],
  duels:        DuelEvent[]
): PhysicalMetrics {
  // Si hay un track enfocado, usar sus métricas; si no, promediar todos
  const focusTracks = focusId
    ? tracks.filter(t => t.id === focusId)
    : tracks;

  if (focusTracks.length === 0) return EMPTY_METRICS;

  const speeds   = focusTracks.map(t => t.smoothSpeedMs).filter(s => s > 0);
  const maxSpeed = Math.max(...focusTracks.map(t => t.speedMs), 0);
  const avgSpeed = speeds.length ? speeds.reduce((a, b) => a + b, 0) / speeds.length : 0;
  const distance = focusTracks.reduce((s, t) => s + t.distanceM, 0);
  const sprints  = focusTracks.reduce((s, t) => s + t.sprintCount, 0);

  const focusScans = scans.filter(s => !focusId || s.trackId === focusId);
  const focusDuels = duels.filter(d => !focusId || d.trackIds.includes(focusId));

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
    avgVoronoiAreaM2: 0, // se calcula en el componente desde voronoiRegions
  };
}
