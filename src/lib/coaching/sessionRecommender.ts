/**
 * VITAS · Session Recommender
 *
 * Generates training recommendations based on:
 * - Current session analysis (balance deviations)
 * - Last 8 sessions history
 * - Team weaknesses
 * - DRILLS_LIBRARY matching
 * - Fatigue/load state
 *
 * Sprint 15: Coaching Assistant — Analysis & Recommendations
 */

import type {
  SessionAnalysis,
  SessionRecommendation,
  DrillSuggestion,
  WeeklySessionPlan,
} from "@/lib/shared/sessionTypes";
import { DRILLS_LIBRARY, type DrillDocument } from "../../data/drillsLibrary";

// ─── Weakness-to-Drill Mapping ────────────────────────────────────────────

/**
 * Maps identified weaknesses/gaps to drill categories and priorities.
 */
const WEAKNESS_TO_DRILL_MAP: Record<string, {
  categories: DrillDocument["category"][];
  keywords: string[];
  priority: "high" | "medium" | "low";
}> = {
  technical_deficit: {
    categories: ["tecnica"],
    keywords: ["rondo", "control", "pase", "conduccion"],
    priority: "high",
  },
  tactical_deficit: {
    categories: ["tactica", "pressing"],
    keywords: ["posicional", "pressing", "transicion"],
    priority: "high",
  },
  physical_deficit: {
    categories: ["fisico"],
    keywords: ["sprint", "resistencia", "fuerza"],
    priority: "medium",
  },
  game_deficit: {
    categories: ["tactica", "transicion"],
    keywords: ["partido", "5v5", "juego"],
    priority: "medium",
  },
  pressing_weakness: {
    categories: ["pressing"],
    keywords: ["pressing", "gegenpressing", "recuperacion"],
    priority: "high",
  },
  shooting_weakness: {
    categories: ["disparo"],
    keywords: ["disparo", "definicion", "remate"],
    priority: "medium",
  },
  transition_weakness: {
    categories: ["transicion"],
    keywords: ["transicion", "contraataque", "defensa-ataque"],
    priority: "high",
  },
};

// ─── Drill Matching ───────────────────────────────────────────────────────

function findDrillsForGap(
  gap: string,
  teamAvgAge: number,
  maxResults: number = 3,
): DrillSuggestion[] {
  const mapping = WEAKNESS_TO_DRILL_MAP[gap];
  if (!mapping) return [];

  // Filter drills by category and age range
  const candidates = DRILLS_LIBRARY.filter((drill) => {
    if (!mapping.categories.includes(drill.category)) return false;
    if (teamAvgAge < drill.ageRange[0] || teamAvgAge > drill.ageRange[1]) return false;
    return true;
  });

  // Score by keyword relevance
  const scored = candidates.map((drill) => {
    const nameNorm = drill.name.toLowerCase();
    const descNorm = drill.description.toLowerCase();
    let score = 0;

    for (const kw of mapping.keywords) {
      if (nameNorm.includes(kw)) score += 3;
      if (descNorm.includes(kw)) score += 1;
    }

    return { drill, score };
  });

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, maxResults).map(({ drill }) => ({
    drillId: drill.id,
    drillName: drill.name,
    reason: `Aborda ${gap.replace(/_/g, " ")} — ${drill.objectives[0] ?? drill.description.slice(0, 80)}`,
    addressesGap: gap,
    durationMin: drill.durationMin,
    priority: mapping.priority,
  }));
}

// ─── Gap Detection ────────────────────────────────────────────────────────

interface DetectedGap {
  id: string;
  description: string;
  severity: number; // 0-100
}

function detectGaps(
  analysis: SessionAnalysis,
  recentSessions?: SessionAnalysis[],
): DetectedGap[] {
  const gaps: DetectedGap[] = [];
  const { balance } = analysis;

  // Balance deviations
  if (balance.deviations.technical < -15) {
    gaps.push({
      id: "technical_deficit",
      description: `Déficit técnico: ${Math.abs(Math.round(balance.deviations.technical))}% por debajo del ideal LTAD`,
      severity: Math.abs(balance.deviations.technical),
    });
  }

  if (balance.deviations.tactical < -15) {
    gaps.push({
      id: "tactical_deficit",
      description: `Déficit táctico: ${Math.abs(Math.round(balance.deviations.tactical))}% por debajo del ideal`,
      severity: Math.abs(balance.deviations.tactical),
    });
  }

  if (balance.deviations.physical < -10) {
    gaps.push({
      id: "physical_deficit",
      description: `Déficit físico: ${Math.abs(Math.round(balance.deviations.physical))}% por debajo del ideal`,
      severity: Math.abs(balance.deviations.physical),
    });
  }

  if (balance.deviations.game < -15) {
    gaps.push({
      id: "game_deficit",
      description: `Poco juego real: ${Math.abs(Math.round(balance.deviations.game))}% por debajo del ideal`,
      severity: Math.abs(balance.deviations.game),
    });
  }

  // Check if recent sessions show persistent patterns
  if (recentSessions && recentSessions.length >= 3) {
    const avgTechnical =
      recentSessions.reduce((s, a) => s + a.balance.actual.technical, 0) /
      recentSessions.length;

    if (avgTechnical < 15 && analysis.teamAvgAge < 15) {
      gaps.push({
        id: "technical_deficit",
        description: "Historial: menos de 15% técnica en últimas sesiones — ventana sensible en riesgo",
        severity: 80,
      });
    }
  }

  // Sort by severity
  gaps.sort((a, b) => b.severity - a.severity);
  return gaps;
}

// ─── Weekly Plan Generation ───────────────────────────────────────────────

