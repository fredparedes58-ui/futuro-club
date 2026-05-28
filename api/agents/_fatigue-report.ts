/**
 * VITAS · Fatigue Report Agent (Sprint 7 — Pipeline Automático)
 * POST /api/agents/fatigue-report
 *
 * 7th report agent in the pipeline. Generates a narrative fatigue report
 * including: current fatigue level, injury risk assessment, workload
 * recommendations, PHV-specific guidance, and recovery protocols.
 *
 * Model: Claude Haiku (fast, cost-effective for structured narrative)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const fatigueReportSchema = z.object({
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
  // Fatigue-specific data
  fatigueReport: z.record(z.unknown()).nullable().optional(),
  fatigueHistory: z.array(z.record(z.unknown())).optional(),
});

const PROMPT_VERSION = "v1.0.0";

function buildPrompt(data: z.infer<typeof fatigueReportSchema>): string {
  const age = data.playerContext?.chronologicalAge ?? 12;
  const position = data.playerContext?.position ?? "MID";
  const phvOffset = (data.phv as Record<string, unknown>)?.offset ?? (data.phv as Record<string, unknown>)?.maturity_offset ?? null;
  const phvCategory = (data.phv as Record<string, unknown>)?.category ?? (data.phv as Record<string, unknown>)?.phv_category ?? "unknown";
  const fatigue = data.fatigueReport ?? {};

  return `Eres un analista de rendimiento deportivo juvenil especializado en fatiga y gestión de carga.

## CONTEXTO DEL JUGADOR
- Edad cronológica: ${age} años
- Posición: ${position}
- Offset PHV: ${phvOffset !== null ? `${phvOffset} años (${phvCategory})` : "No disponible"}

## DATOS DE FATIGA DE LA SESIÓN
${JSON.stringify(fatigue, null, 2)}

## HISTORIAL DE SESIONES (últimas 4 semanas)
${data.fatigueHistory ? JSON.stringify(data.fatigueHistory.slice(-10), null, 2) : "Sin historial disponible"}

## INSTRUCCIONES
Genera un reporte de fatiga en español con las siguientes secciones. Usa datos concretos cuando estén disponibles, estimaciones razonables cuando no.

### 1. Estado Actual de Fatiga
- Índice de fatiga (0-100) y severidad
- Principales indicadores (sprint decay, speed decay, metabolic trend)
- Señales posturales detectadas (manos en rodillas, inclinación trunk, etc.)

### 2. Análisis de Carga (ACWR)
- Valor ACWR actual y zona (óptimo/precaución/peligro/desentrenado)
- Tendencia de carga aguda vs crónica
- Recomendación de carga para la próxima sesión

### 3. Riesgo de Lesión
- Nivel de riesgo (bajo/moderado/alto/muy alto)
- Factores de riesgo identificados
- Zonas corporales más expuestas

### 4. Ajustes PHV
- Cómo la maduración biológica afecta los umbrales de fatiga
- Umbrales personalizados aplicados (sprint, metabolic, ACWR)
- Recomendaciones específicas por banda de maduración

### 5. Protocolo de Recuperación
- Plan de recuperación para las próximas 48-72 horas
- Indicadores para volver a entrenar a intensidad completa
- Ejercicios complementarios recomendados

Formato: JSON con estructura:
{
  "estadoActual": { "indice": number, "severidad": string, "indicadores": string[], "señalesPosturales": string[] },
  "cargaACWR": { "valor": number|null, "zona": string, "tendencia": string, "recomendacionProximaSesion": string },
  "riesgoLesion": { "nivel": string, "factores": string[], "zonasExpuestas": string[] },
  "ajustesPHV": { "banda": string, "umbralesModificados": string[], "recomendaciones": string[] },
  "protocoloRecuperacion": { "plan48h": string[], "indicadoresRetorno": string[], "ejerciciosComplementarios": string[] },
  "resumenEjecutivo": string
}`;
}

export default withHandler(
  { schema: fatigueReportSchema, requireAuth: false, maxRequests: 50 },
  async ({ body }) => {
    const data = body as z.infer<typeof fatigueReportSchema>;

    if (!ANTHROPIC_API_KEY) {
      // Fallback: generate mock report
      return successResponse({
        report: generateMockReport(data),
        promptVersion: PROMPT_VERSION,
        model: "mock",
        source: "fallback",
      });
    }

    try {
      const prompt = buildPrompt(data);

      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: "claude-3-5-haiku-20241022",
          max_tokens: 2000,
          temperature: 0.3,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("[fatigue-report] Anthropic error:", response.status, errText.slice(0, 200));
        return successResponse({
          report: generateMockReport(data),
          promptVersion: PROMPT_VERSION,
          model: "mock",
          source: "fallback_api_error",
        });
      }

      const result = await response.json() as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };

      const text = result.content?.[0]?.text ?? "";
      let report: Record<string, unknown>;

      try {
        // Try to parse JSON from response
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        report = jsonMatch ? JSON.parse(jsonMatch[0]) : { raw: text };
      } catch {
        report = { raw: text };
      }

      return successResponse({
        report,
        promptVersion: PROMPT_VERSION,
        model: "claude-3-5-haiku-20241022",
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.error("[fatigue-report] Error:", err);
      return successResponse({
        report: generateMockReport(data),
        promptVersion: PROMPT_VERSION,
        model: "mock",
        source: "fallback_exception",
      });
    }
  },
);

function generateMockReport(data: z.infer<typeof fatigueReportSchema>): Record<string, unknown> {
  const fatigue = data.fatigueReport as Record<string, unknown> | null;
  return {
    estadoActual: {
      indice: (fatigue as Record<string, unknown>)?.fatigueIndex ?? 35,
      severidad: "moderado",
      indicadores: ["Sprint decay: -12%", "Speed decay: -8%", "Metabolic power estable"],
      señalesPosturales: ["Inclinación trunk aumentó 3° en últimos 15 min"],
    },
    cargaACWR: {
      valor: 1.1,
      zona: "óptimo",
      tendencia: "estable",
      recomendacionProximaSesion: "Mantener carga actual. Sesión de intensidad media recomendada.",
    },
    riesgoLesion: {
      nivel: "bajo",
      factores: ["Carga dentro de rango óptimo", "Sin señales posturales críticas"],
      zonasExpuestas: ["Isquiotibiales (sprint repetido)"],
    },
    ajustesPHV: {
      banda: (data.phv as Record<string, unknown>)?.category ?? "unknown",
      umbralesModificados: ["Sprint threshold ajustado por maduración"],
      recomendaciones: ["Monitorear carga durante pico de crecimiento"],
    },
    protocoloRecuperacion: {
      plan48h: ["Hidratación elevada", "Sueño mínimo 9h", "Movilidad activa día siguiente"],
      indicadoresRetorno: ["Sprint speed recupera >90% del baseline", "Sin dolor muscular residual"],
      ejerciciosComplementarios: ["Core stability", "Movilidad de cadera", "Propiocepción"],
    },
    resumenEjecutivo: "Jugador en estado de fatiga moderado. La carga de trabajo es adecuada (ACWR 1.1). No se detectan señales de riesgo elevado. Se recomienda mantener el plan de entrenamiento actual con monitoreo estándar.",
  };
}
