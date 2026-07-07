/**
 * VITAS · Coaching Assistant Agent (Sprint 15)
 * POST /api/agents/coaching-assistant
 *
 * Claude Haiku agent that generates a narrative coaching report in Spanish.
 * Input: SessionAnalysis + last 8 sessions + PHV distribution.
 * Output: sessionSummary, whatWorkedWell[3], whatToImprove[3],
 *         nextSessionPlan, playerSpotlight[3], weeklyPlan, phvAlerts.
 *
 * Pattern: identical to _fatigue-report.ts
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { coachingAssistantOutputSchema, validateLLMReport } from "./_outputSchemas";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";

const coachingAssistantSchema = z.object({
  teamId: z.string(),
  teamName: z.string().optional(),
  sessionAnalysis: z.record(z.unknown()),
  recentSessions: z.array(z.record(z.unknown())).optional(),
  recommendation: z.record(z.unknown()).optional(),
  phvDistribution: z.object({
    prePhv: z.number().optional(),
    circaPhv: z.number().optional(),
    postPhv: z.number().optional(),
  }).optional(),
  teamAvgAge: z.number().optional(),
  playerHighlights: z.array(z.record(z.unknown())).optional(),
  engagementSnapshots: z.array(z.record(z.unknown())).optional(),
});

const PROMPT_VERSION = "v1.0.0";

function buildPrompt(data: z.infer<typeof coachingAssistantSchema>, ragContext = ""): string {
  const teamName = data.teamName ?? "Equipo";
  const avgAge = data.teamAvgAge ?? 13;
  const phv = data.phvDistribution;
  const analysis = data.sessionAnalysis;
  const highlights = data.playerHighlights ?? [];
  const recommendation = data.recommendation ?? {};

  return `Eres un asistente de coaching para fútbol juvenil. Generas reportes de sesión de entrenamiento en español, usando lenguaje profesional pero accesible para entrenadores de academia.

## CONTEXTO DEL EQUIPO
- Nombre: ${teamName}
- Edad promedio: ${avgAge} años
- Distribución PHV: ${phv ? `pre-PHV: ${phv.prePhv ?? 0}%, circa-PHV: ${phv.circaPhv ?? 0}%, post-PHV: ${phv.postPhv ?? 0}%` : "No disponible"}

## ANÁLISIS DE LA SESIÓN
${JSON.stringify(analysis, null, 2)}

## JUGADORES DESTACADOS
${highlights.length > 0 ? JSON.stringify(highlights, null, 2) : "Sin highlights disponibles"}

## RECOMENDACIONES DEL SISTEMA
${JSON.stringify(recommendation, null, 2)}

## HISTORIAL DE ÚLTIMAS SESIONES
${data.recentSessions ? JSON.stringify(data.recentSessions.slice(-4), null, 2) : "Sin historial"}
${ragContext ? `\n## BASE DE CONOCIMIENTO (metodología LTAD / drills)\n${ragContext}\n` : ""}
## INSTRUCCIONES
Genera un reporte de coaching en español con las siguientes secciones. Sé concreto, usa datos cuando los tengas, y adapta las recomendaciones a la edad del equipo y su fase LTAD. Cuando apliques metodología o drills de la BASE DE CONOCIMIENTO, cita la fuente (atributo source del contexto).

### 1. Resumen de la Sesión
Párrafo de 2-3 oraciones resumiendo lo que funcionó y el balance general.

### 2. Lo Que Funcionó Bien (máx 3 puntos)
Aspectos positivos concretos de la sesión.

### 3. Lo Que Mejorar (máx 3 puntos)
Áreas de mejora con sugerencias accionables.

### 4. Plan Próxima Sesión
Enfoque sugerido para la siguiente sesión, con 2-3 ejercicios concretos.

### 5. Spotlight de Jugadores (máx 3)
Jugadores que merecen atención especial (positiva o de seguimiento).

### 6. Plan Semanal
Resumen del plan semanal recomendado.

### 7. Alertas PHV
Si hay jugadores en periodo de crecimiento, alertas específicas.

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

Formato JSON:
{
  "sessionSummary": string,
  "whatWorkedWell": string[] (max 3),
  "whatToImprove": string[] (max 3),
  "nextSessionPlan": { "focus": string, "drills": string[], "duration": string },
  "playerSpotlight": [{ "playerId": string, "reason": string, "action": string }] (max 3),
  "weeklyPlan": string,
  "phvAlerts": string[] | null,
  "confidence_score": number (0-100 · confianza real en el análisis según los datos disponibles),
  "data_completeness": number (0-100 · % de dimensiones evaluadas con datos reales, no inferidos),
  "not_evaluated": string[] (aspectos que NO se pudieron evaluar por falta de datos; array vacío si todo cubierto)
}`;
}

export default withHandler(
  { schema: coachingAssistantSchema, requireAuth: true, maxRequests: 50, allowServiceToken: true, requiredPlan: "pro,club" },
  async ({ body, req }) => {
    const data = body as z.infer<typeof coachingAssistantSchema>;

    if (!ANTHROPIC_API_KEY) {
      return successResponse({
        report: generateMockReport(data),
        promptVersion: PROMPT_VERSION,
        model: "mock",
        source: "fallback",
      });
    }

    // ── RAG: metodología LTAD + drills (no bloqueante · cae a vacío si falla) ──
    let ragContext = "";
    try {
      const authHeader = req.headers.get("Authorization") ?? "";
      const baseUrl = new URL(req.url).origin;
      const weak = (data.recommendation as { weakestDimension?: string } | undefined)?.weakestDimension ?? "";
      const ragQuery = `entrenamiento fútbol juvenil ${data.teamAvgAge ?? 13} años metodología LTAD ${weak} drills sesión`;
      const ragRes = await fetch(`${baseUrl}/api/rag/query`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: authHeader },
        body: JSON.stringify({ query: ragQuery, limit: 5 }),
      });
      if (ragRes.ok) {
        const rd = (await ragRes.json()) as { data?: { context?: string }; context?: string };
        ragContext = rd.data?.context ?? rd.context ?? "";
      }
    } catch {
      /* RAG no bloqueante */
    }

    try {
      const prompt = buildPrompt(data, ragContext);

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
        console.error("[coaching-assistant] Anthropic error:", response.status, errText.slice(0, 200));
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

      // FASE 2: validar estructura — un {raw: "..."} o shape basura cae al
      // mock MARCADO (el orchestrator propaga el flag y la UI avisa).
      const validation = validateLLMReport(coachingAssistantOutputSchema, report);
      if (!validation.ok) {
        console.error("[coaching-assistant] Schema inválido:", validation.issues);
        return successResponse({
          report: generateMockReport(data),
          promptVersion: PROMPT_VERSION,
          model: "mock",
          source: "fallback_schema_error",
        });
      }

      return successResponse({
        report: validation.report,
        promptVersion: PROMPT_VERSION,
        model: "claude-3-5-haiku-20241022",
        ragEnriched: !!ragContext,
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
      });
    } catch (err) {
      console.error("[coaching-assistant] Error:", err);
      return successResponse({
        report: generateMockReport(data),
        promptVersion: PROMPT_VERSION,
        model: "mock",
        source: "fallback_exception",
      });
    }
  },
);

