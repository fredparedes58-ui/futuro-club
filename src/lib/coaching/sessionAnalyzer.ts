/**
 * VITAS · Session Analyzer
 *
 * Analyzes training session balance (% technical/tactical/physical/game)
 * and compares against LTAD-recommended balance for the team's age group.
 * Integrates PHV-adjusted fatigue thresholds for load analysis.
 *
 * Sprint 15: Coaching Assistant — Analysis & Recommendations
 */

import type {
  TrainingSegment,
  ClassifiedDrill,
  PlayerDrillMetrics,
  SegmentType,
} from "@/lib/shared/sessionTypes";
import type { SessionAnalysis, SessionBalance, LoadAnalysis, PlayerHighlight } from "@/lib/shared/sessionTypes";

// ─── LTAD Balance by Age Group ────────────────────────────────────────────

interface LTADBalance {
  technical: number;  // % of session time
  tactical: number;
  physical: number;
  game: number;
  warmupCooldown: number;
  label: string;
}

/**
 * Recommended session balance per LTAD phase.
 * Source: YOUTH_DEVELOPMENT_DOCS (dev-ltad-model)
 */
const LTAD_BALANCE_BY_AGE: Array<{ minAge: number; maxAge: number; balance: LTADBalance }> = [
  {
    minAge: 6, maxAge: 9,
    balance: {
      technical: 30, tactical: 5, physical: 10, game: 45, warmupCooldown: 10,
      label: "FUNdamentals (6-9): 80% juego libre, técnica a través del juego",
    },
  },
  {
    minAge: 9, maxAge: 12,
    balance: {
      technical: 45, tactical: 15, physical: 10, game: 20, warmupCooldown: 10,
      label: "Learning to Train (9-12): 70% técnica, ventana dorada de adquisición",
    },
  },
  {
    minAge: 12, maxAge: 15,
    balance: {
      technical: 30, tactical: 25, physical: 15, game: 20, warmupCooldown: 10,
      label: "Training to Train (12-15): Técnica bajo presión + desarrollo físico (PHV)",
    },
  },
  {
    minAge: 15, maxAge: 18,
    balance: {
      technical: 20, tactical: 20, physical: 15, game: 35, warmupCooldown: 10,
      label: "Training to Compete (15-18): 40% técnico-táctico, 30% competitivo, 30% físico",
    },
  },
  {
    minAge: 18, maxAge: 21,
    balance: {
      technical: 15, tactical: 15, physical: 20, game: 40, warmupCooldown: 10,
      label: "Training to Win (18-21): 50% competitivo, optimización individual",
    },
  },
];

function getLTADBalance(avgAge: number): LTADBalance {
  const match = LTAD_BALANCE_BY_AGE.find(
    (b) => avgAge >= b.minAge && avgAge < b.maxAge,
  );
  return match?.balance ?? LTAD_BALANCE_BY_AGE[2].balance; // default: 12-15
}

// ─── Segment Type to Category Mapping ─────────────────────────────────────

function segmentToBalanceCategory(
  type: SegmentType,
): keyof Omit<SessionBalance, "ideal" | "deviations" | "overallScore"> {
  switch (type) {
    case "technical": return "technical";
    case "tactical": return "tactical";
    case "physical": return "physical";
    case "game_small_sided":
    case "game_full": return "game";
    case "warmup":
    case "cooldown":
    case "transition_break": return "warmupCooldown";
  }
}

// ─── Load Analysis ────────────────────────────────────────────────────────

/** Maximum recommended session load by age (minutes × intensity) */
const MAX_LOAD_BY_AGE: Array<{ minAge: number; maxAge: number; maxLoadScore: number; maxMinutes: number }> = [
  { minAge: 6, maxAge: 9, maxLoadScore: 150, maxMinutes: 60 },
  { minAge: 9, maxAge: 12, maxLoadScore: 250, maxMinutes: 75 },
  { minAge: 12, maxAge: 15, maxLoadScore: 400, maxMinutes: 90 },
  { minAge: 15, maxAge: 18, maxLoadScore: 550, maxMinutes: 100 },
  { minAge: 18, maxAge: 21, maxLoadScore: 700, maxMinutes: 120 },
];

