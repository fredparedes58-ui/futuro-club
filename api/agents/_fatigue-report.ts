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
import { MODELS } from "../_lib/models";
import { normalizeLocale, languageDirective } from "../../src/lib/shared/locale";
import { resolveCategory, categoryDirective } from "../../src/lib/shared/category";

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
  // FASE 5 · idioma del reporte (default "es") — reportes bilingües ES/EN
  locale: z.enum(["es", "en"]).optional(),
  // C1 multi-categoría · evita que Zod recorte la categoría del sharedContext
  category: z.enum(["youth", "senior"]).optional(),
});

const PROMPT_VERSION = "v1.1.0";

function buildPrompt(data: z.infer<typeof fatigueReportSchema>): string {
  const age = data.playerContext?.chronologicalAge ?? 12;
  const position = data.playerContext?.position ?? "MID";
  const phvOffset = (data.phv as Record<string, unknown>)?.offset ?? (data.phv as Record<string, unknown>)?.maturity_offset ?? null;
  const phvCategory = (data.phv as Record<string, unknown>)?.category ?? (data.phv as Record<string, unknown>)?.phv_category ?? "unknown";
  const fatigue = data.fatigueReport ?? {};
  const locale = normalizeLocale(data.locale);
  // C1 multi-categoría · override explícito > edad cronológica > default youth
  const category = resolveCategory({ age: data.playerContext?.chronologicalAge, category: data.category });

  return `Eres un analista de rendimiento deportivo ${category === "senior" ? "profesional" : "juvenil"} especializado en fatiga y gestión de carga.

## CONTEXTO DEL JUGADOR
- Edad cronológica: ${age} años
- Posición: ${position}${category === "senior" ? "" : `
- Offset PHV: ${phvOffset !== null ? `${phvOffset} años (${phvCategory})` : "No disponible"}`}

## DATOS DE FATIGA DE LA SESIÓN
${JSON.stringify(fatigue, null, 2)}

## HISTORIAL DE SESIONES (últimas 4 semanas)
${data.fatigueHistory ? JSON.stringify(data.fatigueHistory.slice(-10), null, 2) : "Sin historial disponible"}

## INSTRUCCIONES
Genera un reporte de fatiga en español con las siguientes secciones. Usa SOLO datos concretos. Si falta un dato (índice de fatiga, ACWR, historial de carga), NO lo estimes: pon ese campo en null y decláralo en not_evaluated. NUNCA inventes una cifra de fatiga, carga o riesgo. Un hueco honesto vale más que un número inventado sobre un menor.

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

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

${category === "senior" ? `### 4. Ajustes de Umbrales Individuales
- Jugador sénior: NO menciones maduración biológica/PHV — no aplica a adultos
- Umbrales personalizados aplicados (sprint, metabolic, ACWR) según el perfil y la carga del jugador
- En el campo "ajustesPHV" del JSON usa banda "senior" y recomendaciones de gestión de carga adulta` : `### 4. Ajustes PHV
- Cómo la maduración biológica afecta los umbrales de fatiga
- Umbrales personalizados aplicados (sprint, metabolic, ACWR)
- Recomendaciones específicas por banda de maduración`}

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
  "resumenEjecutivo": string,
  "confidence_score": number,
  "data_completeness": number,
  "not_evaluated": ["string · aspectos que NO se pudieron evaluar por falta de datos; array vacío si todo cubierto"]
}

${languageDirective(locale)}${category === "senior" ? "\n\n" : ""}${categoryDirective(category, locale)}`;
}

