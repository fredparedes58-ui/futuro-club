/**
 * VITAS · Player Report (REFACTOR de _scout-insight · LLM Sonnet)
 * POST /api/agents/player-report
 *
 * Reporte ancla comercial. Resumen ejecutivo del jugador para padres y coaches.
 *
 * Combina:
 *   - VSI Score + tier
 *   - PHV (edad biológica vs cronológica)
 *   - Métricas biomecánicas más relevantes
 *   - Top fortalezas y áreas de mejora
 *
 * Cost: ~€0,045 (Sonnet con prompt caching)
 *
 * Reemplaza _scout-insight.ts (que era el embrión de este reporte).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";

export const config = { runtime: "edge" };

const playerReportSchema = z.object({
  playerId: z.string(),
  videoId: z.string(),
  vsi: z.object({
    vsi: z.number(),
    tier: z.string(),
    tierLabel: z.string(),
    subscores: z.record(z.unknown()),
  }),
  phv: z.object({
    biologicalAge: z.number(),
    chronologicalAge: z.number(),
    offset: z.number(),
    category: z.string(),
    phvStatus: z.string(),
    recommendation: z.string().optional(),
  }).optional(),
  biomechanics: z.object({
    knee: z.object({
      leftAvgDeg: z.number(),
      rightAvgDeg: z.number(),
      asymmetryPct: z.number().nullable(),
    }),
    strideFrequencyHz: z.number(),
    sprintSpeed: z.object({ value: z.number(), unit: z.string() }),
    qualityScore: z.number(),
  }).optional(),
  similarity: z.object({
    matches: z.array(z.unknown()).optional(),
  }).optional(),
  playerContext: z.object({
    chronologicalAge: z.number(),
    position: z.string().optional(),
    name: z.string().optional(),
  }),
});

const PROMPT_VERSION = "player-report-v2.0.0"; // v2 = post refactor

const SYSTEM_PROMPT = `Eres el motor del Player Report de VITAS Football Intelligence.

Tu misión: producir el reporte ancla del producto. Es el primer reporte que ven padres y coaches. Debe ser comprensible, motivador, honesto y accionable.

DESTINATARIO PRIMARIO: padre/madre del jugador. Secundario: coach.

ESTILO:
- Lenguaje claro, sin jerga excesiva (adaptado a familia)
- Cita siempre el VSI Score y el tier explícitamente
- Si hay PHV, explícalo en una frase ("tu hijo está pre-estirón / en estirón / post-estirón")
- 2-3 fortalezas concretas con dato
- 2-3 áreas de mejora claras (sin endulzar)
- Una recomendación concreta para próximas 4 semanas
- Tono: profesional pero cercano, NUNCA alarmista

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string · ej. 'Análisis VITAS · [Nombre Jugador]'",
  "vsi_score": number,
  "tier": "elite|pro|talent|develop",
  "tier_label": "string",
  "executive_summary": "string max 280 chars · resumen 1 párrafo para padres",
  "phv_summary": "string max 200 chars · explicación PHV simple",
  "strengths": [
    { "title": "string", "evidence": "string max 120 chars con número o métrica" }
  ],
  "areas_to_improve": [
    { "title": "string", "evidence": "string max 120 chars", "priority": "high|medium|low" }
  ],
  "comparable_pro": "string max 80 chars · solo si similarity disponible",
  "next_4_weeks_focus": "string max 220 chars · qué priorizar",
  "honesty_note": "string max 180 chars · matiz realista sobre la edad y desarrollo"
}

NO incluyas markdown ni texto fuera del JSON.`;

async function callSonnet(systemPrompt: string, userMessage: string, apiKey: string) {
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
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.content?.[0]?.text ?? "{}");
}

export default withHandler(
  { schema: playerReportSchema, requireAuth: true, maxRequests: 50 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "missing", status: 500 });
    }

    const input = body as z.infer<typeof playerReportSchema>;
    const cacheKey = hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      const userMessage = `DATOS DEL JUGADOR:
${JSON.stringify(input.playerContext, null, 2)}

VSI:
${JSON.stringify(input.vsi, null, 2)}

PHV (maduración biológica):
${JSON.stringify(input.phv ?? "no_data", null, 2)}

BIOMECÁNICA:
${JSON.stringify(input.biomechanics ?? "no_data", null, 2)}

COMPARABLES PRO (top-1 si existe):
${JSON.stringify(input.similarity?.matches?.[0] ?? "no_data", null, 2)}

Genera el Player Report en JSON estricto.`;

      const report = await callSonnet(SYSTEM_PROMPT, userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: "claude-sonnet-4-5",
        report,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "player_report_failed",
        message: err instanceof Error ? err.message : "Unknown",
        status: 500,
      });
    }
  }
);
