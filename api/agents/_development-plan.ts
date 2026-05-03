/**
 * VITAS · Development Plan (NUEVO · LLM Haiku + RAG drills)
 * POST /api/agents/development-plan
 *
 * Genera el Plan de Desarrollo de 12 semanas.
 *
 * Flow:
 *   1. Recibe debilidades detectadas (de subscores VSI bajos)
 *   2. Hace RAG sobre la knowledge_base buscando drills relacionados
 *   3. Claude Haiku redacta el plan estructurado en 12 semanas
 *
 * Cost: ~€0,003 por reporte (Haiku + 1 RAG query)
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { hashInput, getCached, setCached } from "../_lib/agentCache";

export const config = { runtime: "edge" };

// Schema tolerante con scanning (Sprint 4)
const planSchema = z.object({
  playerId: z.string(),
  videoId: z.string().optional(),
  analysisId: z.string().optional(),
  vsi: z.record(z.unknown()).nullable().optional(),
  phv: z.record(z.unknown()).nullable().optional(),
  biomechanics: z.record(z.unknown()).nullable().optional(),
  scanning: z.record(z.unknown()).nullable().optional(),
  similarity: z.record(z.unknown()).nullable().optional(),
  playerContext: z.object({
    chronologicalAge: z.number().optional(),
    position: z.string().optional(),
  }).passthrough(),
}).passthrough();

const PROMPT_VERSION = "dev-plan-v1.1.0"; // v1.1 = schema tolerante + scanning

const PLAN_SYSTEM_PROMPT = `Eres el motor de generación de Planes de Desarrollo de VITAS.

Tu misión: producir un plan estructurado de 12 semanas para un jugador juvenil de fútbol, priorizando sus debilidades detectadas y respetando su ventana de desarrollo PHV.

REGLAS:
- Si phvStatus es "during_phv" (estirón): NO programes cargas pesadas. Foco técnico-coordinativo.
- Si offset PHV es "early" (estirón en curso): reduce trabajo de fuerza absoluta.
- Si VSI subscore "technique" <60: priorizar drills técnicos.
- Si VSI subscore "physical" <60 y phvStatus="post_phv": fuerza progresiva.
- Si VSI subscore "tactical" <60: situaciones de juego reducidas.
- Si scanning.scan_rate < p25 de su edad: AÑADIR drill "shoulder check pre-recepción"
  (girar cabeza 2-3 veces antes de recibir el balón) en el primer bloque.
- Si scanning.bilateralityPct < 30: AÑADIR drill de pase ciego al lado débil.
- Estructura el plan en 4 bloques de 3 semanas cada uno.
- Usa los drills sugeridos del RAG context si encajan; no inventes drills nuevos.

ESTRUCTURA OBLIGATORIA (JSON):
{
  "title": "string",
  "duration_weeks": 12,
  "primary_focus": "technique|physical|tactical|mixed",
  "phv_consideration": "string max 200 chars",
  "blocks": [
    {
      "block_number": 1,
      "weeks": "1-3",
      "theme": "string",
      "objectives": ["string"],
      "weekly_sessions": 3,
      "drills": [
        { "name": "string", "frequency": "string", "duration_min": number, "description": "string" }
      ]
    }
  ],
  "metrics_to_track": ["string"],
  "review_checkpoints": ["string fecha relativa"]
}

NO incluyas markdown ni texto fuera del JSON.`;

async function fetchRagDrills(weaknesses: string[], baseUrl: string, authToken: string) {
  // Llama a /api/rag/query buscando drills relevantes para las debilidades
  try {
    const query = `drills para mejorar ${weaknesses.join(", ")} en jugador juvenil`;
    const res = await fetch(`${baseUrl}/api/rag/query`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${authToken}`,
      },
      body: JSON.stringify({ query, category: "drill", limit: 8 }),
    });
    const data = await res.json();
    return data?.results ?? [];
  } catch {
    return [];
  }
}

function detectWeaknesses(subscores: Record<string, unknown>): string[] {
  const weaknesses: string[] = [];
  const entries = Object.entries(subscores);
  for (const [key, val] of entries) {
    const v = typeof val === "object" && val !== null && "value" in val
      ? (val as { value: number }).value
      : typeof val === "number"
        ? val
        : 0;
    if (v < 60) weaknesses.push(key);
  }
  return weaknesses;
}

async function callClaudeHaiku(systemPrompt: string, userMessage: string, apiKey: string) {
  const res = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5",
      max_tokens: 2000,
      system: [
        {
          type: "text",
          text: systemPrompt,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [{ role: "user", content: userMessage }],
    }),
  });

  if (!res.ok) throw new Error(`Claude error ${res.status}`);
  const data = await res.json();
  const text = data.content?.[0]?.text ?? "{}";
  return JSON.parse(text);
}

export default withHandler(
  { schema: planSchema, requireAuth: true, maxRequests: 50 },
  async ({ body }) => {
    const apiKey = process.env.ANTHROPIC_API_KEY;
    const baseUrl = process.env.VITAS_PUBLIC_URL
      ?? process.env.VITAS_API_BASE_URL
      ?? `https://${process.env.VERCEL_URL ?? "localhost:3000"}`;
    const authToken = process.env.INTERNAL_API_TOKEN ?? "";

    if (!apiKey) {
      return errorResponse({ code: "no_api_key", message: "Claude API key missing", status: 500 });
    }

    const input = body as z.infer<typeof planSchema>;
    const cacheKey = hashInput({ ...input, promptVersion: PROMPT_VERSION });
    const cached = await getCached(cacheKey);
    if (cached) return successResponse({ ...cached, fromCache: true });

    try {
      // ── 1. Detectar debilidades ────────────────────────────────
      const weaknesses = detectWeaknesses(input.vsi.subscores);

      // ── 2. RAG: buscar drills relacionados ─────────────────────
      const ragDrills =
        weaknesses.length > 0
          ? await fetchRagDrills(weaknesses, baseUrl, authToken)
          : [];

      // ── 3. Construir mensaje y llamar Claude ───────────────────
      const userMessage = `JUGADOR:
${JSON.stringify(input.playerContext, null, 2)}

VSI:
${JSON.stringify(input.vsi, null, 2)}

PHV:
${JSON.stringify(input.phv ?? "no_data", null, 2)}

DEBILIDADES DETECTADAS (subscores <60):
${weaknesses.join(", ") || "ninguna"}

DRILLS DISPONIBLES (de la knowledge base de VITAS):
${ragDrills.map((d: { content?: string }, i: number) => `${i + 1}. ${d.content?.slice(0, 200)}`).join("\n") || "ningún drill encontrado"}

Genera el Plan de Desarrollo de 12 semanas en JSON estricto.`;

      const plan = await callClaudeHaiku(PLAN_SYSTEM_PROMPT, userMessage, apiKey);

      const result = {
        playerId: input.playerId,
        videoId: input.videoId,
        promptVersion: PROMPT_VERSION,
        model: "claude-haiku-4-5",
        weaknessesDetected: weaknesses,
        ragDrillsUsed: ragDrills.length,
        plan,
        generatedAt: new Date().toISOString(),
      };

      await setCached(cacheKey, result, 86400 * 7);
      return successResponse(result);
    } catch (err) {
      return errorResponse({
        code: "plan_generation_failed",
        message: err instanceof Error ? err.message : "Unknown error",
        status: 500,
      });
    }
  }
);
