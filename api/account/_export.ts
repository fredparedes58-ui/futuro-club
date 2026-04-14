/**
 * VITAS · GET /api/account/export
 * GDPR Art. 20 — Data portability: exports ALL user data from Supabase as JSON.
 * Rate limited to prevent abuse.
 */

import { withHandler } from "../_lib/withHandler";
import { errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

/** Tables to export with their user_id column name. */
const EXPORT_TABLES = [
  { table: "user_profiles", column: "user_id" },
  { table: "players", column: "user_id" },
  { table: "player_analyses", column: "user_id" },
  { table: "scout_insights", column: "user_id" },
  { table: "team_analyses", column: "user_id" },
  { table: "subscriptions", column: "user_id" },
  { table: "analyses_used", column: "user_id" },
  { table: "usage_log", column: "user_id" },
  { table: "team_members", column: "user_id" },
  { table: "push_subscriptions", column: "user_id" },
  { table: "notification_preferences", column: "user_id" },
  { table: "notification_log", column: "user_id" },
  { table: "tracking_sessions", column: "user_id" },
  { table: "legal_acceptances", column: "user_id" },
] as const;

export default withHandler(
  { method: ["GET", "POST"], requireAuth: true, maxRequests: 3, windowMs: 300_000 },
  async ({ userId }) => {
    const sbUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const sbKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!sbUrl || !sbKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const headers = {
      apikey: sbKey,
      Authorization: `Bearer ${sbKey}`,
    };

    const exportData: Record<string, unknown> = {
      exportedAt: new Date().toISOString(),
      userId,
      format: "GDPR_DATA_EXPORT_v1",
      tables: {},
    };

    const errors: string[] = [];

    // Fetch all tables in parallel
    const results = await Promise.allSettled(
      EXPORT_TABLES.map(async ({ table, column }) => {
        try {
          const res = await fetch(
            `${sbUrl}/rest/v1/${table}?${column}=eq.${userId}&order=created_at.desc.nullsfirst`,
            { headers },
          );
          if (res.ok) {
            const rows = await res.json();
            return { table, rows };
          }
          if (res.status === 404) {
            // Table doesn't exist yet — skip silently
            return { table, rows: [] };
          }
          errors.push(`${table}: HTTP ${res.status}`);
          return { table, rows: [] };
        } catch (err) {
          errors.push(`${table}: ${err instanceof Error ? err.message : "fetch error"}`);
          return { table, rows: [] };
        }
      }),
    );

    const tables: Record<string, unknown[]> = {};
    for (const result of results) {
      if (result.status === "fulfilled") {
        tables[result.value.table] = result.value.rows as unknown[];
      }
    }

    exportData.tables = tables;
    if (errors.length > 0) {
      exportData.warnings = errors;
    }

    // Return as downloadable JSON
    const json = JSON.stringify(exportData, null, 2);

    return new Response(json, {
      status: 200,
      headers: {
        "Content-Type": "application/json",
        "Content-Disposition": `attachment; filename="vitas-gdpr-export-${new Date().toISOString().slice(0, 10)}.json"`,
        "Access-Control-Allow-Origin": "*",
      },
    });
  },
);
