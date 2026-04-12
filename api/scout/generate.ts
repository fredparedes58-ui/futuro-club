/**
 * VITAS Scout — Insight Generation Endpoint
 * POST /api/scout/generate
 *
 * Generates AI-powered scout insights for one or all players.
 * Enriches each insight with RAG context (drills, benchmarks, methodology).
 * Persists results to scout_insights table in Supabase.
 */
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const GenerateSchema = z.object({
  playerId: z.string().optional(),
});

interface PlayerRow {
  id: string;
  name: string;
  age: number;
  position: string;
  vsi: number;
  phv_category: string;
  phv_offset: number;
  metrics: Record<string, number>;
  vsi_history: number[];
  minutes_played: number;
  updated_at: string;
}

interface AnalysisRow {
  id: string;
  player_id: string;
  created_at: string;
  report_data: {
    estadoActual?: {
      dimensiones?: Record<string, { score: number }>;
      nivelActual?: string;
      fortalezasPrimarias?: string[];
      areasDesarrollo?: string[];
    };
    planDesarrollo?: {
      pilaresTrabajo?: Array<{ pilar: string; acciones: string[] }>;
    };
  };
}

interface RAGResult {
  content: string;
  category: string;
  metadata: Record<string, unknown>;
  similarity: number;
}

type InsightContext = "breakout" | "comparison" | "phv-alert" | "drill-record" | "regression" | "milestone";

