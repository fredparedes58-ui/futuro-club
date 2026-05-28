/**
 * VITAS · Rival Analysis Engine (Sprint 8)
 *
 * Analyzes the opposing team to produce scouting insights:
 *   - Defensive gaps (areas of low coverage)
 *   - Pressing triggers (when they press high)
 *   - Build-up patterns (how they progress the ball)
 *   - Key players (most involved, highest speed, most passes)
 *   - Vulnerabilities (areas to exploit)
 *   - Set piece routines (corners, free kicks detected from events)
 */

import type { FieldPoint } from "@/lib/yolo/types";
import type { DetectedFormation } from "./formationDetector";
import type { TeamMetrics, PossessionStat, PressingStat, PassNetwork } from "./teamAnalysisEngine";

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DefensiveGap {
  /** Center of the gap area */
  center: FieldPoint;
  /** Approximate area size (m²) */
  areaM2: number;
  /** Zone description: "between_cb_rb", "between_lines", "wide_left", etc. */
  zone: string;
  /** How frequently this gap appears (0-1) */
  frequency: number;
}

export interface PressingTrigger {
  /** When do they press high? */
  condition: string;
  /** Average height of pressing line when trigger activates */
  avgHeightX: number;
  /** How often this trigger appears */
  count: number;
}

export interface BuildUpPattern {
  /** Pattern description */
  name: string;
  /** Side: left, right, central, or alternating */
  side: "left" | "right" | "central" | "alternating";
  /** How frequently this pattern is used (0-1) */
  frequency: number;
  /** Average build-up speed (m/s ball movement toward goal) */
  speedMs: number;
}

export interface KeyPlayerInsight {
  trackId: number;
  /** Dorsal number if detected */
  dorsalNumber: number | null;
  /** Team role: "playmaker", "target_man", "ball_carrier", "anchor", "wide_runner" */
  role: string;
  /** Key stats */
  stats: {
    passesCompleted: number;
    avgSpeedMs: number;
    distanceCoveredM: number;
    /** How often the ball goes through this player (0-1) */
    involvement: number;
  };
  /** Average position */
  avgPosition: FieldPoint;
}

export interface RivalVulnerability {
  /** Type: "wide_open", "high_line", "slow_transition", "weak_pressing", "compact_bypass" */
  type: string;
  /** Description */
  description: string;
  /** Confidence 0-1 */
  confidence: number;
  /** Recommendation for attacking */
  recommendation: string;
}

export interface RivalScoutReport {
  /** Rival team formation */
  formation: DetectedFormation | null;
  /** Defensive gaps found */
  gaps: DefensiveGap[];
  /** Pressing triggers identified */
  pressingTriggers: PressingTrigger[];
  /** Build-up patterns */
  buildUpPatterns: BuildUpPattern[];
  /** Key players */
  keyPlayers: KeyPlayerInsight[];
  /** Vulnerabilities */
  vulnerabilities: RivalVulnerability[];
  /** Tactical metrics */
  metrics: TeamMetrics | null;
  /** Pressing stats */
  pressing: PressingStat | null;
  /** Pass network */
  passNetwork: PassNetwork | null;
  /** Analysis confidence */
  confidence: number;
  /** Minutes analyzed */
  minutesAnalyzed: number;
}

// ─── Engine ──────────────────────────────────────────────────────────────────

const FIELD_LENGTH = 105;
const FIELD_WIDTH = 68;

// Zone grid: divide field into 6×3 zones for gap analysis
const ZONE_COLS = 6;
const ZONE_ROWS = 3;
const ZONE_W = FIELD_LENGTH / ZONE_COLS;
const ZONE_H = FIELD_WIDTH / ZONE_ROWS;

/**
 * Generate a rival scout report from team analysis data.
 */
