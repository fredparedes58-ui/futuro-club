/**
 * POST /api/team/decide-request
 * Un director aprueba o rechaza una solicitud de acceso a su club.
 *
 * Body: { requestId: string, decision: "approve" | "reject" }
 * Returns: { success, status }
 *
 * Al APROBAR crea el team_members (misma sink que _accept) incluyendo org_id
 * (que _accept histórico dejaba null → rompía la RLS de datos de la mig 038).
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { checkTeamQuota, quotaExceededResponse } from "../_lib/usageGuard";
import { isDirectorOfOrg } from "./_directorAuth";

export const config = { runtime: "edge" };

const DecideSchema = z.object({
  requestId: z.string().uuid("ID de solicitud inválido"),
  decision: z.enum(["approve", "reject"], { errorMap: () => ({ message: "Decisión inválida" }) }),
});

export default withHandler(
  { schema: DecideSchema, requireAuth: true, maxRequests: 30 },
  async ({ body, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const deciderId = userId!;
    const { requestId, decision } = body;

    // ── Cargar la solicitud ───────────────────────────────────────────
    const { data: request, error: findErr } = await supabase
      .from("access_requests")
      .select("id, org_owner_id, requester_id, requester_email, requested_role, status")
      .eq("id", requestId)
      .single();

    if (findErr || !request) {
      return errorResponse("Solicitud no encontrada", 404, "NOT_FOUND");
    }

    // ── Gate: quien decide debe ser director DE ESE club ──────────────
    const authorized = await isDirectorOfOrg(supabase, deciderId, request.org_owner_id);
    if (!authorized) {
      return errorResponse("Solo un director del club puede decidir esta solicitud", 403, "FORBIDDEN");
    }

    if (request.status !== "pending") {
      return errorResponse(`La solicitud ya fue ${request.status === "approved" ? "aprobada" : "rechazada"}`, 409, "ALREADY_DECIDED");
    }

    // ── Rechazar ──────────────────────────────────────────────────────
    if (decision === "reject") {
      await supabase
        .from("access_requests")
        .update({ status: "rejected", decided_at: new Date().toISOString(), decided_by: deciderId })
        .eq("id", requestId);

      try {
        await supabase.from("team_audit_log").insert({
          org_owner_id: request.org_owner_id,
          actor_id: deciderId,
          action: "access_rejected",
          target_member_id: request.requester_id,
        });
      } catch { /* best effort */ }

      return successResponse({ success: true, status: "rejected" });
    }

    // ── Aprobar: cupo de equipo del club ──────────────────────────────
    const teamQuota = await checkTeamQuota(request.org_owner_id);
    if (!teamQuota.allowed) return quotaExceededResponse(teamQuota);

    // org_id del club (organizations.owner_id === org_owner_id), para que la RLS
    // de datos (mig 038) scopee al miembro. Si el club no tiene org, queda null
    // (comportamiento previo) — no es bloqueante.
    const { data: org } = await supabase
      .from("organizations")
      .select("id")
      .eq("owner_id", request.org_owner_id)
      .maybeSingle();

    const { error: memberErr } = await supabase
      .from("team_members")
      .upsert(
        {
          org_owner_id: request.org_owner_id,
          member_id: request.requester_id,
          role: request.requested_role,
          org_id: org?.id ?? null,
        },
        { onConflict: "org_owner_id,member_id" },
      );

    if (memberErr) {
      return errorResponse(memberErr.message, 500);
    }

    await supabase
      .from("access_requests")
      .update({ status: "approved", decided_at: new Date().toISOString(), decided_by: deciderId })
      .eq("id", requestId);

    try {
      await supabase.from("team_audit_log").insert({
        org_owner_id: request.org_owner_id,
        actor_id: deciderId,
        action: "access_approved",
        target_member_id: request.requester_id,
        new_role: request.requested_role,
      });
    } catch { /* best effort */ }

    return successResponse({ success: true, status: "approved" });
  },
);
