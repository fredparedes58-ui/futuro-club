/**
 * POST /api/team/accept
 * Acepta una invitación por token y crea el registro en team_members.
 *
 * Body: { token }
 * Returns: { success, role, orgOwnerId }
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

export const config = { runtime: "edge" };

const AcceptSchema = z.object({
  token: z.string().min(1, "Token es requerido"),
});

export default withHandler(
  { schema: AcceptSchema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const { token } = body;

    // Buscar invitación válida
    const { data: invitation, error: findError } = await supabase
      .from("team_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .single();

    if (findError || !invitation) {
      return errorResponse("Invitación no encontrada o ya utilizada", 404);
    }

    // Verificar que no haya expirado
    if (new Date(invitation.expires_at) < new Date()) {
      await supabase
        .from("team_invitations")
        .update({ status: "expired" })
        .eq("id", invitation.id);
      return errorResponse("La invitación ha expirado", 410);
    }

    // Crear miembro del equipo (ignorar conflicto si ya existe)
    const { error: memberError } = await supabase
      .from("team_members")
      .upsert({
        org_owner_id: invitation.org_owner_id,
        member_id: userId,
        role: invitation.role,
      }, { onConflict: "org_owner_id,member_id" });

    if (memberError) {
      return errorResponse(memberError.message, 500);
    }

    // Marcar invitación como aceptada
    await supabase
      .from("team_invitations")
      .update({ status: "accepted" })
      .eq("id", invitation.id);

    // ── Audit log ────────────────────────────────────────────────────
    await supabase.from("team_audit_log").insert({
      org_owner_id: invitation.org_owner_id,
      actor_id: userId,
      action: "invite_accepted",
      target_member_id: userId,
      new_role: invitation.role,
    }).catch(() => {}); // Best effort

    return successResponse({
      success: true,
      role: invitation.role,
      orgOwnerId: invitation.org_owner_id,
    });
  },
);
