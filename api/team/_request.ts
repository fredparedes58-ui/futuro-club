/**
 * POST /api/team/request-access
 * Un usuario solicita unirse a un club identificándolo por su join_code.
 * Crea (o reabre) una fila en access_requests y notifica al director por email.
 *
 * Body: { code: string, message?: string }
 * Returns: { success, orgName }
 *
 * NO añade al equipo — eso lo hace el director al aprobar (/api/team/decide-request).
 */

import { z } from "zod";
import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";

// Node.js runtime — Resend SDK usa APIs de Node.
// export const config = { runtime: "edge" };

const RequestSchema = z.object({
  code: z.string().trim().min(4, "Código inválido").max(64),
  message: z.string().max(500).optional(),
});

export default withHandler(
  { schema: RequestSchema, requireAuth: true, maxRequests: 10 },
  async ({ req, body, userId }) => {
    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    const resendKey = process.env.RESEND_API_KEY;

    if (!supabaseUrl || !serviceKey) {
      return errorResponse("Supabase not configured", 500);
    }

    const supabase = createClient(supabaseUrl, serviceKey);
    const requesterId = userId!;
    const { code, message } = body;

    // ── Resolver el club por join_code (director) ─────────────────────
    // user_profiles NO tiene email/display_name (solo role/organization_name);
    // el email va en auth.users → se obtiene con el admin API más abajo.
    const { data: club } = await supabase
      .from("user_profiles")
      .select("user_id, role, organization_name")
      .eq("join_code", code)
      .eq("role", "director")
      .maybeSingle();

    if (!club) {
      return errorResponse("Código de club no válido", 404, "INVALID_CODE");
    }

    const orgOwnerId = club.user_id as string;

    // No puedes solicitar acceso a tu propio club.
    if (orgOwnerId === requesterId) {
      return errorResponse("Ya eres el director de este club", 400, "SELF_REQUEST");
    }

    // Si ya es miembro, no crear solicitud.
    const { data: alreadyMember } = await supabase
      .from("team_members")
      .select("id")
      .eq("org_owner_id", orgOwnerId)
      .eq("member_id", requesterId)
      .maybeSingle();
    if (alreadyMember) {
      return errorResponse("Ya perteneces a este club", 409, "ALREADY_MEMBER");
    }

    // Datos del solicitante (email + nombre) desde auth.users (admin API):
    // el email vive ahí, y el nombre en user_metadata.display_name (lo fija signUp).
    const { data: reqUser } = await supabase.auth.admin.getUserById(requesterId);
    const requesterEmail: string | null = reqUser?.user?.email ?? null;
    const requesterName: string =
      (reqUser?.user?.user_metadata?.display_name as string | undefined) ??
      requesterEmail ??
      "Un usuario";

    // ── Upsert de la solicitud (re-solicitar reabre a pending) ────────
    const { error: upsertErr } = await supabase
      .from("access_requests")
      .upsert(
        {
          org_owner_id: orgOwnerId,
          requester_id: requesterId,
          requester_email: requesterEmail,
          message: message ?? null,
          status: "pending",
          decided_at: null,
          decided_by: null,
        },
        { onConflict: "org_owner_id,requester_id" },
      );

    if (upsertErr) {
      return errorResponse(upsertErr.message, 500);
    }

    const orgName = (club.organization_name as string) ?? "el club";

    // ── Notificar al director dueño por email (best effort) ───────────
    const { data: dirUser } = await supabase.auth.admin.getUserById(orgOwnerId);
    const directorEmail: string | null = dirUser?.user?.email ?? null;
    if (resendKey && !resendKey.startsWith("placeholder") && directorEmail) {
      const origin = new URL(req.url).origin;
      const reviewUrl = `${origin}/director`;
      const resend = new Resend(resendKey);
      await resend.emails.send({
        from: "VITAS <no-reply@prophet-horizon.tech>",
        to: [directorEmail],
        subject: `Solicitud de acceso a ${orgName}`,
        html: `
          <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
            <h2 style="color:#7c3aed;margin-bottom:8px">VITAS Football Intelligence</h2>
            <p style="color:#374151;font-size:15px"><strong>${requesterName}</strong> ha solicitado acceso a <strong>${orgName}</strong>.</p>
            ${message ? `<p style="color:#6b7280;font-size:14px;border-left:3px solid #e5e7eb;padding-left:12px">${message}</p>` : ""}
            <a href="${reviewUrl}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:bold">
              Revisar solicitud
            </a>
            <p style="color:#9ca3af;font-size:12px;margin-top:32px">Aprueba o rechaza desde tu panel de director.</p>
          </div>
        `,
      }).catch(() => {});
    }

    // ── Audit log (best effort) ───────────────────────────────────────
    try {
      await supabase.from("team_audit_log").insert({
        org_owner_id: orgOwnerId,
        actor_id: requesterId,
        action: "access_requested",
        target_member_id: requesterId,
      });
    } catch { /* best effort */ }

    return successResponse({ success: true, orgName });
  },
);
