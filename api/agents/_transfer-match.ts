/**
 * VITAS · Transfer Match Agent
 * POST /api/agents/transfer-match
 *
 * Rankea candidatos de listings contra una necesidad del club. Claude Sonnet
 * con 4-level fallback al scorer heurístico determinístico.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import {
  TransferMatchInputSchema,
  TransferMatchOutputSchema,
} from "../../src/agents/contracts";
import {
  buildTransferMatchPrompt,
  TRANSFER_PROMPT_VERSION,
} from "../../src/lib/transfer/transferMatchPrompt";

export const config = { runtime: "edge" };

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = MODELS.reasoning;

/** Fallback heurístico: usa solo señales estructuradas (no necesita Claude). */
function generateFallback(
  data: z.infer<typeof TransferMatchInputSchema>,
): z.infer<typeof TransferMatchOutputSchema> {
  const query = data.buyerNeed.query;

  const scored = data.candidates
    .map((c) => {
      const p = c.player;
      let s = 50;
      const matched: string[] = [];
      const missing: string[] = [];

      if (query?.positions?.length) {
        if (p.position && query.positions.includes(p.position)) {
          s += 15;
          matched.push(`Posición ${p.position}`);
        } else {
          s -= 10;
          missing.push(`Posición ${p.position ?? "?"} no encaja`);
        }
      }
      if (query?.minAge != null && p.age != null && p.age >= query.minAge) {
        s += 5;
        matched.push(`Edad ${p.age} ≥ ${query.minAge}`);
      }
      if (query?.maxAge != null && p.age != null && p.age <= query.maxAge) {
        s += 5;
        matched.push(`Edad ${p.age} ≤ ${query.maxAge}`);
      }
      if (query?.minVSI != null && p.vsi != null && p.vsi >= query.minVSI) {
        s += 10;
        matched.push(`VSI ${p.vsi}`);
      }
      if (query?.maxPriceEur != null && c.askingPriceEur != null) {
        if (c.askingPriceEur <= query.maxPriceEur) {
          s += 10;
          matched.push(`Precio dentro presupuesto`);
        } else {
          s -= 15;
          missing.push(`Precio ${c.askingPriceEur} > ${query.maxPriceEur}`);
        }
      }
      if (query?.listingTypes?.length && !query.listingTypes.includes(c.listingType)) {
        return { listingId: c.listingId, score: 0, matched, missing };
      }
      return { listingId: c.listingId, score: Math.max(0, Math.min(100, s)), matched, missing };
    })
    .sort((a, b) => b.score - a.score);

  return {
    topMatches: scored.slice(0, 10).map((m) => ({
      listingId: m.listingId,
      score: m.score,
      reasoning: `Match heurístico: ${m.matched.slice(0, 3).join(" · ") || "criterios mínimos cumplidos"}`,
      matchedCriteria: m.matched,
      missingCriteria: m.missing,
    })),
    summary: `${scored.filter((s) => s.score >= 60).length} candidatos sólidos de ${data.candidates.length} evaluados. Análisis sin agente IA (heurístico).`,
  };
}

export default withHandler(
  { schema: TransferMatchInputSchema, requireAuth: false, maxRequests: 20 },
  async ({ body }) => {
    const data = body as z.infer<typeof TransferMatchInputSchema>;

    if (!ANTHROPIC_API_KEY) {
      return successResponse({
        ...generateFallback(data),
        promptVersion: TRANSFER_PROMPT_VERSION,
        model: "deterministic-fallback",
        source: "no_api_key",
      });
    }

    try {
      const prompt = buildTransferMatchPrompt(data);
      const resp = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": ANTHROPIC_API_KEY,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: MODEL,
          max_tokens: 3000,
          messages: [{ role: "user", content: prompt }],
        }),
      });

      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        console.error("[transfer-match] Anthropic error:", resp.status, errText.slice(0, 200));
        return successResponse({
          ...generateFallback(data),
          promptVersion: TRANSFER_PROMPT_VERSION,
          model: "deterministic-fallback",
          source: "fallback_api_error",
        });
      }

      const result = (await resp.json()) as {
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

      const validated = TransferMatchOutputSchema.safeParse(parsed);
      if (!validated.success) {
        console.warn("[transfer-match] Validation failed:", validated.error.issues.slice(0, 3));
        return successResponse({
          ...generateFallback(data),
          promptVersion: TRANSFER_PROMPT_VERSION,
          model: "deterministic-fallback",
          source: "fallback_validation_error",
        });
      }

      return successResponse({
        ...validated.data,
        promptVersion: TRANSFER_PROMPT_VERSION,
        model: MODEL,
        inputTokens: result.usage?.input_tokens ?? 0,
        outputTokens: result.usage?.output_tokens ?? 0,
        source: "agent",
      });
    } catch (err) {
      console.error("[transfer-match] Unhandled error:", err);
      return successResponse({
        ...generateFallback(data),
        promptVersion: TRANSFER_PROMPT_VERSION,
        model: "deterministic-fallback",
        source: "fallback_exception",
      });
    }
  },
);
