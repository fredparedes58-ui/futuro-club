/**
 * VITAS · Team Baseline Analysis (sin vídeo)
 * POST /api/team/baseline-analysis
 *
 * Análogo a /api/players/baseline-analysis pero a nivel equipo:
 * agrega métricas de TODOS los jugadores del tenant (o un subset
 * por jerseyNumbers) y genera 4 reportes Claude:
 *
 *   - team-overview (Sonnet): resumen ejecutivo, fortalezas, áreas
 *   - tactical-profile (Haiku): formación sugerida, estilo, fases
 *   - phv-stratification (Haiku): mix de precoz/ontime/tardío y plan
 *   - opponent-readiness (Haiku): vulnerabilidades genéricas + drills
 *
 * Body: { playerIds?: string[] }
 *   · si no se pasa, usa todos los players del tenant del usuario
 * Returns: { reports: {...}, teamSize, vsiPromedio, phvDistribution }
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { MODELS } from "../_lib/models";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { avgEvaluatedVsi, byVsiDescNullsLast, formatVsi } from "../_lib/vsiStats";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const PIPELINE_VERSION = "team-baseline-v1.0";

const bodySchema = z.object({
  playerIds: z.array(z.string()).optional(),
  teamName: z.string().max(80).optional(),
  videoObservation: z.record(z.unknown()).optional(),
});

interface PlayerSummary {
  id: string;
  name: string | null;
  age: number | null;
  position: string | null;
  vsi: number | null;
  phv_category: string | null;
  metric_speed: number;
  metric_technique: number;
  metric_vision: number;
  metric_stamina: number;
  metric_shooting: number;
  metric_defending: number;
  height_cm: number | null;
  weight_kg: number | null;
}

async function callClaude(opts: {
  model: (typeof MODELS)[keyof typeof MODELS];
  system: string;
  user: string;
  maxTokens?: number;
}): Promise<Record<string, unknown>> {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": ANTHROPIC_API_KEY,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: opts.maxTokens ?? 1500,
      system: [{ type: "text", text: opts.system, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: opts.user }],
    }),
  });
  if (!res.ok) {
    throw new Error(`Claude ${res.status}: ${(await res.text()).slice(0, 200)}`);
  }
  const data = await res.json();
  const raw = data.content?.[0]?.text ?? "{}";
  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "").trim();
  try { return JSON.parse(cleaned); }
  catch { return { _raw: raw, _parseError: true }; }
}

function buildVideoSection(video: Record<string, unknown>): string {
  const lines: string[] = ["\n─── ANÁLISIS DE VÍDEO DEL EQUIPO (Gemini) ───"];

  const resumen = video.resumenGeneral as string | undefined;
  if (resumen) lines.push(`Resumen: ${resumen}`);

  const patrones = video.patronesJuego as string[] | undefined;
  if (patrones?.length) {
    lines.push("Patrones de juego observados:");
    patrones.forEach((p) => lines.push(`  • ${p}`));
  }

  const dims = video.dimensiones as Record<string, { observaciones?: string[]; score_estimado?: number }> | undefined;
  if (dims) {
    lines.push("Dimensiones evaluadas:");
    for (const [key, val] of Object.entries(dims)) {
      if (val?.score_estimado != null) {
        lines.push(`  ${key}: ${val.score_estimado}/10`);
        val.observaciones?.slice(0, 2).forEach((o) => lines.push(`    - ${o}`));
      }
    }
  }

  const destacados = video.momentosDestacados as Array<{ timestamp?: string; tipo?: string; descripcion?: string }> | undefined;
  if (destacados?.length) {
    lines.push("Momentos destacados:");
    destacados.slice(0, 5).forEach((m) =>
      lines.push(`  [${m.timestamp ?? "?"}] ${m.tipo ?? ""}: ${m.descripcion ?? ""}`)
    );
  }

  const eventos = video.eventosContados as Record<string, number> | undefined;
  if (eventos && Object.keys(eventos).length > 0) {
    lines.push("Eventos contados:");
    for (const [k, v] of Object.entries(eventos)) {
      if (v > 0) lines.push(`  ${k}: ${v}`);
    }
  }

  return lines.join("\n");
}

function teamProfileBlock(players: PlayerSummary[], teamName: string, videoObservation?: Record<string, unknown>): string {
  const n = players.length;
  const ages = players.map((p) => p.age ?? 0).filter((a) => a > 0);
  const avgAge = ages.length > 0 ? (ages.reduce((a, b) => a + b, 0) / ages.length).toFixed(1) : "?";

  const positions = new Map<string, number>();
  players.forEach((p) => {
    const pos = p.position ?? "—";
    positions.set(pos, (positions.get(pos) ?? 0) + 1);
  });

  const phvCounts = { early: 0, ontime: 0, late: 0, unknown: 0 };
  players.forEach((p) => {
    const cat = p.phv_category;
    if (cat === "early") phvCounts.early++;
    else if (cat === "late") phvCounts.late++;
    else if (cat === "ontime" || cat === "ontme") phvCounts.ontime++;
    else phvCounts.unknown++;
  });

  // Media SOLO sobre evaluados (vsi != null). Un jugador sin evaluar no baja la
  // media como 0 (invariante #2). Sin ninguno evaluado ⇒ "sin evaluar".
  const avgVsiNum = avgEvaluatedVsi(players);
  const avgVsiLabel = avgVsiNum === null
    ? "sin evaluar (ningún jugador con VSI de ficha)"
    : `${avgVsiNum.toFixed(1)}/100`;

  const avgMetrics = {
    speed:     n > 0 ? (players.reduce((a, p) => a + Number(p.metric_speed || 0), 0) / n).toFixed(0) : "—",
    technique: n > 0 ? (players.reduce((a, p) => a + Number(p.metric_technique || 0), 0) / n).toFixed(0) : "—",
    vision:    n > 0 ? (players.reduce((a, p) => a + Number(p.metric_vision || 0), 0) / n).toFixed(0) : "—",
    stamina:   n > 0 ? (players.reduce((a, p) => a + Number(p.metric_stamina || 0), 0) / n).toFixed(0) : "—",
    shooting:  n > 0 ? (players.reduce((a, p) => a + Number(p.metric_shooting || 0), 0) / n).toFixed(0) : "—",
    defending: n > 0 ? (players.reduce((a, p) => a + Number(p.metric_defending || 0), 0) / n).toFixed(0) : "—",
  };

  const positionsList = Array.from(positions.entries())
    .map(([pos, count]) => `${pos}(${count})`)
    .join(", ");

  return `EQUIPO: ${teamName}
- Plantilla: ${n} jugadores
- Edad promedio: ${avgAge} años
- Posiciones: ${positionsList}
- VSI promedio: ${avgVsiLabel}

DISTRIBUCIÓN PHV (maduración biológica)
- Pre-estirón (precoz): ${phvCounts.early}
- En estirón (ontime): ${phvCounts.ontime}
- Post-estirón (tardío): ${phvCounts.late}
- Sin medir: ${phvCounts.unknown}

VALORACIÓN COACH PROMEDIO (0-100)
- Velocidad: ${avgMetrics.speed} · Resistencia: ${avgMetrics.stamina}
- Técnica: ${avgMetrics.technique} · Visión: ${avgMetrics.vision}
- Tiro: ${avgMetrics.shooting} · Defensa: ${avgMetrics.defending}

JUGADORES INDIVIDUALES (top 8 por VSI · "—" = sin evaluar, al final)
${[...players]
  .sort(byVsiDescNullsLast)
  .slice(0, 8)
  .map((p, i) => `${i + 1}. ${p.name ?? "?"} (${p.position ?? "?"}, ${p.age ?? "?"}a, VSI ${formatVsi(p.vsi)}, PHV ${p.phv_category ?? "?"})`)
  .join("\n")}

${videoObservation
    ? `${buildVideoSection(videoObservation)}

VENTAJA: Análisis baseline CON VÍDEO via Gemini. Usa las observaciones
del vídeo para enriquecer los reportes con evidencia visual real.
Prioriza datos del vídeo sobre estimaciones genéricas.`
    : `LIMITACIÓN: Análisis baseline SIN VÍDEO. No hay datos de partido, posesión,
PPDA, ni eventos de juego real. Basa el reporte en el perfil agregado del
equipo y la distribución PHV. Sé honesto sobre las limitaciones.`}`;
}

const TEAM_PROMPTS = {
  "team-overview": {
    model: MODELS.reasoning,
    system: `Eres el motor del Team Overview VITAS · baseline mode.
Output JSON estricto:
{
  "title": "Análisis VITAS · [Nombre Equipo]",
  "executive_summary": "string max 320 chars · resumen para coach",
  "team_strengths": [{"title":"string","evidence":"string max 120 chars"}],
  "team_weaknesses": [{"title":"string","evidence":"string max 120 chars","priority":"high|medium|low"}],
  "vsi_summary": "string max 200 chars · qué dice el VSI promedio + distribución",
  "next_focus": "string max 220 chars · qué priorizar próximas 4 semanas"
}
3 fortalezas, 3 debilidades. Sin markdown.`,
  },
  "tactical-profile": {
    model: MODELS.fast,
    system: `Eres el motor del Tactical Profile VITAS · baseline.
Sugiere formación táctica + estilo + fases ofensiva/defensiva basado en el perfil.
Output JSON:
{
  "formation_suggested": "string · ej. 1-3-2-3 / 1-2-3-2",
  "playing_style": "string max 120 chars",
  "offensive_phase": "string max 160 chars",
  "defensive_phase": "string max 160 chars",
  "transition_focus": "string max 140 chars"
}
Sin markdown.`,
  },
  "phv-stratification": {
    model: MODELS.fast,
    system: `Eres el motor de PHV Stratification VITAS.
Analiza el mix de fases de maduración del equipo y sugiere planes diferenciados.
Output JSON:
{
  "mix_summary": "string max 180 chars",
  "early_group_plan":  "string max 140 chars · plan para precoces",
  "ontime_group_plan": "string max 140 chars · plan para on-time",
  "late_group_plan":   "string max 140 chars · plan para tardíos",
  "risk_warning": "string max 160 chars · riesgo de over-reliance en precoces"
}
Sin markdown.`,
  },
  "opponent-readiness": {
    model: MODELS.fast,
    system: `Eres el motor de Opponent Readiness VITAS · baseline.
Sin vídeo del rival, sugiere preparación genérica basada en debilidades del equipo.
Output JSON:
{
  "vulnerabilities": ["string","string","string"],
  "exploitable_strengths": ["string","string"],
  "recommended_drills": ["string","string","string"]
}
Sin markdown.`,
  },
  "tactical-zones": {
    model: MODELS.fast,
    system: `Eres el motor de Tactical Zones VITAS · baseline.
Estima eficacia ofensiva y defensiva por las 9 ZONAS DEL CAMPO (3 tercios x 3 carriles)
basado en el perfil del equipo. SIN vídeo, son ESTIMACIONES proyectadas.

Distribución estándar de zonas (vista propia atacando arriba):
  defensa-izq | defensa-centro | defensa-dcha   (tercio defensivo)
  medio-izq   | medio-centro   | medio-dcha     (tercio medio)
  ataque-izq  | ataque-centro  | ataque-dcha    (tercio ofensivo)

Output JSON estricto:
{
  "zones": [
    {"id":"def-izq","row":"defensa","col":"izq","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"def-cen","row":"defensa","col":"cen","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"def-dcha","row":"defensa","col":"dcha","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"med-izq","row":"medio","col":"izq","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"med-cen","row":"medio","col":"cen","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"med-dcha","row":"medio","col":"dcha","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"atq-izq","row":"ataque","col":"izq","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"atq-cen","row":"ataque","col":"cen","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"},
    {"id":"atq-dcha","row":"ataque","col":"dcha","offensive":0-100,"defensive":0-100,"note":"string max 60 chars"}
  ],
  "dominant_zone": "string · id de la zona con mayor offensive",
  "weakest_zone": "string · id de la zona con menor defensive",
  "summary": "string max 220 chars"
}

9 zonas obligatorias en orden. Scores 0-100 son ESTIMACIONES. Sin markdown.`,
  },
} as const;

type ReportType = keyof typeof TEAM_PROMPTS;

export default withHandler(
  { schema: bodySchema, requireAuth: true, maxRequests: 5 },
  async ({ body, userId }) => {
    if (!ANTHROPIC_API_KEY) {
      return errorResponse({ code: "no_api_key", message: "ANTHROPIC_API_KEY missing", status: 500 });
    }
    const input = body as z.infer<typeof bodySchema>;
    const startedAt = Date.now();

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Cargar players ──────────────────────────────────────────
    let query = supabase
      .from("players")
      .select("id, name, age, position, vsi, phv_category, metric_speed, metric_technique, metric_vision, metric_stamina, metric_shooting, metric_defending, height_cm, weight_kg, tenant_id")
      // nulls last: los NO evaluados (vsi null) no deben colarse antes del top real
      // y truncar a jugadores evaluados con el limit (invariante #2; igual que
      // la RPC get_ranked_players de la migración 059). Postgres ordena DESC con
      // NULLS FIRST por defecto.
      .order("vsi", { ascending: false, nullsFirst: false })
      .limit(40);

    if (input.playerIds && input.playerIds.length > 0) {
      query = query.in("id", input.playerIds);
    }

    const { data: players, error: pErr } = await query;
    if (pErr) {
      return errorResponse({ code: "db_error", message: pErr.message, status: 500 });
    }
    if (!players || players.length === 0) {
      return errorResponse({ code: "no_players", message: "Sin jugadores en plantilla", status: 404 });
    }

    const teamSize = players.length;
    // Media SOLO sobre evaluados; null si ninguno tiene VSI de ficha (invariante #2).
    // El teamSize (conteo) sí incluye a todos.
    const avgVsi = avgEvaluatedVsi(players as PlayerSummary[]);
    const phvCounts = {
      early:   players.filter((p) => p.phv_category === "early").length,
      ontime:  players.filter((p) => p.phv_category === "ontime" || p.phv_category === "ontme").length,
      late:    players.filter((p) => p.phv_category === "late").length,
      unknown: players.filter((p) => !p.phv_category).length,
    };

    const teamName = input.teamName ?? "Mi equipo";
    const userMessage = teamProfileBlock(players as PlayerSummary[], teamName, input.videoObservation as Record<string, unknown> | undefined);

    // ── 2. Generar 4 reportes Claude en paralelo ───────────────────
    const reportPromises = (Object.keys(TEAM_PROMPTS) as ReportType[]).map(async (type) => {
      const cfg = TEAM_PROMPTS[type];
      try {
        const content = await callClaude({
          model: cfg.model,
          system: cfg.system,
          user: userMessage,
          maxTokens: type === "team-overview" ? 2000 : 1200,
        });
        return { type, content, model: cfg.model, ok: true as const };
      } catch (err) {
        return { type, content: null, model: cfg.model, ok: false as const, error: err instanceof Error ? err.message : "unknown" };
      }
    });

    const results = await Promise.all(reportPromises);
    const successful = results.filter((r) => r.ok);

    return successResponse({
      teamName,
      teamSize,
      vsiPromedio: avgVsi, // number | null ("—" si nadie evaluado); ya redondeado a 1 decimal
      phvDistribution: phvCounts,
      reports: successful.map((r) => ({
        type: r.type,
        content: r.content,
        model: r.model,
      })),
      reportsGenerated: successful.length,
      reportsFailed: Object.keys(TEAM_PROMPTS).length - successful.length,
      pipelineVersion: PIPELINE_VERSION,
      generatedBy: userId,
      totalLatencyMs: Date.now() - startedAt,
    });
  }
);
