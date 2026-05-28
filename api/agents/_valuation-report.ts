/**
 * VITAS · Valuation Report Agent (Sprint 12)
 * POST /api/agents/valuation-report
 *
 * Generates a narrative valuation assessment in Spanish.
 * Includes tier analysis, comparable professionals, key factors,
 * and development recommendations.
 *
 * Model: Claude Haiku (fast, cost-effective)
 * Cost: ~$0.002/call
 * Gated: Plan >= Club (checked by orchestrator)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const valuationReportSchema = z.object({
  playerId: z.string(),
  videoId: z.string().optional(),
  analysisId: z.string().optional(),
  biomechanics: z.record(z.unknown()).optional(),
  phv: z.record(z.unknown()).nullable().optional(),
  vsi: z.unknown().nullable().optional(),
  similarity: z.unknown().nullable().optional(),
  playerContext: z.object({
    chronologicalAge: z.number().optional(),
    position: z.string().optional(),
    secondaryPositions: z.array(z.string()).optional(),
    foot: z.string().optional(),
  }).optional(),
  videoContext: z.record(z.unknown()).optional(),
  scanning: z.unknown().nullable().optional(),
  fatigueReport: z.record(z.unknown()).nullable().optional(),
  fatigueHistory: z.array(z.record(z.unknown())).optional(),
  injuryRisk: z.record(z.unknown()).nullable().optional(),
  // Valuation-specific data
  valuationModel: z.record(z.unknown()).nullable().optional(),
  teamAnalysis: z.unknown().nullable().optional(),
  analysisMode: z.string().optional(),
});

const PROMPT_VERSION = "v1.0.0";

function buildPrompt(data: z.infer<typeof valuationReportSchema>): string {
  const age = data.playerContext?.chronologicalAge ?? 12;
  const position = data.playerContext?.position ?? "MID";
  const phvOffset = (data.phv as Record<string, unknown>)?.offset ?? (data.phv as Record<string, unknown>)?.maturity_offset ?? null;
  const valuation = data.valuationModel ?? {};
  const injuryRisk = data.injuryRisk ?? {};
  const vsi = data.vsi;

  return `Eres un director deportivo de academia de futbol juvenil con 20 anos de experiencia en deteccion de talento.
Tu audiencia son directores tecnicos, scouts y directivos de academias.

## CONTEXTO DEL JUGADOR
- Edad cronologica: ${age} anos
- Posicion principal: ${position}
- Offset PHV: ${phvOffset !== null ? `${phvOffset} anos` : "No disponible"}
- VSI actual: ${JSON.stringify(vsi)}

## MODELO DE VALORACION (deterministico VITAS)
${JSON.stringify(valuation, null, 2)}

## RIESGO DE LESION
${JSON.stringify(injuryRisk, null, 2)}

## INSTRUCCIONES
Genera un reporte de valoracion predictiva en formato JSON con esta estructura exacta:

{
  "evaluacionGeneral": "Parrafo de 4-5 lineas evaluando el potencial del jugador de forma honesta y equilibrada",
  "tierAnalisis": "Explicacion de por que el jugador esta en este tier (2-3 lineas)",
  "comparablesProfesionales": [
    {
      "nombre": "Nombre del profesional comparable",
      "equipo": "Equipo actual o historico",
      "razon": "Por que se compara (1 linea)"
    }
  ],
  "factoresClave": [
    {
      "factor": "Nombre del factor",
      "impacto": "positivo | negativo | neutro",
      "explicacion": "1-2 lineas"
    }
  ],
  "proyeccion": {
    "cortoPlaz": "Expectativa a 1 ano (1-2 lineas)",
    "medioPlaz": "Expectativa a 3 anos (1-2 lineas)",
    "techoEstimado": "Nivel maximo estimado (1 linea)"
  },
  "recomendacionesDesarrollo": [
    "Recomendacion 1 para maximizar potencial",
    "Recomendacion 2",
    "Recomendacion 3"
  ],
  "riesgosValoracion": [
    "Riesgo 1 que podria limitar la valoracion",
    "Riesgo 2"
  ]
}

REGLAS:
- Se honesto y realista. No inflar expectativas. La mayoria de juveniles NO llegan a profesional
- Si el VSI es <60, ser cauteloso con las proyecciones
- Si el jugador esta en ventana PHV, mencionar que la valoracion puede cambiar post-crecimiento
- Maximo 3 comparables profesionales (de la misma posicion)
- Si hay riesgo de lesion alto, reflejarlo como riesgo de valoracion
- Los comparables deben ser realistas para el nivel del jugador
- Responde SOLO con JSON valido, sin texto adicional`;
}

export default withHandler(
  { schema: valuationReportSchema, requireAuth: false, maxRequests: 50 },
  async ({ body }) => {
    const data = body as z.infer<typeof valuationReportSchema>;

    if (!ANTHROPIC_API_KEY) {
      return successResponse({
        report: {
          evaluacionGeneral: "Reporte no disponible — API key no configurada",
          tierAnalisis: "N/A",
          comparablesProfesionales: [],
          factoresClave: [],
          proyeccion: { cortoPlaz: "N/A", medioPlaz: "N/A", techoEstimado: "N/A" },
          recomendacionesDesarrollo: [],
          riesgosValoracion: [],
        },
        promptVersion: PROMPT_VERSION,
        fallback: true,
      });
    }

    const prompt = buildPrompt(data);

    try {
      const res = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "content-type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-20250514",
          max_tokens: 2000,
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[valuation-report] Anthropic ${res.status}:`, errText);
        return errorResponse({ code: "llm_error", message: `Anthropic ${res.status}`, status: 502 });
      }

      const json = await res.json();
      const text = (json.content?.[0] as { text?: string })?.text ?? "";

      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return errorResponse({ code: "parse_error", message: "No JSON in response", status: 500 });
      }

      const report = JSON.parse(jsonMatch[0]);

      return successResponse({
        report,
        promptVersion: PROMPT_VERSION,
        model: "claude-sonnet-4-20250514",
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.error("[valuation-report] Error:", err);
      return errorResponse({
        code: "agent_error",
        message: err instanceof Error ? err.message : "Unknown error",
        status: 500,
      });
    }
  },
);
