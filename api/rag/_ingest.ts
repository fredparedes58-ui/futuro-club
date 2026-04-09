/**
 * VITAS RAG — Document Ingestion
 * POST /api/rag/ingest
 *
 * Indexes documents into the knowledge_base table with optional embeddings.
 * Accepts a single document or an array (batch).
 */
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { sanitizeForIngestion } from "../_lib/ragSanitizer";

export const config = { runtime: "edge" };

const IngestDocSchema = z.object({
  content: z.string().min(1),
  category: z.enum(["drill", "pro_player", "report", "methodology", "scouting"]),
  metadata: z.record(z.unknown()).optional(),
  player_id: z.string().optional(),
});

export type IngestRequest = z.infer<typeof IngestDocSchema>;

export default withHandler(
  { optionalAuth: true, maxRequests: 20, rawBody: true },
  async ({ req, userId }) => {
    // Allow authenticated users OR service role (for seed endpoints)
    const authHeader = req.headers.get("Authorization") ?? "";
    const token = authHeader.replace("Bearer ", "");
    const cronSecret = process.env.CRON_SECRET;
    const adminSecret = process.env.ADMIN_SECRET;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const isService =
      (cronSecret && token === cronSecret) ||
      (adminSecret && token === adminSecret) ||
      (serviceKey && token === serviceKey);

    if (!userId && !isService) {
      return errorResponse("No autenticado", 401, "UNAUTHORIZED");
    }
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

    // Embed documents — try batch first, fallback to one-by-one
    const texts = documents.map(d => d.content);
    let embeddings: (number[] | null)[] = texts.map(() => null);

    async function callEmbed(input: string[]): Promise<(number[] | null)[]> {
      const res = await fetch(`${baseUrl}/api/rag/embed`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": authHeader,
        },
        body: JSON.stringify({ texts: input, inputType: "document" }),
      });
      if (!res.ok) return input.map(() => null);
      const raw = await res.json() as { ok?: boolean; data?: { embeddings?: (number[] | null)[] }; embeddings?: (number[] | null)[] };
      const data = raw.data ?? raw;
      return data.embeddings ?? input.map(() => null);
    }

    try {
      // Try batch first
      const batchResult = await callEmbed(texts);
      if (batchResult.length === texts.length && batchResult.some(e => e !== null)) {
        embeddings = batchResult;
      }
      // For any that failed in batch, retry individually
      for (let i = 0; i < embeddings.length; i++) {
        if (embeddings[i] === null) {
          try {
            const single = await callEmbed([texts[i]]);
            if (single[0] !== null) embeddings[i] = single[0];
          } catch { /* skip */ }
        }
      }
    } catch {
      // Batch failed entirely — try one by one
      for (let i = 0; i < texts.length; i++) {
        try {
          const single = await callEmbed([texts[i]]);
          if (single[0] !== null) embeddings[i] = single[0];
        } catch { /* skip */ }
      }
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
