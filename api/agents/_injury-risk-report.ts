/**
 * VITAS · Injury Risk Report Agent (Sprint 10)
 * POST /api/agents/injury-risk-report
 *
 * 8th report agent in the pipeline. Generates a narrative injury risk
 * assessment with PHV-aware guidance, workload recommendations,
 * and prevention protocols in Spanish.
 *
 * Model: Claude Haiku (fast, cost-effective)
 * Cost: ~$0.002/call
 * Gated: Plan >= Pro (checked by orchestrator)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const injuryReportSchema = z.object({
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
  // Injury-specific context (from injury-risk-calculator)
  injuryRisk: z.record(z.unknown()).nullable().optional(),
  teamAnalysis: z.unknown().nullable().optional(),
  analysisMode: z.string().optional(),
});

const PROMPT_VERSION = "v1.0.0";

function buildPrompt(data: z.infer<typeof injuryReportSchema>): string {
  const age = data.playerContext?.chronologicalAge ?? 12;
  const position = data.playerContext?.position ?? "MID";
  const phvOffset = (data.phv as Record<string, unknown>)?.offset ?? (data.phv as Record<string, unknown>)?.maturity_offset ?? null;
  const phvCategory = (data.phv as Record<string, unknown>)?.category ?? (data.phv as Record<string, unknown>)?.phv_category ?? "unknown";
  const fatigue = data.fatigueReport ?? {};
  const injuryRisk = data.injuryRisk ?? {};
  const biomech = data.biomechanics ?? {};

  return `Eres un fisioterapeuta deportivo especializado en futbol juvenil y prevencion de lesiones.
Tu audiencia son entrenadores y preparadores fisicos de academias.

## CONTEXTO DEL JUGADOR
- Edad cronologica: ${age} anos
- Posicion: ${position}
- Offset PHV: ${phvOffset !== null ? `${phvOffset} anos (${phvCategory})` : "No disponible"}

## DATOS DE RIESGO DE LESION (modelo deterministico VITAS)
${JSON.stringify(injuryRisk, null, 2)}

## DATOS DE FATIGA DE LA SESION
${JSON.stringify(fatigue, null, 2)}

## DATOS BIOMECANICOS
${JSON.stringify(biomech, null, 2)}

## INSTRUCCIONES
Genera un reporte de riesgo de lesion en formato JSON con esta estructura exacta:

{
  "evaluacionGeneral": "Parrafo de 3-4 lineas evaluando el estado fisico general del jugador",
  "nivelRiesgo": "bajo | moderado | alto | critico",
  "factoresRiesgo": [
    {
      "factor": "nombre del factor (ej: ACWR elevado, Ventana PHV, Asimetria bilateral)",
      "severidad": "baja | media | alta",
      "descripcion": "Explicacion en 2 lineas maxima comprensible para un entrenador"
    }
  ],
  "recomendacionesCarga": [
    "Recomendacion especifica de carga 1",
    "Recomendacion especifica de carga 2",
    "Recomendacion especifica de carga 3"
  ],
  "alertaPHV": "Solo si el jugador esta en ventana de crecimiento. Explicar el riesgo especifico de lesion osea/apofisitis. Si no aplica: null",
  "protocoloPrevencion": [
    "Ejercicio o protocolo preventivo 1",
    "Ejercicio o protocolo preventivo 2",
    "Ejercicio o protocolo preventivo 3"
  ],
  "seguimiento": "Cuando reevaluar y que monitorizar (1-2 lineas)",
  "confidence_score": "number 0-100 · confianza real en este analisis segun los datos disponibles",
  "data_completeness": "number 0-100 · % de dimensiones evaluadas con datos reales, no inferidos",
  "not_evaluated": ["string · aspectos que no se pudieron evaluar por falta de datos"]
}

REGLAS:
- Lenguaje claro para entrenadores, NO jerga medica excesiva
- Si el ACWR es >1.5, enfatizar la necesidad de reducir carga
- Si el jugador esta en ventana PHV (offset -0.5 a +1.0), alertar sobre riesgo oseo (Osgood-Schlatter, Sever)
- Si la asimetria bilateral >15%, recomendar trabajo correctivo especifico
- Maximo 5 factores de riesgo
- Maximo 5 recomendaciones
- CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el analisis segun los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.
- Responde SOLO con JSON valido, sin texto adicional`;
}

export default withHandler(
  { schema: injuryReportSchema, requireAuth: true, allowServiceToken: true, maxRequests: 50 },
  async ({ body }) => {
    const data = body as z.infer<typeof injuryReportSchema>;

    if (!ANTHROPIC_API_KEY) {
      return successResponse({
        report: {
          evaluacionGeneral: "Reporte no disponible — API key no configurada",
          nivelRiesgo: "desconocido",
          factoresRiesgo: [],
          recomendacionesCarga: [],
          alertaPHV: null,
          protocoloPrevencion: [],
          seguimiento: "Configurar ANTHROPIC_API_KEY para generar reportes",
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
          model: "claude-haiku-4-5",
          max_tokens: 1500,
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error(`[injury-risk-report] Anthropic ${res.status}:`, errText);
        return errorResponse({ code: "llm_error", message: `Anthropic ${res.status}`, status: 502 });
      }

      const json = await res.json();
      const text = (json.content?.[0] as { text?: string })?.text ?? "";

      // Parse JSON from response
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) {
        return errorResponse({ code: "parse_error", message: "No JSON in response", status: 500 });
      }

      const report = JSON.parse(jsonMatch[0]);

      return successResponse({
        report,
        promptVersion: PROMPT_VERSION,
        model: "claude-haiku-4-5",
        inputTokens: json.usage?.input_tokens ?? 0,
        outputTokens: json.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.error("[injury-risk-report] Error:", err);
      return errorResponse({
        code: "agent_error",
        message: err instanceof Error ? err.message : "Unknown error",
        status: 500,
      });
    }
  },
);
