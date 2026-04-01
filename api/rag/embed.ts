/**
 * VITAS RAG — Embedding Service
 * POST /api/rag/embed
 *
 * Generates embeddings using Voyage AI (voyage-3, 1024 dims)
 * Fallback: returns null if VOYAGE_API_KEY not configured
 */
export const config = { runtime: "edge" };

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";

export interface EmbedRequest {
  texts: string[];
  inputType?: "document" | "query";
}

export interface EmbedResponse {
  success: boolean;
  embeddings: (number[] | null)[];
  model: string;
  tokenCount?: number;
  error?: string;
}

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const voyageKey = process.env.VOYAGE_API_KEY;

  let body: EmbedRequest;
  try {
    body = await req.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400);
  }

  const { texts, inputType = "document" } = body;
  if (!texts?.length) {
    return json({ error: "texts array is required" }, 400);
  }

  // No API key: return null embeddings (graceful degradation — use full-text search)
  if (!voyageKey) {
    return json({
      success: true,
      embeddings: texts.map(() => null),
      model: "none",
      error: "VOYAGE_API_KEY not configured — using full-text search fallback",
    } satisfies EmbedResponse);
  }

  try {
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
      throw new Error(`Voyage API error (${res.status}): ${errText}`);
    }

    const data = await res.json() as {
      data: Array<{ embedding: number[]; index: number }>;
      usage: { total_tokens: number };
    };

    const embeddings = texts.map((_, i) => {
      const found = data.data.find(d => d.index === i);
      return found?.embedding ?? null;
    });

    return json({
      success: true,
      embeddings,
      model: VOYAGE_MODEL,
      tokenCount: data.usage.total_tokens,
    } satisfies EmbedResponse);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return json(
      { success: false, embeddings: texts.map(() => null), model: "error", error: message } satisfies EmbedResponse,
      500,
    );
  }
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}
