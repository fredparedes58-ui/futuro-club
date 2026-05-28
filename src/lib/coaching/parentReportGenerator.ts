/**
 * VITAS · Parent Report Generator
 *
 * Generates monthly reports for parents in non-technical, encouraging language.
 * Input: PlayerDrillMetrics[] from last ~12 sessions + PHV data.
 * Output: ParentReport with simple metrics, trends, and growth context.
 *
 * Sprint 15: Coaching Assistant — Analysis & Recommendations
 */

import type {
  PlayerDrillMetrics,
  EngagementSnapshot,
  ParentReport,
} from "@/lib/shared/sessionTypes";

// ─── Configuration ────────────────────────────────────────────────────────

interface ReportConfig {
  /** Number of sessions to analyze (default: 12) */
  sessionsToAnalyze: number;
  /** Minimum sessions to generate report (default: 4) */
  minSessionsRequired: number;
}

const DEFAULT_CONFIG: ReportConfig = {
  sessionsToAnalyze: 12,
  minSessionsRequired: 4,
};

// ─── Trend Detection ──────────────────────────────────────────────────────

function detectTrend(
  values: number[],
): "improving" | "stable" | "declining" {
  if (values.length < 3) return "stable";

  const firstHalf = values.slice(0, Math.ceil(values.length / 2));
  const secondHalf = values.slice(Math.ceil(values.length / 2));

  const avgFirst = firstHalf.reduce((s, v) => s + v, 0) / firstHalf.length;
  const avgSecond = secondHalf.reduce((s, v) => s + v, 0) / secondHalf.length;

  const delta = avgSecond - avgFirst;
  const pctChange = avgFirst > 0 ? (delta / avgFirst) * 100 : 0;

  if (pctChange > 8) return "improving";
  if (pctChange < -8) return "declining";
  return "stable";
}

// ─── PHV Context for Parents ──────────────────────────────────────────────

function generateGrowthContext(
  age: number,
  phvOffset?: number | null,
): string | null {
  if (phvOffset === null || phvOffset === undefined) return null;

  if (Math.abs(phvOffset) <= 1.0) {
    return `Tu hijo/a está pasando por un periodo de crecimiento rápido (estirón). Es normal que durante esta fase su coordinación cambie temporalmente y que necesite más descanso. Esto NO significa que esté perdiendo habilidades — su cuerpo está adaptándose a nuevas proporciones. Es una fase temporal que todos los deportistas atraviesan.`;
  }

  if (phvOffset < -1.0 && age >= 12) {
    return `Tu hijo/a todavía no ha llegado a su estirón de crecimiento. Esto significa que puede ser más pequeño/a que algunos compañeros, pero tiene una ventaja: está en la mejor edad para desarrollar técnica y coordinación. Muchos de los mejores jugadores profesionales fueron de los más pequeños a esta edad.`;
  }

  if (phvOffset > 1.0) {
    return `Tu hijo/a ya pasó por su periodo de crecimiento principal. Ahora puede empezar a desarrollar más fuerza y velocidad. Es un buen momento para consolidar las habilidades técnicas que ha aprendido.`;
  }

  return null;
}

// ─── Positive Highlights ──────────────────────────────────────────────────

function generatePositives(
  metrics: PlayerDrillMetrics[],
  engagementSnapshots: EngagementSnapshot[],
): string[] {
  const positives: string[] = [];

  // Check participation trend
  const participations = metrics.map((m) => m.participationScore);
  if (participations.length > 0) {
    const avgParticipation =
      participations.reduce((s, v) => s + v, 0) / participations.length;
    if (avgParticipation > 60) {
      positives.push("Muestra una participación activa y constante en los entrenamientos");
    }
  }

  // Check social engagement
  if (engagementSnapshots.length > 0) {
    const avgSocial =
      engagementSnapshots.reduce((s, e) => s + e.socialEngagement, 0) /
      engagementSnapshots.length;
    if (avgSocial > 60) {
      positives.push("Se integra bien con el grupo y participa activamente con sus compañeros");
    }
  }

  // Check touches growth
  const touchesBySession = groupBySession(metrics);
  const touchTrend = detectTrend(
    touchesBySession.map((g) => g.reduce((s, m) => s + m.touches, 0)),
  );
  if (touchTrend === "improving") {
    positives.push("Ha mejorado su contacto con el balón en las últimas sesiones");
  }

  // Check intensity
  const avgIntensity =
    metrics.reduce((s, m) => s + m.avgIntensity, 0) / (metrics.length || 1);
  if (avgIntensity > 50) {
    positives.push("Entrena con buena intensidad y esfuerzo");
  }

  // Check scan count (awareness)
  const avgScans =
    metrics.reduce((s, m) => s + m.scanCount, 0) / (metrics.length || 1);
  if (avgScans > 3) {
    positives.push("Demuestra buena capacidad de observar el campo antes de actuar");
  }

  // Ensure at least 3 positives
  if (positives.length < 3) {
    positives.push("Asiste regularmente a los entrenamientos");
  }

  return positives.slice(0, 4);
}

