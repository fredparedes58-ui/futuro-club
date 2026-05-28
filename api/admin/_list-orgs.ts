/**
 * GET /api/admin/list-orgs
 * Lists all organizations with owner email, plan, member count, and usage.
 * Auth: serviceOnly (ADMIN_SECRET / CRON_SECRET)
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const SUPABASE_URL = (process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL)!;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export default withHandler(
  { method: "GET", serviceOnly: true, maxRequests: 30 },
  async () => {
    if (!SUPABASE_URL || !SERVICE_KEY) {
      return errorResponse("Supabase not configured", 500);
    }

    const headers = {
      apikey: SERVICE_KEY,
      Authorization: `Bearer ${SERVICE_KEY}`,
    };

    const month = new Date().toISOString().slice(0, 7);

    // Fetch all user profiles (directors = org owners)
    let profiles: Array<{
      user_id: string;
      organization_name: string | null;
      role: string;
      profile_type: string | null;
    }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/user_profiles?select=user_id,organization_name,role,profile_type&order=created_at.desc`,
        { headers }
      );
      if (res.ok) profiles = await res.json();
    } catch { /* empty */ }

    // Fetch all subscriptions
    let subscriptions: Array<{ user_id: string; plan: string; status: string }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/subscriptions?select=user_id,plan,status`,
        { headers }
      );
      if (res.ok) subscriptions = await res.json();
    } catch { /* empty */ }

    // Fetch all analyses_used for current month
    let usageData: Array<{ user_id: string; count: number }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/analyses_used?month=eq.${month}&select=user_id,count`,
        { headers }
      );
      if (res.ok) usageData = await res.json();
    } catch { /* empty */ }

    // Fetch team member counts per org owner
    let teamMembers: Array<{ org_owner_id: string; member_id: string }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/rest/v1/team_members?select=org_owner_id,member_id`,
        { headers }
      );
      if (res.ok) teamMembers = await res.json();
    } catch { /* empty */ }

    // Fetch emails via auth.users (using RPC or direct)
    let emails: Array<{ id: string; email: string }> = [];
    try {
      const res = await fetch(
        `${SUPABASE_URL}/auth/v1/admin/users?per_page=1000`,
        {
          headers: {
            ...headers,
            Authorization: `Bearer ${SERVICE_KEY}`,
          },
        }
      );
      if (res.ok) {
        const data = await res.json();
        emails = (data.users ?? data ?? []).map((u: { id: string; email: string }) => ({
          id: u.id,
          email: u.email,
        }));
      }
    } catch { /* empty */ }

    // Build lookup maps
    const subMap = new Map(subscriptions.map(s => [s.user_id, s]));
    const usageMap = new Map(usageData.map(u => [u.user_id, u.count]));
    const emailMap = new Map(emails.map(e => [e.id, e.email]));

    // Count members per org owner
    const memberCountMap = new Map<string, number>();
    for (const tm of teamMembers) {
      memberCountMap.set(tm.org_owner_id, (memberCountMap.get(tm.org_owner_id) ?? 0) + 1);
    }

    // Build org list from profiles
    const orgs = profiles.map(p => {
      const sub = subMap.get(p.user_id);
      return {
        userId: p.user_id,
        email: emailMap.get(p.user_id) ?? "unknown",
        orgName: p.organization_name ?? "Sin nombre",
        role: p.role,
        profileType: p.profile_type,
        plan: sub?.plan ?? "free",
        status: sub?.status ?? "active",
        analysesUsed: usageMap.get(p.user_id) ?? 0,
        memberCount: memberCountMap.get(p.user_id) ?? 0,
      };
    });

    // Sort: directors first, then by org name
    orgs.sort((a, b) => {
      if (a.role === "director" && b.role !== "director") return -1;
      if (a.role !== "director" && b.role === "director") return 1;
      return a.orgName.localeCompare(b.orgName);
    });

    return successResponse({
      orgs,
      month,
      total: orgs.length,
    });
  }
);
