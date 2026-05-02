/**
 * VITAS · Sign Parental Consent
 * POST /api/auth/sign-consent
 *
 * Endpoint para firmar el consentimiento parental requerido por GDPR Art. 8
 * y LOPD Art. 7 (procesamiento de datos de menores).
 *
 * Flujo:
 *   1. Padre/tutor rellena formulario con: nombre, email, DNI, datos del hijo
 *   2. POST a este endpoint
 *   3. Se persiste con email_verified=false
 *   4. Se envía email Resend con link de verificación (24h validez)
 *   5. Al hacer click → /api/auth/verify-consent marca email_verified=true
 *   6. Solo entonces el menor puede usar VITAS
 */

import { z } from "zod";
import { withHandler } from "../_lib/withHandler";
import { successResponse, errorResponse } from "../_lib/apiResponse";
import { createClient } from "@supabase/supabase-js";
import crypto from "node:crypto";

export const config = { runtime: "edge" };

const consentSchema = z.object({
  playerId: z.string().min(1).max(120), // text en BBDD (compatible con IDs existentes)
  parentName: z.string().min(2).max(120),
  parentEmail: z.string().email(),
  parentDni: z.string().min(8).max(20).regex(/^[A-Z0-9]+$/i),
  childBirthdate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  acceptedTerms: z.literal(true), // debe ser true · GDPR requiere acción afirmativa
  acceptedPrivacy: z.literal(true),
  consentVersion: z.string().default("v1.0"),
});

const CONSENT_EMAIL_TEMPLATE = (link: string, parentName: string, childName: string) => ({
  subject: "VITAS · Verifica tu consentimiento como tutor legal",
  html: `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:system-ui,-apple-system,sans-serif;color:#0F172A;background:#F4F7FB;padding:40px 20px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:16px;padding:40px;border:1px solid #E2E8F0;">
    <h1 style="font-size:22px;margin:0 0 16px;color:#0066CC;">VITAS · Verificación de consentimiento</h1>
    <p>Hola <strong>${parentName}</strong>,</p>
    <p>Has solicitado registrar a <strong>${childName}</strong> en VITAS Football Intelligence como tutor legal.</p>
    <p>Para activar el análisis de sus vídeos necesitamos que verifiques tu identidad como padre/madre o tutor:</p>
    <p style="text-align:center;margin:32px 0;">
      <a href="${link}" style="display:inline-block;padding:14px 32px;background:linear-gradient(135deg,#0066CC,#B82BD9);color:#fff;text-decoration:none;border-radius:100px;font-weight:600;">
        Verificar consentimiento
      </a>
    </p>
    <p style="font-size:13px;color:#64748b;">Este enlace caduca en 24 horas. Si no solicitaste este registro, ignora este email.</p>
    <hr style="border:none;border-top:1px solid #E2E8F0;margin:24px 0;">
    <p style="font-size:12px;color:#94a3b8;">
      Este consentimiento es obligatorio según GDPR Art. 8 y LOPD Art. 7 para procesar datos de menores.
      Puedes retirarlo en cualquier momento desde tu cuenta.
    </p>
  </div>
</body></html>`,
});

async function sendConsentEmail(to: string, link: string, parentName: string, childName: string) {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    console.warn("[VITAS] RESEND_API_KEY no configurado · email no enviado");
    return false;
  }

  const template = CONSENT_EMAIL_TEMPLATE(link, parentName, childName);
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      // Sandbox por defecto (sin dominio verificado): solo envía a tu email Resend
      // Cuando verifiques dominio, define RESEND_FROM_EMAIL="VITAS <noreply@tu-dominio.com>"
      from: process.env.RESEND_FROM_EMAIL ?? "VITAS <onboarding@resend.dev>",
      to: [to],
      subject: template.subject,
      html: template.html,
    }),
  });

  return res.ok;
}

export default withHandler(
  { schema: consentSchema, requireAuth: true, maxRequests: 10 },
  async ({ body, userId, ip }) => {
    const input = body as z.infer<typeof consentSchema>;

    const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
    if (!supabaseUrl || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
      return errorResponse({ code: "config_missing", message: "DB not configured", status: 500 });
    }

    const supabase = createClient(
      supabaseUrl,
      process.env.SUPABASE_SERVICE_ROLE_KEY,
      { auth: { persistSession: false } }
    );

    // ── Hashear DNI · NUNCA guardar en claro ──────────────────────
    const dniHash = crypto
      .createHash("sha256")
      .update(input.parentDni.toUpperCase())
      .digest("hex");

    // ── Hash de la firma (bundle de campos clave) ─────────────────
    const signaturePayload = JSON.stringify({
      playerId: input.playerId,
      parentEmail: input.parentEmail,
      parentDniHash: dniHash,
      childBirthdate: input.childBirthdate,
      consentVersion: input.consentVersion,
      timestamp: Date.now(),
    });
    const signatureHash = crypto.createHash("sha256").update(signaturePayload).digest("hex");

    // ── Token de verificación (24h validez) ───────────────────────
    const verificationToken = crypto.randomBytes(32).toString("hex");
    const verificationExpires = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();

    // ── Buscar tenant del player ──────────────────────────────────
    const { data: player } = await supabase
      .from("players")
      .select("tenant_id, name")
      .eq("id", input.playerId)
      .single();

    if (!player) {
      return errorResponse({ code: "player_not_found", message: "Player no existe", status: 404 });
    }

    // ── Insertar consentimiento ───────────────────────────────────
    const { data: consent, error } = await supabase
      .from("parental_consents")
      .insert({
        player_id: input.playerId,
        tenant_id: player.tenant_id,
        parent_email: input.parentEmail.toLowerCase(),
        parent_name: input.parentName,
        parent_dni_hash: dniHash,
        child_birthdate: input.childBirthdate,
        signed_ip: ip,
        signature_hash: signatureHash,
        verification_token: verificationToken,
        verification_expires_at: verificationExpires,
        consent_version: input.consentVersion,
      })
      .select()
      .single();

    if (error) {
      return errorResponse({
        code: "consent_save_failed",
        message: error.message,
        status: 500,
      });
    }

    // ── Persistir aceptación T&Cs + Privacy ───────────────────────
    if (userId) {
      await supabase.from("legal_acceptances").insert([
        {
          user_id: userId,
          tenant_id: player.tenant_id,
          document_type: "terms",
          document_version: input.consentVersion,
          accepted_ip: ip,
        },
        {
          user_id: userId,
          tenant_id: player.tenant_id,
          document_type: "privacy",
          document_version: input.consentVersion,
          accepted_ip: ip,
        },
        {
          user_id: userId,
          tenant_id: player.tenant_id,
          document_type: "consent_minor",
          document_version: input.consentVersion,
          accepted_ip: ip,
        },
      ]);
    }

    // ── Enviar email de verificación ──────────────────────────────
    const baseUrl = process.env.VITAS_PUBLIC_URL ?? "https://vitas.app";
    const verifyLink = `${baseUrl}/auth/verify-consent?token=${verificationToken}`;
    const emailSent = await sendConsentEmail(
      input.parentEmail,
      verifyLink,
      input.parentName,
      player.name ?? "tu hijo/a"
    );

    return successResponse({
      consentId: consent.id,
      status: "pending_verification",
      emailSent,
      message: emailSent
        ? `Email de verificación enviado a ${input.parentEmail}. Caduca en 24h.`
        : "Consentimiento registrado pero falló el envío de email · contactar soporte",
    });
  }
);
