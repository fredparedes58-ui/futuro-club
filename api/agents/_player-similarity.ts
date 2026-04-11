/**
 * VITAS · API: Player Similarity Engine
 * POST /api/agents/player-similarity
 *
 * Calcula top-5 jugadores profesionales similares usando similitud por coseno.
 * Determinista puro — sin tokens de IA, sin latencia extra.
 *
 * Improvements:
 * - youthAge + phvOffset support for de-aging
 * - Position-specific PHV curves
 * - Diversity weighting (no 5 players from same position)
 * - Weighted metric importance
 * - Per-match confidence scores
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { PRO_PLAYERS, type ProPlayer } from "../data/_proPlayers";

// ─── Zod schema ───────────────────────────────────────────────────────────────

const similaritySchema = z.object({
  metrics: z.object({
    speed: z.number(),
    shooting: z.number(),
    vision: z.number(),
    technique: z.number(),
    defending: z.number(),
    stamina: z.number(),
  }),
  position: z.string().min(1),
  youthAge: z.number().min(8).max(21).optional(),
  phvOffset: z.number().optional(),
  options: z.object({
    minOverall: z.number().optional(),
    positionFilter: z.enum(["strict", "flexible", "none"]).optional(),
    boostSamePosition: z.boolean().optional(),
    topN: z.number().optional(),
    diversify: z.boolean().optional(),
  }).optional(),
});

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface VSIMetrics {
  speed:     number;
  shooting:  number;
  vision:    number;
  technique: number;
  defending: number;
  stamina:   number;
}

interface SimilarityMatch {
  player:         ProPlayer;
  score:          number;
  positionMatch:  boolean;
  ageAdjusted?:   boolean;
  proAtYouthAge?: Record<string, number>;
  confidence?:    number;
}

// ─── Posición helpers ──────────────────────────────────────────────────────────

const POSITION_GROUPS: Record<string, string[]> = {
  GK:  ["GK"],
  CB:  ["CB", "RCB", "LCB"],
  FB:  ["RB", "LB", "WB", "RWB", "LWB"],
  DM:  ["CDM", "DM"],
  CM:  ["CM", "LCM", "RCM", "CDM", "CAM"],
  AM:  ["CAM", "SS", "LM", "RM", "CM"],
  W:   ["LW", "RW", "LM", "RM", "CAM"],
  ST:  ["ST", "CF", "LW", "RW"],
};

const ADJACENT: Record<string, string[]> = {
  ST:  ["W", "AM"],
  W:   ["ST", "AM"],
  AM:  ["W", "CM"],
  CM:  ["AM", "DM"],
  DM:  ["CM", "CB"],
  FB:  ["CB", "W"],
  CB:  ["DM", "FB"],
};

function getGroup(pos: string): string {
  for (const [group, list] of Object.entries(POSITION_GROUPS)) {
    if (list.includes(pos)) return group;
  }
  return "CM";
}

function isCompatible(youthPos: string, proPos: string): boolean {
  const yG = getGroup(youthPos);
  const pG = getGroup(proPos);
  if (yG === pG) return true;
  return ADJACENT[yG]?.includes(pG) ?? false;
}

// ─── Metric weights (technique/vision > physic/defending) ──────────────────

const METRIC_WEIGHTS = [1.2, 1.0, 1.3, 1.4, 0.8, 0.7];

function weightedCosine(a: number[], b: number[], w: number[]): number {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) {
    const wa = a[i] * w[i];
    const wb = b[i] * w[i];
    dot += wa * wb;
    mA  += wa * wa;
    mB  += wb * wb;
  }
  if (mA === 0 || mB === 0) return 0;
  return dot / (Math.sqrt(mA) * Math.sqrt(mB));
}

function vsiVec(m: VSIMetrics): number[] {
  return [m.speed, m.shooting, m.vision, m.technique, m.defending, m.stamina].map(v => v / 100);
}

function proVec(p: ProPlayer): number[] {
  return [p.pace, p.shooting, p.passing, p.dribbling, p.defending, p.physic].map(v => v / 99);
}

// ─── Development curves (simplified for API — no import) ──────────────────

const CURVES: Record<string, Record<number, number>> = {
  pace:      { 8:0.30, 10:0.38, 12:0.48, 14:0.63, 16:0.78, 18:0.87, 20:0.93, 22:0.97, 25:1.00, 28:0.96, 30:0.91 },
  shooting:  { 8:0.20, 10:0.29, 12:0.40, 14:0.52, 16:0.66, 18:0.78, 20:0.87, 22:0.93, 25:0.97, 28:1.00, 30:0.96 },
  passing:   { 8:0.18, 10:0.27, 12:0.37, 14:0.48, 16:0.60, 18:0.72, 20:0.82, 22:0.89, 25:0.96, 28:0.99, 30:1.00 },
  dribbling: { 8:0.25, 10:0.36, 12:0.49, 14:0.63, 16:0.76, 18:0.85, 20:0.92, 22:0.96, 25:1.00, 28:0.97, 30:0.92 },
  defending: { 8:0.15, 10:0.22, 12:0.31, 14:0.42, 16:0.54, 18:0.66, 20:0.77, 22:0.86, 25:0.94, 28:0.98, 30:1.00 },
  physic:    { 8:0.22, 10:0.30, 12:0.41, 14:0.56, 16:0.71, 18:0.82, 20:0.89, 22:0.94, 25:0.98, 28:1.00, 30:0.97 },
};

const POS_OFFSET: Record<string, number> = { GK:2, CB:1, FB:0, DM:1, CM:0, AM:-1, W:-1, ST:-1 };

function devFactor(age: number, posGroup: string, metric: string): number {
  const curve = CURVES[metric] ?? CURVES.passing;
  const offset = POS_OFFSET[posGroup] ?? 0;
  const effectiveAge = Math.max(8, Math.min(30, age - offset));
  const ages = Object.keys(curve).map(Number).sort((a, b) => a - b);
  // Find bracket
  for (let i = 0; i < ages.length - 1; i++) {
    if (effectiveAge >= ages[i] && effectiveAge <= ages[i + 1]) {
      const t = (effectiveAge - ages[i]) / (ages[i + 1] - ages[i]);
      return curve[ages[i]] + (curve[ages[i + 1]] - curve[ages[i]]) * t;
    }
  }
  return curve[ages[ages.length - 1]] ?? 0.5;
}

function deAgePro(pro: ProPlayer, targetAge: number): Record<string, number> {
  const posGroup = getGroup(pro.position);
  const metrics = ["pace", "shooting", "passing", "dribbling", "defending", "physic"];
  const result: Record<string, number> = {};
  for (const m of metrics) {
    const current = devFactor(pro.age, posGroup, m);
    const target = devFactor(targetAge, posGroup, m);
    result[m] = current > 0 ? Math.round(pro[m as keyof ProPlayer] as number * (target / current)) : 0;
  }
  return result;
}

// ─── Position-specific PHV adjustment ───────────────────────────────────────

function posPhvAdj(age: number, phvOffset: number, position: string): number {
  if (!phvOffset || age > 20 || age < 11 || age > 18) return 1.0;
  const phvProximity = 1 - Math.abs(age - 14) / 4;
  const effect = phvOffset * 0.03 * Math.max(0, phvProximity);
  const baseFactor = Math.max(0.85, Math.min(1.15, 1 + effect));
  const posMultiplier: Record<string, number> = {
    GK:1.2, CB:1.15, FB:0.9, DM:1.0, CM:0.8, AM:0.7, W:0.85, ST:0.95
  };
  const mult = posMultiplier[getGroup(position)] ?? 1.0;
  const deviation = baseFactor - 1.0;
  return 1.0 + deviation * mult;
}

// ─── Age confidence ─────────────────────────────────────────────────────────

function ageConf(age?: number): number {
  if (!age) return 0.95;
  if (age <= 12) return 0.4;
  if (age <= 15) return 0.6;
  if (age <= 17) return 0.8;
  return 0.95;
}

// ─── Diversity selection ────────────────────────────────────────────────────

function diverseTopN(scored: SimilarityMatch[], topN: number): SimilarityMatch[] {
  if (scored.length <= topN) return scored;
  const result: SimilarityMatch[] = [];
  const groupCount: Record<string, number> = {};
  const maxPerGroup = Math.max(2, Math.ceil(topN / 3));

  for (const match of scored) {
    if (result.length >= topN) break;
    const group = getGroup(match.player.position);
    const count = groupCount[group] ?? 0;
    if (count < maxPerGroup) {
      result.push(match);
      groupCount[group] = count + 1;
    }
  }

  if (result.length < topN) {
    const ids = new Set(result.map(m => m.player.id));
    for (const match of scored) {
      if (result.length >= topN) break;
      if (!ids.has(match.player.id)) result.push(match);
    }
  }
  return result;
}

// ─── Handler ───────────────────────────────────────────────────────────────────

export default withHandler(
  { requireAuth: true, schema: similaritySchema },
  async ({ body }) => {
    const { metrics, position, youthAge, phvOffset = 0, options = {} } = body;
    const {
      minOverall        = 70,
      positionFilter    = "flexible",
      boostSamePosition = true,
      topN              = 5,
      diversify         = true,
    } = options ?? {};

    const useAgeAdj = youthAge !== undefined && youthAge < 21;

    // Obtener jugadores desde Supabase
    const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY;

    let proPlayers: ProPlayer[] = [];
    let source = "local";

    if (supabaseUrl && supabaseKey) {
      try {
        const url = `${supabaseUrl}/rest/v1/pro_players?select=*&overall=gte.${minOverall}`;
        const res = await fetch(url, {
          headers: {
            "apikey":        supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
          },
        });
        if (res.ok) {
          proPlayers = await res.json();
          source = "supabase";
        }
      } catch {
        // fallback local
      }
    }

    if (proPlayers.length === 0) {
      proPlayers = PRO_PLAYERS as ProPlayer[];
      source = "local";
    }

    const candidates = proPlayers.filter(p => p.overall >= minOverall);
    const yVec = vsiVec(metrics as VSIMetrics);

    // Apply PHV adjustment to youth vector
    const phvFactor = youthAge ? posPhvAdj(youthAge, phvOffset, position) : 1.0;
    const adjustedYVec = yVec.map(v => Math.min(1, v * phvFactor));

    // Calcular similitud
    const scored: SimilarityMatch[] = candidates.map(pro => {
      let compVec: number[];
      let proAtYouthAge: Record<string, number> | undefined;

      if (useAgeAdj) {
        proAtYouthAge = deAgePro(pro, youthAge!);
        compVec = Object.values(proAtYouthAge).map(v => v / 99);
      } else {
        compVec = proVec(pro);
      }

      let sim = weightedCosine(adjustedYVec, compVec, METRIC_WEIGHTS);
      const posMatch = isCompatible(position, pro.position);

      // Magnitude penalty (classic mode only)
      if (!useAgeAdj) {
        const youthAvg = Object.values(metrics as VSIMetrics).reduce((a, b) => a + b, 0) / 6;
        const gap = pro.overall - youthAvg;
        if (gap > 10) sim *= Math.max(0.5, 1 - (gap - 10) / 80);
      }

      if (boostSamePosition && posMatch) sim = Math.min(1, sim * 1.05);
      if (positionFilter === "strict" && !posMatch) return null!;
      if (positionFilter === "flexible" && !posMatch) sim *= 0.85;

      let matchConf = ageConf(youthAge);
      if (!posMatch) matchConf *= 0.85;

      return {
        player:        pro,
        score:         Math.round(sim * 1000) / 10,
        positionMatch: posMatch,
        ageAdjusted:   useAgeAdj,
        proAtYouthAge,
        confidence:    Math.round(matchConf * 100) / 100,
      };
    }).filter(Boolean);

    scored.sort((a, b) => b.score - a.score);
    const top = diversify ? diverseTopN(scored, topN) : scored.slice(0, topN);

    // Diversity score
    const groupSet = new Set(top.map(m => getGroup(m.player.position)));
    const diversityScore = top.length > 0 ? Math.round((groupSet.size / top.length) * 100) / 100 : 0;

    // Grupo dominante
    const groupCount: Record<string, number> = {};
    top.forEach(m => {
      const g = getGroup(m.player.position);
      groupCount[g] = (groupCount[g] ?? 0) + 1;
    });
    const dominantGroup = Object.entries(groupCount).sort((a, b) => b[1] - a[1])[0]?.[0] ?? "CM";

    const avgScore = top.length > 0
      ? Math.round(top.reduce((s, m) => s + m.score, 0) / top.length * 10) / 10
      : 0;

    return successResponse(
      {
        success:        true,
        top5:           top,
        bestMatch:      top[0] ?? null,
        avgScore,
        dominantGroup,
        source,
        computedAt:     new Date().toISOString(),
        ageAdjusted:    useAgeAdj,
        confidence:     ageConf(youthAge),
        diversityScore,
      },
      200,
      { "Cache-Control": "no-store" }
    );
  }
);
