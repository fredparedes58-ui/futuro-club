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
 *
 * Fase 3: Added team member + player quota checks, getUserPlan() helper.
 */

// ── Plan limits (mirrors frontend PLAN_LIMITS) ─────────────────────────────

export interface PlanLimit {
  analyses: number;
  players: number;
  teamMembers: number;
  injuryPrediction: boolean;
  valuation: boolean;
  multiVideoAggregation: boolean;
}

export const PLAN_LIMITS: Record<string, PlanLimit> = {
  free:  { analyses: 3,    players: 5,    teamMembers: 2,  injuryPrediction: false, valuation: false, multiVideoAggregation: false },
  pro:   { analyses: 20,   players: 25,   teamMembers: 5,  injuryPrediction: true,  valuation: true,  multiVideoAggregation: false },
  club:  { analyses: 9999, players: 9999, teamMembers: 50, injuryPrediction: true,  valuation: true,  multiVideoAggregation: true  },
};

const DEFAULT_LIMIT: PlanLimit = { analyses: 3, players: 5, teamMembers: 2, injuryPrediction: false, valuation: false, multiVideoAggregation: false };

// ── Admin bypass list ───────────────────────────────────────────────────────

const ADMIN_EMAILS = new Set([
  "fredparedes58@gmail.com",
]);

// ── Supabase helpers (reusable across guards) ──────────────────────────────

function getSupabaseConfig() {
  const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
  const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!sbUrl || !sbKey) return null;
  return {
    url: sbUrl,
    headers: {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      "Content-Type": "application/json",
    },
  };
}

// ── Types ───────────────────────────────────────────────────────────────────

export interface UsageCheckResult {
  allowed: boolean;
  used: number;
  limit: number;
  plan: string;
  remaining: number;
  reason?: string;
}

export interface TeamQuotaResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
  reason?: string;
}

export interface PlayerQuotaResult {
  allowed: boolean;
  current: number;
  limit: number;
  plan: string;
  reason?: string;
}

// ── getUserPlan (reusable) ─────────────────────────────────────────────────

/**
 * Reads user's active plan from subscriptions table.
 * Returns "free" as fallback.
 */
export async function getUserPlan(userId: string): Promise<string> {
  const sb = getSupabaseConfig();
  if (!sb) return "free";

  try {
    const res = await fetch(
      `${sb.url}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status&limit=1`,
      { headers: sb.headers }
    );
    if (res.ok) {
      const rows = await res.json() as Array<{ plan: string; status: string }>;
      const active = rows.find(r => r.status === "active" || r.status === "trialing");
      if (active) return active.plan;
    }
  } catch { /* fallback to free */ }

  return "free";
}

/**
 * Checks if a userId belongs to an admin (bypasses all limits).
 */
export async function isAdminUser(userId: string): Promise<boolean> {
  const sb = getSupabaseConfig();
  if (!sb) return false;

  try {
    const res = await fetch(
      `${sb.url}/rest/v1/rpc/get_user_email`,
      {
        method: "POST",
        headers: sb.headers,
        body: JSON.stringify({ p_user_id: userId }),
      }
    );
    if (res.ok) {
      const email = await res.text();
      return ADMIN_EMAILS.has(email.replace(/"/g, ""));
    }
  } catch { /* not critical */ }

  return false;
}

// ── Analysis quota guard ───────────────────────────────────────────────────

export async function checkUsageQuota(userId: string): Promise<UsageCheckResult> {
  const sb = getSupabaseConfig();

  if (!sb) {
    // No Supabase → allow (offline/dev mode)
    return { allowed: true, used: 0, limit: 9999, plan: "dev", remaining: 9999 };
  }

  const plan = await getUserPlan(userId);

  // Admin bypass
  if (await isAdminUser(userId)) {
    return { allowed: true, used: 0, limit: 9999, plan: "admin", remaining: 9999 };
  }

  const limits = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  // Get current month usage
  const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
  let used = 0;
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/analyses_used?user_id=eq.${userId}&month=eq.${month}&select=count`,
      { headers: sb.headers }
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
      reason: `Límite mensual alcanzado (${used}/${limits.analyses}). Upgrade tu plan para continuar.`,
    };
  }

  return { allowed: true, used, limit: limits.analyses, plan, remaining };
}

// ── Team member quota guard ────────────────────────────────────────────────

/**
 * Checks if the org owner can add more team members under their plan.
 * orgOwnerId = the director/owner of the organization.
 */
export async function checkTeamQuota(orgOwnerId: string): Promise<TeamQuotaResult> {
  const sb = getSupabaseConfig();
  if (!sb) return { allowed: true, current: 0, limit: 9999, plan: "dev" };

  if (await isAdminUser(orgOwnerId)) {
    return { allowed: true, current: 0, limit: 9999, plan: "admin" };
  }

  const plan = await getUserPlan(orgOwnerId);
  const limits = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  // Count current team members
  let current = 0;
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/team_members?org_owner_id=eq.${orgOwnerId}&select=member_id`,
      { headers: sb.headers }
    );
    if (res.ok) {
      const rows = await res.json() as Array<unknown>;
      current = rows.length;
    }
  } catch { /* assume 0 */ }

  if (current >= limits.teamMembers) {
    return {
      allowed: false,
      current,
      limit: limits.teamMembers,
      plan,
      reason: `Límite de miembros alcanzado (${current}/${limits.teamMembers}). Upgrade a ${plan === "free" ? "Pro" : "Club"} para añadir más.`,
    };
  }

  return { allowed: true, current, limit: limits.teamMembers, plan };
}

