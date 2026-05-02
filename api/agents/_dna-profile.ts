/**
 * VITAS · DNA Profile (NUEVO · LLM Haiku)
 * POST /api/agents/dna-profile
 *
 * FUSIÓN de _tactical-label.ts + _role-profile.ts en un único agente.
 *
 * Genera el "ADN Futbolístico" del jugador:
 *   - Estilo de juego (técnico, físico, mixto, creativo, defensivo)
 *   - Rol natural sugerido vs rol actual
 *   - Comportamiento bajo presión
 *   - Lectura de juego
 *   - 3-5 etiquetas tácticas (proxy de estilo)
 *
 * Inputs combinados de los 2 antiguos agentes:
 *   - subscores VSI (técnica, físico, mental, táctica)
 *   - métricas biomecánicas
 *   - posición actual del jugador
 *
 * Cost: ~€0,002 (Haiku con prompt caching)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";

export const config = { runtime: "edge" };

const dnaSchema = z.object({
  playerId: z.string(),
  videoId: z.string(),
  vsi: z.object({
    vsi: z.number(),
    subscores: z.record(z.unknown()),
  }),
  biomechanics: z.object({
    sprintSpeed: z.object({ value: z.number(), unit: z.string() }),
    strideFrequencyHz: z.number(),
  }).optional(),
  playerContext: z.object({
    chronologicalAge: z.number(),
    position: z.string().optional(),
  }),
});

const PROMPT_VERSION = "dna-profile-v1.0.0";

const SYSTEM_PROMPT = `Eres el motor de ADN Futbolístico de VITAS.

Tu misión: producir el "ADN" del jugador combinando análisis de estilo (anteriormente _tactical-label) con análisis de rol natural (anteriormente _role-profile).

REGLAS:
- Estilo se deriva del balance de subscores:
  * Físico>Técnico → estilo "físico"
  * Técnico>Físico → estilo "técnico"
  * Equilibrado → estilo "mixto"
  * Mental alto + Táctica alta → "creativo"
  * Táctica alta + Físico alto + Técnica baja → "defensivo"
- Rol natural se sugiere comparando posición actual con perfil de subscores
- 3-5 etiquetas tácticas (ej. "box-to-box", "carrilero ofensivo", "destructor", "mediapunta llegador")
- Si rol natural ≠ posición actual, indícalo como sugerencia, NO como verdad absoluta

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string",
  "primary_style": "técnico|físico|mixto|creativo|defensivo",
  "style_summary": "string max 220 chars",
  "natural_role": "string · ej. 'Mediocentro box-to-box'",
  "current_role": "string · de input",
  "role_alignment": "aligned|adjacent|misaligned",
  "tactical_labels": ["string"],
  "pressure_behavior": "string max 180 chars · cómo se comporta bajo presión",
  "game_reading": "string max 180 chars · capacidad de lectura del juego"
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
  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  return JSON.parse(data.content?.[0]?.text ?? "{}");
}

export default withHandler(
  { schema: dnaSchema, requireAuth: true, maxRequests: 100 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "missing", status: 500 });
    }

    const input = body as z.infer<typeof dnaSchema>;
    const cacheKey = hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      const userMessage = `JUGADOR:
${JSON.stringify(input.playerContext, null, 2)}

VSI Y SUBSCORES:
${JSON.stringify(input.vsi, null, 2)}

BIOMECÁNICA RELEVANTE:
${JSON.stringify(input.biomechanics ?? "no_data", null, 2)}

Genera el ADN Futbolístico en JSON estricto.`;

      const dna = await callHaiku(SYSTEM_PROMPT, userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: "claude-haiku-4-5",
        dna,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "dna_failed",
        message: err instanceof Error ? err.message : "Unknown",
        status: 500,
      });
    }
  }
);