function generateMockReport(data: z.infer<typeof coachingAssistantSchema>): Record<string, unknown> {
  const avgAge = data.teamAvgAge ?? 13;
  const phv = data.phvDistribution;

  return {
    sessionSummary: `Sesión de entrenamiento equilibrada para equipo sub-${Math.round(avgAge + 1)}. El balance entre trabajo técnico y táctico fue adecuado para la fase LTAD del grupo. La intensidad se mantuvo dentro de los parámetros recomendados.`,
    whatWorkedWell: [
      "El trabajo técnico de rondos mostró buena circulación y velocidad de decisión",
      "La participación general fue alta con buena implicación del grupo",
      "Los ejercicios tácticos reflejaron comprensión de los conceptos trabajados",
    ],
    whatToImprove: [
      "Aumentar el tiempo dedicado a juego real para consolidar conceptos tácticos",
      "Incluir más variantes de pressing en los ejercicios colectivos",
      "Monitorizar los jugadores con menor participación para asegurar inclusión",
    ],
    nextSessionPlan: {
      focus: "Consolidar trabajo táctico con más tiempo de juego aplicado",
      drills: ["Rondo 4v2 con transición", "Juego posicional 5v5+2", "Partido condicionado"],
      duration: `${avgAge >= 15 ? 90 : 75} minutos`,
    },
    playerSpotlight: [
      { playerId: "spotlight_1", reason: "Alta participación e intensidad", action: "Reconocer esfuerzo" },
      { playerId: "spotlight_2", reason: "Baja integración social", action: "Incluir en ejercicios de grupo reducido" },
    ],
    weeklyPlan: `Semana enfocada en trabajo técnico-táctico (${avgAge < 15 ? "70/30 técnica/táctica" : "40/30/30 técnico-táctico/competitivo/físico"}) con progresión de intensidad hacia el fin de semana.`,
    phvAlerts: phv && (phv.circaPhv ?? 0) > 20
      ? [`${phv.circaPhv}% del equipo en periodo PHV — reducir ejercicios de impacto`, "Monitorear dolor articular post-sesión"]
      : null,
  };
}
