/**
 * VITAS · Team Report Agent (Sprint 8)
 *
 * Generates a tactical team narrative report comparing both teams.
 * Uses Claude Haiku for cost efficiency.
 *
 * Input: shared pipeline context + team metrics
 * Output: { report: TeamReportContent, promptVersion: string }
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import { teamReportOutputSchema, validateLLMReport } from "./_outputSchemas";
import { normalizeLocale, languageDirective, type ReportLocale } from "../../src/lib/shared/locale";
import { resolveCategory, categoryDirective, type PlayerCategory } from "../../src/lib/shared/category";

export const config = { runtime: "edge" };

const inputSchema = z.object({
  analysisId: z.string().optional(),
  teamMetrics: z.record(z.unknown()).optional(),
  homeFormation: z.string().optional(),
  awayFormation: z.string().optional(),
  possession: z.record(z.unknown()).optional(),
  pressing: z.record(z.unknown()).optional(),
  passNetwork: z.record(z.unknown()).optional(),
  playerContext: z.record(z.unknown()).optional(),
  locale: z.enum(["es", "en"]).optional(),
}).passthrough();

const PROMPT_VERSION = "v1.1.0"; // v1.1 = gate de hueco + observado/inferido + fallback honesto (docx #14 P4)

function buildSystemPrompt(locale: ReportLocale, category: PlayerCategory): string {
  return `Eres un analista táctico de fútbol profesional de VITAS Football Intelligence.
Genera un informe táctico de equipo, breve y accionable.

Estructura tu respuesta como JSON con este formato:
{
  "executive_summary": "Resumen ejecutivo del partido en 2-3 oraciones",
  "tactical_overview": {
    "home": { "style": "descripción del estilo", "strengths": [".."], "weaknesses": [".."] },
    "away": { "style": "descripción del estilo", "strengths": [".."], "weaknesses": [".."] }
  },
  "key_battles": ["batalla 1", "batalla 2"],
  "momentum_shifts": ["cambio de momentum 1"],
  "recommendations": {
    "home": ["recomendación táctica 1", "recomendación 2"],
    "away": ["recomendación táctica 1", "recomendación 2"]
  },
  "overall_rating": { "home": 7.5, "away": 6.8 },
  "confidence_score": "number 0-100 · confianza real en este análisis según los datos disponibles",
  "data_completeness": "number 0-100 · % de dimensiones evaluadas con datos reales, no inferidos",
  "not_evaluated": ["string · aspectos que no se pudieron evaluar por falta de datos"]
}

EVIDENCIA Y PROCEDENCIA (docx #14):
- Todo (style, strengths, weaknesses, key_battles, momentum_shifts, recommendations, overall_rating) deriva ÚNICAMENTE de los datos aportados (formaciones, métricas de equipo, posesión, pressing, red de pases). Si un dato de entrada es null/vacío, escribe "No disponible" en ese punto y BAJA confidence_score; deja key_battles y momentum_shifts como [] si no hay evidencia. NUNCA inventes un valor táctico plausible.
- overall_rating: NO emitas notas si no hay métricas suficientes — deja {} en vez de inventar un número.
- Separa observación directa (visto en vídeo/tracking) de inferencia (estimado por modelo); marca explícitamente lo inferido.

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

${languageDirective(locale)}${categoryDirective(category, locale)}`;
}

export default withHandler(
  { schema: inputSchema, requireAuth: true, allowServiceToken: true, maxRequests: 100 },
  async ({ body }) => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      // Fallback honesto: sin modelo NO se fabrican estilos/batallas/ratings (docx #14
      // P4, inv #2). Se abstiene con campos vacíos y confianza 0; la UI lo señala por
      // `source`. Antes inventaba estilos y overall_rating 7.0/6.5.
      return successResponse({
        data: {
          report: {
            executive_summary: "Informe de equipo no disponible: falta el motor de análisis (sin datos suficientes).",
            tactical_overview: {
              home: { style: "No disponible", strengths: [], weaknesses: [] },
              away: { style: "No disponible", strengths: [], weaknesses: [] },
            },
            key_battles: [],
            momentum_shifts: [],
            recommendations: { home: [], away: [] },
            overall_rating: {},
            confidence_score: 0,
            data_completeness: 0,
            not_evaluated: ["Análisis táctico: no disponible sin el motor"],
          },
          promptVersion: PROMPT_VERSION,
          source: "mock_fallback",
        },
      });
    }

    const userMessage = `Analiza este partido de fútbol con los siguientes datos:

Formación local: ${body.homeFormation ?? "No detectada"}
Formación visitante: ${body.awayFormation ?? "No detectada"}

Métricas de equipo: ${JSON.stringify(body.teamMetrics ?? {}, null, 2)}
Posesión: ${JSON.stringify(body.possession ?? {}, null, 2)}
Pressing: ${JSON.stringify(body.pressing ?? {}, null, 2)}
Red de pases: ${JSON.stringify(body.passNetwork ?? {}, null, 2)}

Genera el informe táctico.`;

    const locale = normalizeLocale(body.locale);
    // C1 multi-categoría: override explícito > edad cronológica > default "youth"
    const category = resolveCategory({
      age: (body.playerContext as { chronologicalAge?: number } | undefined)?.chronologicalAge,
      category: (body as { category?: unknown }).category,
    });

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: MODELS.reasoning,
        max_tokens: 1024,
        system: buildSystemPrompt(locale, category),
        messages: [{ role: "user", content: userMessage }],
      }),
    });

    if (!response.ok) {
      return successResponse({
        data: {
          report: { executive_summary: "Error generando informe táctico." },
          promptVersion: PROMPT_VERSION,
          source: "error_fallback",
        },
      });
    }

    const result = await response.json();
    const text = result.content?.[0]?.text ?? "{}";

    let report: unknown;
    try {
      report = JSON.parse(text);
    } catch {
      report = { executive_summary: text };
    }

    // FASE 2: validar estructura antes de devolver — JSON válido con shape
    // basura ({}, disculpas del modelo…) cae al fallback marcado, no a la UI.
    const validation = validateLLMReport(teamReportOutputSchema, report);
    if (!validation.ok) {
      console.error("[team-report] Schema inválido:", validation.issues);
      return successResponse({
        data: {
          report: { executive_summary: "Informe táctico no disponible — respuesta del modelo con estructura inválida." },
          promptVersion: PROMPT_VERSION,
          source: "fallback_schema_error",
        },
      });
    }

    return successResponse({
      data: {
        report: validation.report,
        promptVersion: PROMPT_VERSION,
        source: "claude_haiku",
      },
    });
  },
);