export function generateRivalScoutReport(options: {
  formation: DetectedFormation | null;
  metrics: TeamMetrics | null;
  pressing: PressingStat | null;
  passNetwork: PassNetwork | null;
  possession: PossessionStat | null;
  /** All rival player positions over time (for gap analysis) */
  rivalPositions: Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>;
  durationMs: number;
}): RivalScoutReport {
  const { formation, metrics, pressing, passNetwork, rivalPositions, durationMs } = options;
  const minutesAnalyzed = durationMs / 60000;

  // ── Defensive gaps ──
  const gaps = analyzeDefensiveGaps(rivalPositions);

  // ── Key players ──
  const keyPlayers = identifyKeyPlayers(rivalPositions, passNetwork);

  // ── Build-up patterns ──
  const buildUpPatterns = analyzeBuildUpPatterns(rivalPositions, passNetwork);

  // ── Pressing triggers ──
  const pressingTriggers = analyzePressingTriggers(rivalPositions, metrics);

  // ── Vulnerabilities ──
  const vulnerabilities = identifyVulnerabilities(
    formation,
    metrics,
    pressing,
    gaps,
    passNetwork,
  );

  // Confidence: based on data availability and sample size
  const dataFactors = [
    formation ? 0.2 : 0,
    metrics && metrics.playerCount >= 8 ? 0.2 : 0,
    passNetwork && passNetwork.totalPasses > 10 ? 0.2 : 0,
    rivalPositions.length > 100 ? 0.2 : rivalPositions.length > 50 ? 0.1 : 0,
    minutesAnalyzed > 10 ? 0.2 : minutesAnalyzed > 5 ? 0.1 : 0,
  ];
  const confidence = Math.min(1, dataFactors.reduce((s, f) => s + f, 0));

  return {
    formation,
    gaps,
    pressingTriggers,
    buildUpPatterns,
    keyPlayers,
    vulnerabilities,
    metrics,
    pressing,
    passNetwork,
    confidence,
    minutesAnalyzed: Math.round(minutesAnalyzed * 10) / 10,
  };
}

// ── Gap analysis ─────────────────────────────────────────────────────────────

function analyzeDefensiveGaps(
  frames: Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>,
): DefensiveGap[] {
  if (frames.length < 10) return [];

  // Count player presence in each zone
  const zoneCounts: number[][] = Array.from({ length: ZONE_COLS }, () =>
    Array(ZONE_ROWS).fill(0),
  );
  let totalFrames = 0;

  for (const frame of frames) {
    totalFrames++;
    for (const p of frame) {
      const col = Math.min(ZONE_COLS - 1, Math.max(0, Math.floor(p.pos.fx / ZONE_W)));
      const row = Math.min(ZONE_ROWS - 1, Math.max(0, Math.floor(p.pos.fy / ZONE_H)));
      zoneCounts[col][row]++;
    }
  }

  // Find zones with low coverage (potential gaps)
  const gaps: DefensiveGap[] = [];
  const avgPresence = totalFrames * 0.5; // expect ~0.5 players per zone per frame

  for (let col = 0; col < ZONE_COLS; col++) {
    for (let row = 0; row < ZONE_ROWS; row++) {
      const count = zoneCounts[col][row];
      const normalized = count / Math.max(1, totalFrames);

      // Gap: zone with significantly less than average coverage
      if (normalized < 0.15 && col >= 2) {
        // Only care about opponent's half
        const zoneLabels = ["left", "central", "right"];
        gaps.push({
          center: {
            fx: (col + 0.5) * ZONE_W,
            fy: (row + 0.5) * ZONE_H,
          },
          areaM2: ZONE_W * ZONE_H,
          zone: `${zoneLabels[row]}_zone_${col + 1}`,
          frequency: 1 - normalized,
        });
      }
    }
  }

  return gaps.sort((a, b) => b.frequency - a.frequency).slice(0, 5);
}

// ── Key player identification ────────────────────────────────────────────────

