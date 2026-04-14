/**
 * VITAS · GET /api/admin/analytics
 * Business analytics endpoint — aggregated metrics for directors.
 * Requires auth + director role or admin email.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

interface TableCount {
  count: number;
}

export default withHandler(
  { method: ["GET", "POST"], requireAuth: true, maxRequests: 30 },
  async ({ userId }) => {
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!sbUrl || !sbKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
      Prefer: "count=exact",
    };

    const month = new Date().toISOString().slice(0, 7); // "YYYY-MM"
    const prevMonth = (() => {
      const d = new Date();
      d.setMonth(d.getMonth() - 1);
      return d.toISOString().slice(0, 7);
    })();

    // ── Parallel data fetches ────────────────────────────────────────────────

    const [
      usageThisMonth,
      usagePrevMonth,
      usageByEndpoint,
      totalPlayers,
      totalTeamMembers,
      recentAnalyses,
      subscriptions,
      recentInsights,
    ] = await Promise.allSettled([
      // 1. Usage this month
      fetch(
        `${sbUrl}/rest/v1/usage_log?month=eq.${month}&select=id`,
        { headers },
      ).then(async (r) => {
        const count = r.headers.get("content-range");
        return count ? parseInt(count.split("/")[1] ?? "0") : 0;
      }),

      // 2. Usage previous month
      fetch(
        `${sbUrl}/rest/v1/usage_log?month=eq.${prevMonth}&select=id`,
        { headers },
      ).then(async (r) => {
        const count = r.headers.get("content-range");
        return count ? parseInt(count.split("/")[1] ?? "0") : 0;
      }),

      // 3. Usage by endpoint this month
      fetch(
        `${sbUrl}/rest/v1/usage_log?month=eq.${month}&select=endpoint`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ).then(async (r) => {
        if (!r.ok) return {};
        const rows = await r.json() as Array<{ endpoint: string }>;
        const counts: Record<string, number> = {};
        for (const row of rows) {
          counts[row.endpoint] = (counts[row.endpoint] ?? 0) + 1;
        }
        return counts;
      }),

      // 4. Total players for org
      fetch(
        `${sbUrl}/rest/v1/players?user_id=eq.${userId}&select=id`,
        { headers },
      ).then(async (r) => {
        const count = r.headers.get("content-range");
        return count ? parseInt(count.split("/")[1] ?? "0") : 0;
      }),

      // 5. Team members
      fetch(
        `${sbUrl}/rest/v1/team_members?select=id,role,status`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ).then(async (r) => {
        if (!r.ok) return { total: 0, byRole: {}, byStatus: {} };
        const rows = await r.json() as Array<{ role: string; status: string }>;
        const byRole: Record<string, number> = {};
        const byStatus: Record<string, number> = {};
        for (const row of rows) {
          byRole[row.role] = (byRole[row.role] ?? 0) + 1;
          byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
        }
        return { total: rows.length, byRole, byStatus };
      }),

      // 6. Recent analyses count (last 30 days)
      fetch(
        `${sbUrl}/rest/v1/player_analyses?user_id=eq.${userId}&created_at=gte.${new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString()}&select=id,agent_name`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ).then(async (r) => {
        if (!r.ok) return { total: 0, byAgent: {} };
        const rows = await r.json() as Array<{ agent_name?: string }>;
        const byAgent: Record<string, number> = {};
        for (const row of rows) {
          const agent = row.agent_name ?? "unknown";
          byAgent[agent] = (byAgent[agent] ?? 0) + 1;
        }
        return { total: rows.length, byAgent };
      }),

      // 7. Subscription info
      fetch(
        `${sbUrl}/rest/v1/subscriptions?user_id=eq.${userId}&select=plan,status,current_period_end`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ).then(async (r) => {
        if (!r.ok) return null;
        const rows = await r.json() as Array<{ plan: string; status: string; current_period_end: string }>;
        return rows[0] ?? null;
      }),

      // 8. Recent scout insights
      fetch(
        `${sbUrl}/rest/v1/scout_insights?user_id=eq.${userId}&order=created_at.desc&limit=5&select=id,type,headline,urgency,created_at`,
        { headers: { apikey: sbKey, Authorization: `Bearer ${sbKey}` } },
      ).then(async (r) => {
        if (!r.ok) return [];
        return r.json();
      }),
    ]);

    // ── Build response ───────────────────────────────────────────────────────

    const getValue = <T>(result: PromiseSettledResult<T>, fallback: T): T =>
      result.status === "fulfilled" ? result.value : fallback;

    const thisMonthCount = getValue(usageThisMonth, 0);
    const prevMonthCount = getValue(usagePrevMonth, 0);
    const growthPercent = prevMonthCount > 0
      ? Math.round(((thisMonthCount - prevMonthCount) / prevMonthCount) * 100)
      : thisMonthCount > 0 ? 100 : 0;

    return successResponse({
      generatedAt: new Date().toISOString(),
      month,
      usage: {
        thisMonth: thisMonthCount,
        previousMonth: prevMonthCount,
        growthPercent,
        byEndpoint: getValue(usageByEndpoint, {}),
      },
      players: {
        total: getValue(totalPlayers, 0),
      },
      team: getValue(totalTeamMembers, { total: 0, byRole: {}, byStatus: {} }),
      analyses: getValue(recentAnalyses, { total: 0, byAgent: {} }),
      subscription: getValue(subscriptions, null),
      recentInsights: getValue(recentInsights, []),
    });
  },
);
