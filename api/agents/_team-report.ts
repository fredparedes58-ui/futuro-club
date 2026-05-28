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
}).passthrough();

const PROMPT_VERSION = "v1.0.0";

const SYSTEM_PROMPT = `Eres un analista táctico de fútbol profesional de VITAS Football Intelligence.
Genera un informe táctico de equipo en español, breve y accionable.

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
  "overall_rating": { "home": 7.5, "away": 6.8 }
}`;

export default withHandler(
  { schema: inputSchema, requireAuth: false, maxRequests: 100 },
  async ({ body }) => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      // Fallback: return mock report
      return successResponse({
        data: {
          report: {
            executive_summary: "Análisis táctico generado con datos de tracking. Sin API key, se retorna estructura base.",
            tactical_overview: {
              home: { style: "Posesión progresiva", strengths: ["Control del balón"], weaknesses: ["Falta de profundidad"] },
              away: { style: "Transiciones rápidas", strengths: ["Velocidad en contra"], weaknesses: ["Desorden defensivo"] },
            },
            key_battles: ["Mediocampo central", "Bandas"],
            momentum_shifts: [],
            recommendations: {
              home: ["Ampliar juego por bandas"],
              away: ["Compactar líneas defensivas"],
            },
            overall_rating: { home: 7.0, away: 6.5 },
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

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-3-5-haiku-20241022",
        max_tokens: 1024,
        temperature: 0.3,
        system: SYSTEM_PROMPT,
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

    return successResponse({
      data: {
        report,
        promptVersion: PROMPT_VERSION,
        source: "claude_haiku",
      },
    });
  },
);
