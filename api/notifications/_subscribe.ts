/**
 * VITAS — Push Subscription Endpoint
 * POST /api/notifications/subscribe — save subscription
 * DELETE /api/notifications/subscribe — remove subscription
 */

import { z } from "zod";
import { withHandler } from "../lib/withHandler";
import { successResponse, errorResponse } from "../lib/apiResponse";

export const config = { runtime: "edge" };

const SubscribeSchema = z.object({
  subscription: z.object({
    endpoint: z.string().url(),
    keys: z.object({
      p256dh: z.string(),
      auth: z.string(),
    }),
  }).passthrough(),
});

export default withHandler(
  { method: ["POST", "DELETE"], schema: SubscribeSchema, requireAuth: true, maxRequests: 10 },
  async ({ req, body, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    if (req.method === "POST") {
      const insertRes = await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
        method: "POST",
        headers: {
          "apikey": supabaseKey,
          "Authorization": `Bearer ${supabaseKey}`,
          "Content-Type": "application/json",
          "Prefer": "resolution=merge-duplicates",
        },
        body: JSON.stringify({ user_id: userId, subscription: body.subscription }),
      });

      if (!insertRes.ok) {
        const errBody = await insertRes.text().catch(() => "Unknown error");
        return errorResponse(`Supabase insert failed: ${errBody}`, 500);
      }

      return successResponse({ success: true });
    }

    // DELETE — parse body manually (withHandler only parses POST)
    let delBody: unknown;
    try { delBody = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
    const parsedDel = z.object({ endpoint: z.string().url() }).safeParse(delBody);
    if (!parsedDel.success) {
      return errorResponse("Endpoint inválido", 400);
    }

    await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(parsedDel.data.endpoint)}`, {
      method: "DELETE",
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
    });

    return successResponse({ success: true });
  },
);
