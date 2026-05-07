/**
 * VITAS · Live Match Aggregation (Sprint B2 · día 4)
 * POST /api/live/aggregate?matchId=<id>
 *
 * Llamado al pitido final. Agrega los live_events del partido por
 * jugador y por equipo, luego llama a Claude para generar 3 reportes:
 *
 *   - team-summary  (Sonnet): resumen del partido + MVP + próximo foco
 *   - per-player    (Haiku):  insights individuales con stats agregadas
 *   - tactical-take (Haiku):  qué funcionó, qué no, ajuste para próximo
 *
 * Persiste el resultado en live_matches.analysis_result (jsonb) para
 * que la summary page lo muestre sin volver a pagar Claude.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY!;

const PIPELINE_VERSION = "live-aggregate-v1.0";

interface PlayerStats {
  playerId: string | null;
  playerName: string;
  goles: number;
  pases_clave: number;
  recuperaciones: number;
  perdidas: number;
  duelos_ganados: number;
  duelos_perdidos: number;
  asistencias: number;
  tarjetas: number;
  totalEvents: number;
  netImpact: number;       // suma ponderada
}

const EVENT_WEIGHTS: Record<string, number> = {
  gol: +5,
  asistencia: +4,
  pase_clave: +2,
  recuperacion: +1.5,
  duelo_ganado: +1,
  parada_portero: +2,
  penalti_provocado: +3,
  perdida: -1,
  duelo_perdido: -1,
  tarjeta_amarilla: -1,
  tarjeta_roja: -3,
  penalti_cometido: -3,
};

async function callClaude(opts: {
  model: "claude-sonnet-4-5" | "claude-haiku-4-5";
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

function aggregateByPlayer(
  events: Array<{ player_id: string | null; event_type: string }>,
  playerNames: Map<string, string>,
): PlayerStats[] {
  const byPlayer = new Map<string, PlayerStats>();

  for (const e of events) {
    const pid = e.player_id ?? "_team";
    if (!byPlayer.has(pid)) {
      byPlayer.set(pid, {
        playerId: e.player_id,
        playerName: e.player_id ? (playerNames.get(e.player_id) ?? "?") : "Equipo (sin asignar)",
        goles: 0, pases_clave: 0, recuperaciones: 0, perdidas: 0,
        duelos_ganados: 0, duelos_perdidos: 0, asistencias: 0, tarjetas: 0,
        totalEvents: 0, netImpact: 0,
      });
    }
    const s = byPlayer.get(pid)!;
    s.totalEvents++;
    s.netImpact += EVENT_WEIGHTS[e.event_type] ?? 0;

    switch (e.event_type) {
      case "gol":             s.goles++; break;
      case "asistencia":      s.asistencias++; break;
      case "pase_clave":      s.pases_clave++; break;
      case "recuperacion":    s.recuperaciones++; break;
      case "perdida":         s.perdidas++; break;
      case "duelo_ganado":    s.duelos_ganados++; break;
      case "duelo_perdido":   s.duelos_perdidos++; break;
      case "tarjeta_amarilla":
      case "tarjeta_roja":    s.tarjetas++; break;
    }
  }

  return Array.from(byPlayer.values()).sort((a, b) => b.netImpact - a.netImpact);
}

function buildPromptContext(
  match: { team_name: string; opponent_name: string | null; score_home: number; score_away: number; duration_seconds: number },
  stats: PlayerStats[],
): string {
  const minutes = Math.floor(match.duration_seconds / 60);
  return `PARTIDO
- ${match.team_name} ${match.score_home}-${match.score_away} ${match.opponent_name ?? "Rival"}
- Duración: ${minutes} minutos
- Total eventos taggeados: ${stats.reduce((a, s) => a + s.totalEvents, 0)}

STATS POR JUGADOR (ordenados por impacto neto ponderado)
${stats
  .filter((s) => s.totalEvents > 0)
  .map((s, i) => `${i + 1}. ${s.playerName}
   gol: ${s.goles} · asist: ${s.asistencias} · pase clave: ${s.pases_clave}
   recup: ${s.recuperaciones} · pérdidas: ${s.perdidas}
   duelos: +${s.duelos_ganados} -${s.duelos_perdidos} · tarjetas: ${s.tarjetas}
   impacto neto: ${s.netImpact > 0 ? "+" : ""}${s.netImpact.toFixed(1)}`)
  .join("\n")}

NOTA: Ponderación impacto neto · gol +5, asist +4, pase clave +2,
recuperación +1.5, parada +2, duelo ganado +1, pérdida -1,
duelo perdido -1, amarilla -1, roja -3.`;
}

const PROMPTS = {
  "team-summary": {
    model: "claude-sonnet-4-5" as const,
    system: `Eres el motor de Match Summary VITAS. Analiza el partido en directo y produce
un resumen para coach + padres. Lenguaje claro, motivador, honesto.

Output JSON:
{
  "title": "Resumen · [Equipo] vs [Rival]",
  "result_phrase": "string max 100 chars · ej. 'Victoria sufrida 2-1'",
  "key_moments": ["string","string","string"],
  "mvp": {"player_name":"string","reason":"string max 140 chars"},
  "team_strengths": ["string","string"],
  "team_weaknesses": ["string","string"],
  "next_focus": "string max 200 chars · qué priorizar entrenamiento siguiente"
}
3 momentos clave. Sin markdown.`,
  },
  "per-player": {
    model: "claude-haiku-4-5" as const,
    system: `Eres el motor de Player Insights VITAS post-partido baseline.
Para los TOP 5 jugadores por impacto neto, da un insight breve.

Output JSON:
{
  "players": [
    {
      "player_name": "string",
      "rating": 1-10,
      "summary": "string max 140 chars · cómo jugó",
      "highlight": "string max 100 chars · su mejor momento"
    }
  ]
}
Sin markdown.`,
  },
  "tactical-take": {
    model: "claude-haiku-4-5" as const,
    system: `Eres el motor de Tactical Take VITAS post-partido.
Output JSON:
{
  "what_worked": ["string","string"],
  "what_didnt": ["string","string"],
  "next_match_adjustment": "string max 200 chars",
  "recommended_drills": ["string","string","string"]
}
Sin markdown.`,
  },
} as const;

type ReportType = keyof typeof PROMPTS;

export default withHandler(
  { method: "POST", requireAuth: true, maxRequests: 10 },
  async ({ userId, query }) => {
    if (!ANTHROPIC_API_KEY) {
      return errorResponse({ code: "no_api_key", message: "ANTHROPIC_API_KEY missing", status: 500 });
    }
    const matchId = query.matchId;
    if (!matchId) {
      return errorResponse({ code: "missing_matchId", message: "matchId requerido", status: 400 });
    }

    const supabase = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { persistSession: false },
    });

    // ── 1. Cargar match ────────────────────────────────────────
    const { data: match, error: mErr } = await supabase
      .from("live_matches")
      .select("*")
      .eq("id", matchId)
      .single();
    if (mErr || !match) {
      return errorResponse({ code: "not_found", message: "Partido no existe", status: 404 });
    }
    if (match.user_id && match.user_id !== userId) {
      return errorResponse({ code: "forbidden", message: "No es tu partido", status: 403 });
    }

    // Si ya hay análisis previo, devolver cacheado
    if (match.analysis_result) {
      return successResponse({
        cached: true,
        match: { id: match.id, status: match.status, score_home: match.score_home, score_away: match.score_away, duration_seconds: match.duration_seconds, team_name: match.team_name, opponent_name: match.opponent_name },
        analysis: match.analysis_result,
      });
    }

    // ── 2. Cargar eventos + nombres jugadores ─────────────────
    const { data: events } = await supabase
      .from("live_events")
      .select("player_id, event_type, timestamp_seconds")
      .eq("match_id", matchId);

    const playerIds = Array.from(new Set((events ?? []).map((e) => e.player_id).filter(Boolean) as string[]));
    const playerNames = new Map<string, string>();
    if (playerIds.length > 0) {
      const { data: players } = await supabase
        .from("players")
        .select("id, name")
        .in("id", playerIds);
      (players ?? []).forEach((p) => playerNames.set(p.id, p.name ?? "?"));
    }

    const stats = aggregateByPlayer(events ?? [], playerNames);

    if (stats.length === 0 || (events ?? []).length === 0) {
      return errorResponse({
        code: "no_events",
        message: "No hay eventos taggeados · imposible generar análisis",
        status: 400,
      });
    }

    // ── 3. Generar 3 reportes Claude en paralelo ───────────────
    const userMessage = buildPromptContext(match, stats);
    const reportPromises = (Object.keys(PROMPTS) as ReportType[]).map(async (type) => {
      const cfg = PROMPTS[type];
      try {
        const content = await callClaude({
          model: cfg.model,
          system: cfg.system,
          user: userMessage,
          maxTokens: type === "team-summary" ? 1800 : 1200,
        });
        return { type, content, model: cfg.model, ok: true as const };
      } catch (err) {
        return { type, content: null, model: cfg.model, ok: false as const, error: err instanceof Error ? err.message : "unknown" };
      }
    });

    const results = await Promise.all(reportPromises);
    const successful = results.filter((r) => r.ok);

    const analysisResult = {
      pipeline: PIPELINE_VERSION,
      generated_at: new Date().toISOString(),
      stats_by_player: stats,
      total_events: (events ?? []).length,
      reports: successful.map((r) => ({ type: r.type, content: r.content, model: r.model })),
      reports_failed: results.length - successful.length,
    };

    // ── 4. Persistir en match.analysis_result ──────────────────
    await supabase
      .from("live_matches")
      .update({
        analysis_result: analysisResult,
        analysis_at: new Date().toISOString(),
      })
      .eq("id", matchId);

    return successResponse({
      cached: false,
      match: {
        id: match.id, status: match.status, score_home: match.score_home, score_away: match.score_away,
        duration_seconds: match.duration_seconds, team_name: match.team_name, opponent_name: match.opponent_name,
      },
      analysis: analysisResult,
    });
  }
);
