/**
 * PATCH /api/team/update-role
 * Updates a team member's role. Only directors can perform this action.
 *
 * Body: { memberId: string, role: "scout" | "coach" | "viewer" }
 * Returns: { success: true, memberId, role }
 *
 * Security: API-level permission validation (not just RLS)
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const UpdateRoleSchema = z.object({
  memberId: z.string().uuid("ID de miembro inválido"),
  role: z.enum(["scout", "coach", "viewer"], {
    errorMap: () => ({ message: "Rol inválido. Opciones: scout, coach, viewer" }),
  }),
});

export default withHandler(
  { schema: UpdateRoleSchema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { memberId, role } = body;

    // ── API-level permission check: verify caller is director ─────────
    const { data: callerProfile } = await supabase
      .from("user_profiles")
      .select("role")
      .eq("user_id", userId)
      .single();

    if (!callerProfile || callerProfile.role !== "director") {
      return errorResponse("Solo directores pueden cambiar roles de equipo", 403, "FORBIDDEN");
    }

    // ── Verify the member exists in caller's team ─────────────────────
    const { data: member, error: findError } = await supabase
      .from("team_members")
      .select("id, member_id, role, org_owner_id")
      .eq("org_owner_id", userId)
      .eq("member_id", memberId)
      .single();

    if (findError || !member) {
      return errorResponse("Miembro no encontrado en tu equipo", 404, "NOT_FOUND");
    }

    // ── Prevent changing own role ─────────────────────────────────────
    if (memberId === userId) {
      return errorResponse("No puedes cambiar tu propio rol", 400, "SELF_UPDATE");
    }

    const previousRole = member.role;

    // ── Update the role ──────────────────────────────────────────────
    const { error: updateError } = await supabase
      .from("team_members")
      .update({ role })
      .eq("org_owner_id", userId)
      .eq("member_id", memberId);

    if (updateError) {
      return errorResponse(`Error actualizando rol: ${updateError.message}`, 500);
    }

    // ── Audit log ────────────────────────────────────────────────────
    await supabase.from("team_audit_log").insert({
      org_owner_id: userId,
      actor_id: userId,
      action: "role_change",
      target_member_id: memberId,
      previous_role: previousRole,
      new_role: role,
    }).catch(() => {}); // Best effort

    return successResponse({
      success: true,
      memberId,
      previousRole,
      role,
    });
  },
);