// ─── Development Areas ────────────────────────────────────────────────────

function generateDevelopmentAreas(
  metrics: PlayerDrillMetrics[],
  engagementSnapshots: EngagementSnapshot[],
): string[] {
  const areas: string[] = [];

  const avgParticipation =
    metrics.reduce((s, m) => s + m.participationScore, 0) / (metrics.length || 1);
  const avgIntensity =
    metrics.reduce((s, m) => s + m.avgIntensity, 0) / (metrics.length || 1);

  if (avgParticipation < 40) {
    areas.push("Puede beneficiarse de más práctica individual para ganar confianza en los ejercicios grupales");
  }

  if (avgIntensity < 35) {
    areas.push("Tiene margen para aumentar su esfuerzo físico en los entrenamientos — animarle a dar un poco más cada sesión");
  }

  // Social isolation
  if (engagementSnapshots.length > 0) {
    const avgSocial =
      engagementSnapshots.reduce((s, e) => s + e.socialEngagement, 0) /
      engagementSnapshots.length;
    if (avgSocial < 35) {
      areas.push("Puede beneficiarse de actividades grupales fuera del entrenamiento para fortalecer su conexión con el equipo");
    }
  }

  return areas.slice(0, 2);
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function groupBySession(metrics: PlayerDrillMetrics[]): PlayerDrillMetrics[][] {
  // Group by drillIndex jumps (when drillIndex resets, it's a new session)
  const groups: PlayerDrillMetrics[][] = [];
  let current: PlayerDrillMetrics[] = [];

  for (const m of metrics) {
    if (current.length > 0 && m.drillIndex <= current[current.length - 1].drillIndex) {
      groups.push(current);
      current = [];
    }
    current.push(m);
  }
  if (current.length > 0) groups.push(current);

  return groups;
}

// ─── Main Generator ───────────────────────────────────────────────────────

export interface ParentReportInput {
  playerId: string;
  playerName: string;
  playerAge: number;
  phvOffset?: number | null;
  /** Metrics from last ~12 sessions (all drills combined) */
  recentMetrics: PlayerDrillMetrics[];
  /** Engagement snapshots from last ~12 sessions */
  recentEngagement: EngagementSnapshot[];
  /** Month for the report (ISO date: YYYY-MM-01) */
  reportMonth: string;
  /** Number of sessions the player attended */
  sessionsAttended: number;
  /** Total training minutes in the month */
  totalTrainingMinutes: number;
}

/**
 * Generate a parent-friendly monthly report.
 * Uses encouraging, non-technical language.
 */
export function generateParentReport(
  input: ParentReportInput,
  configOverrides?: Partial<ReportConfig>,
): ParentReport {
  const config = { ...DEFAULT_CONFIG, ...configOverrides };
  const {
    playerId, playerName, playerAge, phvOffset,
    recentMetrics, recentEngagement,
    reportMonth, sessionsAttended, totalTrainingMinutes,
  } = input;

  // Metrics within window
  const windowMetrics = recentMetrics.slice(-config.sessionsToAnalyze * 8); // ~8 drills per session max
  const windowEngagement = recentEngagement.slice(-config.sessionsToAnalyze);

  // Summary
  const avgParticipation =
    windowMetrics.length > 0
      ? windowMetrics.reduce((s, m) => s + m.participationScore, 0) / windowMetrics.length
      : 50;
  const avgEngagement =
    windowEngagement.length > 0
      ? windowEngagement.reduce((s, e) => s + e.engagementScore, 0) / windowEngagement.length
      : 50;

  // Trends
  const participationTrend = detectTrend(
    windowMetrics.map((m) => m.participationScore),
  );
  const intensityTrend = detectTrend(
    windowMetrics.map((m) => m.avgIntensity),
  );
  const socialTrend = detectTrend(
    windowEngagement.map((e) => e.socialEngagement),
  );

  // PHV context
  const growthContext = generateGrowthContext(playerAge, phvOffset);

  // Positives and development areas
  const positives = generatePositives(windowMetrics, windowEngagement);
  const developmentAreas = generateDevelopmentAreas(windowMetrics, windowEngagement);

  // Coach note (generated, can be overridden by actual coach input)
  const coachNote = avgParticipation > 60
    ? `${playerName} está teniendo un buen mes de entrenamiento. Sigue mostrando compromiso con el equipo y el proceso de mejora.`
    : `${playerName} está en proceso de adaptación. Animamos a seguir practicando y disfrutando del entrenamiento — cada sesión cuenta.`;

  return {
    playerId,
    playerName,
    reportMonth,
    summary: {
      sessionsAttended,
      totalTrainingMinutes,
      avgParticipationScore: Math.round(avgParticipation),
      avgEngagementScore: Math.round(avgEngagement),
    },
    trends: {
      participation: participationTrend,
      technique: participationTrend, // Proxy: touches ~ technique
      physical: intensityTrend,
      social: socialTrend,
    },
    growthContext,
    positives,
    developmentAreas,
    coachNote,
  };
}
