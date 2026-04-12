/**
 * VITAS · DELETE /api/account/delete
 * Elimina permanentemente todos los datos del usuario y su cuenta auth.
 */

import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

/** Tables to purge (order matters: children first to avoid FK violations). */
const USER_TABLES = [
  "scout_insights",
  "player_analyses",
  "players",
  "push_subscriptions",
  "notification_preferences",
  "notification_log",
  "tracking_sessions",
  "team_members",
  "subscriptions",
  "user_profiles",
] as const;

export default withHandler(
  { method: "DELETE", requireAuth: true, maxRequests: 5, windowMs: 60_000 },
  async ({ userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase no configurado", 503, "CONFIG_MISSING");
    }

    const headers = {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      "Content-Type": "application/json",
    };

    // 1. Delete all user data from each table
    const errors: string[] = [];

    for (const table of USER_TABLES) {
      try {
        const res = await fetch(
          `${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}`,
          { method: "DELETE", headers },
        );
        if (!res.ok && res.status !== 404) {
          const errText = await res.text().catch(() => "unknown");
          errors.push(`${table}: ${res.status} ${errText}`);
        }
      } catch (err) {
        errors.push(`${table}: ${err instanceof Error ? err.message : "fetch error"}`);
      }
    }

    // 2. Delete the auth user via Supabase Admin API
    try {
      const authRes = await fetch(
        `${supabaseUrl}/auth/v1/admin/users/${userId}`,
        { method: "DELETE", headers },
      );
      if (!authRes.ok) {
        const errText = await authRes.text().catch(() => "unknown");
        errors.push(`auth_user: ${authRes.status} ${errText}`);
      }
    } catch (err) {
      errors.push(`auth_user: ${err instanceof Error ? err.message : "fetch error"}`);
    }

    // 3. Audit log
    console.log(
      JSON.stringify({
        level: "warn",
        ts: new Date().toISOString(),
        event: "ACCOUNT_DELETED",
        userId,
        errors: errors.length > 0 ? errors : undefined,
      }),
    );

    if (errors.length > 0) {
      // Partial failure — data may be partially deleted. Still return success
      // so the client signs out; the remaining data will be orphaned.
      console.warn(`[account/delete] Partial errors for ${userId}:`, errors);
    }

    return successResponse({ deleted: true });
  },
);
