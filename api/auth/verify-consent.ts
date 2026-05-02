/**
 * VITAS · Verify Parental Consent
 * GET /api/auth/verify-consent?token=...
 *
 * Endpoint llamado al hacer click en el email de verificación.
 * Marca el consentimiento como email_verified=true si el token es válido.
 * Tras esto, el menor puede usar VITAS.
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";

export const config = { runtime: "edge" };

const verifySchema = z.object({
  token: z.string().min(32).max(128),
});

export default withHandler(
  { schema: verifySchema, requireAuth: false, maxRequests: 30 },
  async ({ body }) => {
    const { token } = body as z.infer<typeof verifySchema>;

    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return errorResponse({ code: "config_missing", message: "DB not configured", status: 500 });
    }

    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // ── Buscar consentimiento por token ───────────────────────────
    const { data: consent, error } = await supabase
      .from("parental_consents")
      .select("*")
      .eq("verification_token", token)
      .single();

    if (error || !consent) {
      return errorResponse({
        code: "invalid_token",
        message: "Token de verificación inválido o ya usado",
        status: 404,
      });
    }

    // ── Token caducado ────────────────────────────────────────────
    if (consent.verification_expires_at && new Date(consent.verification_expires_at) < new Date()) {
      return errorResponse({
        code: "token_expired",
        message: "El enlace ha caducado. Solicita uno nuevo.",
        status: 410,
      });
    }

    // ── Ya verificado previamente ─────────────────────────────────
    if (consent.email_verified) {
      return successResponse({
        consentId: consent.id,
        playerId: consent.player_id,
        alreadyVerified: true,
        message: "Este consentimiento ya estaba verificado.",
      });
    }

    // ── Marcar como verificado ────────────────────────────────────
    const { error: updateError } = await supabase
      .from("parental_consents")
      .update({
        email_verified: true,
        email_verified_at: new Date().toISOString(),
        verification_token: null, // invalidar token tras uso
        verification_expires_at: null,
      })
      .eq("id", consent.id);

    if (updateError) {
      return errorResponse({
        code: "verify_failed",
        message: updateError.message,
        status: 500,
      });
    }

    // Audit log
    await supabase.rpc("log_gdpr_action", {
      p_user_id: null,
      p_tenant_id: consent.tenant_id,
      p_action: "consent_email_verified",
      p_resource_type: "parental_consents",
      p_resource_id: consent.id,
      p_metadata: { player_id: consent.player_id },
      p_ip: null,
    });

    return successResponse({
      consentId: consent.id,
      playerId: consent.player_id,
      verified: true,
      message: "Consentimiento verificado · el menor ya puede usar VITAS",
    });
  }
);
