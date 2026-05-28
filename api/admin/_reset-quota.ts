/**
 * POST /api/admin/reset-quota
 * Resets a user's monthly analysis quota to 0.
 * Auth: serviceOnly (ADMIN_SECRET / CRON_SECRET)
 *
 * Body: { userId, month? }
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const resetQuotaSchema = z.object({
  userId: z.string().uuid("userId debe ser UUID"),
  month: z.string().regex(/^\d{4}-\d{2}$/, "Format: YYYY-MM").optional(),
});

export default withHandler(
  { schema: resetQuotaSchema, serviceOnly: true, maxRequests: 30 },
  async ({ body }) => {
    const { userId, month: requestedMonth } = body as z.infer<typeof resetQuotaSchema>;
    const month = requestedMonth ?? new Date().toISOString().slice(0, 7);

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse("Supabase not configured", 500);
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    };

    // Reset analyses_used count to 0
    const res = await fetch(`${SUPABASE_URL}/rest/v1/analyses_used`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: userId,
        month,
        count: 0,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!res.ok) {
      const err = await res.text().catch(() => "unknown");
      return errorResponse(`Failed to reset quota: ${err}`, 500);
    }

    // Log the reset
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: userId,
          endpoint: "admin/reset-quota",
          month,
          created_at: new Date().toISOString(),
        }),
      });
    } catch { /* non-blocking */ }

    return successResponse({
      userId,
      month,
      count: 0,
      message: "Quota reset successfully",
    });
  }
);