function generateWeeklyPlan(
  gaps: DetectedGap[],
  teamAvgAge: number,
  loadZone: string,
): WeeklySessionPlan[] {
  // Base schedule: 4 sessions/week for U14+, 3 for younger
  const sessionsPerWeek = teamAvgAge >= 14 ? 4 : 3;

  const plans: WeeklySessionPlan[] = [];

  // Monday: Technical focus
  plans.push({
    dayOfWeek: 1,
    focus: "Técnica individual + Rondos",
    suggestedDrills: findDrillsForGap("technical_deficit", teamAvgAge, 2),
    totalMinutes: teamAvgAge >= 15 ? 90 : 75,
    intensityLevel: "medium",
  });

  // Wednesday: Tactical + Physical
  plans.push({
    dayOfWeek: 3,
    focus: "Táctica colectiva + Físico",
    suggestedDrills: [
      ...findDrillsForGap("tactical_deficit", teamAvgAge, 1),
      ...findDrillsForGap("physical_deficit", teamAvgAge, 1),
    ],
    totalMinutes: teamAvgAge >= 15 ? 90 : 75,
    intensityLevel: loadZone === "overload" ? "medium" : "high",
  });

  // Thursday/Friday: Game application
  plans.push({
    dayOfWeek: sessionsPerWeek >= 4 ? 4 : 5,
    focus: "Juego aplicado + Transiciones",
    suggestedDrills: [
      ...findDrillsForGap("game_deficit", teamAvgAge, 1),
      ...findDrillsForGap("transition_weakness", teamAvgAge, 1),
    ],
    totalMinutes: teamAvgAge >= 15 ? 90 : 75,
    intensityLevel: "high",
  });

  if (sessionsPerWeek >= 4) {
    // Friday: Address specific gaps
    const topGap = gaps[0]?.id ?? "technical_deficit";
    plans.push({
      dayOfWeek: 5,
      focus: `Trabajo específico: ${topGap.replace(/_/g, " ")}`,
      suggestedDrills: findDrillsForGap(topGap, teamAvgAge, 3),
      totalMinutes: teamAvgAge >= 15 ? 75 : 60,
      intensityLevel: "medium",
    });
  }

  return plans;
}

// ─── Main Recommender ─────────────────────────────────────────────────────

export interface RecommenderInput {
  /** Current session analysis */
  currentAnalysis: SessionAnalysis;
  /** Last 8 session analyses (optional) */
  recentSessions?: SessionAnalysis[];
  /** PHV offset for load adjustment */
  phvOffset?: number | null;
}

/**
 * Generate session recommendations.
 *
 * Algorithm:
 * 1. Detect gaps from current session + history
 * 2. Map gaps to drills from DRILLS_LIBRARY
 * 3. Generate weekly plan addressing top gaps
 * 4. Add load adjustment based on fatigue state
 */
export function recommendSession(input: RecommenderInput): SessionRecommendation {
  const { currentAnalysis, recentSessions, phvOffset } = input;

  // ── Step 1: Detect gaps ──

  const gaps = detectGaps(currentAnalysis, recentSessions);

  // ── Step 2: Map to drills ──

  const areasToImprove = gaps.slice(0, 3).map((g) => g.description);

  const nextSessionDrills: DrillSuggestion[] = [];
  for (const gap of gaps.slice(0, 3)) {
    const drills = findDrillsForGap(gap.id, currentAnalysis.teamAvgAge, 2);
    nextSessionDrills.push(...drills);
  }

  // Deduplicate by drillId
  const seen = new Set<string>();
  const uniqueDrills = nextSessionDrills.filter((d) => {
    if (seen.has(d.drillId)) return false;
    seen.add(d.drillId);
    return true;
  });

  // ── Step 3: Generate weekly plan ──

  const weeklyPlan = generateWeeklyPlan(
    gaps,
    currentAnalysis.teamAvgAge,
    currentAnalysis.loadAnalysis.zone,
  );

  // ── Step 4: Load adjustment ──

  const { loadAnalysis } = currentAnalysis;
  let loadAdjustment: string;

  if (loadAnalysis.zone === "overload") {
    loadAdjustment = "REDUCIR carga un 15-20% en próximas 2 sesiones. Priorizar técnica sobre físico.";
  } else if (loadAnalysis.zone === "caution") {
    loadAdjustment = "Mantener carga actual pero monitorizar fatiga. No aumentar intensidad.";
  } else if (loadAnalysis.zone === "low") {
    loadAdjustment = "Carga baja — considerar aumentar intensidad un 10% si no hay fatiga acumulada.";
  } else {
    loadAdjustment = "Carga óptima. Mantener plan actual.";
  }

  // ── PHV notes ──

  let phvNotes: string | null = null;
  if (phvOffset !== null && phvOffset !== undefined) {
    if (Math.abs(phvOffset) <= 1.0) {
      phvNotes = `Equipo en periodo PHV (offset: ${phvOffset.toFixed(1)}). Reducir ejercicios de impacto (sprints máximos, saltos repetidos). Priorizar trabajo técnico de bajo impacto. Monitorear dolor articular post-sesión.`;
    } else if (phvOffset < -1.0) {
      phvNotes = `Equipo pre-PHV. Ventana óptima para desarrollo técnico y coordinación. Maximizar trabajo con balón.`;
    } else {
      phvNotes = `Equipo post-PHV. Ventana para desarrollo de fuerza y potencia. Incluir trabajo de fuerza funcional.`;
    }
  }

  return {
    areasToImprove,
    nextSessionDrills: uniqueDrills.slice(0, 6),
    weeklyPlan,
    loadAdjustment,
    phvNotes,
  };
}