async function fetchPlayerHistory(
  supabaseUrl: string,
  supabaseKey: string,
  playerId: string,
  userId: string,
): Promise<Array<{ report: Record<string, unknown>; created_at: string }> | null> {
  const headers = { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` };
  const res = await fetch(
    `${supabaseUrl}/rest/v1/player_analyses?player_id=eq.${playerId}&user_id=eq.${userId}&select=report,created_at&order=created_at.desc&limit=2`,
    { headers },
  );
  if (!res.ok) return null;
  const rows = await res.json() as Array<{ report: Record<string, unknown>; created_at: string }>;
  return rows;
}

function detectContext(
  player: PlayerRow,
  latestAnalysis: AnalysisRow | null,
  previousAnalysis: AnalysisRow | null,
): InsightContext {
  const vsiHistory = player.vsi_history ?? [player.vsi];
  const currentVSI = player.vsi;
  const prevVSI = vsiHistory.at(-2) ?? currentVSI;
  const vsiDelta = currentVSI - prevVSI;

  // Check metric deltas if analyses exist
  let maxMetricDelta = 0;
  if (latestAnalysis?.report_data?.estadoActual?.dimensiones && previousAnalysis?.report_data?.estadoActual?.dimensiones) {
    const latest = latestAnalysis.report_data.estadoActual.dimensiones;
    const prev = previousAnalysis.report_data.estadoActual.dimensiones;
    for (const key of Object.keys(latest)) {
      const delta = (latest[key]?.score ?? 0) - (prev[key]?.score ?? 0);
      if (Math.abs(delta) > maxMetricDelta) maxMetricDelta = delta;
    }
  }

  // Regression: VSI dropped > 5 points
  if (vsiDelta < -5) return "regression";

  // Milestone: crossed VSI threshold
  if ((currentVSI >= 80 && prevVSI < 80) || (currentVSI >= 90 && prevVSI < 90)) return "milestone";

  // Breakout: VSI up >5 or metric up >1.5 (on 0-10 scale = >15 on 0-100)
  if (vsiDelta > 5 || maxMetricDelta > 1.5) return "breakout";

  // PHV Alert: critical development window
  const offset = player.phv_offset ?? 0;
  if (player.phv_category === "early" && offset >= -1.0 && offset <= 0.5) return "phv-alert";

  // Drill record: any metric above 85
  const metrics = player.metrics ?? {};
  if (Object.values(metrics).some(v => v > 85)) return "drill-record";

  // Comparison: balanced profile (all metrics 55-75)
  const vals = Object.values(metrics);
  if (vals.length > 0 && vals.every(v => v >= 55 && v <= 75)) return "comparison";

  return "breakout"; // default
}

export default withHandler(
  { schema: GenerateSchema, requireAuth: true, maxRequests: 10, windowMs: 120_000 },
  async ({ body, req, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503, "CONFIG_ERROR");
    }
    if (!anthropicKey) {
      return errorResponse("Anthropic API not configured", 503, "CONFIG_ERROR");
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const baseUrl = new URL(req.url).origin;

    // 1. Fetch players
    let playersUrl = `${supabaseUrl}/rest/v1/players?select=*&user_id=eq.${userId}`;
    if (body.playerId) {
      playersUrl += `&id=eq.${body.playerId}`;
    }
    playersUrl += "&order=updated_at.desc&limit=50";

    const playersRes = await fetch(playersUrl, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });

    if (!playersRes.ok) {
      return errorResponse("Failed to fetch players", 500);
    }

    const players: PlayerRow[] = await playersRes.json();
    if (players.length === 0) {
      return successResponse({ insights: [], message: "No players found" });
    }

    // 2. Fetch latest analyses for each player
    const playerIds = players.map(p => p.id);
    const analysesUrl = `${supabaseUrl}/rest/v1/player_analyses?select=*&player_id=in.(${playerIds.join(",")})&order=created_at.desc&limit=100`;
    const analysesRes = await fetch(analysesUrl, {
      headers: { apikey: supabaseKey, Authorization: `Bearer ${supabaseKey}` },
    });

    const analyses: AnalysisRow[] = analysesRes.ok ? await analysesRes.json() : [];

    // Group analyses by player
    const analysesByPlayer = new Map<string, AnalysisRow[]>();
    for (const a of analyses) {
      const list = analysesByPlayer.get(a.player_id) ?? [];
      list.push(a);
      analysesByPlayer.set(a.player_id, list);
    }

    // 3. Generate insights for each player
    const generatedInsights: Array<Record<string, unknown>> = [];
    const errors: string[] = [];

    for (const player of players) {
      try {
        const playerAnalyses = analysesByPlayer.get(player.id) ?? [];
        const latestAnalysis = playerAnalyses[0] ?? null;
        const previousAnalysis = playerAnalyses[1] ?? null;

        const context = detectContext(player, latestAnalysis, previousAnalysis);

        // Query RAG for enrichment
        let ragContext = "";
        let ragDrills: RAGResult[] = [];
        try {
          const ragQuery = `${player.position} ${context} ${player.age} años métricas: velocidad ${player.metrics?.speed ?? 0} técnica ${player.metrics?.technique ?? 0} visión ${player.metrics?.vision ?? 0}`;
          const ragRes = await fetch(`${baseUrl}/api/rag/query`, {
            method: "POST",
            headers: { "Content-Type": "application/json", Authorization: authHeader },
            body: JSON.stringify({ query: ragQuery, limit: 5 }),
          });
          if (ragRes.ok) {
            const ragData = await ragRes.json() as { data?: { context?: string; results?: RAGResult[] } };
            ragContext = ragData.data?.context ?? "";
            ragDrills = ragData.data?.results ?? [];
          }
        } catch {
          // RAG failure is non-blocking
        }

        // Build analysis context for Claude
        let analysisContext = "";
        if (latestAnalysis?.report_data?.estadoActual) {
          const ea = latestAnalysis.report_data.estadoActual;
          analysisContext += `\nÚltimo análisis (${latestAnalysis.created_at}):`;
          analysisContext += `\n- Nivel: ${ea.nivelActual ?? "N/A"}`;
          if (ea.fortalezasPrimarias) analysisContext += `\n- Fortalezas: ${ea.fortalezasPrimarias.join(", ")}`;
          if (ea.areasDesarrollo) analysisContext += `\n- Áreas desarrollo: ${ea.areasDesarrollo.join(", ")}`;
          if (ea.dimensiones) {
            analysisContext += `\n- Dimensiones: ${Object.entries(ea.dimensiones).map(([k, v]) => `${k}: ${v.score}/10`).join(", ")}`;
          }
        }
        if (previousAnalysis?.report_data?.estadoActual) {
          const ea = previousAnalysis.report_data.estadoActual;
          analysisContext += `\nAnálisis anterior (${previousAnalysis.created_at}):`;
          analysisContext += `\n- Nivel: ${ea.nivelActual ?? "N/A"}`;
          if (ea.dimensiones) {
            analysisContext += `\n- Dimensiones: ${Object.entries(ea.dimensiones).map(([k, v]) => `${k}: ${v.score}/10`).join(", ")}`;
          }
        }

        // Historical comparison: fetch last 2 player_analyses and compute dimension deltas
        let historicalContext = "";
        try {
          const history = await fetchPlayerHistory(supabaseUrl, supabaseKey!, player.id, userId!);
          if (history && history.length >= 2) {
            const latest = history[0].report as Record<string, Record<string, unknown>>;
            const previous = history[1].report as Record<string, Record<string, unknown>>;
            const latestDims = latest?.estadoActual?.dimensiones;
            const prevDims = previous?.estadoActual?.dimensiones;
            const latestVSI = latest?.estadoActual?.vsi ?? player.vsi;
            const prevVSI = previous?.estadoActual?.vsi ?? (player.vsi_history?.at(-2) ?? player.vsi);
            if (latestDims && prevDims) {
              const dimNames = Object.keys(latestDims);
              const deltas = dimNames.map((d: string) => {
                const curr = latestDims[d]?.score ?? 0;
                const prev = prevDims[d]?.score ?? 0;
                const delta = curr - prev;
                return `${d}: ${prev}→${curr} (${delta > 0 ? "+" : ""}${delta})`;
              });
              historicalContext = `\n\nHISTORIAL DE EVOLUCIÓN (comparación últimos 2 análisis):\n${deltas.join("\n")}`;
              historicalContext += `\nVSI previo: ${prevVSI} → VSI actual: ${latestVSI} (${latestVSI - prevVSI > 0 ? "+" : ""}${latestVSI - prevVSI})`;

              // Override context detection based on real analysis deltas
              const maxDelta = Math.max(...dimNames.map((d: string) => {
                return (latestDims[d]?.score ?? 0) - (prevDims[d]?.score ?? 0);
              }));
              const vsiDelta = latestVSI - prevVSI;
              if (maxDelta > 1.5) {
                // 15+ points on 0-100 scale → breakout
                historicalContext += `\n→ DETECCIÓN: Breakout (dimensión subió ${(maxDelta * 10).toFixed(0)}+ puntos)`;
              } else if (vsiDelta < -5) {
                historicalContext += `\n→ DETECCIÓN: Regresión (VSI cayó ${Math.abs(vsiDelta)} puntos)`;
              } else if ((latestVSI >= 80 && prevVSI < 80) || (latestVSI >= 90 && prevVSI < 90)) {
                historicalContext += `\n→ DETECCIÓN: Milestone (VSI cruzó umbral ${latestVSI >= 90 ? 90 : 80})`;
              }
            }
          }
        } catch {
          // Historical query is non-blocking
        }

        // Prompt for Claude
        const systemPrompt = `Eres el generador de insights de scouting de VITAS Football Intelligence.
Analiza datos de un jugador juvenil y genera un insight accionable en español.

CONTEXTO DETECTADO: ${context}
${ragContext ? `\nCONTEXTO RAG (base de conocimiento):\n${ragContext.slice(0, 1500)}` : ""}
${analysisContext ? `\nHISTORIAL DE ANÁLISIS:${analysisContext}` : ""}${historicalContext}

REGLAS:
- headline: máximo 80 caracteres, directo, sin emojis
- body: máximo 400 caracteres, incluye dato numérico específico, compara con análisis anterior si existe
- metric: nombre corto de la métrica más destacada
- metricValue: valor con unidad (ej: "82.4", "+14%")
- urgency: "high" para breakout/regression/milestone, "medium" para phv-alert/drill-record, "low" para comparison
- tags: máximo 4
- recommendedDrills: array de máximo 3 objetos {name, reason} basados en el contexto RAG
- actionItems: array de máximo 3 acciones concretas para el entrenador
- benchmark: una frase comparativa con percentil o referencia (ej: "Percentil 85 en velocidad para Sub-15")

RESPONDE ÚNICAMENTE JSON:
{"type":"string","headline":"string","body":"string","metric":"string","metricValue":"string","urgency":"high|medium|low","tags":["string"],"recommendedDrills":[{"name":"string","reason":"string"}],"actionItems":["string"],"benchmark":"string"}`;

        const playerData = JSON.stringify({
          id: player.id,
          name: player.name,
          age: player.age,
          position: player.position,
          vsi: player.vsi,
          vsiHistory: player.vsi_history,
          phvCategory: player.phv_category,
          phvOffset: player.phv_offset,
          metrics: player.metrics,
          minutesPlayed: player.minutes_played,
        });

        const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-api-key": anthropicKey,
            "anthropic-version": "2023-06-01",
          },
          body: JSON.stringify({
            model: "claude-haiku-4-5-20251001",
            max_tokens: 1024,
            temperature: 0.3,
            system: systemPrompt,
            messages: [{ role: "user", content: playerData }],
          }),
        });

        if (!claudeRes.ok) {
          errors.push(`Claude error for ${player.name}: ${claudeRes.status}`);
          continue;
        }

        const claudeData = await claudeRes.json() as {
          content: Array<{ type: string; text?: string }>;
        };

        let fullText = "";
        for (const block of claudeData.content) {
          if (block.type === "text" && block.text) fullText += block.text;
        }

        const match = fullText.match(/\{[\s\S]*\}/);
        if (!match) {
          errors.push(`No JSON for ${player.name}`);
          continue;
        }

        const parsed = JSON.parse(match[0]);

        // Map type to valid insight_type
        const typeMap: Record<string, string> = {
          breakout: "breakout", comparison: "comparison",
          phv_alert: "phv-alert", "phv-alert": "phv-alert",
          drill_record: "drill-record", "drill-record": "drill-record",
          regression: "regression", milestone: "milestone",
          general: "breakout",
        };

        const insightRow = {
          user_id: userId,
          player_id: player.id,
          player_name: player.name,
          insight_type: typeMap[parsed.type ?? context] ?? context,
          title: parsed.headline ?? "Insight generado",
          description: parsed.body ?? "",
          metric: parsed.metric ?? null,
          metric_value: parsed.metricValue ?? null,
          urgency: parsed.urgency ?? "low",
          tags: parsed.tags ?? [],
          context_data: {
            vsi: player.vsi,
            position: player.position,
            age: player.age,
            detectedContext: context,
          },
          rag_drills: parsed.recommendedDrills ?? [],
          action_items: parsed.actionItems ?? [],
          benchmark: parsed.benchmark ?? null,
        };

        // Save to Supabase
        const insertRes = await fetch(`${supabaseUrl}/rest/v1/scout_insights`, {
          method: "POST",
          headers: {
            apikey: supabaseKey,
            Authorization: `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            Prefer: "return=representation",
          },
          body: JSON.stringify(insightRow),
        });

        if (insertRes.ok) {
          const [saved] = await insertRes.json() as Array<Record<string, unknown>>;
          generatedInsights.push(saved);
        } else {
          const errText = await insertRes.text();
          errors.push(`Save error for ${player.name}: ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        errors.push(`Exception for ${player.name}: ${err instanceof Error ? err.message : "unknown"}`);
      }
    }

    return successResponse({
      generated: generatedInsights.length,
      insights: generatedInsights,
      errors: errors.length > 0 ? errors : undefined,
      totalPlayers: players.length,
    });
  },
);
