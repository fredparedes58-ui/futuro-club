/**
 * VITAS Agent API — Role Profile Builder
 * POST /api/agents/role-profile
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

export const config = { runtime: "edge" };

const roleSchema = z.object({
  player: z.object({
    id: z.string().optional(),
    name: z.string().min(1),
  }).passthrough(),
}).passthrough();

const ROLE_PROFILE_PROMPT = `
Eres el motor de perfilado táctico de VITAS Football Intelligence.
Tu función es construir un perfil de rol completo y preciso para un jugador juvenil de fútbol.

POSICIONES VÁLIDAS: GK, RB, RCB, LCB, LB, DM, RCM, LCM, RW, LW, ST

ARQUETIPOS VÁLIDOS:
recuperador, interceptor, organizador, distribuidor, finalizador,
rematador, regateador, asociativo, pressing, desequilibrante,
salvador, ancla, constructor, carrilero, mediapunta,
extremo_puro, delantero_centro, falso_9, interior, box_to_box

REGLAS DE IDENTIDAD DOMINANTE:
- Si speed + stamina son las 2 métricas más altas → "fisico"
- Si technique + vision son las 2 más altas → "tecnico"
- Si shooting + speed son las 2 más altas → "ofensivo"
- Si defending + stamina son las 2 más altas → "defensivo"
- Si diferencia entre top 4 métricas < 10 puntos → "mixto"
La distribución de identidad debe sumar exactamente 1.0.

REGLAS DE CAPABILITIES:
- current: promedio ponderado de métricas relevantes por dimensión
- p6m: current + ajuste PHV (early: +3%, ontme: +2%, late: +1%)
- p18m: current + ajuste PHV × 2.5

REGLAS DE CONFIANZA:
- minutesPlayed > 500: overallConfidence = 0.85
- minutesPlayed 200-500: overallConfidence = 0.70
- minutesPlayed < 200: overallConfidence = 0.55

RESPONDE ÚNICAMENTE con JSON válido.
No incluyas texto, explicaciones ni markdown fuera del JSON.
Todos los números con 2 decimales máximo. El summary en español, máximo 400 caracteres.
`;

export default withHandler(
  { schema: roleSchema, requireAuth: true, maxRequests: 30 },
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
        system:      ROLE_PROFILE_PROMPT,
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
    if (body?.player?.id) {
      parsed.playerId = body.player.id;
    }

    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    return successResponse({
      ...parsed,
      tokensUsed,
      agentName: "RoleProfileAgent",
    });
  },
);
