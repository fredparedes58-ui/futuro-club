/**
 * VITAS · Similarity Service
 * Motor de similitud por coseno — DETERMINISTA puro (sin IA, sin llamadas externas)
 *
 * Compara un vector VSI de jugador de academia contra la base de datos
 * de jugadores profesionales (pro_players en Supabase o fallback local).
 *
 * Mapping de métricas:
 *   VSI speed     → pro pace
 *   VSI shooting  → pro shooting
 *   VSI vision    → pro passing
 *   VSI technique → pro dribbling
 *   VSI defending → pro defending
 *   VSI stamina   → pro physic
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import PRO_PLAYERS, { type ProPlayer, getPositionGroup } from "@/data/proPlayers";
import {
  estimateAtAge,
  phvAdjustment,
  ageConfidence,
  type MetricName,
} from "@/data/developmentCurves";

// ─── Tipos ───────────────────────────────────────────────────────────────────

export interface VSIMetrics {
  speed:     number; // 0-100
  shooting:  number;
  vision:    number;
  technique: number;
  defending: number;
  stamina:   number;
}

export interface SimilarityMatch {
  player:          ProPlayer;
  score:           number;   // 0-100 (porcentaje de similitud coseno)
  positionMatch:   boolean;
  ageAdjusted?:    boolean;  // true si se aplicó ajuste por edad
  proAtYouthAge?:  Record<string, number>; // métricas estimadas del pro a la edad del youth
}

export interface SimilarityResult {
  top5:            SimilarityMatch[];
  bestMatch:       SimilarityMatch;
  avgScore:        number;
  dominantGroup:   string;
  source:          "supabase" | "local";
  computedAt:      string;
  ageAdjusted:     boolean;
  confidence:      number;  // 0-1, basado en edad del youth
}

// ─── Internos ─────────────────────────────────────────────────────────────────

function toProVector(p: ProPlayer): number[] {
  return [
    p.pace       / 99,
    p.shooting   / 99,
    p.passing    / 99,
    p.dribbling  / 99,
    p.defending  / 99,
    p.physic     / 99,
  ];
}

function toVSIVector(m: VSIMetrics): number[] {
  return [
    m.speed     / 100,
    m.shooting  / 100,
    m.vision    / 100,
    m.technique / 100,
    m.defending / 100,
    m.stamina   / 100,
  ];
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  if (magA === 0 || magB === 0) return 0;
  return dot / (Math.sqrt(magA) * Math.sqrt(magB));
}

/** Devuelve true si la posición del pro está cerca de la del jugador de academia */
function isPositionCompatible(playerPos: string, proPos: string): boolean {
  const playerGroup = getPositionGroup(playerPos);
  const proGroup    = getPositionGroup(proPos);

  // Mismo grupo exacto
  if (playerGroup === proGroup) return true;

  // Grupos adyacentes permitidos
  const adjacent: Record<string, string[]> = {
    ST:  ["W", "AM"],
    W:   ["ST", "AM"],
    AM:  ["W", "CM"],
    CM:  ["AM", "DM"],
    DM:  ["CM", "CB"],
    FB:  ["CB", "W"],
    CB:  ["DM", "FB"],
  };

  return adjacent[playerGroup]?.includes(proGroup) ?? false;
}

// ─── De-aging: estimar stats del pro a la edad del youth ─────────────────────

/**
 * Estima las métricas de un jugador profesional a una edad más joven,
 * usando las curvas de desarrollo científicas + Kaggle.
 *
 * Ejemplo: Rodri (28, passing 88) → a los 14 se estima ~47
 */
function deAgeProPlayer(
  pro: ProPlayer,
  targetAge: number
): { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physic: number } {
  const posGroup = getPositionGroup(pro.position);
  const metrics: MetricName[] = ["pace", "shooting", "passing", "dribbling", "defending", "physic"];

  const result: Record<string, number> = {};
  for (const metric of metrics) {
    const currentVal = pro[metric];
    result[metric] = estimateAtAge(currentVal, pro.age, targetAge, posGroup, metric);
  }

  return result as { pace: number; shooting: number; passing: number; dribbling: number; defending: number; physic: number };
}

/** Convierte métricas de pro de-aged a vector normalizado (0-1) */
function deAgedToVector(deAged: Record<string, number>): number[] {
  return [
    deAged.pace      / 99,
    deAged.shooting  / 99,
    deAged.passing   / 99,
    deAged.dribbling / 99,
    deAged.defending / 99,
    deAged.physic    / 99,
  ];
}

// ─── Función principal ────────────────────────────────────────────────────────

/**
 * Calcula top-5 jugadores profesionales similares a un jugador de academia.
 * Con ajuste por edad: "de-ages" a los pros para compararlos al nivel del youth.
 *
 * @param metrics   - Métricas VSI del jugador (0-100)
 * @param position  - Posición del jugador ("ST", "CM", "RW", etc.)
 * @param options   - Opciones de filtrado
 */
