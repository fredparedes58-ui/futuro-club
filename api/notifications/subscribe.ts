/**
 * VITAS — Push Subscription Endpoint
 * POST /api/notifications/subscribe — save subscription
 * DELETE /api/notifications/subscribe — remove subscription
 */
export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !supabaseKey) {
    return json({ error: "Supabase not configured" }, 503);
  }

  // Extract user from JWT
  const authHeader = req.headers.get("Authorization") ?? "";
  let userId: string | null = null;
  if (authHeader.startsWith("Bearer ")) {
    try {
      const token = authHeader.slice(7);
      const parts = token.split(".");
      if (parts.length >= 3) {
        const payload = JSON.parse(atob(parts[1]));
        userId = payload.sub ?? null;
      }
    } catch { /* invalid token */ }
  }

  if (req.method === "POST") {
    let body: { subscription: object };
    try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

    const { error } = await (await fetch(`${supabaseUrl}/rest/v1/push_subscriptions`, {
      method: "POST",
      headers: {
        "apikey": supabaseKey,
        "Authorization": `Bearer ${supabaseKey}`,
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
      },
      body: JSON.stringify({ user_id: userId, subscription: body.subscription }),
    })).json().then(() => ({ error: null })).catch(e => ({ error: e }));

    return json({ success: !error });
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
