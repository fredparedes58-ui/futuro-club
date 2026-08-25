/**
 * VITAS · POST /api/transfer/smart-match
 *
 * Orquestador: comprador describe necesidad → carga listings públicos
 * activos → llama al agente transfer-match → cachea scores.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { MODELS } from "../_lib/models";
import {
  TransferMatchInputSchema,
  TransferMatchOutputSchema,
} from "../../src/agents/contracts";
import {
  buildTransferMatchPrompt,
  TRANSFER_PROMPT_VERSION,
} from "../../src/lib/transfer/transferMatchPrompt";
import { hashQuery } from "../../src/lib/transfer/matchScorer";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY ?? "";
const MODEL = MODELS.reasoning;

const SmartMatchInputSchema = z.object({
  buyerNeed: z.object({
    description: z.string().min(10).max(1000),
    query: z.record(z.unknown()).optional(),
    buyerContext: z
      .object({
        teamLevel: z.enum(["weak", "average", "strong", "elite"]).optional(),
        formation: z.string().optional(),
        currentRoster: z.array(z.string()).optional(),
      })
      .optional(),
  }),
  maxCandidates: z.number().int().min(5).max(50).default(30),
});

interface DbListing {
  id: string;
  listing_type: "sale" | "loan" | "trial";
  asking_price_eur: number | null;
  player_snapshot: Record<string, unknown>;
  description: string | null;
  tags: string[];
}

export default withHandler(
  // requireAuth: corre Claude + consulta la BD; anónimo era abuso de coste/datos.
  { method: "POST", schema: SmartMatchInputSchema, requireAuth: true, maxRequests: 15 },
  async ({ body }) => {
    const input = body as z.infer<typeof SmartMatchInputSchema>;

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return errorResponse("Supabase no configurado", 503);
    }

    // 1. Load active public listings
    const res = await fetch(
      `${SUPABASE_URL}/rest/v1/transfer_listings?status=eq.active&visibility=eq.public&select=*&limit=${input.maxCandidates}`,
      {
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
        },
      },
    );
    const listings = (await res.json()) as DbListing[];

    if (!Array.isArray(listings) || listings.length === 0) {
      return successResponse({
        topMatches: [],
        summary: "No hay listings activos para evaluar.",
        candidatesEvaluated: 0,
      });
    }

    // 2. Build agent input
    const agentInput: z.infer<typeof TransferMatchInputSchema> = {
      buyerNeed: {
        description: input.buyerNeed.description,
        query: input.buyerNeed.query as z.infer<typeof TransferMatchInputSchema>["buyerNeed"]["query"],
        buyerContext: input.buyerNeed.buyerContext,
      },
      candidates: listings.map((l) => {
        const snap = l.player_snapshot as Record<string, unknown>;
        return {
          listingId: l.id,
          listingType: l.listing_type,
          askingPriceEur: l.asking_price_eur,
          player: {
            name: snap.name as string | undefined,
            age: snap.age as number | undefined,
            position: snap.position as string | undefined,
            foot: snap.foot as string | undefined,
            vsi: snap.vsi as number | undefined,
            vsiBreakdown: snap.vsiBreakdown as
              | { technical: number; tactical: number; physical: number; mental: number }
              | undefined,
            phvOffset: snap.phvOffset as number | undefined,
            phvCategory: snap.phvCategory as string | undefined,
            tags: l.tags,
            description: l.description ?? undefined,
          },
        };
      }),
    };

    // 3. Call agent
    let agentOutput: z.infer<typeof TransferMatchOutputSchema> | null = null;
    let source = "deterministic-fallback";
    let model = "fallback";

    if (ANTHROPIC_API_KEY) {
      try {
        const prompt = buildTransferMatchPrompt(agentInput);
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
        if (resp.ok) {
          const data = (await resp.json()) as { content: Array<{ text: string }> };
          const text = data.content?.[0]?.text ?? "";
          const m = text.match(/\{[\s\S]*\}/);
          if (m) {
            const parsed = JSON.parse(m[0]);
            const validated = TransferMatchOutputSchema.safeParse(parsed);
            if (validated.success) {
              agentOutput = validated.data;
              source = "agent";
              model = MODEL;
            }
          }
        }
      } catch (err) {
        console.warn("[smart-match] Anthropic call failed:", err);
      }
    }

    if (!agentOutput) {
      // Fallback heuristic
      agentOutput = {
        topMatches: listings.slice(0, 10).map((l) => ({
          listingId: l.id,
          score: 50,
          reasoning: "Match heurístico básico — agente IA no disponible.",
          matchedCriteria: ["Listing activo"],
          missingCriteria: [],
        })),
        summary: `${listings.length} candidatos evaluados con heurística simple. Configurar ANTHROPIC_API_KEY para análisis profundo.`,
      };
    }

    // 4. Cache scores (best-effort)
    const queryHash = hashQuery(
      (input.buyerNeed.query as Record<string, unknown>) ?? {},
    );
    try {
      const scoreRows = agentOutput.topMatches.map((m) => ({
        listing_id: m.listingId,
        query_hash: queryHash,
        score: m.score,
        reasoning: m.reasoning,
        matched_criteria: m.matchedCriteria,
        missing_criteria: m.missingCriteria,
      }));
      void fetch(`${SUPABASE_URL}/rest/v1/transfer_match_scores`, {
        method: "POST",
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: `Bearer ${SUPABASE_KEY}`,
          "Content-Type": "application/json",
          Prefer: "resolution=merge-duplicates,return=minimal",
        },
        body: JSON.stringify(scoreRows),
      }).catch(() => undefined);
    } catch {
      /* cache best-effort */
    }

    return successResponse({
      ...agentOutput,
      candidatesEvaluated: listings.length,
      source,
      model,
      promptVersion: TRANSFER_PROMPT_VERSION,
    });
  },
);
