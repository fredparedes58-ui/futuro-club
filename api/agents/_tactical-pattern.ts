/**
 * VITAS · Tactical Pattern Agent
 * POST /api/agents/tactical-pattern
 *
 * Interpreta los heatmaps de las 6 fases tácticas de un partido y genera
 * insights accionables para el cuerpo técnico. Reutiliza el patrón de
 * fallback de los agentes existentes:
 *
 *   1. ANTHROPIC_API_KEY set → Claude Sonnet → Zod-validated output
 *   2. API error / timeout → deterministic fallback
 *   3. Validation fails → deterministic fallback
 *
 * Model: Sonnet (necesita razonar sobre coordenadas + estilo + edad media).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import {
  TacticalPatternInputSchema,
  TacticalPatternOutputSchema,
} from "../../src/agents/contracts";
import {
  buildTacticalPatternPrompt,
  TACTICAL_PROMPT_VERSION,
} from "../../src/lib/tactical/tacticalPatternPrompt";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = "claude-3-5-sonnet-20241022";

function generateFallback(data: z.infer<typeof TacticalPatternInputSchema>): z.infer<typeof TacticalPatternOutputSchema> {
  const totalSec = Object.values(data.phaseDurations).reduce((a, b) => a + b, 0) || 1;
  const dominantPhase = Object.entries(data.phaseDurations).sort(
    (a, b) => b[1] - a[1],
  )[0]?.[0] ?? "build_up";

  const headline = `Partido dominado por fase "${dominantPhase}" con ${data.possessionPct}% de posesión.`;

  return {
    headline,
    summary: `Análisis automático de ${Math.round(totalSec / 60)} minutos. ${data.teamHotZonesByPhase.length} fases con zonas detectadas. Sin agente IA disponible — análisis heurístico básico.`,
    byPhase: data.teamHotZonesByPhase
      .filter((p) => p.zones.length > 0)
      .slice(0, 3)
      .map((p) => ({
        phase: p.phase,
        observation: `Concentración detectada en ${p.zones[0]?.label ?? "zona principal"} (share ${Math.round((p.zones[0]?.share ?? 0) * 100)}%).`,
        risk: (p.zones[0]?.share ?? 0) > 0.4 ? "moderate" : "low",
        suggestion: "Revisar dispersión en próximas sesiones de entrenamiento.",
      })),
    strengths: [
      `Posesión: ${data.possessionPct}%`,
      `Fase dominante: ${dominantPhase}`,
    ],
    weaknesses: data.coverageGaps?.length
      ? [`${data.coverageGaps.length} zonas con cobertura insuficiente`]
      : ["Sin gaps significativos detectados"],
    coachingTips: [
      "Revisar el heatmap por fases con el equipo",
      "Comparar con próximos partidos para detectar patrones",
      "Ajustar drills según las zonas con menor presencia",
    ],
  };
}

export default withHandler(
  { schema: TacticalPatternInputSchema, requireAuth: false, maxRequests: 30 },
  async ({ body }) => {
    const data = body as z.infer<typeof TacticalPatternInputSchema>;

    if (!ANTHROPIC_API_KEY) {
      return successResponse({
        insights: generateFallback(data),
        promptVersion: TACTICAL_PROMPT_VERSION,
        model: "deterministic-fallback",
        source: "no_api_key",
      });
    }

    try {
      const prompt = buildTacticalPatternPrompt(data);
      const response = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 2500,
          temperature: 0.4,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!response.ok) {
        const errText = await response.text().catch(() => "");
        console.error("[tactical-pattern] Anthropic error:", response.status, errText.slice(0, 200));
        return successResponse({
          insights: generateFallback(data),
          promptVersion: TACTICAL_PROMPT_VERSION,
          model: "deterministic-fallback",
          source: "fallback_api_error",
        });
      }

      const result = (await response.json()) as {
        content: Array<{ type: string; text: string }>;
        usage?: { input_tokens: number; output_tokens: number };
      };

      const text = result.content?.[0]?.text ?? "";
      let parsed: unknown;
      try {
        const m = text.match(/\{[\s\S]*\}/);
        parsed = m ? JSON.parse(m[0]) : null;
      } catch {
        parsed = null;
      }

      const validated = TacticalPatternOutputSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn("[tactical-pattern] Output validation failed:", validated.error.issues.slice(0, 3));
        return successResponse({
          insights: generateFallback(data),
          promptVersion: TACTICAL_PROMPT_VERSION,
          model: "deterministic-fallback",
          source: "fallback_validation_error",
          validationErrors: validated.error.issues.slice(0, 5),
        });
      }

      return successResponse({
        insights: validated.data,
        promptVersion: TACTICAL_PROMPT_VERSION,
        model: MODEL,
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        source: "agent",
      });
    } catch (err) {
      console.error("[tactical-pattern] Unhandled error:", err);
      return successResponse({
        insights: generateFallback(data),
        promptVersion: TACTICAL_PROMPT_VERSION,
        model: "deterministic-fallback",
        source: "fallback_exception",
      });
    }
  },
);
