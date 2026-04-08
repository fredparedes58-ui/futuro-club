/**
 * VITAS · Gemini → VAEP Bridge
 *
 * Módulo puente que convierte los conteos de eventos agregados de Gemini
 * (observación de video) en objetos MatchEvent[] sintéticos, y luego los
 * alimenta a VAEPService.calculateFromEvents() para obtener métricas VAEP.
 */

import type { MatchEvent, EventType, EventZone } from "@/services/real/matchEventsService";
import type { VAEPResult } from "@/services/real/advancedMetricsService";
import { VAEPService } from "@/services/real/advancedMetricsService";

// ─── Tipos ───────────────────────────────────────────────────────────────────

/** Conteos de eventos agregados provenientes del análisis de video con Gemini */
export interface GeminiEventCounts {
  pasesCompletados?: number;
  pasesFallados?: number;
  recuperaciones?: number;
  duelosGanados?: number;
  duelosPerdidos?: number;
  disparosAlArco?: number;
  disparosFuera?: number;
}

// ─── Distribución de zonas por posición ──────────────────────────────────────

/** Distribución porcentual de eventos por zona del campo */
interface ZoneDistribution {
  offensive: number;
  middle: number;
  defensive: number;
}

/** Posiciones consideradas como delanteras */
const FORWARD_POSITIONS = [
  "delantero", "extremo", "mediapunta", "forward", "striker", "winger",
];

/** Posiciones consideradas como mediocampistas */
const MIDFIELDER_POSITIONS = [
  "mediocampista", "mediocentro", "pivote", "midfielder", "central",
];

/** Posiciones consideradas como defensivas */
const DEFENDER_POSITIONS = [
  "defensa", "lateral", "central", "defender", "fullback", "centerback",
  "portero", "goalkeeper",
];

/**
 * Determina la distribución de zonas según la posición del jugador.
 * @param position — Posición del jugador (en español o inglés)
 * @returns Distribución porcentual por zona
 */
function getZoneDistribution(position: string): ZoneDistribution {
  const pos = position.toLowerCase().trim();

  if (FORWARD_POSITIONS.some((p) => pos.includes(p))) {
    return { offensive: 0.6, middle: 0.3, defensive: 0.1 };
  }

  if (MIDFIELDER_POSITIONS.some((p) => pos.includes(p))) {
    return { offensive: 0.25, middle: 0.5, defensive: 0.25 };
  }

  if (DEFENDER_POSITIONS.some((p) => pos.includes(p))) {
    return { offensive: 0.1, middle: 0.3, defensive: 0.6 };
  }

  // Por defecto: distribución de mediocampista
  return { offensive: 0.25, middle: 0.5, defensive: 0.25 };
}

// ─── Mapeo de eventos Gemini → MatchEvent ────────────────────────────────────

/** Definición de mapeo: campo de GeminiEventCounts → tipo y resultado */
interface EventMapping {
  field: keyof GeminiEventCounts;
  type: EventType;
  result: "success" | "fail";
}

const EVENT_MAPPINGS: EventMapping[] = [
  { field: "pasesCompletados", type: "pass",   result: "success" },
  { field: "pasesFallados",    type: "pass",   result: "fail" },
  { field: "recuperaciones",   type: "tackle", result: "success" },
  { field: "duelosGanados",    type: "press",  result: "success" },
  { field: "duelosPerdidos",   type: "press",  result: "fail" },
  { field: "disparosAlArco",   type: "shot",   result: "success" },
  { field: "disparosFuera",    type: "shot",   result: "fail" },
];

/**
 * Asigna una zona del campo a un evento según su índice y la distribución.
 * @param index — Índice del evento dentro de su grupo
 * @param total — Total de eventos del mismo tipo
 * @param dist  — Distribución porcentual de zonas
 */
function assignZone(index: number, total: number, dist: ZoneDistribution): EventZone {
  const offensiveEnd = Math.round(total * dist.offensive);
  const middleEnd = offensiveEnd + Math.round(total * dist.middle);

  if (index < offensiveEnd) return "offensive";
  if (index < middleEnd) return "middle";
  return "defensive";
}

// ─── Funciones exportadas ────────────────────────────────────────────────────

/**
 * Convierte los conteos agregados de Gemini en objetos MatchEvent[] sintéticos.
 *
 * Cada evento recibe una zona según la posición del jugador y se distribuye
 * uniformemente a lo largo de los minutos jugados.
 *
 * @param counts         — Conteos de eventos de Gemini
 * @param playerPosition — Posición del jugador (ej: "mediocampista", "forward")
 * @param minutesPlayed  — Minutos jugados en el partido
 * @returns Array de eventos sintéticos listos para VAEP
 */
export function geminiEventsToMatchEvents(
  counts: GeminiEventCounts,
  playerPosition: string,
  minutesPlayed: number,
): MatchEvent[] {
  const zoneDist = getZoneDistribution(playerPosition);
  const now = new Date();
  const matchDate = now.toISOString().split("T")[0]; // "YYYY-MM-DD"
  const createdAt = now.toISOString();

  const events: MatchEvent[] = [];
  let globalIndex = 0;

  for (const mapping of EVENT_MAPPINGS) {
    const count = counts[mapping.field] ?? 0;
    if (count <= 0) continue;

    for (let i = 0; i < count; i++) {
      const zone = assignZone(i, count, zoneDist);
      // Distribuir minutos uniformemente; mínimo minuto 1
      const minute = Math.max(1, Math.round(((globalIndex + 1) / (getTotalEvents(counts) || 1)) * minutesPlayed));

      events.push({
        id: `synth-${mapping.type}-${globalIndex}`,
        playerId: "gemini-observed",
        type: mapping.type,
        result: mapping.result,
        minute,
        matchDate,
        xZone: zone,
        createdAt,
      });

      globalIndex++;
    }
  }

  return events;
}

/**
 * Calcula el total de eventos a partir de los conteos de Gemini.
 * @param counts — Conteos de eventos
 */
function getTotalEvents(counts: GeminiEventCounts): number {
  return EVENT_MAPPINGS.reduce((sum, m) => sum + (counts[m.field] ?? 0), 0);
}

/**
 * Calcula VAEP aproximado a partir de conteos de eventos de Gemini.
 *
 * Convierte los conteos en MatchEvent[] sintéticos y los pasa a
 * VAEPService.calculateFromEvents(). El resultado incluye la marca
 * `isApproximate: true` para indicar que proviene de datos estimados.
 *
 * @param counts         — Conteos de eventos de Gemini
 * @param playerPosition — Posición del jugador
 * @param minutesPlayed  — Minutos jugados
 * @returns Resultado VAEP con marca de aproximación
 */
export function calculateVAEPFromGemini(
  counts: GeminiEventCounts,
  playerPosition: string,
  minutesPlayed: number,
): VAEPResult & { isApproximate: true } {
  const events = geminiEventsToMatchEvents(counts, playerPosition, minutesPlayed);

  if (events.length === 0) {
    return {
      vaepTotal: null,
      vaep90: null,
      topActions: [],
      status: "insufficient_data",
      message: "No se encontraron eventos en el análisis de video. Se requieren datos de acciones para calcular VAEP.",
      isApproximate: true,
    };
  }

  const result = VAEPService.calculateFromEvents(events, minutesPlayed);

  return {
    ...result,
    isApproximate: true,
  };
}
