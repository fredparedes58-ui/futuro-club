/**
 * VITAS · Compare to Rival (Sprint B3 · día 3-5)
 * POST /api/team/compare-rival
 *
 * Compara TU equipo contra un rival descrito por el coach (sin vídeo).
 * Claude analiza la asimetría de fortalezas/debilidades y genera plan
 * de partido + drills específicos para entrenar la semana previa.
 *
 * Body:
 *   {
 *     rivalName: string,
 *     rivalFormation?: string,
 *     rivalNotes?: string,         // texto libre con lo que sabe el coach
 *     rivalStrengths?: string[],   // hasta 3
 *     rivalWeaknesses?: string[],  // hasta 3
 *     rivalKeyPlayers?: Array<{ name: string; position: string; threat: string }>,
 *     matchContext?: string,       // local/visitante, eliminatoria, etc.
 *   }
 *
 * Returns: { plan: { tactical, key_matchups, exploitable, vulnerabilities, drills } }
 *
 * Cost: ~€0.05 por análisis (1x Sonnet con prompt cache).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const PIPELINE_VERSION = "compare-rival-v1.0";

const bodySchema = z.object({
  rivalName: z.string().min(1).max(80),
  rivalFormation: z.string().max(40).optional(),
  rivalNotes: z.string().max(800).optional(),
  rivalStrengths: z.array(z.string().max(120)).max(5).optional(),
  rivalWeaknesses: z.array(z.string().max(120)).max(5).optional(),
  rivalKeyPlayers: z
    .array(
      z.object({
        name: z.string().max(80),
        position: z.string().max(40),
        threat: z.string().max(160),
      }),
    )
    .max(5)
    .optional(),
  matchContext: z.string().max(200).optional(),
});

const SYSTEM_PROMPT = `Eres el motor Compare-to-Rival VITAS. Comparas DOS equipos juveniles
y produces plan de partido + drills.

ENFOQUE:
- Identifica matchups críticos (qué jugador tuyo defiende a qué rival clave)
- Detecta vulnerabilidades del rival que TU equipo puede explotar
- Detecta vulnerabilidades TUYAS que ellos pueden explotar
- Da plan de partido en 3 fases (inicio · medio · cierre)
- Recomienda drills concretos para entrenar la semana previa

CONSIDERA SIEMPRE:
- Distribución PHV de tu equipo (precoces / on-time / tardíos)
- Asimetría física esperada por categoría/edad
- Que el rival tiene su propia distribución desconocida (asumir mixta)
- POLIVALENCIA: si un jugador tiene secondary_positions, eso da flexibilidad táctica
  · Para key_matchups específicos sugiere mover jugadores polivalentes a la posición ideal contra ese rival
  · Ej: "Samu (LB principal · también DM): jugar de DM para neutralizar al 10 rival"

Output JSON estricto:
{
  "tldr": "string max 200 chars · resumen 1 frase del plan",
  "tactical_approach": {
    "formation_recommended": "string · ej. 1-3-2-3",
    "high_press":  boolean,
    "compactness": "alta|media|baja",
    "tempo": "rapido|controlado|paciente",
    "key_principle": "string max 160 chars"
  },
  "key_matchups": [
    {
      "ours": "string · jugador o posición tuya",
      "theirs": "string · rival",
      "approach": "string max 140 chars · cómo defenderlo/atacarlo"
    }
  ],
  "exploit_their_weaknesses": [
    {"weakness": "string", "how_to_exploit": "string max 140 chars"}
  ],
  "guard_our_vulnerabilities": [
    {"our_vulnerability": "string", "mitigation": "string max 140 chars"}
  ],
  "match_phases": {
    "first_15min":  "string max 160 chars",
    "mid_match":    "string max 160 chars",
    "last_15min":   "string max 160 chars"
  },
  "training_week": {
    "monday":    "string · ej. recuperación + análisis vídeo rival",
    "wednesday": "string · drill principal",
    "friday":    "string · activación pre-partido"
  },
  "recommended_drills": [
    {"drill": "string", "purpose": "string max 100 chars", "duration_min": integer}
  ],
  "wildcards": [
    {"scenario": "string · ej. si nos meten gol pronto", "response": "string max 140 chars"}
  ]
}

3 matchups, 2-3 weaknesses, 2-3 vulnerabilities, 3-5 drills, 2 wildcards.
Sin markdown.`;

interface PlayerSummary {
  name: string | null;
  age: number | null;
  position: string | null;
  vsi: number;
  phv_category: string | null;
}

function buildContext(
  ours: PlayerSummary[],
  ourTeamName: string,
  rival: z.infer<typeof bodySchema>,
): string {
  const phvCounts = {
    early:   ours.filter((p) => p.phv_category === "early").length,
    ontime:  ours.filter((p) => p.phv_category === "ontime" || p.phv_category === "ontme").length,
    late:    ours.filter((p) => p.phv_category === "late").length,
    unknown: ours.filter((p) => !p.phv_category).length,
  };
  const avgVsi = ours.length > 0 ? (ours.reduce((a, p) => a + Number(p.vsi || 0), 0) / ours.length).toFixed(1) : "—";
  const ages = ours.map((p) => p.age ?? 0).filter((a) => a > 0);
  const avgAge = ages.length > 0 ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : "?";

  return `─── NUESTRO EQUIPO ───
Nombre: ${ourTeamName}
Plantilla: ${ours.length} jugadores · Edad promedio ${avgAge}a
VSI promedio: ${avgVsi}
PHV: pre-estirón ${phvCounts.early} · ontime ${phvCounts.ontime} · post-estirón ${phvCounts.late}${phvCounts.unknown ? ` · sin medir ${phvCounts.unknown}` : ""}

Top 8 por VSI:
${ours
  .sort((a, b) => Number(b.vsi || 0) - Number(a.vsi || 0))
  .slice(0, 8)
  .map((p, i) => `  ${i + 1}. ${p.name ?? "?"} (${p.position ?? "?"}, ${p.age ?? "?"}a, VSI ${Number(p.vsi || 0).toFixed(0)}, PHV ${p.phv_category ?? "?"})`)
  .join("\n")}

─── RIVAL ───
Nombre: ${rival.rivalName}
${rival.rivalFormation   ? `Formación reportada: ${rival.rivalFormation}` : "Formación: desconocida"}
${rival.matchContext     ? `Contexto: ${rival.matchContext}` : ""}
${rival.rivalNotes       ? `\nNotas del coach:\n${rival.rivalNotes}` : ""}
${rival.rivalStrengths?.length ? `\nFortalezas conocidas:\n${rival.rivalStrengths.map((s) => `  - ${s}`).join("\n")}` : ""}
${rival.rivalWeaknesses?.length ? `\nDebilidades conocidas:\n${rival.rivalWeaknesses.map((w) => `  - ${w}`).join("\n")}` : ""}
${rival.rivalKeyPlayers?.length ? `\nJugadores clave:\n${rival.rivalKeyPlayers.map((k) => `  - ${k.name} (${k.position}): ${k.threat}`).join("\n")}` : ""}

LIMITACIÓN: Análisis SIN VÍDEO del rival · basado en lo que reporta
el coach. Genera plan accionable y honesto sobre incertidumbre.`;
}

async function callClaude(system: string, user: string): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2500,
      system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); }
  catch { return { _raw: raw, _parseError: true }; }
}

export default withHandler(
  { schema: bodySchema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId }) => {
    if (!ANTHROPIC_API_KEY) {
      return errorResponse({ code: "no_api_key", message: "missing", status: 500 });
    }
    const input = body as z.infer<typeof bodySchema>;
    const startedAt = Date.now();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Cargar nuestro equipo (top 40 por VSI) ──────────────
    // Incluimos secondary_positions para que el agente considere polivalencia al
    // diseñar el matchup (un LB que también es DM da más flexibilidad táctica)
    const { data: players, error } = await supabase
      .from("players")
      .select("name, age, position, secondary_positions, vsi, phv_category")
      .order("vsi", { ascending: false })
      .limit(40);

    if (error || !players || players.length === 0) {
      return errorResponse({
        code: "no_players",
        message: "Sin jugadores en plantilla · imposible comparar",
        status: 400,
      });
    }

    // ── 2. Generar plan ────────────────────────────────────────
    let plan: Record<string, unknown>;
    try {
      plan = await callClaude(SYSTEM_PROMPT, buildContext(players as PlayerSummary[], "Mi equipo", input));
    } catch (err) {
      return errorResponse({
        code: "claude_error",
        message: err instanceof Error ? err.message : "Claude failed",
        status: 502,
      });
    }

    return successResponse({
      plan,
      pipelineVersion: PIPELINE_VERSION,
      generatedAt: new Date().toISOString(),
      latencyMs: Date.now() - startedAt,
      ourTeamSize: players.length,
      rivalName: input.rivalName,
      generatedBy: userId,
    });
  }
);
