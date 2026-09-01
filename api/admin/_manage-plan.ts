/**
 * POST /api/admin/manage-plan
 * Manually assign a plan to a user (admin-only, no Stripe).
 *
 * Body: { userId, plan, reason? }
 * Auth: adminOnly — JWT de un admin de plataforma (email en ADMIN_EMAILS).
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const managePlanSchema = z.object({
  userId: z.string().uuid("userId debe ser UUID"),
  plan: z.enum(["free", "pro", "club"]),
  reason: z.string().optional(),
});

export default withHandler(
  { schema: managePlanSchema, requireAuth: true, adminOnly: true, maxRequests: 30 },
  async ({ body }) => {
    const { userId, plan, reason } = body as z.infer<typeof managePlanSchema>;

    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse("Supabase not configured", 500);
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
      "Content-Type": "application/json",
      Prefer: "resolution=merge-duplicates",
    };

    // 1. Upsert subscription
    const subRes = await fetch(`${SUPABASE_URL}/rest/v1/subscriptions`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify({
        user_id: userId,
        plan,
        status: "active",
        stripe_customer_id: null,
        stripe_subscription_id: null,
        current_period_end: null,
        updated_at: new Date().toISOString(),
      }),
    });

    if (!subRes.ok) {
      const err = await subRes.text().catch(() => "unknown");
      return errorResponse(`Failed to update subscription: ${err}`, 500);
    }

    const subscription = await subRes.json();

    // 2. Also update organization plan if org exists
    try {
      await fetch(
        `${SUPABASE_URL}/rest/v1/organizations?owner_id=eq.${userId}`,
        {
          method: "PATCH",
          headers,
          body: JSON.stringify({ plan, updated_at: new Date().toISOString() }),
        }
      );
    } catch { /* org may not exist — non-blocking */ }

    // 3. Log to usage_log
    try {
      await fetch(`${SUPABASE_URL}/rest/v1/usage_log`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          user_id: userId,
          endpoint: "admin/manage-plan",
          month: new Date().toISOString().slice(0, 7),
          created_at: new Date().toISOString(),
        }),
      });
    } catch { /* non-blocking */ }

    return successResponse({
      userId,
      plan,
      status: "active",
      reason: reason ?? "Manual admin assignment",
      updatedAt: new Date().toISOString(),
      subscription: Array.isArray(subscription) ? subscription[0] : subscription,
    });
  }
);
