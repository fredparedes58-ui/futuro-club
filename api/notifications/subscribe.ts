/**
 * VITAS — Push Subscription Endpoint
 * POST /api/notifications/subscribe — save subscription
 * DELETE /api/notifications/subscribe — remove subscription
 */

import { verifyAuth } from "../lib/auth";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Supabase not configured" }, 503);
  }

  // Verify JWT with signature check
  const { userId, error: authError } = await verifyAuth(req);
  if (!userId) return json({ error: authError ?? "No autenticado" }, 401);

  if (req.method === "POST") {
    let body: { subscription: object };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

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
      return json({ success: false, error: `Supabase insert failed: ${errBody}` }, 500);
    }

    return json({ success: true });
  }

  if (req.method === "DELETE") {
    let body: { endpoint: string };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
    await fetch(`${supabaseUrl}/rest/v1/push_subscriptions?endpoint=eq.${encodeURIComponent(body.endpoint)}`, {
      method: "DELETE",
      headers: { "apikey": supabaseKey, "Authorization": `Bearer ${supabaseKey}` },
    });
    return json({ success: true });
  }

  return json({ error: "Method not allowed" }, 405);
}

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status, headers: { "Content-Type": "application/json" },
  });
}