function getMaxLoad(avgAge: number, phvOffset?: number | null): { maxLoadScore: number; maxMinutes: number } {
  const match = MAX_LOAD_BY_AGE.find(
    (l) => avgAge >= l.minAge && avgAge < l.maxAge,
  ) ?? MAX_LOAD_BY_AGE[2];

  let { maxLoadScore, maxMinutes } = match;

  // PHV adjustment: reduce max load by 20-30% during PHV
  if (phvOffset !== null && phvOffset !== undefined) {
    if (Math.abs(phvOffset) <= 1.0) {
      // During PHV (circa PHV)
      maxLoadScore = Math.round(maxLoadScore * 0.75);
      maxMinutes = Math.round(maxMinutes * 0.85);
    }
  }

  return { maxLoadScore, maxMinutes };
}

function calculateSessionLoad(segments: TrainingSegment[]): number {
  // Load = sum of (duration × intensity multiplier)
  const intensityMultiplier: Record<string, number> = {
    low: 1.0,
    medium: 2.0,
    high: 3.5,
  };

  return segments.reduce((total, seg) => {
    const multiplier = intensityMultiplier[seg.signals.intensityLevel] ?? 1.5;
    return total + seg.durationMin * multiplier;
  }, 0);
}

// ─── Player Highlights ────────────────────────────────────────────────────

function generatePlayerHighlights(
  drillMetrics: PlayerDrillMetrics[],
  maxHighlights: number = 5,
): PlayerHighlight[] {
  // Group by player
  const byPlayer = new Map<string, PlayerDrillMetrics[]>();
  for (const m of drillMetrics) {
    const existing = byPlayer.get(m.playerId) ?? [];
    existing.push(m);
    byPlayer.set(m.playerId, existing);
  }

  const highlights: PlayerHighlight[] = [];

  for (const [playerId, metrics] of byPlayer) {
    const avgParticipation =
      metrics.reduce((s, m) => s + m.participationScore, 0) / metrics.length;
    const avgIntensity =
      metrics.reduce((s, m) => s + m.avgIntensity, 0) / metrics.length;
    const totalTouches = metrics.reduce((s, m) => s + m.touches, 0);
    const avgCentroidDist =
      metrics.reduce((s, m) => s + m.distanceToCentroidM, 0) / metrics.length;

    // Top performer
    if (avgParticipation > 70 && avgIntensity > 60) {
      highlights.push({
        playerId,
        type: "top_performer",
        description: `Participación alta (${Math.round(avgParticipation)}/100) con intensidad consistente`,
        metric: avgParticipation,
      });
    }

    // Low participation
    if (avgParticipation < 30) {
      highlights.push({
        playerId,
        type: "low_participation",
        description: `Participación baja (${Math.round(avgParticipation)}/100) — posible desconexión`,
        metric: avgParticipation,
      });
    }

    // High touches (technique drill star)
    if (totalTouches > 50) {
      highlights.push({
        playerId,
        type: "high_touches",
        description: `${totalTouches} toques totales — alta implicación con balón`,
        metric: totalTouches,
      });
    }

    // Isolated (social concern — feeds Burnout)
    if (avgCentroidDist > 12) {
      highlights.push({
        playerId,
        type: "isolated",
        description: `Distancia promedio al grupo: ${avgCentroidDist.toFixed(1)}m — alejado del grupo`,
        metric: avgCentroidDist,
      });
    }
  }

  // Sort by relevance (low participation first, then others)
  highlights.sort((a, b) => {
    const priority: Record<string, number> = {
      low_participation: 0, isolated: 1, top_performer: 2, high_touches: 3,
    };
    return (priority[a.type] ?? 5) - (priority[b.type] ?? 5);
  });

  return highlights.slice(0, maxHighlights);
}

// ─── Main Analyzer ────────────────────────────────────────────────────────

export interface SessionAnalyzerInput {
  segments: TrainingSegment[];
  drills: ClassifiedDrill[];
  drillMetrics: PlayerDrillMetrics[];
  /** Average age of the team (for LTAD comparison) */
  teamAvgAge: number;
  /** PHV offset of team (for load adjustment) */
  teamPhvOffset?: number | null;
  /** Session duration in minutes */
  sessionDurationMin: number;
}

/**
 * Analyze a training session:
 * 1. Calculate actual balance (% per type)
 * 2. Compare with LTAD ideal for age
 * 3. Analyze load vs recommended
 * 4. Generate player highlights
 */
