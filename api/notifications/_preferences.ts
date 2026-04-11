/**
 * VITAS — Notification Preferences Endpoint
 * GET  /api/notifications/preferences — get user preferences
 * POST /api/notifications/preferences — update user preferences
 *
 * Syncs notification preferences to Supabase so the cron job respects them.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const PreferencesSchema = z.object({
  rendimiento_bajo: z.boolean().optional(),
  inactividad: z.boolean().optional(),
  limite_plan: z.boolean().optional(),
  analisis_completado: z.boolean().optional(),
});

const DEFAULT_PREFS = {
  rendimiento_bajo: true,
  inactividad: true,
  limite_plan: true,
  analisis_completado: true,
};

export default withHandler(
  { method: ["GET", "POST"], schema: PreferencesSchema, requireAuth: true, maxRequests: 20 },
  async ({ req, body, userId }) => {
    const supabaseUrl = process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.VITE_SUPABASE_ANON_KEY;

    if (!supabaseUrl || !supabaseKey) {
      return errorResponse("Supabase not configured", 503);
    }

    const headers = {
      apikey: supabaseKey,
      Authorization: `Bearer ${supabaseKey}`,
      "Content-Type": "application/json",
    };
    const base = `${supabaseUrl}/rest/v1`;

    if (req.method === "GET") {
      const res = await fetch(
        `${base}/notification_preferences?user_id=eq.${userId}&select=*`,
        { headers }
      );

      if (!res.ok) {
        return successResponse(DEFAULT_PREFS);
      }

      const rows = await res.json();
      if (!rows || rows.length === 0) {
        return successResponse(DEFAULT_PREFS);
      }

      const prefs = rows[0];
      return successResponse({
        rendimiento_bajo: prefs.rendimiento_bajo ?? true,
        inactividad: prefs.inactividad ?? true,
        limite_plan: prefs.limite_plan ?? true,
        analisis_completado: prefs.analisis_completado ?? true,
      });
    }

    // POST: upsert preferences
    let postBody = body;
    if (!postBody || typeof postBody !== "object") {
      try { postBody = await req.json(); } catch { return errorResponse("Invalid JSON", 400); }
    }

    const parsed = PreferencesSchema.safeParse(postBody);
    if (!parsed.success) {
      return errorResponse("Invalid preferences", 400);
    }

    const upsertData = {
      user_id: userId,
      ...parsed.data,
      updated_at: new Date().toISOString(),
    };

    const res = await fetch(`${base}/notification_preferences`, {
      method: "POST",
      headers: { ...headers, "Prefer": "resolution=merge-duplicates,return=representation" },
      body: JSON.stringify(upsertData),
    });

    if (!res.ok) {
      const errText = await res.text();
      return errorResponse(`Failed to save preferences: ${errText.slice(0, 200)}`, 500);
    }

    return successResponse({ success: true, ...parsed.data });
  },
);