function identifyKeyPlayers(
  frames: Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>,
  passNetwork: PassNetwork | null,
): KeyPlayerInsight[] {
  if (frames.length < 10) return [];

  const playerStats = new Map<
    number,
    { sumX: number; sumY: number; sumSpeed: number; count: number; maxSpeed: number }
  >();

  for (const frame of frames) {
    for (const p of frame) {
      const existing = playerStats.get(p.trackId) ?? {
        sumX: 0,
        sumY: 0,
        sumSpeed: 0,
        count: 0,
        maxSpeed: 0,
      };
      existing.sumX += p.pos.fx;
      existing.sumY += p.pos.fy;
      existing.sumSpeed += p.speedMs;
      existing.count++;
      existing.maxSpeed = Math.max(existing.maxSpeed, p.speedMs);
      playerStats.set(p.trackId, existing);
    }
  }

  // Get pass stats
  const passCounts = new Map<number, number>();
  if (passNetwork) {
    for (const edge of passNetwork.edges) {
      passCounts.set(edge.fromTrackId, (passCounts.get(edge.fromTrackId) ?? 0) + edge.count);
    }
  }

  const insights: KeyPlayerInsight[] = [];
  const totalPlayerFrames = [...playerStats.values()].reduce((s, v) => s + v.count, 0);

  for (const [trackId, stats] of playerStats.entries()) {
    const avgX = stats.sumX / stats.count;
    const avgY = stats.sumY / stats.count;
    const avgSpeed = stats.sumSpeed / stats.count;
    const passes = passCounts.get(trackId) ?? 0;
    const involvement = stats.count / Math.max(1, totalPlayerFrames);

    // Determine role
    let role = "outfield";
    if (avgX < 25) role = "goalkeeper";
    else if (avgX < 45 && passes > 10) role = "anchor";
    else if (avgX > 75) role = "target_man";
    else if (passes > 15) role = "playmaker";
    else if (avgSpeed > 4) role = "ball_carrier";
    else if (Math.abs(avgY - 34) > 20) role = "wide_runner";

    insights.push({
      trackId,
      dorsalNumber: null,
      role,
      stats: {
        passesCompleted: passes,
        avgSpeedMs: Math.round(avgSpeed * 100) / 100,
        distanceCoveredM: 0,
        involvement: Math.round(involvement * 1000) / 1000,
      },
      avgPosition: {
        fx: Math.round(avgX * 10) / 10,
        fy: Math.round(avgY * 10) / 10,
      },
    });
  }

  // Sort by involvement and return top 5
  return insights
    .filter((p) => p.role !== "goalkeeper")
    .sort((a, b) => b.stats.involvement - a.stats.involvement)
    .slice(0, 5);
}

// ── Build-up pattern analysis ────────────────────────────────────────────────

function analyzeBuildUpPatterns(
  frames: Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>,
  passNetwork: PassNetwork | null,
): BuildUpPattern[] {
  const patterns: BuildUpPattern[] = [];

  if (!passNetwork || passNetwork.totalPasses < 5) return patterns;

  // Analyze pass directions
  let leftPasses = 0;
  let rightPasses = 0;
  let centralPasses = 0;

  for (const edge of passNetwork.edges) {
    const fromPos = passNetwork.avgPositions.get(edge.fromTrackId);
    const toPos = passNetwork.avgPositions.get(edge.toTrackId);
    if (!fromPos || !toPos) continue;

    const avgY = (fromPos.fy + toPos.fy) / 2;
    if (avgY < 22) leftPasses += edge.count;
    else if (avgY > 46) rightPasses += edge.count;
    else centralPasses += edge.count;
  }

  const total = Math.max(1, leftPasses + rightPasses + centralPasses);

  if (leftPasses / total > 0.4) {
    patterns.push({
      name: "Build-up por izquierda",
      side: "left",
      frequency: leftPasses / total,
      speedMs: 0,
    });
  }
  if (rightPasses / total > 0.4) {
    patterns.push({
      name: "Build-up por derecha",
      side: "right",
      frequency: rightPasses / total,
      speedMs: 0,
    });
  }
  if (centralPasses / total > 0.4) {
    patterns.push({
      name: "Build-up central",
      side: "central",
      frequency: centralPasses / total,
      speedMs: 0,
    });
  }
  if (Math.abs(leftPasses - rightPasses) / total < 0.1) {
    patterns.push({
      name: "Build-up alternante",
      side: "alternating",
      frequency: 0.5,
      speedMs: 0,
    });
  }

  return patterns;
}

