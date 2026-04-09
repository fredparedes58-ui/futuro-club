/**
 * VITAS RAG — Document Ingestion
 * POST /api/rag/ingest
 *
 * Indexes documents into the knowledge_base table with optional embeddings.
 * Accepts a single document or an array (batch).
 */
import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";
import { sanitizeForIngestion } from "../lib/ragSanitizer";

export const config = { runtime: "edge" };

const IngestDocSchema = z.object({
  content: z.string().min(1),
  category: z.enum(["drill", "pro_player", "report", "methodology", "scouting"]),
  metadata: z.record(z.unknown()).optional(),
  player_id: z.string().optional(),
});

export type IngestRequest = z.infer<typeof IngestDocSchema>;

export default withHandler(
  { requireAuth: true, maxRequests: 20, rawBody: true },
  async ({ req }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    let rawBody: unknown;
    try {
      rawBody = await req.json();
    } catch {
      return errorResponse("Invalid JSON", 400);
    }

    // Normalise: accept { documents: [...] } wrapper OR bare array OR single object
    let documents: IngestRequest[];
    if (Array.isArray(rawBody)) {
      documents = rawBody as IngestRequest[];
    } else if (
      rawBody !== null &&
      typeof rawBody === "object" &&
      "documents" in (rawBody as Record<string, unknown>) &&
      Array.isArray((rawBody as Record<string, unknown>).documents)
    ) {
      documents = (rawBody as { documents: IngestRequest[] }).documents;
    } else if (rawBody !== null && typeof rawBody === "object" && "content" in (rawBody as Record<string, unknown>)) {
      const single = IngestDocSchema.safeParse(rawBody);
      if (!single.success) {
        return errorResponse("Documento invalido: " + single.error.errors.map(e => e.message).join(", "), 400, "VALIDATION_ERROR");
      }
      documents = [single.data];
    } else {
      return errorResponse("Body must be a document, an array of documents, or { documents: [...] }", 400);
    }

    if (!documents.length) {
      return successResponse({ success: true, indexed: 0, errors: [] });
    }

    const baseUrl = new URL(req.url).origin;
    const errors: string[] = [];
    let indexed = 0;

    // Sanitize all documents before indexing
    for (let i = 0; i < documents.length; i++) {
      const result = sanitizeForIngestion(documents[i].content);
      if (result.blocked) {
        errors.push(`Doc[${i}]: BLOQUEADO — contenido contiene prompt injection (risk: ${result.riskScore}, patrones: ${result.detections.map(d => d.name).join(", ")})`);
        documents.splice(i, 1);
        i--;
        continue;
      }
      if (result.detections.length > 0) {
        documents[i].content = result.content;
      }
    }

    if (!documents.length) {
      return successResponse({ success: errors.length === 0, indexed: 0, errors });
    }

    // Embed all documents in one request
    const texts = documents.map(d => d.content);
    let embeddings: (number[] | null)[] = texts.map(() => null);

    try {
      const embedRes = await fetch(`${baseUrl}/api/rag/embed`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ texts, inputType: "document" }),
      });
      if (embedRes.ok) {
        const embedData = await embedRes.json() as { embeddings?: (number[] | null)[] };
        if (embedData.embeddings?.length === texts.length) {
          embeddings = embedData.embeddings;
        }
      }
    } catch {
      // Embedding failed — proceed without vectors
    }

    // Insert each document
    for (let i = 0; i < documents.length; i++) {
      const doc = documents[i];
      const embedding = embeddings[i];

      const row: Record<string, unknown> = {
        content: doc.content,
        category: doc.category,
        metadata: doc.metadata ?? {},
        player_id: doc.player_id ?? null,
      };
      if (embedding !== null) {
        row.embedding = `[${embedding.join(",")}]`;
      }

      try {
        const res = await fetch(`${supabaseUrl}/rest/v1/knowledge_base`, {
          method: "POST",
          headers: {
            "apikey": supabaseKey,
            "Authorization": `Bearer ${supabaseKey}`,
            "Content-Type": "application/json",
            "Prefer": "return=minimal",
          },
          body: JSON.stringify(row),
        });

        if (!res.ok) {
          const errText = await res.text();
          errors.push(`Doc[${i}]: ${res.status} — ${errText.slice(0, 200)}`);
        } else {
          indexed++;
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Doc[${i}]: ${msg}`);
      }
    }

    return successResponse({ success: errors.length === 0, indexed, errors });
  }
);
