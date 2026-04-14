/**
 * VITAS — Organization Service
 * CRUD de organizaciones (clubs/academias) y gestión de membresía.
 * Supabase-first con localStorage cache.
 */

import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";
import { StorageService } from "./storageService";

// ─── Tipos ──────────────────────────────────────────────────────────────

export interface Organization {
  id: string;
  name: string;
  slug: string | null;
  logo_url: string | null;
  plan: "free" | "pro" | "club";
  owner_id: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrgMember {
  user_id: string;
  email: string;
  role: string;
  display_name: string;
  joined_at: string;
}

const STORAGE_KEY = "current_org";

// ─── Service ────────────────────────────────────────────────────────────

export const OrganizationService = {

  // ── Obtener org actual del usuario (cached) ───────────────────────
  getCurrent(): Organization | null {
    return StorageService.get<Organization | null>(STORAGE_KEY, null);
  },

  setCurrent(org: Organization): void {
    StorageService.set(STORAGE_KEY, org);
  },

  clearCurrent(): void {
    StorageService.remove(STORAGE_KEY);
  },

  // ── Crear organización (al registrarse o onboarding) ──────────────
  async create(userId: string, name: string): Promise<Organization | null> {
    if (!SUPABASE_CONFIGURED) {
      // Modo offline: org local
      const org: Organization = {
        id: `org_${Date.now()}`,
        name,
        slug: name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, ""),
        logo_url: null,
        plan: "free",
        owner_id: userId,
        active: true,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };
      StorageService.set(STORAGE_KEY, org);
      return org;
    }

    try {
      const slug = name.toLowerCase().replace(/\s+/g, "-").replace(/[^a-z0-9-]/g, "");
      const { data, error } = await supabase
        .from("organizations")
        .insert({ name, slug, owner_id: userId, plan: "free" })
        .select()
        .single();

      if (error) throw error;

      const org = data as Organization;
      StorageService.set(STORAGE_KEY, org);
      return org;
    } catch (err) {
      console.error("[OrganizationService] create failed:", err);
      return null;
    }
  },

  // ── Obtener org del usuario desde Supabase ────────────────────────
  async fetchForUser(userId: string): Promise<Organization | null> {
    if (!SUPABASE_CONFIGURED) return this.getCurrent();

    try {
      // Primero buscar como owner
      const { data: owned } = await supabase
        .from("organizations")
        .select("*")
        .eq("owner_id", userId)
        .eq("active", true)
        .limit(1)
        .single();

      if (owned) {
        const org = owned as Organization;
        StorageService.set(STORAGE_KEY, org);
        return org;
      }

      // Luego buscar como miembro
      const { data: membership } = await supabase
        .from("team_members")
        .select("org_id")
        .eq("member_id", userId)
        .limit(1)
        .single();

      if (membership?.org_id) {
        const { data: orgData } = await supabase
          .from("organizations")
          .select("*")
          .eq("id", membership.org_id)
          .single();

        if (orgData) {
          const org = orgData as Organization;
          StorageService.set(STORAGE_KEY, org);
          return org;
        }
      }

      return null;
    } catch {
      // Fallback a cache local
      return this.getCurrent();
    }
  },

  // ── Actualizar org ────────────────────────────────────────────────
  async update(orgId: string, updates: Partial<Pick<Organization, "name" | "logo_url">>): Promise<Organization | null> {
    if (!SUPABASE_CONFIGURED) return this.getCurrent();

    try {
      const { data, error } = await supabase
        .from("organizations")
        .update(updates)
        .eq("id", orgId)
        .select()
        .single();

      if (error) throw error;
      const org = data as Organization;
      StorageService.set(STORAGE_KEY, org);
      return org;
    } catch (err) {
      console.error("[OrganizationService] update failed:", err);
      return null;
    }
  },

  // ── Obtener miembros de la org ────────────────────────────────────
  async getMembers(orgId: string): Promise<OrgMember[]> {
    if (!SUPABASE_CONFIGURED) return [];

    try {
      const { data, error } = await supabase
        .from("team_members")
        .select("member_id, role, joined_at")
        .eq("org_id", orgId);

      if (error) throw error;

      // Enrich with user profile data
      const members: OrgMember[] = [];
      for (const row of data ?? []) {
        const { data: profile } = await supabase
          .from("user_profiles")
          .select("display_name, email")
          .eq("user_id", row.member_id)
          .single();

        members.push({
          user_id: row.member_id,
          email: (profile as Record<string, string>)?.email ?? "",
          role: row.role,
          display_name: (profile as Record<string, string>)?.display_name ?? "Usuario",
          joined_at: row.joined_at,
        });
      }

      return members;
    } catch {
      return [];
    }
  },

  // ── Verificar pertenencia ─────────────────────────────────────────
  async isUserInOrg(userId: string, orgId: string): Promise<boolean> {
    if (!SUPABASE_CONFIGURED) return true;

    try {
      // Check if owner
      const { data: org } = await supabase
        .from("organizations")
        .select("id")
        .eq("id", orgId)
        .eq("owner_id", userId)
        .single();

      if (org) return true;

      // Check if member
      const { data: member } = await supabase
        .from("team_members")
        .select("id")
        .eq("org_id", orgId)
        .eq("member_id", userId)
        .single();

      return !!member;
    } catch {
      return false;
    }
  },

  // ── Obtener org_id para inyectar en queries ───────────────────────
  getOrgId(): string | null {
    const org = this.getCurrent();
    return org?.id ?? null;
  },
};