export default withHandler(
  { schema: fatigueReportSchema, requireAuth: true, allowServiceToken: true, maxRequests: 50 },
  async ({ body }) => {
    const data = body as z.infer<typeof fatigueReportSchema>;

    // Inv #2 (CLAUDE.md): ante dato ausente se BLOQUEA, nunca se estima. Sin sesiones
    // de fatiga ni historial de carga no hay nada que medir → informe bloqueado con
    // índice/ACWR/riesgo en null y motivo. Se corta ANTES del LLM y del mock, así que
    // ninguna rama (con o sin API key, éxito o error) puede fabricar cifras.
    if (!hasRealFatigueData(data)) {
      return successResponse({
        report: blockedFatigueReport(data),
        promptVersion: PROMPT_VERSION,
        model: "gated",
        source: "no_fatigue_data",
      });
    }

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
          model: MODELS.fast,
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
        model: MODELS.fast,
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

/** ¿Hay datos REALES de fatiga? Sesión con contenido, o historial de carga no vacío. */
export function hasRealFatigueData(data: z.infer<typeof fatigueReportSchema>): boolean {
  const fr = data.fatigueReport;
  const hasSession = fr != null && typeof fr === "object" && Object.keys(fr).length > 0;
  const hasHistory = Array.isArray(data.fatigueHistory) && data.fatigueHistory.length > 0;
  return hasSession || hasHistory;
}

/**
 * Informe de fatiga BLOQUEADO (inv #2). Sin sesiones registradas no se puede evaluar
 * índice/ACWR/riesgo: se devuelven en null con motivo, NUNCA cifras fabricadas. La
 * vista (FatigueReportView) ya degrada null → sin cifra y muestra el resumen honesto.
 */
export function blockedFatigueReport(data: z.infer<typeof fatigueReportSchema>): Record<string, unknown> {
  const phv = data.phv as Record<string, unknown> | null | undefined;
  const banda = phv?.category ?? phv?.phv_category ?? "unknown";
  return {
    estadoActual: { indice: null, severidad: "sin datos", indicadores: [], señalesPosturales: [] },
    cargaACWR: {
      valor: null,
      zona: "sin datos",
      tendencia: "sin datos",
      recomendacionProximaSesion: "Registra sesiones de entrenamiento (carga/RPE) o analiza un vídeo con tracking para activar el análisis de carga.",
    },
    riesgoLesion: { nivel: "sin datos", factores: [], zonasExpuestas: [] },
    ajustesPHV: { banda, umbralesModificados: [], recomendaciones: [] },
    protocoloRecuperacion: { plan48h: [], indicadoresRetorno: [], ejerciciosComplementarios: [] },
    resumenEjecutivo: "Sin datos de sesión de fatiga registrados. No es posible evaluar el estado de fatiga, la carga (ACWR) ni el riesgo de lesión sin sesiones de entrenamiento o tracking de vídeo. Registra sesiones para activar este informe.",
    confidence_score: 0,
    data_completeness: 0,
    not_evaluated: [
      "Índice de fatiga: sin datos de sesión",
      "ACWR (carga aguda:crónica): sin historial de carga",
      "Riesgo de lesión por fatiga: sin datos",
    ],
    _gated: true,
    _gate_reason: "no_fatigue_data",
  };
}

// Fallback cuando el LLM no está disponible pero SÍ hay datos reales (el guard
// hasRealFatigueData ya cortó el caso sin datos). No se fabrican cifras: el índice
// sale del dato real si existe, si no null; el ACWR exige historial → null (no se
// estima), y no se inventan decays concretos.
function generateMockReport(data: z.infer<typeof fatigueReportSchema>): Record<string, unknown> {
  const fatigue = data.fatigueReport as Record<string, unknown> | null;
  const idx = typeof fatigue?.fatigueIndex === "number" ? (fatigue.fatigueIndex as number) : null;
  const severidad = idx === null ? "sin datos" : idx >= 66 ? "alto" : idx >= 33 ? "moderado" : "bajo";
  return {
    estadoActual: {
      indice: idx,
      severidad,
      indicadores: [],
      señalesPosturales: [],
    },
    cargaACWR: {
      valor: null,
      zona: "sin datos",
      tendencia: "sin datos",
      recomendacionProximaSesion: "El ACWR exige historial de carga; registra sesiones para calcularlo.",
    },
    riesgoLesion: { nivel: "sin datos", factores: [], zonasExpuestas: [] },
    ajustesPHV: {
      banda: (data.phv as Record<string, unknown>)?.category ?? "unknown",
      umbralesModificados: [],
      recomendaciones: [],
    },
    protocoloRecuperacion: {
      plan48h: ["Hidratación adecuada", "Sueño de calidad", "Movilidad activa"],
      indicadoresRetorno: ["Ausencia de dolor muscular residual"],
      ejerciciosComplementarios: ["Core stability", "Movilidad de cadera", "Propiocepción"],
    },
    resumenEjecutivo: idx === null
      ? "Análisis de fatiga no disponible temporalmente (servicio de IA caído). No se muestran cifras estimadas."
      : `Índice de fatiga registrado: ${idx}/100 (${severidad}). El ACWR y el riesgo de lesión requieren historial de carga, no disponible en esta sesión.`,
    _fallback: true,
  };
}
