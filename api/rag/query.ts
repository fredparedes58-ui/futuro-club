/**
 * VITAS RAG — Retrieval Endpoint
 * POST /api/rag/query
 *
 * Embeds the query, performs similarity search via Supabase RPC,
 * falls back to full-text search when embeddings are unavailable.
 *
 * Body: { query, category?, player_id?, limit? }
 * Response: { context, results }
 */
export const config = { runtime: "edge" };

export interface QueryRequest {
  query: string;
  category?: "drill" | "pro_player" | "report" | "methodology" | "scouting";
  player_id?: string;
  limit?: number;
}

export interface KnowledgeResult {
  id: string;
  content: string;
  category: string;
  metadata: Record<string, unknown>;
  player_id: string | null;
  similarity: number;
}

export interface QueryResponse {
  success: boolean;
  context: string;
  results: KnowledgeResult[];
  usedEmbeddings: boolean;
  error?: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Supabase not configured" }, 503);
  }

  let body: QueryRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { query, category, player_id, limit = 5 } = body;
  if (!query?.trim()) {
    return json({ error: "query is required" }, 400);
  }

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
    // Vector similarity search via RPC
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

  const context = formatContext(results);

  return json({
    success: true,
    context,
    results,
    usedEmbeddings,
  } satisfies QueryResponse);
}

function formatContext(results: KnowledgeResult[]): string {
  if (!results.length) return "";

  return results
    .map((r, i) => {
      const header = `[CONTEXTO ${i + 1}] Categoría: ${r.category}${r.player_id ? ` | Jugador: ${r.player_id}` : ""}`;
      return `${header}\n${r.content}`;
    })
    .join("\n\n---\n\n");
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
