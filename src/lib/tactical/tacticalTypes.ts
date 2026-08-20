/**
 * VITAS · Tactical Heatmap — shared types
 *
 * El módulo segmenta un partido en 6 fases tácticas y produce un heatmap
 * por (jugador × fase) sobre una cancha normalizada 100×100.
 *
 * Coordenadas:
 *   x ∈ [0, 100]   — eje largo de la cancha (de portería propia a rival)
 *   y ∈ [0, 100]   — eje ancho (de banda izquierda a derecha mirando al ataque)
 *
 * El grid del heatmap es 10×10 (100 bins) por defecto — suficiente para
 * mostrar patrones sin sobrecargar la UI ni la BD.
 *
 * Mirrors `supabase/migrations/048_tactical_heatmaps.sql`.
 */

// ── Enums ─────────────────────────────────────────────────────────────
export type GamePhase =
  | "build_up"               // construcción desde campo propio, con posesión
  | "attacking"              // ataque organizado en campo rival, con posesión
  | "defending"              // defensa organizada sin posesión
  | "defensive_transition"   // primeros 5-10s tras pérdida del balón
  | "offensive_transition"   // primeros 5-10s tras recuperación
  | "set_piece";             // balón parado (córner, falta, lateral, penalti)

export type BallPossession = "ours" | "theirs" | "neutral";

export type PhaseSource = "auto" | "manual" | "hybrid";

// ── Core entities ─────────────────────────────────────────────────────

/** Un segmento temporal del partido clasificado como una fase. */
export interface PhaseSegment {
  id: string;
  matchId: string;
  videoId?: string;
  phaseType: GamePhase;
  startMs: number;
  endMs: number;
  ballPossession: BallPossession;
  source: PhaseSource;
  /** 0-1, confianza de la clasificación automática. */
  confidence: number;
  createdAt: string;
}

/**
 * Una celda del grid. `x` y `y` son índices del grid (0-9 en grid 10×10).
 * `weight` es la fracción de tiempo (0-1) que el jugador pasó en esa celda
 * durante la fase.
 */
export interface HeatmapBin {
  x: number;
  y: number;
  weight: number;
}

/**
 * Una zona caliente identificada por clustering (DBSCAN simple o K-means).
 * Útil para narrativa "su zona principal es X,Y".
 */
export interface HotZone {
  /** Centroide en coords del campo (0-100, 0-100). */
  centroidX: number;
  centroidY: number;
  /** Radio efectivo en coords del campo. */
  radius: number;
  /** Fracción de tiempo dentro del cluster (0-1). */
  share: number;
  /** Nombre humano: "banda izquierda defensiva", etc. */
  label?: string;
}

/** Heatmap completo de un jugador en una fase concreta de un partido. */
export interface PhaseHeatmap {
  id: string;
  matchId: string;
  /** NULL = heatmap agregado del equipo. */
  playerId: string | null;
  phaseType: GamePhase;
  /** 100 bins (grid 10×10 normalizado). */
  bins: HeatmapBin[];
  /** Top 1-3 zonas calientes detectadas. */
  hotZones: HotZone[];
  /** Tiempo total en esta fase (segundos). */
  totalTimeSec: number;
  /** Versión del algoritmo de detección (para re-cálculos selectivos). */
  algoVersion: string;
  computedAt: string;
}

/** Resumen agregado para vista de equipo / dashboard director. */
export interface TacticalMatchSummary {
  matchId: string;
  videoId?: string;
  matchDate?: string;
  /** Fase → segundos totales. */
  phaseDurations: Record<GamePhase, number>;
  /** % posesión equipo propio (0-100). */
  possessionPct: number;
  /** Heatmaps por jugador en cada fase (pre-cargado para UI rápida). */
  playerHeatmaps: PhaseHeatmap[];
  /** Heatmap agregado del equipo por fase. */
  teamHeatmaps: PhaseHeatmap[];
  /** Insights del agente (si se ha generado). */
  insights?: TacticalInsights;
}

/** Output del agente TacticalPattern. */
export interface TacticalInsights {
  headline: string;
  summary: string;
  byPhase: Array<{
    phase: GamePhase;
    observation: string;
    risk: "low" | "moderate" | "high";
    suggestion: string;
  }>;
  strengths: string[];
  weaknesses: string[];
  coachingTips: string[];
  modelVersion: string;
}

// ── Agent contract ────────────────────────────────────────────────────

export interface TacticalPatternInput {
  match: {
    id: string;
    matchDate?: string;
    durationMin?: number;
    score?: { ours: number; theirs: number };
  };
  team: {
    id?: string;
    formation?: string;
    averageAge?: number;
    style?: "possession" | "direct" | "counter" | "pressing";
  };
  phaseDurations: Record<GamePhase, number>;
  possessionPct: number;
  /** Top hot zones por fase (de teamHeatmaps). */
  teamHotZonesByPhase: Array<{
    phase: GamePhase;
    zones: HotZone[];
  }>;
  /** Anomalías detectadas: zonas donde el equipo NO está pero debería. */
  coverageGaps?: Array<{
    phase: GamePhase;
    zone: { x: number; y: number };
    label: string;
  }>;
}

// ── Demo helpers ──────────────────────────────────────────────────────
/** Prefijo de los match demo (seed local vía mockSeeder). */
export const DEMO_MATCH_PREFIX = "demo-";

/**
 * ¿Es un match de demostración (seed local)? Los match demo viven SOLO en
 * localStorage: no tienen fila en `analyses` ni son UUID válido, así que NO se
 * consultan contra los endpoints de api/tactical (darían 403 por ownsMatch).
 */
export function isDemoMatchId(matchId: string | null | undefined): boolean {
  return typeof matchId === "string" && matchId.startsWith(DEMO_MATCH_PREFIX);
}