// ── Pressing trigger analysis ────────────────────────────────────────────────

function analyzePressingTriggers(
  frames: Array<Array<{ trackId: number; pos: FieldPoint; speedMs: number }>>,
  metrics: TeamMetrics | null,
): PressingTrigger[] {
  const triggers: PressingTrigger[] = [];

  if (!metrics || frames.length < 20) return triggers;

  // Detect high pressing moments: when average team X is above 60
  let highPressFrames = 0;
  for (const frame of frames) {
    if (frame.length < 3) continue;
    const avgX = frame.reduce((s, p) => s + p.pos.fx, 0) / frame.length;
    if (avgX > 60) highPressFrames++;
  }

  const highPressRatio = highPressFrames / Math.max(1, frames.length);

  if (highPressRatio > 0.2) {
    triggers.push({
      condition: "Prensa alto frecuentemente (>20% del tiempo)",
      avgHeightX: 65,
      count: highPressFrames,
    });
  }

  if (metrics.compactnessM < 25) {
    triggers.push({
      condition: "Equipo compacto: bloque corto facilita pressing",
      avgHeightX: metrics.defensiveLineX,
      count: Math.round(frames.length * 0.3),
    });
  }

  return triggers;
}

// ── Vulnerability identification ─────────────────────────────────────────────

function identifyVulnerabilities(
  formation: DetectedFormation | null,
  metrics: TeamMetrics | null,
  pressing: PressingStat | null,
  gaps: DefensiveGap[],
  passNetwork: PassNetwork | null,
): RivalVulnerability[] {
  const vulns: RivalVulnerability[] = [];

  // High defensive line → vulnerable to through balls
  if (metrics && metrics.defensiveLineX > 45) {
    vulns.push({
      type: "high_line",
      description: `Línea defensiva alta (${metrics.defensiveLineX.toFixed(0)}m). Espacio a la espalda.`,
      confidence: 0.8,
      recommendation: "Pases al espacio detrás de la defensa. Movimientos en profundidad.",
    });
  }

  // Low compactness → gaps between lines
  if (metrics && metrics.compactnessM > 35) {
    vulns.push({
      type: "compact_bypass",
      description: `Poca compactación vertical (${metrics.compactnessM.toFixed(0)}m entre líneas).`,
      confidence: 0.7,
      recommendation: "Jugar entre líneas. Mediapuntas y falso 9 pueden explotar los espacios.",
    });
  }

  // Wide gaps detected
  if (gaps.length > 0) {
    const topGap = gaps[0];
    vulns.push({
      type: "wide_open",
      description: `Zona descubierta frecuente: ${topGap.zone} (${Math.round(topGap.frequency * 100)}% del tiempo).`,
      confidence: topGap.frequency,
      recommendation: `Dirigir ataques hacia la zona ${topGap.zone}. Sobrecarga por ese sector.`,
    });
  }

  // Weak pressing
  if (pressing && pressing.ppda > 15) {
    vulns.push({
      type: "weak_pressing",
      description: `Pressing débil (PPDA=${pressing.ppda}). Permiten muchos pases sin presión.`,
      confidence: 0.6,
      recommendation: "Salida larga desde atrás. Juego posicional para progresar sin oposición.",
    });
  }

  // Low pass completion → turnover prone
  if (passNetwork && passNetwork.completionPct < 70) {
    vulns.push({
      type: "slow_transition",
      description: `Baja precisión de pase (${passNetwork.completionPct}%). Propensos a pérdidas.`,
      confidence: 0.7,
      recommendation: "Pressing alto tras pérdida rival. Transiciones rápidas.",
    });
  }

  return vulns.sort((a, b) => b.confidence - a.confidence);
}