export async function findSimilarPlayers(
  metrics: VSIMetrics,
  position: string,
  options: {
    topN?:              number;
    minOverall?:        number;
    positionFilter?:    "strict" | "flexible" | "none";
    boostSamePosition?: boolean;
    youthAge?:          number;  // Edad del jugador de academia
    phvOffset?:         number;  // PHV offset para ajuste madurativo
  } = {}
): Promise<SimilarityResult> {
  const {
    topN              = 5,
    minOverall        = 70,
    positionFilter    = "flexible",
    boostSamePosition = true,
    youthAge,
    phvOffset         = 0,
  } = options;

  const useAgeAdjustment = youthAge !== undefined && youthAge < 21;

  // 1. Obtener la base de datos de pros (Supabase preferido, fallback local)
  let proPlayers: ProPlayer[] = [];
  let source: "supabase" | "local" = "local";

  if (SUPABASE_CONFIGURED) {
    try {
      const { data, error } = await supabase
        .from("pro_players")
        .select("*")
        .gte("overall", minOverall);

      if (!error && data && data.length > 0) {
        proPlayers = data as ProPlayer[];
        source = "supabase";
      }
    } catch {
      // Fallback silencioso a local
    }
  }

  if (proPlayers.length === 0) {
    proPlayers = PRO_PLAYERS.filter((p) => p.overall >= minOverall);
  }

  // 2. Construir vector del jugador de academia
  const youthVec = toVSIVector(metrics);

  // Ajuste PHV: modificar el vector youth si hay offset madurativo
  const phvFactor = youthAge ? phvAdjustment(youthAge, phvOffset) : 1.0;

  // 3. Calcular similitud para cada pro
  const scored = proPlayers.map((pro) => {
    let comparisonVec: number[];
    let proAtYouthAgeMetrics: Record<string, number> | undefined;

    if (useAgeAdjustment) {
      // MODE: Age-adjusted — "de-age" el pro a la edad del youth
      // En vez de comparar youth (14, ~50 OVR) vs pro (28, 89 OVR),
      // estimamos qué métricas tenía el pro a los 14 y comparamos eso.
      const deAged = deAgeProPlayer(pro, youthAge!);
      comparisonVec = deAgedToVector(deAged);
      proAtYouthAgeMetrics = deAged;
    } else {
      // MODE: Classic — comparar vectores directos (con penalización magnitud)
      comparisonVec = toProVector(pro);
    }

    let rawSimilarity = cosineSimilarity(youthVec, comparisonVec);

    // Penalización por brecha de magnitud (solo en modo clásico)
    // En modo age-adjusted la brecha ya se reduce por el de-aging
    if (!useAgeAdjustment) {
      const youthAvg = (metrics.speed + metrics.shooting + metrics.vision +
                        metrics.technique + metrics.defending + metrics.stamina) / 6;
      const levelGap = pro.overall - youthAvg;
      if (levelGap > 10) {
        const penalty = Math.max(0.5, 1 - (levelGap - 10) / 80);
        rawSimilarity *= penalty;
      }
    }

    // Boost de 5% si comparte posición exacta (para relevancia táctica)
    const positionMatch = isPositionCompatible(position, pro.position);
    if (boostSamePosition && positionMatch) {
      rawSimilarity = Math.min(1, rawSimilarity * 1.05);
    }

    // Filtro de posición
    if (positionFilter === "strict" && !positionMatch) return null;
    if (positionFilter === "flexible" && !positionMatch) {
      rawSimilarity *= 0.85; // penalty si posición lejana
    }

    return {
      player:         pro,
      score:          Math.round(rawSimilarity * 1000) / 10, // 0-100 con 1 decimal
      positionMatch,
      ageAdjusted:    useAgeAdjustment,
      proAtYouthAge:  proAtYouthAgeMetrics,
    } as SimilarityMatch;
  }).filter(Boolean) as SimilarityMatch[];

  // 4. Ordenar descendente y tomar top N
  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topN);

  // 5. Grupo dominante (posición más frecuente en top5)
  const groupCount: Record<string, number> = {};
  top.forEach((m) => {
    const g = getPositionGroup(m.player.position);
    groupCount[g] = (groupCount[g] ?? 0) + 1;
  });
  const dominantGroup = Object.entries(groupCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "CM";

  const avgScore = top.length > 0
    ? Math.round((top.reduce((s, m) => s + m.score, 0) / top.length) * 10) / 10
    : 0;

  const { confidence } = youthAge ? ageConfidence(youthAge) : { confidence: 0.95 };

  return {
    top5:          top,
    bestMatch:     top[0],
    avgScore,
    dominantGroup,
    source,
    computedAt:    new Date().toISOString(),
    ageAdjusted:   useAgeAdjustment,
    confidence,
  };
}

// ─── Helpers de presentación ──────────────────────────────────────────────────

/** Etiqueta verbal para el score */
export function scoreToBadge(score: number): { label: string; color: string } {
  if (score >= 92) return { label: "Clon",         color: "#FFD700" };
  if (score >= 85) return { label: "Muy similar",  color: "#22C55E" };
  if (score >= 75) return { label: "Similar",      color: "#3B82F6" };
  if (score >= 60) return { label: "Referencia",   color: "#8B5CF6" };
  return                   { label: "Inspiración", color: "#6B7280" };
}

/** Descripción narrativa del match */
export function matchNarrative(match: SimilarityMatch): string {
  const { score, player } = match;
  const badge = scoreToBadge(score);
  if (score >= 92)
    return `Perfil casi idéntico a ${player.short_name} — misma firma técnica y física.`;
  if (score >= 85)
    return `Comparte el ADN futbolístico de ${player.short_name} (${player.position}, ${player.club}).`;
  if (score >= 75)
    return `Similitudes claras con ${player.short_name}: posición, estilo y físico coinciden.`;
  if (score >= 60)
    return `${player.short_name} es una referencia de desarrollo para este perfil.`;
  return `${player.short_name} representa un horizonte aspiracional para el jugador.`;
}
