/**
 * VITAS RAG — Retrieval Endpoint
 * POST /api/rag/query
 *
 * Embeds the query, performs similarity search via Supabase RPC,
 * falls back to full-text search when embeddings are unavailable.
 */
import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";
import { buildSecureContext } from "../lib/ragSanitizer";

export const config = { runtime: "edge" };

const QueryRequestSchema = z.object({
  query: z.string().min(1, "query es requerido").max(2000, "query muy largo"),
  category: z.enum(["drill", "pro_player", "report", "methodology", "scouting"]).optional(),
  player_id: z.string().optional(),
  limit: z.number().int().min(1).max(20).default(5),
});

export interface KnowledgeResult {
  id: string;
  content: string;
  category: string;
  metadata: Record<string, unknown>;
  player_id: string | null;
  similarity: number;
}

export default withHandler(
  { schema: QueryRequestSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, req }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    const { query, category, player_id, limit } = body;
    const baseUrl = new URL(req.url).origin;

    // Try vector search first
    let embedding: number[] | null = null;
    try {
      const embedRes = await fetch(`${baseUrl}/api/rag/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts: [query], inputType: "query" }),
      });
      if (embedRes.ok) {
        const embedData = await embedRes.json() as { embeddings?: (number[] | null)[] };
        embedding = embedData.embeddings?.[0] ?? null;
      }
    } catch {
      // proceed with full-text search
    }

    let results: KnowledgeResult[] = [];
    let usedEmbeddings = false;

    if (embedding !== null) {
      try {
        const rpcBody: Record<string, unknown> = {
          query_embedding: `[${embedding.join(",")}]`,
          match_threshold: 0.60,
          match_count: limit,
        };
        if (category) rpcBody.filter_category = category;
        if (player_id) rpcBody.filter_player_id = player_id;

        const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/match_knowledge`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(rpcBody),
        });

        if (rpcRes.ok) {
          results = await rpcRes.json() as KnowledgeResult[];
          usedEmbeddings = true;
        }
      } catch {
        // fall through to text search
      }
    }

    // Full-text search fallback
    if (!usedEmbeddings) {
      try {
        const rpcBody: Record<string, unknown> = {
          query_text: query,
          match_count: limit,
        };
        if (category) rpcBody.filter_category = category;
        if (player_id) rpcBody.filter_player_id = player_id;

        const rpcRes = await fetch(`${supabaseUrl}/rest/v1/rpc/search_knowledge_text`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify(rpcBody),
        });

        if (rpcRes.ok) {
          results = await rpcRes.json() as KnowledgeResult[];
        }
      } catch {
        // return empty context — non-blocking
      }
    }

    const secureContext = buildSecureContext(results);
    const legacyContext = formatContext(results);

    return successResponse({
      success: true,
      context: secureContext || legacyContext,
      results,
      usedEmbeddings,
      sanitized: !!secureContext,
    });
  }
);

function formatContext(results: KnowledgeResult[]): string {
  if (!results.length) return "";
  return results
    .map((r, i) => {
      const header = `[CONTEXTO ${i + 1}] Categoría: ${r.category}${r.player_id ? ` | Jugador: ${r.player_id}` : ""}`;
      return `${header}\n${r.content}`;
    })
    .join("\n\n---\n\n");
}
