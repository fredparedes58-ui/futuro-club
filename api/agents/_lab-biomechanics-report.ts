/**
 * VITAS · LAB Biomechanics Report (NUEVO · LLM Sonnet)
 * POST /api/agents/lab-biomechanics-report
 *
 * Genera el reporte técnico LAB usando Claude Sonnet 4.5.
 * Recibe métricas reales de _biomechanics-extractor + PHV + VSI subscores
 * y produce un informe detallado en español dirigido a coaches.
 *
 * Output: JSON con estructura del reporte + markdown render.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached, incrementHitCount } from "../_lib/agentCache";

export const config = { runtime: "edge" };

const labSchema = z.object({
  playerId: z.string(),
  videoId: z.string(),
  biomechanics: z.object({
    knee: z.object({
      leftAvgDeg: z.number(),
      rightAvgDeg: z.number(),
      asymmetryPct: z.number().nullable(),
    }),
    strideFrequencyHz: z.number(),
    sprintSpeed: z.object({ value: z.number(), unit: z.string() }),
    trunkInclinationDeg: z.number(),
    qualityScore: z.number(),
  }),
  phv: z.object({
    biologicalAge: z.number(),
    chronologicalAge: z.number(),
    offset: z.number(),
    category: z.string(),
    phvStatus: z.string(),
  }).optional(),
  vsi: z.object({
    vsi: z.number(),
    tier: z.string(),
    subscores: z.record(z.unknown()),
  }).optional(),
  playerContext: z.object({
    chronologicalAge: z.number(),
    position: z.string().optional(),
  }),
});

const PROMPT_VERSION = "lab-biomech-v1.0.0";

const LAB_SYSTEM_PROMPT = `Eres el motor de generación de reportes biomecánicos LAB de VITAS Football Intelligence.

Tu misión: producir un informe técnico denso y profesional dirigido a entrenadores y preparadores físicos sobre las métricas biomecánicas extraídas del análisis automático de vídeo.

ESTILO OBLIGATORIO:
- Lenguaje técnico pero claro
- Cita números concretos siempre
- Identifica fortalezas y debilidades sin endulzar
- Si una asimetría es >12% señálala como riesgo de lesión
- Si trunkInclination >35° en sprint, indica posible déficit de core
- Si strideFrequency <2.5 Hz para edad >12, indica déficit explosividad
- Adapta a la edad biológica (no cronológica) si tienes PHV

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string",
  "summary": "string max 240 chars · resumen 1-2 frases",
  "metrics_table": [
    { "metric": "string", "value": "string con unidad", "interpretation": "string", "alert": "ok|warning|critical" }
  ],
  "strengths": ["string"],     // 2-4 fortalezas observadas
  "concerns": ["string"],      // 0-4 alertas técnicas (si las hay)
  "recommendations": ["string"], // 3-5 recomendaciones concretas para coach
  "next_focus": "string max 200 chars · qué priorizar próximas 2 semanas"
}

NO incluyas markdown ni texto fuera del JSON.`;

interface LabReportInput {
  playerId: string;
  videoId: string;
  biomechanics: unknown;
  phv?: unknown;
  vsi?: unknown;
  playerContext: { chronologicalAge: number; position?: string };
}

async function callClaude(systemPrompt: string, userMessage: string, apiKey: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-5",
      max_tokens: 2500,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" }, // prompt caching
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Claude API error ${res.status}: ${errText}`);
  }

  const data = await res.json();
  const text = data.content?.[0]?.text ?? "{}";
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`Claude returned non-JSON: ${text.slice(0, 200)}`);
  }
}

export default withHandler(
  { schema: labSchema, requireAuth: true, maxRequests: 50 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({
        code: "no_api_key",
        message: "Claude API key not configured",
        status: 500,
      });
    }

    const input = body as LabReportInput;

    // ── Cache: mismo input → mismo reporte ──────────────────────
    const cacheKey = hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) {
      await incrementHitCount(cacheKey);
      return successResponse({ ...cached, fromCache: true });
    }

    // ── Construir mensaje contextualizado ──────────────────────
    const userMessage = `DATOS DEL JUGADOR:
${JSON.stringify(input.playerContext, null, 2)}

MÉTRICAS BIOMECÁNICAS (extracción automática MMPose):
${JSON.stringify(input.biomechanics, null, 2)}

MADURACIÓN BIOLÓGICA (Mirwald):
${JSON.stringify(input.phv ?? "no_data", null, 2)}

VSI ACTUAL:
${JSON.stringify(input.vsi ?? "no_data", null, 2)}

Genera el reporte LAB en JSON estricto.`;

    try {
      const report = await callClaude(LAB_SYSTEM_PROMPT, userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: "claude-sonnet-4-5",
        report,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7); // 7 días cache

      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "lab_generation_failed",
        message: err instanceof Error ? err.message : "Unknown LAB error",
        status: 500,
      });
    }
  }
);