export function analyzeSession(input: SessionAnalyzerInput): SessionAnalysis {
  const {
    segments, drills, drillMetrics,
    teamAvgAge, teamPhvOffset, sessionDurationMin,
  } = input;

  // ── Step 1: Calculate actual balance ──

  const totalDuration = segments.reduce((s, seg) => s + seg.durationMin, 0);
  const durationByCategory: Record<string, number> = {
    technical: 0, tactical: 0, physical: 0, game: 0, warmupCooldown: 0,
  };

  for (const seg of segments) {
    const cat = segmentToBalanceCategory(seg.type);
    durationByCategory[cat] += seg.durationMin;
  }

  const actual = {
    technical: totalDuration > 0 ? (durationByCategory.technical / totalDuration) * 100 : 0,
    tactical: totalDuration > 0 ? (durationByCategory.tactical / totalDuration) * 100 : 0,
    physical: totalDuration > 0 ? (durationByCategory.physical / totalDuration) * 100 : 0,
    game: totalDuration > 0 ? (durationByCategory.game / totalDuration) * 100 : 0,
    warmupCooldown: totalDuration > 0 ? (durationByCategory.warmupCooldown / totalDuration) * 100 : 0,
  };

  // ── Step 2: Compare with LTAD ideal ──

  const ideal = getLTADBalance(teamAvgAge);
  const deviations = {
    technical: actual.technical - ideal.technical,
    tactical: actual.tactical - ideal.tactical,
    physical: actual.physical - ideal.physical,
    game: actual.game - ideal.game,
    warmupCooldown: actual.warmupCooldown - ideal.warmupCooldown,
  };

  // Overall balance score: 100 = perfect match, 0 = completely off
  const totalDeviation =
    Math.abs(deviations.technical) +
    Math.abs(deviations.tactical) +
    Math.abs(deviations.physical) +
    Math.abs(deviations.game) +
    Math.abs(deviations.warmupCooldown);
  const overallScore = Math.max(0, Math.round(100 - totalDeviation));

  const balance: SessionBalance = {
    actual,
    ideal: {
      technical: ideal.technical,
      tactical: ideal.tactical,
      physical: ideal.physical,
      game: ideal.game,
      warmupCooldown: ideal.warmupCooldown,
      label: ideal.label,
    },
    deviations,
    overallScore,
  };

  // ── Step 3: Load analysis ──

  const sessionLoad = calculateSessionLoad(segments);
  const { maxLoadScore, maxMinutes } = getMaxLoad(teamAvgAge, teamPhvOffset);
  const loadPct = maxLoadScore > 0 ? (sessionLoad / maxLoadScore) * 100 : 0;
  const durationPct = maxMinutes > 0 ? (sessionDurationMin / maxMinutes) * 100 : 0;

  const loadAnalysis: LoadAnalysis = {
    sessionLoad: Math.round(sessionLoad),
    maxRecommendedLoad: maxLoadScore,
    loadPct: Math.round(loadPct),
    sessionDurationMin,
    maxRecommendedMinutes: maxMinutes,
    durationPct: Math.round(durationPct),
    zone: loadPct < 70 ? "low" : loadPct <= 100 ? "optimal" : loadPct <= 120 ? "caution" : "overload",
    phvAdjusted: teamPhvOffset !== null && teamPhvOffset !== undefined && Math.abs(teamPhvOffset) <= 1.0,
    recommendation: loadPct > 120
      ? "Carga excesiva. Reducir intensidad o duración en próxima sesión."
      : loadPct > 100
        ? "Carga ligeramente alta. Monitorear fatiga en próxima sesión."
        : loadPct < 70
          ? "Carga baja. Considerar aumentar intensidad si no hay fatiga acumulada."
          : "Carga dentro del rango óptimo.",
  };

  // ── Step 4: Player highlights ──

  const highlights = generatePlayerHighlights(drillMetrics);

  return {
    sessionDurationMin,
    segmentCount: segments.length,
    drillCount: drills.length,
    playerCount: new Set(drillMetrics.map((m) => m.playerId)).size,
    balance,
    loadAnalysis,
    highlights,
    teamAvgAge,
    ltadPhase: ideal.label,
  };
}
