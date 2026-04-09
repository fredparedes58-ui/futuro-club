/**
 * VITAS RAG — Knowledge Base Seeding (Methodology, Scouting, Benchmarks)
 * POST|GET /api/rag/seed-knowledge
 *
 * Indexes football expertise documents into the knowledge_base table.
 * Separate from drill seeding to keep file sizes manageable.
 * Protected: requires SUPABASE_SERVICE_ROLE_KEY.
 */
export const config = { runtime: "edge" };

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { SCOUTING_METHODOLOGY_DOCS } from "../../src/data/knowledgeBase/scoutingMethodology";
import { YOUTH_DEVELOPMENT_DOCS } from "../../src/data/knowledgeBase/youthDevelopment";
import { TACTICAL_SYSTEMS_DOCS } from "../../src/data/knowledgeBase/tacticalSystems";
import { PERFORMANCE_BENCHMARKS_DOCS } from "../../src/data/knowledgeBase/performanceBenchmarks";
import { WEAKNESS_TO_DRILL_MAP } from "../../src/data/knowledgeBase/weaknessToDrillMap";
import type { KnowledgeDocument } from "../../src/data/knowledgeBase/types";

const ALL_KNOWLEDGE_DOCS: KnowledgeDocument[] = [
  ...SCOUTING_METHODOLOGY_DOCS,
  ...YOUTH_DEVELOPMENT_DOCS,
  ...TACTICAL_SYSTEMS_DOCS,
  ...PERFORMANCE_BENCHMARKS_DOCS,
  ...WEAKNESS_TO_DRILL_MAP,
];

const BATCH_SIZE = 10;

interface SeedResult {
  success: boolean;
  totalDocs: number;
  indexed: number;
  errors: string[];
  batches: number;
  categories: Record<string, number>;
}

export default withHandler(
  { method: ["POST", "GET"], serviceOnly: true },
  async ({ req }) => {
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!serviceRoleKey) {
      return errorResponse("SUPABASE_SERVICE_ROLE_KEY not configured — seed is protected", 403);
    }

    const baseUrl = new URL(req.url).origin;
    const errors: string[] = [];
    let totalIndexed = 0;
    let batchCount = 0;

    // Count by category
    const categories: Record<string, number> = {};
    for (const doc of ALL_KNOWLEDGE_DOCS) {
      categories[doc.category] = (categories[doc.category] ?? 0) + 1;
    }

    // Process in batches
    for (let i = 0; i < ALL_KNOWLEDGE_DOCS.length; i += BATCH_SIZE) {
      const batch = ALL_KNOWLEDGE_DOCS.slice(i, i + BATCH_SIZE);
      batchCount++;

      const documents = batch.map((doc) => ({
        content: doc.content,
        category: doc.category,
        metadata: {
          docId: doc.id,
          title: doc.title,
          ...doc.metadata,
        },
      }));

      try {
        const res = await fetch(`${baseUrl}/api/rag/ingest`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ documents }),
        });

        if (res.ok) {
          const data = (await res.json()) as { indexed?: number; errors?: string[] };
          totalIndexed += data.indexed ?? 0;
          if (data.errors?.length) {
            errors.push(...data.errors.map((e) => `Batch ${batchCount}: ${e}`));
          }
        } else {
          const errText = await res.text();
          errors.push(`Batch ${batchCount} failed (${res.status}): ${errText.slice(0, 200)}`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Unknown error";
        errors.push(`Batch ${batchCount} exception: ${msg}`);
      }
    }

    const result: SeedResult = {
      success: errors.length === 0,
      totalDocs: ALL_KNOWLEDGE_DOCS.length,
      indexed: totalIndexed,
      errors,
      batches: batchCount,
      categories,
    };

    return successResponse(result);
  },
);
