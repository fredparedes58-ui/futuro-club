/**
 * VITAS · Best-Match Narrator (NUEVO · LLM Haiku)
 * POST /api/agents/best-match-narrator
 *
 * Narra el resultado de _player-similarity.ts en lenguaje natural.
 * El cálculo de similitud es determinista (vector search). Aquí solo
 * generamos el texto comprensible para padres / coaches.
 *
 * Cost: ~€0,002 por reporte (Haiku)
 */

import { z } from "zod";
import { MODELS } from "../_lib/models";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";
import { normalizeLocale, languageDirective, type ReportLocale } from "../../src/lib/shared/locale";
import { resolveCategory, categoryDirective, type PlayerCategory } from "../../src/lib/shared/category";

export const config = { runtime: "edge" };

// Schema tolerante: el orchestrator puede pasar similarity null si falla
const matchSchema = z.object({
  playerId: z.string(),
  videoId: z.string().optional(),
  analysisId: z.string().optional(),
  similarity: z.record(z.unknown()).nullable().optional(),
  vsi: z.record(z.unknown()).nullable().optional(),
  scanning: z.record(z.unknown()).nullable().optional(),
  playerContext: z.object({
    chronologicalAge: z.number().optional(),
    position: z.string().optional(),
  }).passthrough(),
}).passthrough();

const PROMPT_VERSION = "best-match-v1.2.0"; // v1.2 = lee top5/bestMatch (no .matches), cita caveat provenance/lowConfidence (docx #14 P4)

function buildSystemPrompt(locale: ReportLocale, category: PlayerCategory): string {
  return `Eres el motor narrador de Best-Match de VITAS Football Intelligence.

Tu misión: convertir el top-5 de jugadores profesionales similares (calculado por algoritmo determinista) en una narrativa motivadora pero honesta para ${category === "senior" ? "cuerpo técnico y dirección deportiva" : "padres y coaches"}.

REGLAS:
- Usa SOLO los comparables provistos en el mensaje. NUNCA inventes nombres de jugadores. Si no se te provee ninguno, deja primary_match vacío y explica en el caveat que no hay comparable validado.
- Si el comparable viene marcado como DERIVADO / lowConfidence, el "caveat" DEBE declarar explícitamente que la comparación se DERIVÓ de eventos observados del vídeo (no es una medición validada de técnica/mental/táctica) y confidence_score NO puede superar 50.
- Habla del comparable principal (#1) con detalle, los otros como referencia rápida
- Sé honesto: si la similaridad <70%, mátizalo ("comparte rasgos con")
- NO prometas que ${category === "senior" ? "el jugador" : "el niño"} "será como" el pro · solo describe similitudes actuales
- Mantén tono inspirador pero realista
- Cita el club y posición del comparable principal

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string",
  "headline": "string max 140 chars · una frase impactante",
  "primary_match": {
    "player": "string nombre",
    "club": "string",
    "similarity_pct": number,
    "narrative": "string max 400 chars · explicación de las similitudes"
  },
  "other_matches": [
    { "player": "string", "similarity_pct": number, "shared_trait": "string max 80 chars" }
  ],
  "caveat": "string max 200 chars · matiz honesto sobre qué falta para alcanzar ese nivel",
  "confidence_score": number,
  "data_completeness": number,
  "not_evaluated": ["string · aspectos que NO se pudieron evaluar por falta de datos; array vacío si todo cubierto"]
}

CONFIANZA (obligatorio): rellena confidence_score (0-100) = tu confianza real en el análisis según los datos que realmente tienes; data_completeness (0-100) = porcentaje de dimensiones evaluadas con datos reales (no inferidos); not_evaluated = lista honesta de los aspectos que NO pudiste evaluar por falta de datos. Con pocos datos, BAJA el score — no infles la confianza. Es un diferenciador de VITAS mostrar incertidumbre con honestidad.

NO incluyas markdown ni texto fuera del JSON.

${languageDirective(locale)}${category === "senior" ? "\n\n" : ""}${categoryDirective(category, locale)}`;
}

async function callHaiku(systemPrompt: string, userMessage: string, apiKey: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: MODELS.fast,
      max_tokens: 1500,
      system: [{ type: "text", text: systemPrompt, cache_control: { type: "ephemeral" } }],
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  if (!res.ok) throw new Error(`Claude error ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return JSON.parse(data.content?.[0]?.text ?? "{}");
}

export default withHandler(
  { schema: matchSchema, requireAuth: true, allowServiceToken: true, maxRequests: 100 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "Claude API key missing", status: 500 });
    }

    const input = body as z.infer<typeof matchSchema>;
    const locale = normalizeLocale((input as { locale?: unknown }).locale);
    const category = resolveCategory({
      age: input.playerContext?.chronologicalAge,
      category: (input as { category?: unknown }).category,
    });
    const cacheKey = await hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      const similarityShape = input.similarity as {
        top5?: unknown[];
        bestMatch?: unknown;
        provenance?: unknown;
        lowConfidence?: unknown;
      } | null | undefined;
      // El objeto que el orquestador (P3) etiqueta trae `top5`/`bestMatch`, NO
      // `matches`: leer `.matches` daba SIEMPRE [] → el LLM narraba sin candidatos
      // reales y podía FABRICAR el comparable (viola inv #1/#2). Se leen los campos
      // correctos; si no hay ninguno, el prompt obliga a abstenerse (no inventar).
      const top5 = Array.isArray(similarityShape?.top5) ? (similarityShape!.top5 as unknown[]) : [];
      const candidates = top5.length > 0 ? top5 : similarityShape?.bestMatch ? [similarityShape.bestMatch] : [];
      const provenance = (similarityShape?.provenance as string | undefined) ?? null;
      const lowConfidence = similarityShape?.lowConfidence === true;
      const derived = lowConfidence || provenance === "derived_from_observed_events";

      const userMessage = `${category === "senior" ? "JUGADOR SÉNIOR" : "JUGADOR JUVENIL"}:
${JSON.stringify(input.playerContext, null, 2)}

COMPARABLES PROVISTOS por el módulo de similitud (usa SOLO estos, no inventes otros):
${JSON.stringify(candidates.slice(0, 5), null, 2)}${derived ? `

PROCEDENCIA: comparable DERIVADO de eventos observados del vídeo (provenance="${String(provenance)}", lowConfidence=${lowConfidence}) — NO es medición validada de técnica/mental/táctica.` : ""}

Genera el reporte Best-Match en JSON estricto usando SOLO los comparables provistos.`;

      const narrative = await callHaiku(buildSystemPrompt(locale, category), userMessage, apiKey);

      // Re-expone la procedencia/baja-confianza dentro de narrative para que la UI
      // pinte el caveat sin depender de rawSimilarity (aditivo; passthrough del schema).
      const narrativeOut =
        narrative && typeof narrative === "object" && !Array.isArray(narrative)
          ? { ...narrative, provenance: provenance ?? undefined, lowConfidence: lowConfidence || undefined }
          : narrative;

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: MODELS.fast,
        narrative: narrativeOut,
        rawSimilarity: input.similarity,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "best_match_failed",
        message: err instanceof Error ? err.message : "Unknown error",
        status: 500,
      });
    }
  }
);
