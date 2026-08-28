/**
 * VITAS · Rival Scout Report Agent (Sprint 8)
 *
 * Generates an AI-powered scouting report for the opposing team.
 * Identifies vulnerabilities, key threats, and tactical recommendations.
 *
 * Input: rival analysis data from tracking
 * Output: { report: RivalScoutContent, promptVersion: string }
 */

import { z } from "zod";
import { MODELS } from "../_lib/models";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { rivalScoutOutputSchema, validateLLMReport } from "./_outputSchemas";
import {
  normalizeLocale,
  languageDirective,
  phvDistributionLine,
  phvConsideration,
  type ReportLocale,
} from "../../src/lib/shared/locale";
import {
  resolveCategory,
  categoryDirective,
  phvApplies,
  type PlayerCategory,
} from "../../src/lib/shared/category";

export const config = { runtime: "edge" };

const inputSchema = z.object({
  analysisId: z.string().optional(),
  rivalFormation: z.string().optional(),
  rivalMetrics: z.record(z.unknown()).optional(),
  vulnerabilities: z.array(z.record(z.unknown())).optional(),
  keyPlayers: z.array(z.record(z.unknown())).optional(),
  buildUpPatterns: z.array(z.record(z.unknown())).optional(),
  gaps: z.array(z.record(z.unknown())).optional(),
  pressing: z.record(z.unknown()).optional(),
  playerContext: z.record(z.unknown()).optional(),
  // FASE 5 · maduración biológica del rival (diferenciador VITAS) e idioma
  phvDistribution: z
    .object({ prePhv: z.number().optional(), circaPhv: z.number().optional(), postPhv: z.number().optional() })
    .optional(),
  locale: z.enum(["es", "en"]).optional(),
}).passthrough();

const PROMPT_VERSION = "v1.1.0"; // v1.1 = gate de hueco + observado/inferido + fallback honesto (docx #14 P4)

function buildSystemPrompt(locale: ReportLocale, category: PlayerCategory): string {
  return `Eres un analista de scouting de fútbol de VITAS Football Intelligence.
Tu trabajo es analizar al equipo rival y producir un informe de scouting accionable.

Sé directo y táctico. Enfócate en:
1. Cómo juega el rival (fortalezas y debilidades)
2. Jugadores clave a vigilar
3. Cómo atacarlos (vulnerabilidades específicas)
4. Cómo defenderse de sus amenazas

Responde como JSON:
{
  "rival_profile": "Descripción general del estilo del rival",
  "threat_level": "low|medium|high",
  "strengths": ["fortaleza 1", "fortaleza 2"],
  "weaknesses": ["debilidad 1", "debilidad 2"],
  "key_threats": [{ "player": "Jugador o zona", "threat": "descripción" }],
  "attack_plan": {
    "primary": "Plan de ataque principal",
    "secondary": "Plan alternativo",
    "set_pieces": "Recomendación para jugadas a balón parado"
  },
  "defensive_plan": {
    "marking": "Marcajes especiales recomendados",
    "pressing_trigger": "Cuándo presionar",
    "transition_defense": "Cómo defender transiciones"
  },
  "game_management": {
    "first_half": "Plan para primer tiempo",
    "second_half": "Ajustes para segundo tiempo",
    "substitution_triggers": "Cuándo considerar cambios"
  },
  "confidence_score": "number 0-100 · confianza real en este análisis según los datos disponibles",
  "data_completeness": "number 0-100 · % de dimensiones evaluadas con datos reales, no inferidos",
  "not_evaluated": ["string · aspectos que no se pudieron evaluar por falta de datos"]
}

EVIDENCIA Y PROCEDENCIA (docx #14):
- strengths, weaknesses, key_threats, attack_plan y defensive_plan derivan ÚNICAMENTE de los datos aportados (formación, métricas, vulnerabilidades, jugadores clave, build-up, zonas descubiertas, pressing). Si una dimensión llega vacía ([] o {}), su campo de salida correspondiente va vacío ([] o "sin datos suficientes") y el aspecto entra en not_evaluated. NUNCA rellenes con tácticas genéricas ni jugadores/zonas inventados.
- En cada ítem distingue lo OBSERVADO en el tracking de la INFERENCIA táctica; marca los inferidos con el sufijo "(inferencia)". No presentes inferencia como observación.
- threat_level = "low" y confidence_score bajo cuando la mayor parte del análisis es inferido por falta de datos.

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

${languageDirective(locale)}${category === "senior" ? `\n\n${categoryDirective(category, locale)}` : ""}`;
}

export default withHandler(
  { schema: inputSchema, requireAuth: true, allowServiceToken: true, maxRequests: 100 },
  async ({ body }) => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      // Fallback honesto: sin modelo NO se fabrican tácticas/amenazas (docx #14 P4,
      // inv #2/#3). Se abstiene con campos vacíos y confianza 0; la UI lo señala por
      // `source`. Antes hardcodeaba un plan de ataque/defensa inventado.
      return successResponse({
        data: {
          report: {
            rival_profile: "Informe de rival no disponible: falta el motor de análisis (sin datos suficientes).",
            threat_level: "low",
            strengths: [],
            weaknesses: [],
            key_threats: [],
            attack_plan: {},
            defensive_plan: {},
            game_management: {},
            confidence_score: 0,
            data_completeness: 0,
            not_evaluated: ["Análisis completo: no disponible sin el motor de scouting"],
          },
          promptVersion: PROMPT_VERSION,
          source: "mock_fallback",
        },
      });
    }

    const locale = normalizeLocale(body.locale);
    // Sin fuente de edad en el input (análisis de equipo rival) → solo override explícito.
    const category = resolveCategory({ category: (body as { category?: unknown }).category });
    const phvLine = phvDistributionLine(body.phvDistribution, locale);
    const phvNote = phvConsideration(body.phvDistribution, locale);

    const userMessage = `Genera un informe de scouting del equipo rival:

Formación: ${body.rivalFormation ?? "No detectada"}
Métricas: ${JSON.stringify(body.rivalMetrics ?? {}, null, 2)}
Vulnerabilidades detectadas: ${JSON.stringify(body.vulnerabilities ?? [], null, 2)}
Jugadores clave: ${JSON.stringify(body.keyPlayers ?? [], null, 2)}
Patrones de build-up: ${JSON.stringify(body.buildUpPatterns ?? [], null, 2)}
Zonas descubiertas: ${JSON.stringify(body.gaps ?? [], null, 2)}
Pressing: ${JSON.stringify(body.pressing ?? {}, null, 2)}
${phvLine && phvApplies(category) ? `\n${phvLine}\n${phvNote}\n` : ""}
Genera el informe SOLO con lo que estos datos soporten; deja vacío ([] / "sin datos suficientes") lo que no puedas evaluar y no inventes.`;

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
          report: { rival_profile: "Error generando informe de scouting." },
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
      report = { rival_profile: text };
    }

    // FASE 2: validar estructura antes de devolver (ver _outputSchemas.ts)
    const validation = validateLLMReport(rivalScoutOutputSchema, report);
    if (!validation.ok) {
      console.error("[rival-scout-report] Schema inválido:", validation.issues);
      return successResponse({
        data: {
          report: { rival_profile: "Informe de scouting no disponible — respuesta del modelo con estructura inválida." },
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
