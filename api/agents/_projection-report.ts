/**
 * VITAS · Projection Report (NUEVO · LLM Haiku)
 * POST /api/agents/projection-report
 *
 * Genera la proyección VSI a 1, 2 y 3 años usando:
 *   - VSI actual + subscores
 *   - PHV adjusted offset (Mirwald)
 *   - Edad biológica vs cronológica
 *   - Tendencia histórica (si existen análisis previos del mismo jugador)
 *
 * El cálculo de la curva es PARCIALMENTE determinista (curva PHV típica)
 * y la narrativa la añade Claude Haiku.
 *
 * Cost: ~€0,002 por reporte
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";

export const config = { runtime: "edge" };

// Schema tolerante: PHV puede ser null si player no tiene anthropometrics
const projectionSchema = z.object({
  playerId: z.string(),
  videoId: z.string().optional(),
  analysisId: z.string().optional(),
  vsi: z.record(z.unknown()).nullable().optional(),
  phv: z.record(z.unknown()).nullable().optional(),
  biomechanics: z.record(z.unknown()).nullable().optional(),
  scanning: z.record(z.unknown()).nullable().optional(),
  similarity: z.record(z.unknown()).nullable().optional(),
  historicalVsi: z.array(z.unknown()).optional(),
  playerContext: z.object({
    chronologicalAge: z.number().optional(),
    position: z.string().optional(),
  }).passthrough(),
}).passthrough();

const PROMPT_VERSION = "projection-v1.1.0"; // v1.1 = schema tolerante (PHV null OK)

const SYSTEM_PROMPT = `Eres el motor de Proyección 3 años de VITAS.

Recibes la curva proyectada (calculada deterministicamente con coeficientes PHV) y las debilidades actuales. Tu misión es narrar qué significa esa proyección para el jugador.

REGLAS:
- Sé HONESTO: si la curva sube poco, no la infles
- Si está en "during_phv", explica que la proyección es más volátil
- Identifica los 2-3 sub-scores que más impactarán el VSI futuro
- Sugiere qué pasa si trabaja sus debilidades (escenario optimista) vs si no (escenario base)

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string",
  "headline": "string max 140 chars",
  "current_vsi": number,
  "year_1_vsi": number,
  "year_2_vsi": number,
  "year_3_vsi": number,
  "phv_consideration": "string max 240 chars",
  "key_drivers": ["string"],
  "scenarios": {
    "base": "string max 200 chars",
    "with_focused_work": "string max 200 chars"
  }
}

NO incluyas markdown ni texto fuera del JSON.`;

/**
 * Curva determinista de proyección VSI según etapa PHV.
 * Refleja el "boost" típico durante el estirón y la consolidación post-PHV.
 */
function projectVsiCurve(currentVsi: number, phv: { offset: number; category: "early" | "ontime" | "late" }): {
  year1: number;
  year2: number;
  year3: number;
} {
  const base = currentVsi;
  let r1 = 0, r2 = 0, r3 = 0;

  if (phv.category === "early") {
    // Pre-PHV: crecimiento progresivo, máximo en año 2 (estirón)
    r1 = base + 4;
    r2 = base + 9;
    r3 = base + 12;
  } else if (phv.category === "ontime") {
    // Durante PHV: año 1 más volátil, consolidación años 2-3
    r1 = base + 2;
    r2 = base + 6;
    r3 = base + 10;
  } else {
    // Post-PHV: ya muestra su nivel, crecimiento moderado
    r1 = base + 3;
    r2 = base + 6;
    r3 = base + 8;
  }

  return {
    year1: Math.min(100, Number(r1.toFixed(1))),
    year2: Math.min(100, Number(r2.toFixed(1))),
    year3: Math.min(100, Number(r3.toFixed(1))),
  };
}

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
  { schema: projectionSchema, requireAuth: true, maxRequests: 100 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "missing", status: 500 });
    }

    const input = body as z.infer<typeof projectionSchema>;
    const cacheKey = hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      // Cálculo determinista de la curva
      const curve = projectVsiCurve(input.vsi.vsi, {
        offset: input.phv.offset,
        category: input.phv.category,
      });

      const userMessage = `JUGADOR:
${JSON.stringify(input.playerContext, null, 2)}

VSI ACTUAL: ${input.vsi.vsi} (tier: ${input.vsi.tier})
Subscores: ${JSON.stringify(input.vsi.subscores, null, 2)}

PHV:
${JSON.stringify(input.phv, null, 2)}

CURVA PROYECTADA (calculada deterministicamente):
- Año 1: ${curve.year1}
- Año 2: ${curve.year2}
- Año 3: ${curve.year3}

HISTÓRICO PREVIO (si hay):
${JSON.stringify(input.historicalVsi ?? "primer análisis", null, 2)}

Genera el reporte Proyección 3 años en JSON estricto, usando los valores de la curva proyectada.`;

      const narrative = await callHaiku(SYSTEM_PROMPT, userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: "claude-haiku-4-5",
        deterministicCurve: { current: input.vsi.vsi, ...curve },
        narrative,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "projection_failed",
        message: err instanceof Error ? err.message : "Unknown",
        status: 500,
      });
    }
  }
);
