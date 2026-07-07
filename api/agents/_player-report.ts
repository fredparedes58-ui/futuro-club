/**
 * VITAS · Player Report (REFACTOR de _scout-insight · LLM Sonnet)
 * POST /api/agents/player-report
 *
 * Reporte ancla comercial. Resumen ejecutivo del jugador para padres y coaches.
 *
 * Combina:
 *   - VSI Score + tier
 *   - PHV (edad biológica vs cronológica)
 *   - Métricas biomecánicas más relevantes
 *   - Top fortalezas y áreas de mejora
 *
 * Cost: ~€0,045 (Sonnet con prompt caching)
 *
 * Reemplaza _scout-insight.ts (que era el embrión de este reporte).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";
import { MODELS } from "../_lib/models";
import { normalizeLocale, languageDirective, type ReportLocale } from "../../src/lib/shared/locale";

export const config = { runtime: "edge" };

// Schema flexible · acepta lo que el orchestrator manda (incluye partial/null)
const playerReportSchema = z.object({
  playerId: z.string(),
  videoId: z.string().optional(),
  analysisId: z.string().optional(),
  vsi: z.record(z.unknown()).nullable().optional(),
  phv: z.record(z.unknown()).nullable().optional(),
  biomechanics: z.record(z.unknown()).nullable().optional(),
  similarity: z.record(z.unknown()).nullable().optional(),
  scanning: z.record(z.unknown()).nullable().optional(),
  playerContext: z.object({
    chronologicalAge: z.number().optional(),
    position: z.string().optional(),
    name: z.string().optional(),
  }).passthrough(),
}).passthrough();

const PROMPT_VERSION = "player-report-v2.1.0"; // v2.1 = schema tolerante + scanning

function buildSystemPrompt(locale: ReportLocale): string {
  return `Eres el motor del Player Report de VITAS Football Intelligence.

Tu misión: producir el reporte ancla del producto. Es el primer reporte que ven padres y coaches. Debe ser comprensible, motivador, honesto y accionable.

DESTINATARIO PRIMARIO: padre/madre del jugador. Secundario: coach.

ESTILO:
- Lenguaje claro, sin jerga excesiva (adaptado a familia)
- Cita siempre el VSI Score y el tier explícitamente
- Si hay PHV, explícalo en una frase ("tu hijo está pre-estirón / en estirón / post-estirón")
- 2-3 fortalezas concretas con dato
- 2-3 áreas de mejora claras (sin endulzar)
- Una recomendación concreta para próximas 4 semanas
- Tono: profesional pero cercano, NUNCA alarmista
- TODO informe DEBE referenciar el video fuente: incluye la fecha del análisis y la posición jugada en ese video. Sin video no hay informe.

POLIVALENCIA · si videoContext.playedPosition existe:
- El executive_summary debe mencionar explícitamente la posición jugada: "Análisis del video del DD/MM jugando de [posición]"
- Las fortalezas y áreas de mejora se evalúan EN EL CONTEXTO de esa posición específica
- Si player.secondaryPositions[] existe, el next_4_weeks_focus puede sugerir afianzar polivalencia

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string · ej. 'Análisis VITAS · [Nombre Jugador]'",
  "vsi_score": number,
  "tier": "elite|pro|talent|develop",
  "tier_label": "string",
  "executive_summary": "string max 280 chars · resumen 1 párrafo para padres",
  "phv_summary": "string max 200 chars · explicación PHV simple",
  "strengths": [
    { "title": "string", "evidence": "string max 120 chars con número o métrica" }
  ],
  "areas_to_improve": [
    { "title": "string", "evidence": "string max 120 chars", "priority": "high|medium|low" }
  ],
  "comparable_pro": "string max 80 chars · solo si similarity disponible",
  "next_4_weeks_focus": "string max 220 chars · qué priorizar",
  "honesty_note": "string max 180 chars · matiz realista sobre la edad y desarrollo",
  "confidence_score": number,
  "data_completeness": number,
  "not_evaluated": ["string · aspectos que NO se pudieron evaluar por falta de datos; array vacío si todo cubierto"]
}

REGLAS ABSOLUTAS DE DATOS:
1. Si no tienes un dato concreto, di "No disponible" o "Sin datos suficientes". NUNCA inventes valores.
2. NUNCA uses "aproximadamente", "más o menos", "alrededor de", "cercano a" para fabricar datos.
3. NUNCA compares con jugadores famosos ("el próximo Messi", "recuerda a Iniesta").
4. Si faltan >30% de las dimensiones de evaluación, penaliza el score explícitamente y menciona: "Evaluación parcial — datos insuficientes en: [dimensiones faltantes]".
5. Separa siempre observación directa (visto en video) de inferencia (estimado por modelo).
6. NUNCA menciones decisiones contractuales, económicas o de transferencias — no es nuestro dominio.
7. Banderas rojas (lesiones recurrentes, edad fuera de target, datos contradictorios) → mencionarlas SIEMPRE.
8. CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

SCORING RUBRIC (desglose obligatorio):
- Técnica (35%): pases, control, regate, tiro — basado en video features observados
- Físico (20%): velocidad, resistencia, duelos — basado en tracking data
- Proyección + PHV (25%): margen de mejora por edad madurativa (PHV Mirwald), tendencia de evolución
- Fit contextual (20%): encaje con posición, estilo de juego, necesidades del equipo

El score final DEBE ser la suma ponderada de estos 4 componentes.
Incluir desglose visible: "Técnica: 72 | Físico: 65 | Proyección+PHV: 85 | Fit: 70 → VSI: 74"

NO incluyas markdown ni texto fuera del JSON.

${languageDirective(locale)}`;
}

async function callSonnet(systemPrompt: string, userMessage: string, apiKey: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.reasoning,
      max_tokens: 2500,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.content?.[0]?.text ?? "{}");
}

export default withHandler(
  { schema: playerReportSchema, requireAuth: true, allowServiceToken: true, maxRequests: 50 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "missing", status: 500 });
    }

    const input = body as z.infer<typeof playerReportSchema>;
    const locale = normalizeLocale(input.locale);
    const cacheKey = await hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      const userMessage = `DATOS DEL JUGADOR:
${JSON.stringify(input.playerContext, null, 2)}

VSI:
${JSON.stringify(input.vsi, null, 2)}

PHV (maduración biológica):
${JSON.stringify(input.phv ?? "no_data", null, 2)}

BIOMECÁNICA:
${JSON.stringify(input.biomechanics ?? "no_data", null, 2)}

COMPARABLES PRO (top-1 si existe):
${JSON.stringify(input.similarity?.matches?.[0] ?? "no_data", null, 2)}

Genera el Player Report en JSON estricto.`;

      const report = await callSonnet(buildSystemPrompt(locale), userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: MODELS.reasoning,
        report,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "player_report_failed",
        message: err instanceof Error ? err.message : "Unknown",
        status: 500,
      });
    }
  }
);
