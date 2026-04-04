/**
 * VITAS · YOLO Tracking — Core Types
 * Tipos base para el sistema de tracking real con YOLOv8n-pose
 */

// ─── Coordenadas ──────────────────────────────────────────────────────────────

export interface PixelPoint  { px: number; py: number }
export interface FieldPoint  { fx: number; fy: number }   // metros (0-105, 0-68)

// ─── Keypoints COCO-17 ────────────────────────────────────────────────────────
// 0=nariz 1=ojoIzq 2=ojoDer 3=orejaIzq 4=orejaDer
// 5=hombroIzq 6=hombroDer 7=codoIzq 8=codoDer 9=muñecaIzq 10=muñecaDer
// 11=caderaIzq 12=caderaDer 13=rodillaIzq 14=rodillaDer 15=tobilloIzq 16=tobilloDer

export interface Keypoint {
  x: number;          // píxeles en espacio original del video
  y: number;
  confidence: number; // 0-1
}

// ─── Detección raw de YOLO ────────────────────────────────────────────────────

export interface Detection {
  bbox:       [number, number, number, number]; // [x, y, w, h] en píxeles
  confidence: number;
  keypoints:  Keypoint[];  // 17 keypoints COCO
}

// ─── Track (jugador seguido entre frames) ────────────────────────────────────

export interface FieldPosition {
  fx:          number;
  fy:          number;
  timestampMs: number;
}

export interface Track {
  id:           number;
  bbox:         [number, number, number, number];
  keypoints:    Keypoint[];
  age:          number;       // frames sin match (0 = activo)
  positions:    FieldPosition[];  // historial de posiciones en campo
  lastFieldPos: FieldPoint | null;
  // Métricas calculadas en tiempo real
  speedMs:      number;       // velocidad actual m/s
  smoothSpeedMs: number;      // velocidad suavizada (EMA)
  accelMs2:     number;       // aceleración m/s²
  distanceM:    number;       // distancia acumulada en metros
  sprintCount:  number;
}

// ─── Métricas físicas finales ─────────────────────────────────────────────────

export interface IntensityZones {
  walk:     number;  // 0-2 m/s   → metros recorridos
  jog:      number;  // 2-4 m/s
  run:      number;  // 4-5.83 m/s
  sprint:   number;  // >5.83 m/s (>21 km/h)
}

export interface PhysicalMetrics {
  maxSpeedMs:       number;
  avgSpeedMs:       number;
  distanceCoveredM: number;
  sprintCount:      number;
  sprintDistanceM:  number;
  maxAccelMs2:      number;
  intensityZones:   IntensityZones;
  scanCount:        number;
  duelsWon:         number;
  duelsLost:        number;
  avgVoronoiAreaM2: number;
}

// ─── Eventos ──────────────────────────────────────────────────────────────────

export interface ScanEvent {
  trackId:     number;
  timestampMs: number;
  direction:   "left" | "right";
  durationMs:  number;
}

export interface DuelEvent {
  trackIds:    [number, number];
  timestampMs: number;
  fieldPos:    FieldPoint;
  type:        "aerial" | "ground";
  winnerId:    number | null;  // null si no determinado
}

// ─── Voronoi ──────────────────────────────────────────────────────────────────

export interface VoronoiRegion {
  trackId:      number;
  fieldPos:     FieldPoint;
  areaM2:       number;
  pixelPolygon: [number, number][];
}

// ─── Worker messages ──────────────────────────────────────────────────────────

export type WorkerCommand =
  | { type: "INIT";  modelUrl: string }
  | { type: "FRAME"; imageData: ImageData; frameIndex: number; timestampMs: number; homography: number[] }
  | { type: "RESET" }

export type WorkerEvent =
  | { type: "READY" }
  | { type: "PROGRESS"; percent: number; message: string }
  | { type: "RESULT"; frameIndex: number; timestampMs: number; tracks: Track[] }
  | { type: "ERROR"; message: string }

// ─── Calibración del campo ────────────────────────────────────────────────────

export interface CalibrationAnchor {
  pixel: PixelPoint;
  field: FieldPoint;
}

// Presets de posiciones reales del campo (FIFA standard 105×68m)
export const FIELD_ANCHOR_PRESETS = {
  "full_corners": [
    { field: { fx: 0,    fy: 0  } },  // P1 → esquina sup-izq
    { field: { fx: 105,  fy: 0  } },  // P2 → esquina sup-der
    { field: { fx: 105,  fy: 68 } },  // P3 → esquina inf-der
    { field: { fx: 0,    fy: 68 } },  // P4 → esquina inf-izq
  ],
  "penalty_near": [
    { field: { fx: 0,   fy: 13.84 } },  // P1 → poste izq área
    { field: { fx: 16.5, fy: 13.84 } }, // P2 → borde der área
    { field: { fx: 16.5, fy: 54.16 } }, // P3 → borde der área inf
    { field: { fx: 0,   fy: 54.16 } },  // P4 → poste izq área inf
  ],
  "center_line": [
    { field: { fx: 52.5, fy: 0  } },  // P1 → centro línea sup
    { field: { fx: 105,  fy: 0  } },  // P2 → esquina sup-der
    { field: { fx: 105,  fy: 68 } },  // P3 → esquina inf-der
    { field: { fx: 52.5, fy: 68 } },  // P4 → centro línea inf
  ],
} as const;

export type FieldAnchorPreset = keyof typeof FIELD_ANCHOR_PRESETS;

// ─── Estado del tracking ──────────────────────────────────────────────────────

export type TrackingStatus =
  | "idle"
  | "loading-model"
  | "ready"
  | "tracking"
  | "paused"
  | "complete"
  | "error";

export interface TrackingSession {
  id:              string;
  userId:          string;
  playerId:        string;
  videoId:         string;
  targetTrackId:   number;
  durationMs:      number;
  metrics:         PhysicalMetrics;
  scanEvents:      ScanEvent[];
  duelEvents:      DuelEvent[];
  calibrationPreset: FieldAnchorPreset;
  createdAt:       string;
}
