/**
 * VITAS · API: Player Similarity Engine
 * POST /api/agents/player-similarity
 *
 * Calcula top-5 jugadores profesionales similares usando similitud por coseno.
 * Determinista puro — sin tokens de IA, sin latencia extra.
 *
 * Body:
 * {
 *   metrics:  { speed, shooting, vision, technique, defending, stamina }  // 0-100
 *   position: "ST" | "CM" | "RW" | ...
 *   options?: { minOverall, positionFilter, boostSamePosition }
 * }
 */


import { PRO_PLAYERS, type ProPlayer } from "../data/proPlayers";

// ─── Tipos duplicados aquí para el Edge runtime (no puede importar todo el bundle) ─

interface VSIMetrics {
  speed:     number;
  shooting:  number;
  vision:    number;
  technique: number;
  defending: number;
  stamina:   number;
}

interface SimilarityMatch {
  player:        ProPlayer;
  score:         number;
  positionMatch: boolean;
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

// ─── Cosine similarity ─────────────────────────────────────────────────────────

function cosine(a: number[], b: number[]): number {
  let dot = 0, mA = 0, mB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    mA  += a[i] * a[i];
    mB  += b[i] * b[i];
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

// ─── Handler ───────────────────────────────────────────────────────────────────

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { "Content-Type": "application/json" },
    });
  }

  let body: {
    metrics:  VSIMetrics;
    position: string;
    options?: {
      minOverall?:        number;
      positionFilter?:    "strict" | "flexible" | "none";
      boostSamePosition?: boolean;
      topN?:              number;
    };
  };

  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON body" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

  const { metrics, position, options = {} } = body;
  const {
    minOverall        = 70,
    positionFilter    = "flexible",
    boostSamePosition = true,
    topN              = 5,
  } = options;

  // Validar métricas
  if (!metrics || !position) {
    return new Response(JSON.stringify({ error: "metrics and position are required" }), {
      status: 400,
      headers: { "Content-Type": "application/json" },
    });
  }

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

  // Fallback to local dataset if Supabase unavailable or empty
  if (proPlayers.length === 0) {
    proPlayers = PRO_PLAYERS as ProPlayer[];
    source = "local";
  }

  // Filtrar por overall mínimo
  const candidates = proPlayers.filter(p => p.overall >= minOverall);

  // Vector del jugador
  const yVec = vsiVec(metrics);

  // Calcular similitud
  const scored: SimilarityMatch[] = candidates.map(pro => {
    const pVec        = proVec(pro);
    let   sim         = cosine(yVec, pVec);
    const posMatch    = isCompatible(position, pro.position);

    if (boostSamePosition && posMatch)   sim = Math.min(1, sim * 1.05);
    if (positionFilter === "strict"   && !posMatch) return null!;
    if (positionFilter === "flexible" && !posMatch) sim *= 0.85;

    return {
      player:        pro,
      score:         Math.round(sim * 1000) / 10,
      positionMatch: posMatch,
    };
  }).filter(Boolean);

  scored.sort((a, b) => b.score - a.score);
  const top = scored.slice(0, topN);

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

  return new Response(
    JSON.stringify({
      success:       true,
      top5:          top,
      bestMatch:     top[0] ?? null,
      avgScore,
      dominantGroup,
      source,
      computedAt:    new Date().toISOString(),
    }),
    { status: 200, headers: { "Content-Type": "application/json", "Cache-Control": "no-store" } }
  );
}
