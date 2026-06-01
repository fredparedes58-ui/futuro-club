/**
 * VITAS · Phase Detector
 *
 * Algoritmo auto-detector que clasifica cada segmento del partido en una
 * de las 6 fases tácticas:
 *
 *   build_up:               nuestra posesión en campo propio (x < 50)
 *   attacking:              nuestra posesión en campo rival (x ≥ 50)
 *   defending:              posesión rival en su campo (x < 50 desde su perspectiva)
 *   defensive_transition:   primeros 5s tras pérdida del balón
 *   offensive_transition:   primeros 5s tras recuperación
 *   set_piece:              flag externo (ball stopped + dead ball marker)
 *
 * Input: secuencia de samples con posición del balón + posesión.
 * Output: array de `PhaseSegment` no superpuestos cubriendo el partido.
 *
 * Diseño:
 *   - Window de transición = 5000 ms tras cualquier cambio de posesión
 *   - Min phase duration = 2000 ms para evitar fragmentación
 *   - Si hay flag `isSetPiece` en el sample, fuerza esa fase
 */

import type { GamePhase, PhaseSegment, BallPossession } from "./tacticalTypes";

interface PhaseSample {
  timestampMs: number;
  ballX: number;
  ballY: number;
  /** Quién tiene el balón en este frame (resuelto por proximidad). */
  possession: BallPossession;
  /** True si Modal/coach lo marcó como balón parado. */
  isSetPiece?: boolean;
}

interface DetectorOptions {
  /** ms tras cambio de posesión hasta que deja de ser "transition". */
  transitionWindowMs?: number;
  /** Duración mínima para crear un segmento (anti-fragmentación). */
  minPhaseMs?: number;
  /** Función que asigna IDs nuevos (inyectable para tests). */
  idGen?: () => string;
}

const DEFAULT_TRANSITION_MS = 5000;
const DEFAULT_MIN_PHASE_MS = 2000;

export function detectPhases(
  samples: PhaseSample[],
  matchId: string,
  options: DetectorOptions = {},
): PhaseSegment[] {
  const transitionMs = options.transitionWindowMs ?? DEFAULT_TRANSITION_MS;
  const minPhaseMs = options.minPhaseMs ?? DEFAULT_MIN_PHASE_MS;
  const idGen = options.idGen ?? (() => crypto.randomUUID());

  if (samples.length === 0) return [];

  const segments: PhaseSegment[] = [];
  const now = new Date().toISOString();

  // Track last possession change to compute transition windows
  let lastPossessionChangeMs = samples[0].timestampMs;
  let prevPossession = samples[0].possession;

  // Build per-sample phase label, then run-length compress
  const labels: GamePhase[] = samples.map((s) => {
    // 1. set piece overrides everything
    if (s.isSetPiece) return "set_piece";

    // 2. detect transition window
    if (s.possession !== prevPossession && s.possession !== "neutral") {
      lastPossessionChangeMs = s.timestampMs;
      prevPossession = s.possession;
    }
    const inTransition =
      s.timestampMs - lastPossessionChangeMs <= transitionMs;

    if (inTransition) {
      return s.possession === "ours"
        ? "offensive_transition"
        : "defensive_transition";
    }

    // 3. organized phases
    if (s.possession === "ours") {
      return s.ballX >= 50 ? "attacking" : "build_up";
    }
    if (s.possession === "theirs") {
      // From our perspective, "defending" regardless of where the ball is
      return "defending";
    }
    // Neutral ball: inherit last known phase (or default to build_up)
    return segments[segments.length - 1]?.phaseType ?? "build_up";
  });

  // Run-length compress
  let segStart = 0;
  for (let i = 1; i <= labels.length; i++) {
    if (i === labels.length || labels[i] !== labels[segStart]) {
      const startMs = samples[segStart].timestampMs;
      const endMs = samples[i - 1].timestampMs;
      const duration = endMs - startMs;
      if (duration >= minPhaseMs) {
        segments.push({
          id: idGen(),
          matchId,
          phaseType: labels[segStart],
          startMs,
          endMs,
          ballPossession: samples[segStart].possession,
          source: "auto",
          confidence: 0.85,
          createdAt: now,
        });
      }
      segStart = i;
    }
  }

  return segments;
}

/**
 * Resuelve la posesión por proximidad: el jugador (de cualquier equipo) más
 * cerca del balón "tiene" la posesión. Si el más cercano está a > threshold,
 * la posesión es `neutral`.
 *
 * Caller pasa un mapping playerId → team ("ours" | "theirs").
 */
export function resolvePossession(
  ballPos: { x: number; y: number },
  players: Array<{ id: string; x: number; y: number; team: "ours" | "theirs" }>,
  threshold = 5,
): BallPossession {
  if (players.length === 0) return "neutral";
  let closest = players[0];
  let closestDist = Number.POSITIVE_INFINITY;
  for (const p of players) {
    const dx = p.x - ballPos.x;
    const dy = p.y - ballPos.y;
    const d = Math.sqrt(dx * dx + dy * dy);
    if (d < closestDist) {
      closestDist = d;
      closest = p;
    }
  }
  if (closestDist > threshold) return "neutral";
  return closest.team === "ours" ? "ours" : "theirs";
}
