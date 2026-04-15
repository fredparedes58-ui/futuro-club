/**
 * VITAS · Video Metrics Extractor
 *
 * Extrae inputs para VAEP / SPADL / Biomechanics desde el informe
 * estructurado generado por el agente de análisis de video (Gemini + Claude).
 *
 * Esto REEMPLAZA la necesidad de GPS físico (Catapult / StatSports) en el MVP:
 * el video analizado por IA aporta las acciones, posiciones aproximadas y
 * patrones de movimiento necesarios para calcular las métricas avanzadas.
 *
 * Flujo:
 *   Video MP4 → Gemini (extrae eventos) → Claude (estructura JSON)
 *              → VideoMetricsExtractor → SPADLAction[] / TrackingInput / BiomechanicsInput
 *              → advancedMetricsService (calcula VAEP/SPADL/Biomechanics)
 */
import type {
  SPADLAction,
  VAEPInput,
  TrackingInput,
  BiomechanicsInput,
} from "./advancedMetricsService";

// ─── Schema esperado del agente de video ────────────────────────────────────

/** Estructura de eventos que el agente de video debe producir. */
export interface VideoObservationPacket {
  /** Duración del clip analizado (segundos) */
  durationSec: number;
  /** Minutos jugados (puede ser menor si el clip no cubre todo) */
  minutesPlayed: number;
  /** Eventos detectados en orden cronológico */
  events: VideoEvent[];
  /** Métricas de posicionamiento estimadas por Gemini */
  positioning?: VideoPositioning;
  /** Métricas biomecánicas observadas */
  biomechanics?: VideoBiomechanicsObservation;
}

export interface VideoEvent {
  /** Tiempo en segundos desde el inicio del clip */
  tSec: number;
  /** Tipo de acción */
  type:
    | "pass" | "dribble" | "shot" | "cross"
    | "tackle" | "interception" | "clearance" | "foul"
    | "reception" | "header" | "run";
  /** Resultado de la acción */
  result: "success" | "fail";
  /** Zona del campo origen (propio / medio / rival · izq / centro / der) */
  fromZone?: FieldZoneApprox;
  /** Zona del campo destino */
  toZone?: FieldZoneApprox;
  /** Riesgo/impacto percibido (0-1) */
  impact?: number;
  /** Confianza de la detección (0-1) */
  confidence?: number;
}

export type FieldZoneApprox =
  | "def-left" | "def-center" | "def-right"
  | "mid-left" | "mid-center" | "mid-right"
  | "att-left" | "att-center" | "att-right";

export interface VideoPositioning {
  /** Zona media donde se posicionó el jugador (la más frecuente) */
  dominantZone?: FieldZoneApprox;
  /** Distribución de tiempo por zona (0-1 cada una, suman ≤1) */
  zoneDistribution?: Partial<Record<FieldZoneApprox, number>>;
  /** Velocidad máxima estimada por IA (m/s) — aproximación visual */
  estimatedMaxSpeedMs?: number;
  /** Nº de sprints detectados (carreras explosivas largas) */
  sprintCount?: number;
  /** Distancia total estimada (m) — muy aproximada */
  estimatedDistanceM?: number;
}

export interface VideoBiomechanicsObservation {
  /** Asimetría bilateral observada (0-100, mayor = más asimetría) */
  bilateralAsymmetryObserved?: number;
  /** Eficiencia de movimientos (0-1) */
  movementEfficiency?: number;
  /** Señales de fatiga detectadas */
  fatigueSignals?: boolean;
  /** Uso de pie dominante (%) */
  dominantFootUsagePct?: number;
}

// ─── Mapeo de zonas a coordenadas de campo ──────────────────────────────────

/**
 * Convierte zona aproximada (9 celdas) a coordenadas (x, y) en metros.
 * Campo estándar: 105m x 68m. Atacando hacia x=105.
 */
const ZONE_COORDS: Record<FieldZoneApprox, { x: number; y: number }> = {
  "def-left":   { x: 20,  y: 54 },
  "def-center": { x: 20,  y: 34 },
  "def-right":  { x: 20,  y: 14 },
  "mid-left":   { x: 52,  y: 54 },
  "mid-center": { x: 52,  y: 34 },
  "mid-right":  { x: 52,  y: 14 },
  "att-left":   { x: 85,  y: 54 },
  "att-center": { x: 85,  y: 34 },
  "att-right":  { x: 85,  y: 14 },
};

// ─── Extractor principal ─────────────────────────────────────────────────────

