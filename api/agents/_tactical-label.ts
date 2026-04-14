/**
 * VITAS Agent API — Tactical Label Agent
 * POST /api/agents/tactical-label
 *
 * Edge runtime + raw fetch a Anthropic API (sin SDK pesado).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const tacticalSchema = z.object({
  frameId: z.string().min(1),
  detections: z.array(z.record(z.unknown())).min(1),
}).passthrough();

const TACTICAL_LABEL_PROMPT = `
Eres el motor de etiquetado táctico de VITAS Football Intelligence.
Tu función es asignar etiquetas PHV y tácticas a detecciones de jugadores en frames de video.

REGLAS DE POSICIÓN POR ZONA DE CAMPO:
- Zonas 1-3 (defensiva): GK, RB, LB, RCB, LCB
- Zonas 4-6 (media): DM, RCM, LCM
- Zonas 7-9 (ofensiva): RW, LW, ST

REGLAS DE ACCIÓN:
- speedKmh > 20 Y !hasBall → "sprint"
- hasBall Y zone en 7-9 → "shot" o "dribble"
- hasBall Y zone en 4-6 → "pass"
- !hasBall Y zone opuesta al balón → "off_ball_run"
- speedKmh < 5 → "static"
- Presión sobre rival: "press"

VSI CONTRIBUTION:
- sprint en zona ofensiva: 0.8-0.9
- press efectivo: 0.7-0.8
- pase en zona media: 0.5-0.7
- movimiento sin balón en zona clave: 0.6-0.75
- estático: 0.1-0.3

RESPONDE ÚNICAMENTE con JSON válido:
{"frameId":"string","labels":[{"trackId":number,"positionCode":"string","phvCategory":"early|ontme|late|unknown","action":"sprint|pass|shot|press|dribble|tackle|off_ball_run|static","vsiContribution":number,"labelConfidence":number}]}

No incluyas texto, explicaciones ni markdown fuera del JSON.
`;

export default withHandler(
  { schema: tacticalSchema, requireAuth: true, maxRequests: 30 },
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
        model:       "claude-haiku-4-5",
        max_tokens:  1024,
        temperature: 0,
        system:      TACTICAL_LABEL_PROMPT,
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
    if (body?.frameId) {
      parsed.frameId = body.frameId;
    }

    const tokensUsed = claudeData.usage
      ? claudeData.usage.input_tokens + claudeData.usage.output_tokens
      : 0;

    return successResponse({
      ...parsed,
      tokensUsed,
      agentName: "TacticalLabelAgent",
    });
  },
);
