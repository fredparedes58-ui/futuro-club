/**
 * VITAS RAG Service — Client-side wrapper
 *
 * Provides query, ingest, and prompt-formatting utilities for the RAG system.
 * All methods are non-throwing: errors are logged and empty values returned.
 */

export interface RagQueryOptions {
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

export interface RagQueryResult {
  context: string;
  results: KnowledgeResult[];
  usedEmbeddings: boolean;
}

export interface RagIngestDocument {
  content: string;
  category: "drill" | "pro_player" | "report" | "methodology" | "scouting";
  metadata?: Record<string, unknown>;
  player_id?: string;
}

export interface RagIngestResult {
  success: boolean;
  indexed: number;
  errors: string[];
}

const RAG_BASE = "/api/rag";

async function postJson<T>(path: string, body: unknown): Promise<T | null> {
  try {
    const res = await fetch(`${RAG_BASE}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      console.warn(`[ragService] ${path} failed (${res.status})`);
      return null;
    }
    return res.json() as Promise<T>;
  } catch (err) {
    console.warn(`[ragService] ${path} error:`, err instanceof Error ? err.message : err);
    return null;
  }
}

export const ragService = {
  /**
   * Query the knowledge base for relevant context.
   * Returns an empty result on failure — never throws.
   */
  async query(query: string, options: RagQueryOptions = {}): Promise<RagQueryResult> {
    const empty: RagQueryResult = { context: "", results: [], usedEmbeddings: false };
    if (!query?.trim()) return empty;

    const data = await postJson<RagQueryResult>("/query", {
      query,
      ...options,
    });

    return data ?? empty;
  },

  /**
   * Ingest one or more documents into the knowledge base.
   * Returns a summary — never throws.
   */
  async ingest(documents: RagIngestDocument[]): Promise<RagIngestResult> {
    const empty: RagIngestResult = { success: false, indexed: 0, errors: ["RAG service unavailable"] };
    if (!documents.length) return { success: true, indexed: 0, errors: [] };

    const data = await postJson<RagIngestResult>("/ingest", { documents });
    return data ?? empty;
  },

  /**
   * Format retrieved knowledge results for injection into an LLM prompt.
   * Returns an empty string when there are no results.
   */
  formatForPrompt(results: KnowledgeResult[]): string {
    if (!results.length) return "";

    const lines = [
      "--- CONTEXTO RELEVANTE DEL CONOCIMIENTO BASE ---",
      ...results.map((r, i) => {
        const tag = r.category.toUpperCase();
        const playerTag = r.player_id ? ` | Jugador: ${r.player_id}` : "";
        return `[${tag} ${i + 1}${playerTag}]\n${r.content}`;
      }),
      "--- FIN DEL CONTEXTO ---",
    ];

    return lines.join("\n\n");
  },
};
