/**
 * GET /api/admin/list-users
 * Lists all users with their plan, usage, role, and org info.
 * Supports pagination via limit/offset query params.
 * Auth: adminOnly — JWT de un admin de plataforma (email en ADMIN_EMAILS).
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default withHandler(
  { method: "GET", requireAuth: true, adminOnly: true, maxRequests: 30 },
  async ({ query }) => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse("Supabase not configured", 500);
    }

    const limit = Math.min(100, parseInt(query.limit ?? "50", 10));
    const offset = parseInt(query.offset ?? "0", 10);
    const month = new Date().toISOString().slice(0, 7);

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    // Fetch auth users (paginated)
    let users: Array<{ id: string; email: string; created_at: string; last_sign_in_at: string | null }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?page=${Math.floor(offset / limit) + 1}&per_page=${limit}`,
        { headers: { ...headers, Authorization: `Bearer ${SERVICE_KEY}` } }
      );
      if (res.ok) {
        const data = await res.json();
        users = (data.users ?? data ?? []).map((u: Record<string, unknown>) => ({
          id: u.id as string,
          email: u.email as string,
          created_at: u.created_at as string,
          last_sign_in_at: u.last_sign_in_at as string | null,
        }));
      }
    } catch { /* empty */ }

    if (users.length === 0) {
      return successResponse({ users: [], total: 0, limit, offset, month });
    }

    const userIds = users.map(u => u.id);

    // Fetch profiles
    let profiles: Array<{ user_id: string; role: string; organization_name: string | null; profile_type: string | null }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?user_id=in.(${userIds.join(",")})&select=user_id,role,organization_name,profile_type`,
        { headers }
      );
      if (res.ok) profiles = await res.json();
    } catch { /* empty */ }

    // Fetch subscriptions
    let subs: Array<{ user_id: string; plan: string; status: string }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?user_id=in.(${userIds.join(",")})&select=user_id,plan,status`,
        { headers }
      );
      if (res.ok) subs = await res.json();
    } catch { /* empty */ }

    // Fetch usage
    let usage: Array<{ user_id: string; count: number }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/analyses_used?user_id=in.(${userIds.join(",")})&month=eq.${month}&select=user_id,count`,
        { headers }
      );
      if (res.ok) usage = await res.json();
    } catch { /* empty */ }

    // Build lookups
    const profileMap = new Map(profiles.map(p => [p.user_id, p]));
    const subMap = new Map(subs.map(s => [s.user_id, s]));
    const usageMap = new Map(usage.map(u => [u.user_id, u.count]));

    const result = users.map(u => {
      const profile = profileMap.get(u.id);
      const sub = subMap.get(u.id);
      return {
        userId: u.id,
        email: u.email,
        createdAt: u.created_at,
        lastSignIn: u.last_sign_in_at,
        role: profile?.role ?? "viewer",
        orgName: profile?.organization_name ?? null,
        profileType: profile?.profile_type ?? null,
        plan: sub?.plan ?? "free",
        status: sub?.status ?? "active",
        analysesUsed: usageMap.get(u.id) ?? 0,
      };
    });

    return successResponse({
      users: result,
      total: result.length,
      limit,
      offset,
      month,
    });
  }
);
