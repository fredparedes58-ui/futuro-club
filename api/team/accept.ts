/**
 * POST /api/team/accept
 * Acepta una invitación por token y crea el registro en team_members.
 *
 * Body: { token, userId }
 * Returns: { success, role, orgOwnerId }
 */

import { createClient } from "@supabase/supabase-js";
import { verifyAuth } from "../lib/auth";

export const config = { runtime: "edge" };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Verify JWT — userId comes from token, not body
  const { userId, error: authError } = await verifyAuth(req);
  if (!userId) {
    return new Response(JSON.stringify({ error: authError ?? "No autenticado" }), { status: 401 });
  }

  const supabaseUrl = process.env.VITE_SUPABASE_URL ?? process.env.SUPABASE_URL;
  const serviceKey  = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceKey) {
    return new Response(JSON.stringify({ error: "Supabase not configured" }), { status: 500 });
  }

  const supabase = createClient(supabaseUrl, serviceKey);

  let body: { token?: string };
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: "Invalid JSON" }), { status: 400 });
  }

  const { token } = body;
  if (!token) {
    return new Response(JSON.stringify({ error: "Missing token" }), { status: 400 });
  }

  // Buscar invitación válida
  const { data: invitation, error: findError } = await supabase
    .from("team_invitations")
    .select("*")
    .eq("token", token)
    .eq("status", "pending")
    .single();

  if (findError || !invitation) {
    return new Response(JSON.stringify({ error: "Invitación no encontrada o ya utilizada" }), { status: 404 });
  }

  // Verificar que no haya expirado
  if (new Date(invitation.expires_at) < new Date()) {
    await supabase
      .from("team_invitations")
      .update({ status: "expired" })
      .eq("id", invitation.id);
    return new Response(JSON.stringify({ error: "La invitación ha expirado" }), { status: 410 });
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
    return new Response(JSON.stringify({ error: memberError.message }), { status: 500 });
  }

  // Marcar invitación como aceptada
  await supabase
    .from("team_invitations")
    .update({ status: "accepted" })
    .eq("id", invitation.id);

  return new Response(JSON.stringify({
    success: true,
    role: invitation.role,
    orgOwnerId: invitation.org_owner_id,
  }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
