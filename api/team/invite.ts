/**
 * POST /api/team/invite
 * Crea una invitación y envía email con Resend.
 *
 * Body: { orgOwnerId, email, role }
 */

import { createClient } from "@supabase/supabase-js";
import { Resend } from "resend";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const resendKey   = process.env.RESEND_API_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { orgOwnerId?: string; email?: string; role?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { orgOwnerId, email, role } = body;
  if (!orgOwnerId || !email || !role) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  const validRoles = ["scout", "coach", "viewer"];
  if (!validRoles.includes(role)) {
    return new Response(JSON.stringify({ error: "Invalid role" }), { status: 400 });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return new Response(JSON.stringify({ error: "Email inválido" }), { status: 400 });
  }

  // Verificar que no exista ya una invitación pendiente para este email
  const { data: existing } = await supabase
    .from("team_invitations")
    .select("id")
    .eq("org_owner_id", orgOwnerId)
    .eq("email", email)
    .eq("status", "pending")
    .single();

  if (existing) {
    return new Response(
      JSON.stringify({ error: "Ya existe una invitación pendiente para este email" }),
      { status: 409 }
    );
  }

  // Obtener nombre de la organización
  const { data: profileData } = await supabase
    .from("user_profiles")
    .select("organization_name")
    .eq("user_id", orgOwnerId)
    .single();

  const orgName = profileData?.organization_name ?? "VITAS Football Intelligence";

  // Crear la invitación en Supabase
  const { data: invitation, error: inviteError } = await supabase
    .from("team_invitations")
    .insert({ org_owner_id: orgOwnerId, email, role })
    .select("token")
    .single();

  if (inviteError || !invitation) {
    return new Response(JSON.stringify({ error: inviteError?.message ?? "Error creating invitation" }), { status: 500 });
  }

  const origin = new URL(req.url).origin;
  const acceptUrl = `${origin}/aceptar-invitacion?token=${invitation.token}`;

  // Enviar email con Resend (si está configurado)
  if (resendKey && !resendKey.startsWith("placeholder")) {
    const resend = new Resend(resendKey);
    await resend.emails.send({
      from: "VITAS <no-reply@prophet-horizon.tech>",
      to: [email],
      subject: `Invitación a unirte al equipo de ${orgName}`,
      html: `
        <div style="font-family:sans-serif;max-width:480px;margin:0 auto;padding:32px">
          <h2 style="color:#7c3aed;margin-bottom:8px">VITAS Football Intelligence</h2>
          <p style="color:#374151;font-size:15px">Has sido invitado a unirte al equipo de <strong>${orgName}</strong> con el rol de <strong>${role}</strong>.</p>
          <a href="${acceptUrl}" style="display:inline-block;margin-top:24px;padding:12px 24px;background:#7c3aed;color:white;text-decoration:none;border-radius:8px;font-weight:bold">
            Aceptar invitación
          </a>
          <p style="color:#9ca3af;font-size:12px;margin-top:32px">Este enlace expira en 7 días. Si no esperabas este correo, puedes ignorarlo.</p>
        </div>
      `,
    }).catch(console.warn);
  }

  return new Response(JSON.stringify({ success: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
