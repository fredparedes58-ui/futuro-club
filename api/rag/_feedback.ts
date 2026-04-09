/**
 * VITAS RAG — Feedback Endpoint
 * POST /api/rag/feedback
 *
 * Persiste feedback del usuario sobre resultados RAG en Supabase.
 */
import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

export const config = { runtime: "edge" };

const FeedbackSchema = z.object({
  traceId: z.string().min(1, "traceId es requerido"),
  score: z.number().int().min(1).max(5),
  comment: z.string().max(500).optional(),
});

export default withHandler(
  { schema: FeedbackSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, ip }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    const { traceId, score, comment } = body;

    try {
      const res = await fetch(`${supabaseUrl}/rest/v1/rag_feedback`, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "return=minimal",
        },
        body: JSON.stringify({
          trace_id: traceId,
          score,
          comment: comment ?? null,
          ip_hash: ip.slice(0, 8),
          created_at: new Date().toISOString(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text();
        console.error("[rag/feedback] Supabase error:", res.status, errText);
        return successResponse({ saved: false, reason: "storage_error" });
      }

      return successResponse({ saved: true });
    } catch (err) {
      console.error("[rag/feedback]", err);
      return successResponse({ saved: false, reason: "network_error" });
    }
  }
);
