/**
 * VITAS · Tactical Mock Seeder
 *
 * Genera un partido completo de demo con phases + heatmaps + insights para
 * que el módulo /tactical se vea funcional sin necesidad de subir video.
 *
 * Producto:
 *   - 1 match con 11 jugadores
 *   - ~12 phase segments distribuidos en 90 min
 *   - Heatmaps por (jugador × fase) con bins coherentes con la fase
 *     (build_up concentrado atrás, attacking en tercio rival, etc.)
 *   - Insights del agente — generados aquí, no llaman Claude
 *
 * Persiste todo vía TacticalHeatmapService (offline-first, va a localStorage
 * si Supabase no está).
 */

import { aggregateBins } from "./heatmapAggregator";
import { findHotZones } from "./clusterAnalyzer";
import { TacticalHeatmapService } from "@/services/real/tacticalHeatmapService";
import type {
  GamePhase,
  PhaseHeatmap,
  PhaseSegment,
  TacticalInsights,
} from "./tacticalTypes";

const uuid = (): string => crypto.randomUUID();

/** Posición esperada del jugador según fase + carril (0-100). */
function expectedPosition(
  phase: GamePhase,
  laneY: number, // 0-100 (donde patrulla en eje ancho)
  homeX: number, // x base del jugador
): { x: number; y: number } {
  // Ajustes por fase
  let xShift = 0;
  let yJitter = 0;
  switch (phase) {
    case "build_up":             xShift = -15; yJitter = 5; break;
    case "attacking":            xShift = +25; yJitter = 10; break;
    case "defending":            xShift = -20; yJitter = 5; break;
    case "defensive_transition": xShift = -10; yJitter = 15; break;
    case "offensive_transition": xShift = +15; yJitter = 15; break;
    case "set_piece":            xShift = +5;  yJitter = 8; break;
  }
  return {
    x: Math.max(5, Math.min(95, homeX + xShift + (Math.random() - 0.5) * 12)),
    y: Math.max(5, Math.min(95, laneY + (Math.random() - 0.5) * yJitter * 2)),
  };
}

/** 11 jugadores con su carril Y y posición base X (formación 4-3-3). */
const FORMATION_433: Array<{ id: string; name: string; laneY: number; homeX: number }> = [
  { id: "p1",  name: "Samu",         laneY: 50, homeX: 8 },   // GK
  { id: "p2",  name: "Lateral D.",   laneY: 80, homeX: 25 },  // LB
  { id: "p3",  name: "Central D.",   laneY: 60, homeX: 20 },  // CB
  { id: "p4",  name: "Central I.",   laneY: 40, homeX: 20 },  // CB
  { id: "p5",  name: "Lateral I.",   laneY: 20, homeX: 25 },  // RB
  { id: "p6",  name: "Pivote",       laneY: 50, homeX: 40 },  // DM
  { id: "p7",  name: "Interior D.",  laneY: 65, homeX: 50 },  // CM
  { id: "p8",  name: "Interior I.",  laneY: 35, homeX: 50 },  // CM
  { id: "p9",  name: "Extremo D.",   laneY: 85, homeX: 70 },  // RW
  { id: "p10", name: "Delantero",    laneY: 50, homeX: 80 },  // ST
  { id: "p11", name: "Extremo I.",   laneY: 15, homeX: 70 },  // LW
];

/**
 * Distribución temporal típica de un partido (proporciones del total).
 * Total = 1.0. Reordenado por bloques contiguos plausibles.
 */
