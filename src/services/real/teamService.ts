/**
 * VITAS — Team Service
 * CRUD para team_members y team_invitations (plan Club).
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { getAuthHeaders } from "@/lib/apiAuth";
import type { UserRole } from "./userProfileService";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface TeamMember {
  id: string;
  orgOwnerId: string;
  memberId: string;
  role: UserRole;
  joinedAt: string;
  email?: string;
  displayName?: string;
}

export interface TeamInvitation {
  id: string;
  orgOwnerId: string;
  email: string;
  role: UserRole;
  token: string;
  status: "pending" | "accepted" | "expired";
  expiresAt: string;
  createdAt: string;
}

/** Solicitud de acceso a un club (Rama B). */
export interface AccessRequest {
  id: string;
  requesterId: string;
  requesterEmail: string | null;
  requestedRole: string;
  message: string | null;
  createdAt: string;
}

// ─── Service ──────────────────────────────────────────────────────────────────

export const TeamService = {
  async getMembers(orgOwnerId: string): Promise<TeamMember[]> {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabase!
      .from("team_members")
      .select("*")
      .eq("org_owner_id", orgOwnerId)
      .order("joined_at", { ascending: true });

    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      orgOwnerId: r.org_owner_id,
      memberId: r.member_id,
      role: r.role as UserRole,
      joinedAt: r.joined_at,
    }));
  },

  async getInvitations(orgOwnerId: string): Promise<TeamInvitation[]> {
    if (!SUPABASE_CONFIGURED) return [];
    const { data, error } = await supabase!
      .from("team_invitations")
      .select("*")
      .eq("org_owner_id", orgOwnerId)
      .order("created_at", { ascending: false });

    if (error) throw error;
    return (data ?? []).map((r) => ({
      id: r.id,
      orgOwnerId: r.org_owner_id,
      email: r.email,
      role: r.role as UserRole,
      token: r.token,
      status: r.status as TeamInvitation["status"],
      expiresAt: r.expires_at,
      createdAt: r.created_at,
    }));
  },

  async invite(orgOwnerId: string, email: string, role: UserRole): Promise<void> {
    const res = await fetch("/api/team/invite", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ orgOwnerId, email, role }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Error al enviar invitación");
    }
  },

  // ── Acceso a club (Rama B): código, solicitud y aprobación ──────────
  async getJoinCode(): Promise<string> {
    const res = await fetch("/api/team/join-code", { headers: await getAuthHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudo obtener el código");
    return (json.data ?? json).code as string;
  },

  async regenJoinCode(): Promise<string> {
    const res = await fetch("/api/team/join-code", { method: "POST", headers: await getAuthHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudo regenerar el código");
    return (json.data ?? json).code as string;
  },

  async requestAccess(code: string, message?: string): Promise<{ orgName: string }> {
    const res = await fetch("/api/team/request-access", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ code, message }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudo enviar la solicitud");
    return { orgName: (json.data ?? json).orgName ?? "el club" };
  },

  async listRequests(): Promise<AccessRequest[]> {
    const res = await fetch("/api/team/list-requests", { headers: await getAuthHeaders() });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json.error ?? "No se pudieron cargar las solicitudes");
    return ((json.data ?? json).requests ?? []) as AccessRequest[];
  },

  async decideRequest(requestId: string, decision: "approve" | "reject"): Promise<void> {
    const res = await fetch("/api/team/decide-request", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ requestId, decision }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "No se pudo procesar la solicitud");
    }
  },

  async removeMember(orgOwnerId: string, memberId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    const { error } = await supabase!
      .from("team_members")
      .delete()
      .eq("org_owner_id", orgOwnerId)
      .eq("member_id", memberId);
    if (error) throw error;
  },

  async cancelInvitation(invitationId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    const { error } = await supabase!
      .from("team_invitations")
      .update({ status: "expired" })
      .eq("id", invitationId);
    if (error) throw error;
  },

  async acceptInvitation(token: string, userId: string): Promise<{ role: UserRole; orgOwnerId: string }> {
    const res = await fetch("/api/team/accept", {
      method: "POST",
      headers: await getAuthHeaders(),
      body: JSON.stringify({ token, userId }),
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(err.error ?? "Error al aceptar invitación");
    }
    return res.json();
  },

  async getInvitationByToken(token: string): Promise<TeamInvitation | null> {
    if (!SUPABASE_CONFIGURED) return null;
    const { data, error } = await supabase!
      .from("team_invitations")
      .select("*")
      .eq("token", token)
      .eq("status", "pending")
      .maybeSingle();

    if (error || !data) return null;
    return {
      id: data.id,
      orgOwnerId: data.org_owner_id,
      email: data.email,
      role: data.role as UserRole,
      token: data.token,
      status: data.status,
      expiresAt: data.expires_at,
      createdAt: data.created_at,
    };
  },
};
