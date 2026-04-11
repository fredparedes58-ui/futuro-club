/**
 * VITAS Scout — Insights CRUD Endpoint
 * GET    /api/scout/insights — list insights (paginated, filtered)
 * PATCH  /api/scout/insights — mark as read/archived
 * DELETE /api/scout/insights — delete insight
 */
import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const PatchSchema = z.object({
  id: z.string().uuid(),
  is_read: z.boolean().optional(),
  is_archived: z.boolean().optional(),
});

const DeleteSchema = z.object({
  id: z.string().uuid(),
});

export default withHandler(
  { method: ["GET", "POST", "PATCH", "DELETE"], requireAuth: true, maxRequests: 60 },
  async ({ req, body, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503, "CONFIG_ERROR");
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };

    // ── GET: List insights ──────────────────────────────────────────────────
    if (req.method === "GET") {
      const url = new URL(req.url);
      const type = url.searchParams.get("type");
      const urgency = url.searchParams.get("urgency");
      const playerId = url.searchParams.get("playerId");
      const archived = url.searchParams.get("archived") === "true";
      const limit = Math.min(parseInt(url.searchParams.get("limit") ?? "20"), 50);
      const offset = parseInt(url.searchParams.get("offset") ?? "0");

      let queryUrl = `${supabaseUrl}/rest/v1/scout_insights?user_id=eq.${userId}`;
      queryUrl += `&is_archived=eq.${archived}`;
      if (type) queryUrl += `&insight_type=eq.${type}`;
      if (urgency) queryUrl += `&urgency=eq.${urgency}`;
      if (playerId) queryUrl += `&player_id=eq.${playerId}`;
      queryUrl += `&order=created_at.desc`;
      queryUrl += `&limit=${limit}&offset=${offset}`;

      const res = await fetch(queryUrl, {
        headers: { ...headers, Prefer: "count=exact" },
      });

      if (!res.ok) {
        return errorResponse("Failed to fetch insights", 500);
      }

      const insights = await res.json();
      const total = parseInt(res.headers.get("content-range")?.split("/")[1] ?? "0");

      // Count unread
      const unreadUrl = `${supabaseUrl}/rest/v1/scout_insights?user_id=eq.${userId}&is_read=eq.false&is_archived=eq.false&select=id`;
      const unreadRes = await fetch(unreadUrl, {
        headers: { ...headers, Prefer: "count=exact" },
      });
      const unreadTotal = parseInt(unreadRes.headers.get("content-range")?.split("/")[1] ?? "0");

      return successResponse({
        insights,
        total,
        unread: unreadTotal,
        limit,
        offset,
      });
    }

    // ── PATCH: Update insight (read/archive) ────────────────────────────────
    if (req.method === "PATCH") {
      const parsed = PatchSchema.safeParse(body);
      if (!parsed.success) {
        return errorResponse("Invalid body: " + parsed.error.message, 400);
      }

      const updates: Record<string, unknown> = {};
      if (parsed.data.is_read !== undefined) updates.is_read = parsed.data.is_read;
      if (parsed.data.is_archived !== undefined) updates.is_archived = parsed.data.is_archived;

      const res = await fetch(
        `${supabaseUrl}/rest/v1/scout_insights?id=eq.${parsed.data.id}&user_id=eq.${userId}`,
        {
          method: "PATCH",
          headers: { ...headers, Prefer: "return=representation" },
          body: JSON.stringify(updates),
        },
      );

      if (!res.ok) {
        return errorResponse("Failed to update insight", 500);
      }

      const updated = await res.json();
      return successResponse(updated);
    }

    // ── DELETE: Remove insight ───────────────────────────────────────────────
    if (req.method === "DELETE") {
      let deleteBody = body;
      if (!deleteBody || typeof deleteBody !== "object") {
        try { deleteBody = await req.json(); } catch { /* empty */ }
      }

      const parsed = DeleteSchema.safeParse(deleteBody);
      if (!parsed.success) {
        return errorResponse("Invalid body: need {id}", 400);
      }

      const res = await fetch(
        `${supabaseUrl}/rest/v1/scout_insights?id=eq.${parsed.data.id}&user_id=eq.${userId}`,
        { method: "DELETE", headers },
      );

      if (!res.ok) {
        return errorResponse("Failed to delete insight", 500);
      }

      return successResponse({ deleted: true });
    }

    // POST = redirect to generate endpoint (convenience)
    if (req.method === "POST") {
      return errorResponse("Use POST /api/scout/generate to create insights", 400);
    }

    return errorResponse("Method not allowed", 405);
  },
);