const PHASE_PLAN: Array<{ phase: GamePhase; durationFraction: number; ballPossession: "ours" | "theirs" | "neutral" }> = [
  { phase: "build_up",             durationFraction: 0.05, ballPossession: "ours" },
  { phase: "attacking",            durationFraction: 0.08, ballPossession: "ours" },
  { phase: "offensive_transition", durationFraction: 0.04, ballPossession: "ours" },
  { phase: "defending",            durationFraction: 0.12, ballPossession: "theirs" },
  { phase: "defensive_transition", durationFraction: 0.05, ballPossession: "theirs" },
  { phase: "build_up",             durationFraction: 0.06, ballPossession: "ours" },
  { phase: "attacking",            durationFraction: 0.10, ballPossession: "ours" },
  { phase: "set_piece",            durationFraction: 0.03, ballPossession: "ours" },
  { phase: "defending",            durationFraction: 0.15, ballPossession: "theirs" },
  { phase: "build_up",             durationFraction: 0.07, ballPossession: "ours" },
  { phase: "attacking",            durationFraction: 0.12, ballPossession: "ours" },
  { phase: "set_piece",            durationFraction: 0.03, ballPossession: "theirs" },
  { phase: "defending",            durationFraction: 0.10, ballPossession: "theirs" },
];

/**
 * Seedea un partido demo en la BD/localStorage.
 * @param matchId  ID del partido — pasa el mismo para sobrescribir.
 * @returns El matchId persistido.
 */
