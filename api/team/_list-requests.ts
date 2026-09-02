/**
 * GET /api/team/list-requests
 * Lista las solicitudes de acceso PENDIENTES del club del director que llama.
 * Sirve al panel de director para aprobar/rechazar (/api/team/decide-request).
 *
 * Returns: { requests: [{ id, requesterId, requesterEmail, requestedRole, message, createdAt }] }
 */

import { createClient } from "@supabase/supabase-js";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

export default withHandler(
  { method: "GET", requireAuth: true, maxRequests: 30 },
  async ({ userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);

    // Resolver el club (org_owner_id) del que el que llama es director:
    // 1) director dueño (user_profiles.role=director → su club es él mismo), o
    // 2) director-miembro de otro club (team_members role=director).
    let orgOwnerId: string | null = null;
    const { data: prof } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();

    if (prof?.role === "director") {
      orgOwnerId = userId;
    } else {
      const { data: tm } = await supabase
        .from("team_members")
        .select("org_owner_id")
        .eq("member_id", userId)
        .eq("role", "director")
        .maybeSingle();
      orgOwnerId = (tm?.org_owner_id as string | undefined) ?? null;
    }

    if (!orgOwnerId) {
      return errorResponse("No eres director de ningún club", 403, "FORBIDDEN");
    }

    const { data: rows, error } = await supabase
      .from("access_requests")
      .select("id, requester_id, requester_email, requested_role, message, created_at")
      .eq("org_owner_id", orgOwnerId)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) {
      return errorResponse(error.message, 500);
    }

    const requests = (rows ?? []).map((r) => ({
      id: r.id,
      requesterId: r.requester_id,
      requesterEmail: r.requester_email,
      requestedRole: r.requested_role,
      message: r.message,
      createdAt: r.created_at,
    }));

    return successResponse({ requests });
  },
);
