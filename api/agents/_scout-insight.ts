/**
 * VITAS Agent API — Scout Insight Generator (v2: RAG-enriched)
 * POST /api/agents/scout-insight
 *
 * Edge runtime + raw fetch a Anthropic API.
 * Now queries RAG knowledge base for drills, benchmarks, methodology
 * before generating insights with Claude.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached, incrementHitCount } from "../_lib/agentCache";
import { scoutInsightFallback } from "../_lib/agentFallbacks";

export const config = { runtime: "edge" };

const scoutSchema = z.object({
  player: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
    age: z.number().optional(),
    position: z.string().optional(),
    vsi: z.number().optional(),
    vsiTrend: z.string().optional(),
    phvCategory: z.string().optional(),
    recentMetrics: z.record(z.number()).optional(),
  }),
  context: z.string().optional(),
});

function buildSystemPrompt(ragContext: string): string {
  return `Eres el generador de insights de scouting de VITAS Football Intelligence.
Tu función es analizar métricas de un jugador juvenil y generar un insight accionable en español.

CONTEXTOS Y SUS REGLAS:

breakout:
  - Úsalo cuando vsi > 75 Y vsiTrend = "up"
  - headline: menciona el nombre y el avance
  - urgency: "high"

phv_alert:
  - Úsalo cuando phvCategory = "early" Y speed > 75
  - headline: alerta de ventana crítica de desarrollo
  - urgency: "high"

drill_record:
  - Úsalo cuando alguna métrica > 85
  - headline: menciona la métrica récord
  - urgency: "medium"

comparison:
  - Úsalo cuando el perfil es equilibrado (todas métricas entre 55-75)
  - headline: comparativa con arquetipo táctico
  - urgency: "low"

regression:
  - Úsalo cuando VSI bajó significativamente
  - headline: alerta de regresión con datos concretos
  - urgency: "high"

milestone:
  - Úsalo cuando el jugador cruzó un umbral importante (VSI 80, 90, etc.)
  - headline: celebra el hito con datos
  - urgency: "medium"

general:
  - Para cualquier otro caso
  - urgency: "low"

${ragContext ? `CONTEXTO DE LA BASE DE CONOCIMIENTO VITAS (RAG):
${ragContext}

Usa este contexto para:
- Recomendar drills específicos de la biblioteca
- Citar benchmarks de rendimiento reales
- Aplicar metodología de scouting profesional
` : ""}

REGLAS DE ESCRITURA (obligatorias):
- Todo en español
- headline: máximo 80 caracteres, directo, sin emojis
- body: máximo 400 caracteres, incluye dato numérico específico
- metric: nombre corto de la métrica más destacada (ej: "VSI", "Velocidad", "Visión")
- metricValue: valor con unidad (ej: "82.4", "+14%", "1er percentil")
- tags: máximo 4, en minúsculas con guión (ej: "phv-early", "breakout", "lateral-derecho")
- recommendedDrills: máximo 3 objetos {name, reason} de drills recomendados del contexto RAG
- actionItems: máximo 3 acciones concretas para el entrenador
- benchmark: una frase comparativa (ej: "Percentil 85 en velocidad para Sub-15")
- timestamp: ISO 8601 actual

RESPONDE ÚNICAMENTE con JSON válido:
{"playerId":"string","type":"string","headline":"string","body":"string","metric":"string","metricValue":"string","urgency":"high|medium|low","tags":["string"],"timestamp":"ISO","recommendedDrills":[{"name":"string","reason":"string"}],"actionItems":["string"],"benchmark":"string"}

No incluyas texto, explicaciones ni markdown fuera del JSON.
`;
}

export default withHandler(
  { schema: scoutSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, req, userId }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return successResponse(scoutInsightFallback(body, "no_api_key"));
    }

    // ── Cache check ─────────────────────────────────────────────
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const playerId = body?.player?.id ?? null;

    if (sbUrl && sbKey && userId) {
      try {
        const cacheKey = await hashInput("scout-insight", userId, body);
        const cached = await getCached(cacheKey, sbUrl, sbKey);
        if (cached) {
          incrementHitCount(cacheKey, sbUrl, sbKey).catch(() => {});
          return successResponse({ ...cached.response, _cached: true });
        }
      } catch { /* cache miss — proceed to Claude */ }
    }

    const authHeader = req.headers.get("Authorization") ?? "";
    const baseUrl = new URL(req.url).origin;

    // ── RAG enrichment ────────────────────────────────────────────────────
    let ragContext = "";
    try {
      const metrics = body.player?.recentMetrics ?? {};
      const ragQuery = `${body.player?.position ?? ""} ${body.context ?? ""} ${body.player?.age ?? ""} años métricas: velocidad ${metrics.speed ?? 0} técnica ${metrics.technique ?? 0} visión ${metrics.vision ?? 0} disparo ${metrics.shooting ?? 0} defensa ${metrics.defending ?? 0}`;

      const ragRes = await fetch(`${baseUrl}/api/rag/query`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: authHeader,
        },
        body: JSON.stringify({ query: ragQuery, limit: 5 }),
      });

      if (ragRes.ok) {
        const ragData = await ragRes.json() as { context?: string; results?: unknown[] };
        ragContext = ragData.context ?? "";
      }
    } catch {
      // RAG failure is non-blocking — proceed without enrichment
    }

    // ── Claude call ───────────────────────────────────────────────────────
    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:       "claude-haiku-4-5",
        max_tokens:  1024,
        temperature: 0.3,
        system:      buildSystemPrompt(ragContext),
        messages:    [{ role: "user", content: JSON.stringify(body) }],
      }),
    });

    if (!claudeRes.ok) {
      console.warn(`[ScoutInsight] Claude API ${claudeRes.status}, using fallback`);
      return successResponse(scoutInsightFallback(body, "claude_error"));
    }

    const claudeData = await claudeRes.json() as {
      content: Array<{ type: string; text?: string }>;
      usage?: { input_tokens: number; output_tokens: number };
    };

    let fullText = "";
    for (const block of claudeData.content) {
      if (block.type === "text" && block.text) fullText += block.text;
    }

    const m = fullText.match(/\{[\s\S]*\}/);
    if (!m) {
      console.warn("[ScoutInsight] No JSON in Claude response, using fallback");
      return successResponse(scoutInsightFallback(body, "parse_error"));
    }

    const parsed = JSON.parse(m[0]);

    if (!parsed.timestamp) {
      parsed.timestamp = new Date().toISOString();
    }
    if (!parsed.playerId && body?.player?.id) {
      parsed.playerId = body.player.id;
    }

    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    const result = { ...parsed, tokensUsed, agentName: "ScoutInsightAgent", ragEnriched: !!ragContext };

    // ── Cache store ─────────────────────────────────────────────
    if (sbUrl && sbKey && userId) {
      hashInput("scout-insight", userId, body).then(cacheKey =>
        setCached(cacheKey, "scout-insight", userId, playerId, null, result, tokensUsed, sbUrl, sbKey)
      ).catch(() => {});
    }

    return successResponse(result);
  },
);
