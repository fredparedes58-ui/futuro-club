/**
 * VITAS · Best-Match Narrator (NUEVO · LLM Haiku)
 * POST /api/agents/best-match-narrator
 *
 * Narra el resultado de _player-similarity.ts en lenguaje natural.
 * El cálculo de similitud es determinista (vector search). Aquí solo
 * generamos el texto comprensible para padres / coaches.
 *
 * Cost: ~€0,002 por reporte (Haiku)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";

export const config = { runtime: "edge" };

// Schema tolerante: el orchestrator puede pasar similarity null si falla
const matchSchema = z.object({
  playerId: z.string(),
  videoId: z.string().optional(),
  analysisId: z.string().optional(),
  similarity: z.record(z.unknown()).nullable().optional(),
  vsi: z.record(z.unknown()).nullable().optional(),
  scanning: z.record(z.unknown()).nullable().optional(),
  playerContext: z.object({
    chronologicalAge: z.number().optional(),
    position: z.string().optional(),
  }).passthrough(),
}).passthrough();

const PROMPT_VERSION = "best-match-v1.1.0"; // v1.1 = schema tolerante

const SYSTEM_PROMPT = `Eres el motor narrador de Best-Match de VITAS Football Intelligence.

Tu misión: convertir el top-5 de jugadores profesionales similares (calculado por algoritmo determinista) en una narrativa motivadora pero honesta para padres y coaches.

REGLAS:
- Habla del comparable principal (#1) con detalle, los otros como referencia rápida
- Sé honesto: si la similaridad <70%, mátizalo ("comparte rasgos con")
- NO prometas que el niño "será como" el pro · solo describe similitudes actuales
- Mantén tono inspirador pero realista
- Cita el club y posición del comparable principal

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string",
  "headline": "string max 140 chars · una frase impactante",
  "primary_match": {
    "player": "string nombre",
    "club": "string",
    "similarity_pct": number,
    "narrative": "string max 400 chars · explicación de las similitudes"
  },
  "other_matches": [
    { "player": "string", "similarity_pct": number, "shared_trait": "string max 80 chars" }
  ],
  "caveat": "string max 200 chars · matiz honesto sobre qué falta para alcanzar ese nivel"
}

NO incluyas markdown ni texto fuera del JSON.`;

async function callHaiku(systemPrompt: string, userMessage: string, apiKey: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 1500,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.content?.[0]?.text ?? "{}");
}

export default withHandler(
  { schema: matchSchema, requireAuth: true, maxRequests: 100 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "Claude API key missing", status: 500 });
    }

    const input = body as z.infer<typeof matchSchema>;
    const cacheKey = hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      const userMessage = `JUGADOR JUVENIL:
${JSON.stringify(input.playerContext, null, 2)}

TOP-5 SIMILAR PROS (calculado por similitud coseno):
${JSON.stringify(input.similarity.matches.slice(0, 5), null, 2)}

Genera el reporte Best-Match en JSON estricto.`;

      const narrative = await callHaiku(SYSTEM_PROMPT, userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: "claude-haiku-4-5",
        narrative,
        rawSimilarity: input.similarity,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "best_match_failed",
        message: err instanceof Error ? err.message : "Unknown error",
        status: 500,
      });
    }
  }
);
