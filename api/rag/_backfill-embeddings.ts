/**
 * VITAS RAG — Backfill Missing Embeddings
 * POST /api/rag/backfill-embeddings
 *
 * Finds all knowledge_base rows with NULL embedding,
 * calls Voyage AI directly, and updates each row.
 * No internal endpoint chaining — direct Voyage + Supabase calls.
 */
export const config = { runtime: "edge" };

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

const VOYAGE_URL = "https://api.voyageai.com/v1/embeddings";
const VOYAGE_MODEL = "voyage-3";
const BATCH_SIZE = 5; // Small batches to avoid token limits

interface KBRow {
  id: string;
  content: string;
}

export default withHandler(
  { method: ["POST"], serviceOnly: true },
  async () => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const voyageKey = process.env.VOYAGE_API_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }
    if (!voyageKey) {
      return errorResponse("VOYAGE_API_KEY not configured", 503);
    }

    // 1. Get all rows without embeddings
    const queryRes = await fetch(
      `${supabaseUrl}/rest/v1/knowledge_base?embedding=is.null&select=id,content&limit=500`,
      {
        headers: {
          apikey: supabaseKey,
          Authorization: `Bearer ${supabaseKey}`,
        },
      },
    );

    if (!queryRes.ok) {
      const err = await queryRes.text();
      return errorResponse(`Failed to query knowledge_base: ${err}`, 500);
    }

    const rows: KBRow[] = await queryRes.json();

    if (rows.length === 0) {
      return successResponse({ message: "All rows already have embeddings", updated: 0, total: 0 });
    }

    let updated = 0;
    const errors: string[] = [];

    // 2. Process in small batches
    for (let i = 0; i < rows.length; i += BATCH_SIZE) {
      const batch = rows.slice(i, i + BATCH_SIZE);
      const texts = batch.map((r) => r.content);

      // 3. Call Voyage directly
      let embeddings: (number[] | null)[];
      try {
        const voyageRes = await fetch(VOYAGE_URL, {
          method: "POST",
          headers: {
            Authorization: `Bearer ${voyageKey}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            model: VOYAGE_MODEL,
            input: texts,
            input_type: "document",
          }),
        });

        if (!voyageRes.ok) {
          // Batch failed — try one by one
          embeddings = [];
          for (const text of texts) {
            try {
              const singleRes = await fetch(VOYAGE_URL, {
                method: "POST",
                headers: {
                  Authorization: `Bearer ${voyageKey}`,
                  "Content-Type": "application/json",
                },
                body: JSON.stringify({
                  model: VOYAGE_MODEL,
                  input: [text],
                  input_type: "document",
                }),
              });
              if (singleRes.ok) {
                const singleData = (await singleRes.json()) as {
                  data: Array<{ embedding: number[] }>;
                };
                embeddings.push(singleData.data[0]?.embedding ?? null);
              } else {
                const errText = await singleRes.text();
                errors.push(`Voyage single error: ${errText.slice(0, 100)}`);
                embeddings.push(null);
              }
            } catch (e) {
              embeddings.push(null);
              errors.push(`Voyage single exception: ${e instanceof Error ? e.message : "unknown"}`);
            }
          }
        } else {
          const voyageData = (await voyageRes.json()) as {
            data: Array<{ embedding: number[]; index: number }>;
          };
          embeddings = texts.map((_, idx) => {
            const found = voyageData.data.find((d) => d.index === idx);
            return found?.embedding ?? null;
          });
        }
      } catch (e) {
        errors.push(`Voyage batch exception: ${e instanceof Error ? e.message : "unknown"}`);
        continue;
      }

      // 4. Update each row in Supabase
      for (let j = 0; j < batch.length; j++) {
        const embedding = embeddings[j];
        if (!embedding) continue;

        try {
          const updateRes = await fetch(
            `${supabaseUrl}/rest/v1/knowledge_base?id=eq.${batch[j].id}`,
            {
              method: "PATCH",
              headers: {
                apikey: supabaseKey,
                Authorization: `Bearer ${supabaseKey}`,
                "Content-Type": "application/json",
                Prefer: "return=minimal",
              },
              body: JSON.stringify({
                embedding: `[${embedding.join(",")}]`,
              }),
            },
          );

          if (updateRes.ok) {
            updated++;
          } else {
            const err = await updateRes.text();
            errors.push(`Update ${batch[j].id}: ${err.slice(0, 100)}`);
          }
        } catch (e) {
          errors.push(`Update exception ${batch[j].id}: ${e instanceof Error ? e.message : "unknown"}`);
        }
      }
    }

    return successResponse({
      total: rows.length,
      updated,
      remaining: rows.length - updated,
      errors,
    });
  },
);
