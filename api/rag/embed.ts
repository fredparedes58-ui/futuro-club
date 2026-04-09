/**
 * VITAS RAG — Embedding Service
 * POST /api/rag/embed
 *
 * Generates embeddings using Voyage AI (voyage-3, 1024 dims)
 * Fallback: returns null if VOYAGE_API_KEY not configured
 */
import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

export const config = { runtime: "edge" };

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";

const EmbedSchema = z.object({
  texts: z.array(z.string()).min(1, "texts array es requerido"),
  inputType: z.enum(["document", "query"]).default("document"),
});

export default withHandler(
  { schema: EmbedSchema, requireAuth: true, maxRequests: 60 },
  async ({ body }) => {
    const voyageKey = process.env.VOYAGE_API_KEY;
    const { texts, inputType } = body;

    // No API key: return null embeddings (graceful degradation)
    if (!voyageKey) {
      return successResponse({
        success: true,
        embeddings: texts.map(() => null),
        model: "none",
        error: "VOYAGE_API_KEY not configured — using full-text search fallback",
      });
    }

    const res = await fetch(VOYAGE_URL, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${voyageKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: VOYAGE_MODEL,
        input: texts,
        input_type: inputType,
      }),
    });

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(`Voyage API error (${res.status}): ${errText}`, 500, "EMBED_ERROR");
    }

    const data = await res.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    const embeddings = texts.map((_, i) => {
      const found = data.data.find(d => d.index === i);
      return found?.embedding ?? null;
    });

    return successResponse({
      success: true,
      embeddings,
      model: VOYAGE_MODEL,
      tokenCount: data.usage.total_tokens,
    });
  }
);
