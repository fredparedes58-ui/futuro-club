/**
 * VITAS · Usage Guard — Server-side AI quota enforcement
 *
 * Verifica que el usuario no ha excedido su límite de análisis mensuales
 * ANTES de ejecutar una llamada costosa a Claude/Gemini.
 *
 * Flujo:
 *   1. Lee plan del usuario desde subscriptions (Supabase)
 *   2. Lee consumo del mes desde analyses_used
 *   3. Si count >= limit → rechaza con 429
 *   4. Si OK → incrementa count y permite la ejecución
 *
 * También registra cada uso en usage_log para analytics.
 */

// ── Plan limits (mirrors frontend PLAN_LIMITS) ─────────────────────────────

interface PlanLimit {
  analyses: number;
}

const PLAN_LIMITS: Record<string, PlanLimit> = {
  free:  { analyses: 3 },
  pro:   { analyses: 20 },
  club:  { analyses: 9999 },
};

const DEFAULT_LIMIT: PlanLimit = { analyses: 3 };

// ── Admin bypass list ───────────────────────────────────────────────────────

const ADMIN_EMAILS = new Set([
  "fredparedes58@gmail.com",
]);

// ── Types ───────────────────────────────────────────────────────────────────

export interface UsageCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
  remaining: number;
  reason?: string;
}

// ── Guard function ──────────────────────────────────────────────────────────

export async function checkUsageQuota(userId: string): Promise<UsageCheckResult> {
  const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!sbUrl || !sbKey) {
    // No Supabase → allow (offline/dev mode)
    return { allowed: true, used: 0, limit: 9999, plan: "dev", remaining: 9999 };
  }

  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
  };

  // 1. Get user plan
  let plan = "free";
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status&limit=1`,
      { headers }
    );
    if (res.ok) {
      const rows = await res.json() as Array<{ plan: string; status: string }>;
      const active = rows.find(r => r.status === "active" || r.status === "trialing");
      if (active) plan = active.plan;
    }
  } catch { /* fallback to free */ }

  // 2. Check admin bypass
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/rpc/get_user_email`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ p_user_id: userId }),
      }
    );
    if (res.ok) {
      const email = await res.text();
      if (ADMIN_EMAILS.has(email.replace(/"/g, ""))) {
        return { allowed: true, used: 0, limit: 9999, plan: "admin", remaining: 9999 };
      }
    }
  } catch { /* not critical */ }

  const limits = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  // 3. Get current month usage
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  let used = 0;
  try {
    const res = await fetch(
      `${sbUrl}/rest/v1/analyses_used?user_id=eq.${userId}&month=eq.${month}&select=count`,
      { headers }
    );
    if (res.ok) {
      const rows = await res.json() as Array<{ count: number }>;
      if (rows.length > 0) used = rows[0].count;
    }
  } catch { /* assume 0 */ }

  const remaining = Math.max(0, limits.analyses - used);

  if (used >= limits.analyses) {
    return {
      allowed: false,
      used,
      limit: limits.analyses,
      plan,
      remaining: 0,
      reason: `Límite mensual alcanzado (${used}/${limits.analyses})`,
    };
  }

  return { allowed: true, used, limit: limits.analyses, plan, remaining };
}

// ── Increment usage ─────────────────────────────────────────────────────────

export async function incrementUsage(userId: string, endpoint: string): Promise<void> {
  const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return;

  const headers = {
    apikey: sbKey,
    Authorization: `Bearer ${sbKey}`,
    "Content-Type": "application/json",
    Prefer: "resolution=merge-duplicates",
  };

  const month = new Date().toISOString().slice(0, 7);

  // Upsert analyses_used (increment count)
  try {
    // First get current count
    const getRes = await fetch(
      `${sbUrl}/rest/v1/analyses_used?user_id=eq.${userId}&month=eq.${month}&select=count`,
      { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } }
    );
    let currentCount = 0;
    if (getRes.ok) {
      const rows = await getRes.json() as Array<{ count: number }>;
      if (rows.length > 0) currentCount = rows[0].count;
    }

    await fetch(`${sbUrl}/rest/v1/analyses_used`, {
      method: "POST",
      headers: { ...headers, Prefer: "resolution=merge-duplicates" },
      body: JSON.stringify({
        user_id: userId,
        month,
        count: currentCount + 1,
        updated_at: new Date().toISOString(),
      }),
    });
  } catch { /* non-blocking */ }

  // Log to usage_log (if table exists)
  try {
    await fetch(`${sbUrl}/rest/v1/usage_log`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        user_id: userId,
        endpoint,
        month,
        created_at: new Date().toISOString(),
      }),
    });
  } catch { /* non-blocking — table may not exist yet */ }
}

// ── Response helper ─────────────────────────────────────────────────────────

export function usageExceededResponse(result: UsageCheckResult): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: result.reason ?? "Límite de uso excedido",
      code: "USAGE_LIMIT",
      usage: {
        used: result.used,
        limit: result.limit,
        plan: result.plan,
        remaining: result.remaining,
      },
    }),
    {
      status: 429,
      headers: {
        "Content-Type": "application/json",
        "X-Usage-Used": String(result.used),
        "X-Usage-Limit": String(result.limit),
        "X-Usage-Remaining": String(result.remaining),
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
