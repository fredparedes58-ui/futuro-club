/**
 * VITAS User Profile Service
 * Gestiona el tipo de perfil (scout / parent / academy / club)
 * y el rol del usuario (director / scout / coach / viewer).
 *
 * localStorage como cache; Supabase como fuente de verdad.
 */

import { StorageService } from "./storageService";
import { supabase, SUPABASE_CONFIGURED } from "@/lib/supabase";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export type ProfileType = "scout" | "parent" | "academy" | "club";
export type UserRole    = "director" | "scout" | "coach" | "viewer";

export interface UserProfile {
  userId: string;
  profileType: ProfileType;
  role: UserRole;
  organizationName?: string;
  onboardingCompleted: boolean;
  createdAt: string;
}

// ─── Etiquetas UI ─────────────────────────────────────────────────────────────

export const PROFILE_TYPE_LABELS: Record<ProfileType, string> = {
  scout:   "Scout Independiente",
  parent:  "Padre / Tutor",
  academy: "Academia",
  club:    "Club Profesional",
};

export const PROFILE_TYPE_DESCRIPTIONS: Record<ProfileType, string> = {
  scout:   "Sigues jugadores de varios clubes de forma independiente",
  parent:  "Monitoreas el desarrollo de tu hijo/a jugador/a",
  academy: "Academia de fútbol con staff y jugadores propios",
  club:    "Club con director deportivo, cuerpo técnico y plantilla",
};

export const ROLE_LABELS: Record<UserRole, string> = {
  director: "Director Deportivo",
  scout:    "Scout",
  coach:    "Entrenador",
  viewer:   "Observador",
};

// ─── Permisos por rol ─────────────────────────────────────────────────────────

export interface RolePermissions {
  canCreatePlayers: boolean;
  canEditPlayers: boolean;
  canDeletePlayers: boolean;
  canRunAnalysis: boolean;
  canViewAllPlayers: boolean;
  canManageTeam: boolean;
  canViewDirectorDashboard: boolean;
  canExportPDF: boolean;
  canViewVideoAnalysis: boolean;
}

export const ROLE_PERMISSIONS: Record<UserRole, RolePermissions> = {
  director: {
    canCreatePlayers: true,
    canEditPlayers: true,
    canDeletePlayers: true,
    canRunAnalysis: true,
    canViewAllPlayers: true,
    canManageTeam: true,
    canViewDirectorDashboard: true,
    canExportPDF: true,
    canViewVideoAnalysis: true,
  },
  scout: {
    canCreatePlayers: true,
    canEditPlayers: true,
    canDeletePlayers: false,
    canRunAnalysis: true,
    canViewAllPlayers: true,
    canManageTeam: false,
    canViewDirectorDashboard: false,
    canExportPDF: true,
    canViewVideoAnalysis: true,
  },
  coach: {
    canCreatePlayers: true,
    canEditPlayers: true,
    canDeletePlayers: false,
    canRunAnalysis: true,
    canViewAllPlayers: false,
    canManageTeam: false,
    canViewDirectorDashboard: false,
    canExportPDF: false,
    canViewVideoAnalysis: true,
  },
  viewer: {
    canCreatePlayers: false,
    canEditPlayers: false,
    canDeletePlayers: false,
    canRunAnalysis: false,
    canViewAllPlayers: true,
    canManageTeam: false,
    canViewDirectorDashboard: false,
    canExportPDF: false,
    canViewVideoAnalysis: false,
  },
};

// ─── Storage key ──────────────────────────────────────────────────────────────

const STORAGE_KEY = "user_profile";

// ─── UserProfileService ───────────────────────────────────────────────────────

export const UserProfileService = {
  // ── Lectura ────────────────────────────────────────────────────────────────

  get(userId: string): UserProfile | null {
    const cached = StorageService.get<UserProfile | null>(STORAGE_KEY, null);
    if (cached?.userId === userId) return cached;
    return null;
  },

  getRole(userId: string): UserRole {
    return this.get(userId)?.role ?? "scout";
  },

  getPermissions(userId: string): RolePermissions {
    const role = this.getRole(userId);
    return ROLE_PERMISSIONS[role];
  },

  isOnboardingCompleted(userId: string): boolean {
    return this.get(userId)?.onboardingCompleted ?? false;
  },

  // ── Escritura ─────────────────────────────────────────────────────────────

  create(profile: Omit<UserProfile, "createdAt">): UserProfile {
    const full: UserProfile = { ...profile, createdAt: new Date().toISOString() };
    StorageService.set(STORAGE_KEY, full);
    this.syncToSupabase(full).catch(() => {});
    return full;
  },

  update(userId: string, patch: Partial<UserProfile>): void {
    const current = this.get(userId);
    if (!current) return;
    const updated = { ...current, ...patch };
    StorageService.set(STORAGE_KEY, updated);
    this.syncToSupabase(updated).catch(() => {});
  },

  completeOnboarding(userId: string): void {
    this.update(userId, { onboardingCompleted: true });
  },

  // ── Sync con Supabase ─────────────────────────────────────────────────────

  async syncToSupabase(profile: UserProfile): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    await supabase.from("user_profiles").upsert({
      user_id: profile.userId,
      profile_type: profile.profileType,
      role: profile.role,
      organization_name: profile.organizationName ?? null,
      onboarding_completed: profile.onboardingCompleted,
    }, { onConflict: "user_id" });
  },

  async syncFromSupabase(userId: string): Promise<void> {
    if (!SUPABASE_CONFIGURED) return;
    try {
      const { data } = await supabase
        .from("user_profiles")
        .select("*")
        .eq("user_id", userId)
        .maybeSingle();
      if (data) {
        StorageService.set<UserProfile>(STORAGE_KEY, {
          userId,
          profileType: data.profile_type as ProfileType,
          role: data.role as UserRole,
          organizationName: data.organization_name ?? undefined,
          onboardingCompleted: data.onboarding_completed,
          createdAt: data.created_at,
        });
      }
    } catch {
      // Silently fail — usa cache local
    }
  },
};