export const VideoMetricsExtractor = {
  /**
   * Convierte un VideoObservationPacket en inputs listos para
   * advancedMetricsService.calculateAdvancedMetrics().
   */
  extract(packet: VideoObservationPacket): {
    vaepInput: VAEPInput;
    trackingInput: TrackingInput;
    biomechanicsInput: BiomechanicsInput | null;
  } {
    return {
      vaepInput: extractVAEP(packet),
      trackingInput: extractTracking(packet),
      biomechanicsInput: extractBiomechanics(packet),
    };
  },

  /**
   * Parsea y valida un packet JSON crudo devuelto por el LLM.
   * Normaliza valores faltantes y descarta eventos inconsistentes.
   */
  parseRawPacket(raw: unknown): VideoObservationPacket | null {
    if (!raw || typeof raw !== "object") return null;
    const r = raw as Record<string, unknown>;

    const events = Array.isArray(r.events)
      ? (r.events as unknown[]).map(normalizeEvent).filter((e): e is VideoEvent => e !== null)
      : [];

    if (events.length === 0) return null;

    return {
      durationSec: typeof r.durationSec === "number" ? r.durationSec : 90 * 60,
      minutesPlayed: typeof r.minutesPlayed === "number"
        ? r.minutesPlayed
        : typeof r.durationSec === "number"
          ? Math.round(r.durationSec / 60)
          : 90,
      events,
      positioning: typeof r.positioning === "object" && r.positioning !== null
        ? r.positioning as VideoPositioning
        : undefined,
      biomechanics: typeof r.biomechanics === "object" && r.biomechanics !== null
        ? r.biomechanics as VideoBiomechanicsObservation
        : undefined,
    };
  },
};

// ─── Conversores específicos ─────────────────────────────────────────────────

/**
 * Convierte eventos de video a acciones SPADL + xG chain aproximado.
 *
 * xG chain aproximado: cada acción en zona "att-*" suma impacto al score_prob
 * (hasta 0.30 para tiros, 0.15 pases clave). Es una aproximación conservadora
 * — para valores precisos se necesitaría un modelo xG entrenado con datos
 * de eventos reales (StatsBomb, Opta). Pero para MVP de comparación relativa
 * entre jugadores es suficiente.
 */
function extractVAEP(packet: VideoObservationPacket): VAEPInput {
  const actions: SPADLAction[] = [];

  for (const ev of packet.events) {
    const spadlType = mapEventTypeToSPADL(ev.type);
    if (!spadlType) continue; // "reception", "run" no son acciones SPADL

    const fromCoords = ev.fromZone ? ZONE_COORDS[ev.fromZone] : { x: 52, y: 34 };
    const toCoords = ev.toZone
      ? ZONE_COORDS[ev.toZone]
      : spadlType === "shot" ? { x: 100, y: 34 } : fromCoords;

    const { scoreProbBefore, scoreProbAfter, concedeProbBefore, concedeProbAfter } =
      estimateXGChain(ev);

    actions.push({
      actionId: `v_${Math.round(ev.tSec * 1000)}_${spadlType}`,
      type: spadlType,
      startX: fromCoords.x,
      startY: fromCoords.y,
      endX: toCoords.x,
      endY: toCoords.y,
      result: ev.result,
      scoreProbBefore,
      scoreProbAfter,
      concedeProbBefore,
      concedeProbAfter,
    });
  }

  return {
    actions,
    minutesPlayed: packet.minutesPlayed,
  };
}

/**
 * Genera positions sintéticas a partir de zone distribution + duration.
 * No es GPS real — es una aproximación basada en dónde se movió el jugador
 * según Gemini. Suficiente para calcular fieldCoverage y estimar
 * avgSpeed si no viene dado.
 */
function extractTracking(packet: VideoObservationPacket): TrackingInput {
  const positioning = packet.positioning;
  const positions: TrackingInput["positions"] = [];
  const durationMs = packet.durationSec * 1000;

  // Genera un punto por cada evento con zona (aproximación temporal real)
  for (const ev of packet.events) {
    if (!ev.fromZone) continue;
    const coords = ZONE_COORDS[ev.fromZone];
    positions.push({
      x: coords.x + jitter(5),
      y: coords.y + jitter(5),
      timestampMs: Math.round(ev.tSec * 1000),
    });
  }

  // Si hay zoneDistribution, añade muestras sintéticas adicionales
  if (positioning?.zoneDistribution) {
    const totalSamples = 50; // muestras sintéticas para coverage
    for (const [zone, pct] of Object.entries(positioning.zoneDistribution)) {
      const coords = ZONE_COORDS[zone as FieldZoneApprox];
      const n = Math.round(totalSamples * (pct ?? 0));
      for (let i = 0; i < n; i++) {
        positions.push({
          x: coords.x + jitter(8),
          y: coords.y + jitter(8),
          timestampMs: Math.round((durationMs / totalSamples) * (positions.length + 1)),
        });
      }
    }
  }

  positions.sort((a, b) => a.timestampMs - b.timestampMs);
  return { positions, minutesPlayed: packet.minutesPlayed };
}

