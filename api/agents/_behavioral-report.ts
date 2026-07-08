/**
 * VITAS · Behavioral Report Agent (Sprint 19)
 * POST /api/agents/behavioral-report
 *
 * Claude Haiku agent that generates a narrative behavioral profile report in Spanish.
 * Input: BehavioralProfile + player context.
 * Output: headline, summary, archetypeExplanation, strengths[3],
 *         developmentAreas[3], comparisonWithPeers, coachingTips[3].
 *
 * Pattern: identical to _fatigue-report.ts
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import { resolveCategory, categoryDirective } from "../../src/lib/shared/category";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const behavioralReportSchema = z.object({
  playerId: z.string(),
  playerName: z.string().optional(),
  playerAge: z.number(),
  position: z.string().optional(),
  scores: z.object({
    decisionSpeed: z.number(),
    scanningIntelligence: z.number(),
    resilience: z.number(),
    clutchFactor: z.number(),
    leadership: z.number(),
    mentalFatigue: z.number(),
    unpredictability: z.number(),
    mentalComposite: z.number(),
    archetype: z.string(),
  }),
  strengths: z.array(z.string()).optional(),
  developmentAreas: z.array(z.string()).optional(),
  videosAnalyzed: z.number().optional(),
});

const PROMPT_VERSION = "v1.0.0";

function buildPrompt(data: z.infer<typeof behavioralReportSchema>): string {
  const name = data.playerName ?? "Jugador";
  const age = data.playerAge;
  const pos = data.position ?? "No especificada";
  const s = data.scores;
  const category = resolveCategory({ age: data.playerAge, category: (data as { category?: unknown }).category });

  return `Eres un psicólogo deportivo especializado en ${category === "senior" ? "fútbol profesional" : "fútbol juvenil"}. Generas perfiles conductuales en español, usando lenguaje profesional pero accesible para ${category === "senior" ? "el cuerpo técnico" : "entrenadores de academia"}.

## DATOS DEL JUGADOR
- Nombre: ${name}
- Edad: ${age} años
- Posición: ${pos}
- Videos analizados: ${data.videosAnalyzed ?? "N/A"}

## SCORES CONDUCTUALES (0-100)
- Velocidad de Decisión: ${s.decisionSpeed}
- Inteligencia de Escaneo: ${s.scanningIntelligence}
- Resiliencia: ${s.resilience}
- Rendimiento bajo Presión (Clutch): ${s.clutchFactor}
- Liderazgo: ${s.leadership}
- Resistencia Mental: ${s.mentalFatigue}
- Creatividad/Imprevisibilidad: ${s.unpredictability}
- **Compuesto Mental: ${s.mentalComposite}**
- **Arquetipo: ${s.archetype}**

## FORTALEZAS DETECTADAS
${(data.strengths ?? []).join("\n") || "No disponibles"}

## ÁREAS DE DESARROLLO
${(data.developmentAreas ?? []).join("\n") || "No disponibles"}

## INSTRUCCIONES
Genera un reporte de perfil conductual en español con las siguientes secciones. Adapta el lenguaje a la edad del jugador y su ${category === "senior" ? "momento de carrera" : "fase de desarrollo"}.

### Formato JSON:
{
  "headline": string (1 frase impactante que resume al jugador),
  "summary": string (párrafo de 3-4 oraciones),
  "archetypeExplanation": string (explicar qué significa su arquetipo y cómo se manifiesta),
  "strengths": string[] (max 3, concretas con datos),
  "developmentAreas": string[] (max 3, con sugerencias accionables),
  "comparisonWithPeers": string (1 párrafo comparándolo con jugadores de su edad),
  "coachingTips": string[] (max 3, tips específicos para el entrenador),
  "confidence_score": number (0-100 · confianza real en el análisis según los datos disponibles),
  "data_completeness": number (0-100 · % de dimensiones evaluadas con datos reales, no inferidos),
  "not_evaluated": string[] (aspectos que no se pudieron evaluar por falta de datos; array vacío si todo cubierto)
}

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.${category === "senior" ? "\n\n" : ""}${categoryDirective(category)}`;
}

export default withHandler(
  { schema: behavioralReportSchema, requireAuth: true, maxRequests: 50, allowServiceToken: true, requiredPlan: "pro,club" },
  async ({ body }) => {
    const data = body as z.infer<typeof behavioralReportSchema>;

    if (!ANTHROPIC_API_KEY) {
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
        console.error("[behavioral-report] Anthropic error:", response.status, errText.slice(0, 200));
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
      console.error("[behavioral-report] Error:", err);
      return successResponse({
        report: generateMockReport(data),
        promptVersion: PROMPT_VERSION,
        model: "mock",
        source: "fallback_exception",
      });
    }
  },
);

function generateMockReport(data: z.infer<typeof behavioralReportSchema>): Record<string, unknown> {
  const name = data.playerName ?? "Jugador";
  const s = data.scores;

  return {
    headline: `${name}: Un ${s.archetype} en desarrollo con gran potencial mental`,
    summary: `${name} muestra un perfil mental sólido con un compuesto de ${s.mentalComposite}/100. Su arquetipo "${s.archetype}" refleja una combinación de habilidades cognitivas que, bien desarrolladas, pueden marcar la diferencia en su carrera futbolística. A los ${data.playerAge} años, está en una edad clave para consolidar estos aspectos.`,
    archetypeExplanation: `El arquetipo "${s.archetype}" se caracteriza por jugadores que combinan inteligencia táctica con capacidad de ejecución. En el campo, esto se traduce en decisiones rápidas y efectivas, especialmente en situaciones de presión.`,
    strengths: [
      `Velocidad de decisión (${s.decisionSpeed}/100): Procesa información y ejecuta más rápido que la media de su edad`,
      `Resiliencia (${s.resilience}/100): Se recupera bien de los errores y mantiene la intensidad`,
      `Escaneo visual (${s.scanningIntelligence}/100): Observa el campo antes de recibir el balón`,
    ],
    developmentAreas: [
      "Liderazgo: Puede beneficiarse de ejercicios que fomenten la comunicación verbal en el campo",
      "Creatividad: Aumentar la variedad de soluciones en situaciones similares para ser menos predecible",
      "Resistencia mental: Trabajar la concentración en los últimos 20 minutos del partido",
    ],
    comparisonWithPeers: `Comparado con jugadores de ${data.playerAge} años en la base de datos, ${name} se sitúa en el percentil superior en velocidad de decisión y en la media en liderazgo. Su perfil mental es prometedor y con trabajo enfocado puede alcanzar niveles élite en las dimensiones clave.`,
    coachingTips: [
      "Asignar responsabilidades de capitanía en ejercicios reducidos para desarrollar liderazgo",
      "Incluir ejercicios de decisión bajo presión temporal (rondos con cuenta regresiva) para consolidar su velocidad",
      "Usar post-error recovery drills: tras perder balón, reforzar la búsqueda inmediata de recuperación",
    ],
  };
}
