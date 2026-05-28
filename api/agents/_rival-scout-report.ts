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
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";

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
}).passthrough();

const PROMPT_VERSION = "v1.0.0";

const SYSTEM_PROMPT = `Eres un analista de scouting de fútbol de VITAS Football Intelligence.
Tu trabajo es analizar al equipo rival y producir un informe de scouting accionable.

Escribe en español. Sé directo y táctico. Enfócate en:
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
  }
}`;

export default withHandler(
  { schema: inputSchema, requireAuth: false, maxRequests: 100 },
  async ({ body }) => {
    const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY;

    if (!ANTHROPIC_API_KEY) {
      return successResponse({
        data: {
          report: {
            rival_profile: "Análisis de scouting basado en datos de tracking.",
            threat_level: "medium",
            strengths: ["Organización defensiva"],
            weaknesses: ["Espacios entre líneas"],
            key_threats: [],
            attack_plan: {
              primary: "Explotar espacios entre líneas",
              secondary: "Ataques por bandas",
              set_pieces: "Centros al segundo palo",
            },
            defensive_plan: {
              marking: "Marcaje zonal",
              pressing_trigger: "Tras pase lateral del rival",
              transition_defense: "Repliegue rápido",
            },
            game_management: {
              first_half: "Control del juego",
              second_half: "Aprovechar fatiga rival",
              substitution_triggers: "Minuto 60-65",
            },
          },
          promptVersion: PROMPT_VERSION,
          source: "mock_fallback",
        },
      });
    }

    const userMessage = `Genera un informe de scouting del equipo rival:

Formación: ${body.rivalFormation ?? "No detectada"}
Métricas: ${JSON.stringify(body.rivalMetrics ?? {}, null, 2)}
Vulnerabilidades detectadas: ${JSON.stringify(body.vulnerabilities ?? [], null, 2)}
Jugadores clave: ${JSON.stringify(body.keyPlayers ?? [], null, 2)}
Patrones de build-up: ${JSON.stringify(body.buildUpPatterns ?? [], null, 2)}
Zonas descubiertas: ${JSON.stringify(body.gaps ?? [], null, 2)}
Pressing: ${JSON.stringify(body.pressing ?? {}, null, 2)}

Genera el informe de scouting completo.`;

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

    return successResponse({
      data: {
        report,
        promptVersion: PROMPT_VERSION,
        source: "claude_haiku",
      },
    });
  },
);
