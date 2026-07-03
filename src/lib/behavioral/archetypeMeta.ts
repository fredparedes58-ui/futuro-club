/**
 * VITAS · Meta de arquetipos mentales (Sprint 3.6 · ADN Mental)
 *
 * Fuente única para el card compartible y la composición de plantilla.
 * (ArchetypeCard.tsx y BehavioralOverviewPage.tsx mantienen su meta local;
 *  esta vive para los componentes de productización nuevos.)
 */

export type Archetype = "commander" | "creator" | "engine" | "ghost" | "warrior" | "architect";

export interface ArchetypeMeta {
  key: Archetype;
  label: string;
  /** Frase de una línea, ideal para compartir. */
  tagline: string;
  description: string;
  /** Rol que aporta a la plantilla (para el análisis de composición). */
  role: string;
  color: string; // hex — sirve tanto en Tailwind arbitrary como en canvas export
  emoji: string;
}

export const ARCHETYPE_META: Record<Archetype, ArchetypeMeta> = {
  commander: {
    key: "commander",
    label: "Comandante",
    tagline: "Organiza al equipo y manda bajo presión.",
    description: "Líder vocal que mantiene la calma y ordena al equipo. Referente en el campo.",
    role: "un líder que organice",
    color: "#ef4444",
    emoji: "🛡️",
  },
  creator: {
    key: "creator",
    label: "Creador",
    tagline: "Ve el pase que nadie más ve.",
    description: "Impredecible, con visión excepcional. Encuentra soluciones que rompen líneas.",
    role: "una chispa creativa",
    color: "#fbbf24",
    emoji: "💡",
  },
  engine: {
    key: "engine",
    label: "Motor",
    tagline: "El corazón que no baja el ritmo.",
    description: "Constante y fiable durante los 90 minutos. Resiliente y de bajo desgaste.",
    role: "un motor de energía",
    color: "#10b981",
    emoji: "⚙️",
  },
  ghost: {
    key: "ghost",
    label: "Fantasma",
    tagline: "Lee el juego antes de que ocurra.",
    description: "Inteligencia silenciosa. Escanea y anticipa mejor que nadie; lidera con el ejemplo.",
    role: "un lector silencioso del juego",
    color: "#94a3b8",
    emoji: "👻",
  },
  warrior: {
    key: "warrior",
    label: "Guerrero",
    tagline: "Crece cuando el partido se pone difícil.",
    description: "Competitividad inquebrantable. Gana duelos y aparece en los momentos clave.",
    role: "un competidor que gane duelos",
    color: "#f97316",
    emoji: "⚔️",
  },
  architect: {
    key: "architect",
    label: "Arquitecto",
    tagline: "Construye el juego desde la cabeza.",
    description: "Estratega de decisiones rápidas y precisas. Diseña el juego leyendo el campo.",
    role: "un cerebro táctico",
    color: "#3b82f6",
    emoji: "🧭",
  },
};

export const ALL_ARCHETYPES: Archetype[] = [
  "commander",
  "creator",
  "engine",
  "ghost",
  "warrior",
  "architect",
];

export interface SquadInsight {
  tone: "gap" | "reliance" | "balanced";
  text: string;
}

/**
 * Analiza la composición mental de la plantilla y devuelve insights accionables:
 * arquetipos ausentes (huecos) y sobre-dependencia de uno solo.
 */
export function analyzeSquadComposition(
  counts: Record<Archetype, number>,
  total: number,
): SquadInsight[] {
  if (total === 0) return [];
  const insights: SquadInsight[] = [];

  // Sobre-dependencia: un arquetipo con ≥50% de la plantilla (y equipo ≥ 3).
  if (total >= 3) {
    const dominant = ALL_ARCHETYPES.map((a) => ({ a, n: counts[a] })).sort((x, y) => y.n - x.n)[0];
    if (dominant && dominant.n / total >= 0.5) {
      const m = ARCHETYPE_META[dominant.a];
      insights.push({
        tone: "reliance",
        text: `Dependes mucho de ${m.label}s (${dominant.n}/${total}). Un rival que los neutralice te deja sin plan B.`,
      });
    }
  }

  // Huecos: arquetipos ausentes, priorizando los más diferenciales.
  const missing = ALL_ARCHETYPES.filter((a) => counts[a] === 0);
  if (missing.length > 0 && total >= 3) {
    // Prioriza arquitecto/creador/comandante (los que más se echan en falta).
    const priority: Archetype[] = ["architect", "creator", "commander", "warrior", "ghost", "engine"];
    const topMissing = priority.filter((a) => missing.includes(a)).slice(0, 2);
    for (const a of topMissing) {
      const m = ARCHETYPE_META[a];
      insights.push({ tone: "gap", text: `No tienes ningún ${m.label}: te falta ${m.role}.` });
    }
  }

  if (insights.length === 0) {
    insights.push({ tone: "balanced", text: "Plantilla mentalmente equilibrada — hay de todo en el vestuario." });
  }

  return insights.slice(0, 3);
}
