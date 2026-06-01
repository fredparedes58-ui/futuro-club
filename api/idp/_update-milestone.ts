/**
 * VITAS · POST /api/idp/update-milestone
 *
 * Marks a weekly milestone as completed/missed/partial with optional evidence
 * (video IDs, session IDs, metrics snapshot).
 *
 * Auto-sets `completed_at = now` when transitioning to `completed`.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL ?? "";
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY ?? "";

const UpdateMilestoneSchema = z.object({
  milestoneId: z.string().uuid(),
  status: z.enum(["pending", "completed", "missed", "partial"]),
  evidence: z
    .object({
      videoIds: z.array(z.string()).optional(),
      sessionIds: z.array(z.string()).optional(),
      metrics: z.record(z.number()).optional(),
      notes: z.string().optional(),
    })
    .optional(),
});

export default withHandler(
  {
    method: "POST",
    schema: UpdateMilestoneSchema,
    requireAuth: false,
    maxRequests: 100,
  },
  async ({ body }) => {
    const { milestoneId, status, evidence } = body as z.infer<typeof UpdateMilestoneSchema>;

    const patch: Record<string, unknown> = { status };
    if (evidence) patch.evidence = evidence;
    if (status === "completed") patch.completed_at = new Date().toISOString();

    if (!SUPABASE_URL || !SUPABASE_KEY) {
      return successResponse({ milestoneId, ...patch, source: "client_only" });
    }

    try {
      const headers = {
        apikey: SUPABASE_KEY,
        Authorization: `Bearer ${SUPABASE_KEY}`,
        "Content-Type": "application/json",
        Prefer: "return=representation",
      };

      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/idp_milestones?id=eq.${milestoneId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify(patch),
        },
      );

      if (!res.ok) {
        const text = await res.text().catch(() => "");
        return errorResponse(
          `Supabase update failed: ${res.status} ${text.slice(0, 200)}`,
          500,
        );
      }

      const rows = await res.json();
      if (!Array.isArray(rows) || rows.length === 0) {
        return errorResponse("Milestone not found", 404);
      }

      return successResponse({ milestone: rows[0] });
    } catch (err) {
      console.error("[update-milestone] error:", err);
      return errorResponse("Internal error updating milestone", 500);
    }
  },
);