export async function seedDemoMatch(matchId?: string): Promise<string> {
  const id = matchId ?? `demo-${Date.now().toString(36)}`;
  const totalDurationMs = 90 * 60 * 1000; // 90 min
  const now = new Date().toISOString();

  // 1. Build phases
  const phases: PhaseSegment[] = [];
  let cursor = 0;
  for (const block of PHASE_PLAN) {
    const dur = Math.floor(totalDurationMs * block.durationFraction);
    phases.push({
      id: uuid(),
      matchId: id,
      phaseType: block.phase,
      startMs: cursor,
      endMs: cursor + dur,
      ballPossession: block.ballPossession,
      source: "auto",
      confidence: 0.9,
      createdAt: now,
    });
    cursor += dur;
  }

  // 2. For each (player × phase), synthesize positions and aggregate
  const heatmaps: PhaseHeatmap[] = [];

  for (const phase of new Set(phases.map((p) => p.phaseType))) {
    const phaseSegments = phases.filter((p) => p.phaseType === phase);
    const perPlayerBinsForTeam: PhaseHeatmap["bins"][] = [];

    for (const player of FORMATION_433) {
      // Synthesize 1 sample every 100ms for the full duration of these segments
      const positions: Array<{ timestampMs: number; x: number; y: number }> = [];
      for (const seg of phaseSegments) {
        for (let t = seg.startMs; t < seg.endMs; t += 200) {
          const pos = expectedPosition(phase, player.laneY, player.homeX);
          positions.push({ timestampMs: t, x: pos.x, y: pos.y });
        }
      }
      if (positions.length === 0) continue;

      const { bins, totalTimeMs } = aggregateBins(positions);
      const hotZones = findHotZones(bins);
      heatmaps.push({
        id: uuid(),
        matchId: id,
        playerId: player.id,
        phaseType: phase,
        bins,
        hotZones,
        totalTimeSec: totalTimeMs / 1000,
        algoVersion: "mock-v1.0.0",
        computedAt: now,
      });
      perPlayerBinsForTeam.push(bins);
    }

    // Team aggregate
    if (perPlayerBinsForTeam.length > 0) {
      // Combine: sum weights normalized
      const teamGrid = new Map<string, number>();
      let total = 0;
      for (const playerBins of perPlayerBinsForTeam) {
        for (const b of playerBins) {
          const key = `${b.x},${b.y}`;
          teamGrid.set(key, (teamGrid.get(key) ?? 0) + b.weight);
          total += b.weight;
        }
      }
      const teamBins: PhaseHeatmap["bins"] = [];
      if (total > 0) {
        for (const [key, w] of teamGrid.entries()) {
          const [x, y] = key.split(",").map(Number);
          teamBins.push({ x, y, weight: w / total });
        }
      }
      const teamZones = findHotZones(teamBins);
      const phaseDurationSec =
        phaseSegments.reduce((s, seg) => s + (seg.endMs - seg.startMs), 0) / 1000;
      heatmaps.push({
        id: uuid(),
        matchId: id,
        playerId: null,
        phaseType: phase,
        bins: teamBins,
        hotZones: teamZones,
        totalTimeSec: phaseDurationSec,
        algoVersion: "mock-v1.0.0",
        computedAt: now,
      });
    }
  }

  // 3. Synthesize insights
  const insights: TacticalInsights = {
    headline: "Equipo dominador en posesión pero vulnerable en transición defensiva por la banda derecha.",
    summary: "Partido con 60% de posesión y foco en construcción + ataque organizado. La transición defensiva muestra gaps en zona (35, 80) — banda derecha del medio campo. Set pieces favorables como punto fuerte.",
    byPhase: [
      {
        phase: "build_up",
        observation: "Centrales y pivote ocupan zona (20, 50) consistentemente; los laterales suben hasta (35, 80) y (35, 20).",
        risk: "low",
        suggestion: "Continuar trabajando salida de balón con la actual estructura. Añadir variantes de pase largo al extremo.",
      },
      {
        phase: "attacking",
        observation: "Concentración alta en (75, 50) — delantero referencia. Extremos ofrecen amplitud en (75, 85) y (75, 15).",
        risk: "low",
        suggestion: "Drills de combinación entre delantero y extremos para multiplicar acciones de tercer hombre.",
      },
      {
        phase: "defensive_transition",
        observation: "Tras pérdida, el equipo tarda en replegarse en zona (35, 80) — banda derecha. Lateral derecho queda aislado.",
        risk: "high",
        suggestion: "Repliegue inmediato del extremo derecho + apoyo del interior diestro. Drill 4v3 con presión en banda.",
      },
      {
        phase: "defending",
        observation: "Bloque medio-bajo bien estructurado entre x=20 y x=40. Líneas compactas.",
        risk: "low",
        suggestion: "Mantener estructura. Trabajar coberturas en pasillos interiores.",
      },
      {
        phase: "offensive_transition",
        observation: "Buena verticalidad pero pocos apoyos cercanos al portador. Centrocampistas tardan en sumarse.",
        risk: "moderate",
        suggestion: "Ejercicios de contraataque con 3 oleadas de jugadores incorporándose en 2-3 segundos.",
      },
      {
        phase: "set_piece",
        observation: "Saques de esquina: 80% al primer palo. Faltas: variantes limitadas.",
        risk: "moderate",
        suggestion: "Ampliar repertorio de jugadas ensayadas (variante segundo palo, jugada corta).",
      },
    ],
    strengths: [
      "Posesión sostenida (60%)",
      "Construcción desde defensa estructurada",
      "Ataque organizado con amplitud",
      "Bloque defensivo compacto",
    ],
    weaknesses: [
      "Transición defensiva en banda derecha",
      "Apoyos lentos en contraataque",
      "Set pieces previsibles",
    ],
    coachingTips: [
      "Drill 4v3 con presión en banda derecha (ejecutar 3× en próxima sesión)",
      "Trabajar 3 oleadas de incorporación en transición ofensiva",
      "Diseñar 2 variantes nuevas de córner y 1 de falta lateral",
    ],
    modelVersion: "mock-v1.0.0",
  };

  // 4. Persist all
  await TacticalHeatmapService.savePhases(phases);
  await TacticalHeatmapService.saveHeatmaps(heatmaps);
  await TacticalHeatmapService.saveInsights(id, insights);

  return id;
}

/** Limpia todos los mock matches. */
export async function clearMockMatches(): Promise<void> {
  const matches = await TacticalHeatmapService.listMatchesWithHeatmap();
  for (const m of matches) {
    if (m.matchId.startsWith("demo-")) {
      await TacticalHeatmapService.deleteMatch(m.matchId);
    }
  }
}