// ── Player quota guard ─────────────────────────────────────────────────────

/**
 * Checks if the user can add more players under their plan.
 * Counts players in the user's tenant.
 */
export async function checkPlayerQuota(userId: string): Promise<PlayerQuotaResult> {
  const sb = getSupabaseConfig();
  if (!sb) return { allowed: true, current: 0, limit: 9999, plan: "dev" };

  if (await isAdminUser(userId)) {
    return { allowed: true, current: 0, limit: 9999, plan: "admin" };
  }

  const plan = await getUserPlan(userId);
  const limits = PLAN_LIMITS[plan] ?? DEFAULT_LIMIT;

  // Count players where user_id matches (tenant scoping)
  let current = 0;
  try {
    const res = await fetch(
      `${sb.url}/rest/v1/players?user_id=eq.${userId}&select=id`,
      { headers: sb.headers }
    );
    if (res.ok) {
      const rows = await res.json() as Array<unknown>;
      current = rows.length;
    }
  } catch { /* assume 0 */ }

  if (current >= limits.players) {
    return {
      allowed: false,
      current,
      limit: limits.players,
      plan,
      reason: `Límite de jugadores alcanzado (${current}/${limits.players}). Upgrade tu plan para añadir más.`,
    };
  }

  return { allowed: true, current, limit: limits.players, plan };
}

// ── Increment usage ─────────────────────────────────────────────────────────

export async function incrementUsage(userId: string, endpoint: string): Promise<void> {
  const sb = getSupabaseConfig();
  if (!sb) return;

  const month = new Date().toISOString().slice(0, 7);

  // Upsert analyses_used (increment count)
  try {
    // First get current count
    const getRes = await fetch(
      `${sb.url}/rest/v1/analyses_used?user_id=eq.${userId}&month=eq.${month}&select=count`,
      { headers: { apikey: sb.headers.apikey, Authorization: sb.headers.Authorization } }
    );
    let currentCount = 0;
    if (getRes.ok) {
      const rows = await getRes.json() as Array<{ count: number }>;
      if (rows.length > 0) currentCount = rows[0].count;
    }

    await fetch(`${sb.url}/rest/v1/analyses_used`, {
      method: "POST",
      headers: { ...sb.headers, Prefer: "resolution=merge-duplicates" },
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
    await fetch(`${sb.url}/rest/v1/usage_log`, {
      method: "POST",
      headers: sb.headers,
      body: JSON.stringify({
        user_id: userId,
        endpoint,
        month,
        created_at: new Date().toISOString(),
      }),
    });
  } catch { /* non-blocking — table may not exist yet */ }
}

// ── Response helpers ───────────────────────────────────────────────────────

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

export function quotaExceededResponse(result: TeamQuotaResult | PlayerQuotaResult): Response {
  return new Response(
    JSON.stringify({
      ok: false,
      error: result.reason ?? "Límite alcanzado",
      code: "QUOTA_EXCEEDED",
      quota: {
        current: result.current,
        limit: result.limit,
        plan: result.plan,
      },
    }),
    {
      status: 403,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
    }
  );
}
