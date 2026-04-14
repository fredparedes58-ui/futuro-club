/**
 * VITAS — Notification History Endpoint
 * GET /api/notifications/history?limit=20&offset=0
 *
 * Returns in-app notification history for the authenticated user.
 */
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

export default withHandler(
  { method: "GET", requireAuth: true, maxRequests: 30 },
  async ({ req, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    const url = new URL(req.url);
    const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
    const offset = parseInt(url.searchParams.get("offset") ?? "0");

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
      Prefer: "count=exact",
    };

    const res = await fetch(
      `${supabaseUrl}/rest/v1/notification_history?user_id=eq.${userId}&order=created_at.desc&limit=${limit}&offset=${offset}&select=id,type,title,body,player_id,read,created_at`,
      { headers },
    );

    if (!res.ok) {
      return successResponse({ items: [], total: 0 });
    }

    const items = await res.json();
    const total = parseInt(res.headers.get("content-range")?.split("/")?.[1] ?? "0");

    return successResponse({ items, total });
  },
);