/**
 * Convierte observaciones biomecánicas de Gemini a BiomechanicsInput.
 * Si Gemini no observó nada biomecánico, retorna null (stub).
 */
function extractBiomechanics(packet: VideoObservationPacket): BiomechanicsInput | null {
  const bio = packet.biomechanics;
  if (!bio || (bio.bilateralAsymmetryObserved === undefined && bio.movementEfficiency === undefined)) {
    return null;
  }

  return {
    bilateralAsymmetry: bio.bilateralAsymmetryObserved,
    // jointAngles & impactForces requieren Pose Estimation (Roboflow Keypoints)
    // — se mantienen undefined hasta integrar esa pipeline.
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function mapEventTypeToSPADL(type: VideoEvent["type"]): SPADLAction["type"] | null {
  switch (type) {
    case "pass":
    case "cross":
    case "dribble":
    case "shot":
    case "tackle":
    case "interception":
    case "clearance":
    case "foul":
      return type;
    case "header":
      return "pass"; // aproximación: cabezazo cuenta como pase
    case "reception":
    case "run":
      return null; // no son acciones SPADL puras
    default:
      return null;
  }
}

/**
 * Estima xG chain deltas basándose en tipo de acción + zona + resultado.
 * NO es xG profesional — es aproximación para poder calcular VAEP relativo.
 */
function estimateXGChain(ev: VideoEvent): {
  scoreProbBefore: number;
  scoreProbAfter: number;
  concedeProbBefore: number;
  concedeProbAfter: number;
} {
  const isAttackingZone = ev.toZone?.startsWith("att-") ?? false;
  const isDefensiveZone = ev.fromZone?.startsWith("def-") ?? false;
  const isSuccess = ev.result === "success";

  const baseScore = isAttackingZone ? 0.08 : 0.02;
  const baseConcede = isDefensiveZone ? 0.05 : 0.01;

  let scoreDelta = 0;
  let concedeDelta = 0;

  switch (ev.type) {
    case "shot":
      scoreDelta = isSuccess ? 0.30 : -0.05;
      break;
    case "pass":
    case "cross":
      scoreDelta = isSuccess ? (isAttackingZone ? 0.10 : 0.03) : -0.03;
      break;
    case "dribble":
      scoreDelta = isSuccess ? 0.08 : -0.02;
      break;
    case "tackle":
    case "interception":
      concedeDelta = isSuccess ? -0.08 : 0.04;
      break;
    case "clearance":
      concedeDelta = isSuccess ? -0.05 : 0.02;
      break;
    case "foul":
      concedeDelta = 0.03;
      break;
    default:
      break;
  }

  // impact opcional del LLM: amplifica el delta hasta 1.5x
  const impactMult = 1 + (ev.impact ?? 0) * 0.5;

  return {
    scoreProbBefore: baseScore,
    scoreProbAfter: clamp01(baseScore + scoreDelta * impactMult),
    concedeProbBefore: baseConcede,
    concedeProbAfter: clamp01(baseConcede + concedeDelta * impactMult),
  };
}

function normalizeEvent(raw: unknown): VideoEvent | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;

  const validTypes: VideoEvent["type"][] = [
    "pass", "dribble", "shot", "cross", "tackle", "interception",
    "clearance", "foul", "reception", "header", "run",
  ];

  const type = typeof r.type === "string" && validTypes.includes(r.type as VideoEvent["type"])
    ? r.type as VideoEvent["type"]
    : null;
  if (!type) return null;

  const result = r.result === "success" || r.result === "fail"
    ? r.result
    : "success";

  const tSec = typeof r.tSec === "number" ? r.tSec
    : typeof r.t === "number" ? r.t
    : 0;

  return {
    tSec,
    type,
    result,
    fromZone: isValidZone(r.fromZone) ? r.fromZone as FieldZoneApprox : undefined,
    toZone: isValidZone(r.toZone) ? r.toZone as FieldZoneApprox : undefined,
    impact: typeof r.impact === "number" ? clamp01(r.impact) : undefined,
    confidence: typeof r.confidence === "number" ? clamp01(r.confidence) : undefined,
  };
}

function isValidZone(z: unknown): boolean {
  return typeof z === "string" && z in ZONE_COORDS;
}

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

// Jitter determinístico (no afecta tests si seed=0)
let _jitterSeed = 0;
function jitter(range: number): number {
  _jitterSeed = (_jitterSeed * 1103515245 + 12345) & 0x7fffffff;
  return ((_jitterSeed / 0x7fffffff) - 0.5) * range;
}

/** Reset interno del jitter (para tests deterministas) */
export function _resetJitter(): void {
  _jitterSeed = 0;
}
