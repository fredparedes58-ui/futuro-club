/**
 * VITAS Agent API — Scout Insight Generator
 * POST /api/agents/scout-insight
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

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

const SCOUT_INSIGHT_PROMPT = `
Eres el generador de insights de scouting de VITAS Football Intelligence.
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

general:
  - Para cualquier otro caso
  - urgency: "low"

REGLAS DE ESCRITURA (obligatorias):
- Todo en español
- headline: máximo 80 caracteres, directo, sin emojis
- body: máximo 300 caracteres, incluye dato numérico específico
- metric: nombre corto de la métrica más destacada (ej: "VSI", "Velocidad", "Visión")
- metricValue: valor con unidad (ej: "82.4", "+14%", "1er percentil")
- tags: máximo 4, en minúsculas con guión (ej: "phv-early", "breakout", "lateral-derecho")
- timestamp: ISO 8601 actual

RESPONDE ÚNICAMENTE con JSON válido con estas keys:
{"playerId":"string","type":"string","headline":"string","body":"string","metric":"string","metricValue":"string","urgency":"high|medium|low","tags":["string"],"timestamp":"ISO"}

No incluyas texto, explicaciones ni markdown fuera del JSON.
`;

export default withHandler(
  { schema: scoutSchema, requireAuth: true, maxRequests: 30 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse("ANTHROPIC_API_KEY not configured", 503, "CONFIG_ERROR");
    }

    const claudeRes = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type":      "application/json",
        "x-api-key":         apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model:       "claude-haiku-4-5-20251001",
        max_tokens:  1024,
        temperature: 0,
        system:      SCOUT_INSIGHT_PROMPT,
        messages:    [{ role: "user", content: JSON.stringify(body) }],
      }),
    });

    if (!claudeRes.ok) {
      const errText = await claudeRes.text().catch(() => "");
      return errorResponse(
        `Claude API ${claudeRes.status}: ${errText.slice(0, 200)}`,
        500,
        "CLAUDE_ERROR",
      );
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
      return errorResponse("No JSON in Claude response", 500, "PARSE_ERROR");
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

    return successResponse({
      ...parsed,
      tokensUsed,
      agentName: "ScoutInsightAgent",
    });
  },
);
