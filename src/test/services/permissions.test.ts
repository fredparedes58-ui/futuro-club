/**
 * Tests para Permission Matrix y Role System
 * Sprint 7F — Verificar que cada rol tiene los permisos correctos.
 */

import { describe, it, expect, vi } from "vitest";
import {
  ROLE_PERMISSIONS,
  type UserRole,
  type RolePermissions,
  ROLE_LABELS,
  PROFILE_TYPE_LABELS,
} from "@/services/real/userProfileService";

// ── Mock: Supabase ──────────────────────────────────────────────────────────
vi.mock("@/lib/supabase", () => ({
  supabase: { from: () => ({}) },
  SUPABASE_CONFIGURED: false,
}));

// ─── Tests ──────────────────────────────────────────────────────────────────

const ALL_ROLES: UserRole[] = ["director", "scout", "coach", "viewer"];
const ALL_PERMISSIONS = Object.keys(ROLE_PERMISSIONS.director) as (keyof RolePermissions)[];

describe("Permission Matrix", () => {

  // ── Completitud ─────────────────────────────────────────────────────────

  describe("completitud", () => {
    it("todos los roles tienen definición de permisos", () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_PERMISSIONS[role]).toBeDefined();
      }
    });

    it("todos los roles tienen todos los permisos definidos (no undefined)", () => {
      for (const role of ALL_ROLES) {
        for (const perm of ALL_PERMISSIONS) {
          expect(typeof ROLE_PERMISSIONS[role][perm]).toBe("boolean");
        }
      }
    });

    it("hay exactamente 9 permisos definidos", () => {
      expect(ALL_PERMISSIONS.length).toBe(9);
    });

    it("los 4 roles tienen etiquetas", () => {
      for (const role of ALL_ROLES) {
        expect(ROLE_LABELS[role]).toBeDefined();
        expect(ROLE_LABELS[role].length).toBeGreaterThan(0);
      }
    });

    it("los 4 tipos de perfil tienen etiquetas", () => {
      for (const pt of ["scout", "parent", "academy", "club"] as const) {
        expect(PROFILE_TYPE_LABELS[pt]).toBeDefined();
      }
    });
  });

  // ── Director (acceso total) ─────────────────────────────────────────────

  describe("director", () => {
    const perms = ROLE_PERMISSIONS.director;

    it("tiene TODOS los permisos habilitados", () => {
      for (const perm of ALL_PERMISSIONS) {
        expect(perms[perm]).toBe(true);
      }
    });

    it("es el único que puede eliminar jugadores", () => {
      expect(perms.canDeletePlayers).toBe(true);
      expect(ROLE_PERMISSIONS.scout.canDeletePlayers).toBe(false);
      expect(ROLE_PERMISSIONS.coach.canDeletePlayers).toBe(false);
      expect(ROLE_PERMISSIONS.viewer.canDeletePlayers).toBe(false);
    });

    it("es el único que puede gestionar equipo", () => {
      expect(perms.canManageTeam).toBe(true);
      for (const role of ALL_ROLES.filter(r => r !== "director")) {
        expect(ROLE_PERMISSIONS[role].canManageTeam).toBe(false);
      }
    });

    it("es el único con acceso al director dashboard", () => {
      expect(perms.canViewDirectorDashboard).toBe(true);
      for (const role of ALL_ROLES.filter(r => r !== "director")) {
        expect(ROLE_PERMISSIONS[role].canViewDirectorDashboard).toBe(false);
      }
    });
  });

  // ── Scout ───────────────────────────────────────────────────────────────

  describe("scout", () => {
    const perms = ROLE_PERMISSIONS.scout;

    it("puede crear y editar jugadores", () => {
      expect(perms.canCreatePlayers).toBe(true);
      expect(perms.canEditPlayers).toBe(true);
    });

    it("NO puede eliminar jugadores", () => {
      expect(perms.canDeletePlayers).toBe(false);
    });

    it("puede ejecutar análisis", () => {
      expect(perms.canRunAnalysis).toBe(true);
    });

    it("puede ver todos los jugadores", () => {
      expect(perms.canViewAllPlayers).toBe(true);
    });

    it("puede exportar PDF y ver video analysis", () => {
      expect(perms.canExportPDF).toBe(true);
      expect(perms.canViewVideoAnalysis).toBe(true);
    });

    it("NO puede gestionar equipo ni ver director dashboard", () => {
      expect(perms.canManageTeam).toBe(false);
      expect(perms.canViewDirectorDashboard).toBe(false);
    });
  });

  // ── Coach ───────────────────────────────────────────────────────────────

  describe("coach", () => {
    const perms = ROLE_PERMISSIONS.coach;

    it("puede crear y editar jugadores", () => {
      expect(perms.canCreatePlayers).toBe(true);
      expect(perms.canEditPlayers).toBe(true);
    });

    it("NO puede eliminar jugadores", () => {
      expect(perms.canDeletePlayers).toBe(false);
    });

    it("puede ejecutar análisis", () => {
      expect(perms.canRunAnalysis).toBe(true);
    });

    it("NO puede ver todos los jugadores (solo los suyos)", () => {
      expect(perms.canViewAllPlayers).toBe(false);
    });

    it("NO puede exportar PDF (feature pro/director)", () => {
      expect(perms.canExportPDF).toBe(false);
    });

    it("puede ver video analysis", () => {
      expect(perms.canViewVideoAnalysis).toBe(true);
    });
  });

  // ── Viewer (solo lectura) ───────────────────────────────────────────────

  describe("viewer", () => {
    const perms = ROLE_PERMISSIONS.viewer;

    it("NO puede crear, editar, ni eliminar jugadores", () => {
      expect(perms.canCreatePlayers).toBe(false);
      expect(perms.canEditPlayers).toBe(false);
      expect(perms.canDeletePlayers).toBe(false);
    });

    it("NO puede ejecutar análisis", () => {
      expect(perms.canRunAnalysis).toBe(false);
    });

    it("puede ver todos los jugadores (lectura)", () => {
      expect(perms.canViewAllPlayers).toBe(true);
    });

    it("NO puede exportar PDF ni ver video analysis", () => {
      expect(perms.canExportPDF).toBe(false);
      expect(perms.canViewVideoAnalysis).toBe(false);
    });

    it("NO tiene ningún permiso de escritura ni gestión", () => {
      expect(perms.canManageTeam).toBe(false);
      expect(perms.canViewDirectorDashboard).toBe(false);
    });
  });

  // ── Jerarquía de privilegios ────────────────────────────────────────────

  describe("jerarquía", () => {
    it("director tiene más permisos que scout", () => {
      const dirCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.director[p]).length;
      const scoutCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.scout[p]).length;
      expect(dirCount).toBeGreaterThan(scoutCount);
    });

    it("scout tiene más permisos que coach", () => {
      const scoutCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.scout[p]).length;
      const coachCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.coach[p]).length;
      expect(scoutCount).toBeGreaterThan(coachCount);
    });

    it("coach tiene más permisos que viewer", () => {
      const coachCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.coach[p]).length;
      const viewerCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.viewer[p]).length;
      expect(coachCount).toBeGreaterThan(viewerCount);
    });

    it("viewer tiene al menos 1 permiso (ver jugadores)", () => {
      const viewerCount = ALL_PERMISSIONS.filter(p => ROLE_PERMISSIONS.viewer[p]).length;
      expect(viewerCount).toBeGreaterThanOrEqual(1);
    });
  });

  // ── Invariantes de seguridad ────────────────────────────────────────────

  describe("invariantes de seguridad", () => {
    it("ningún rol viewer puede mutar datos", () => {
      const v = ROLE_PERMISSIONS.viewer;
      expect(v.canCreatePlayers).toBe(false);
      expect(v.canEditPlayers).toBe(false);
      expect(v.canDeletePlayers).toBe(false);
    });

    it("solo director puede borrar", () => {
      const canDelete = ALL_ROLES.filter(r => ROLE_PERMISSIONS[r].canDeletePlayers);
      expect(canDelete).toEqual(["director"]);
    });

    it("solo director puede gestionar equipo", () => {
      const canManage = ALL_ROLES.filter(r => ROLE_PERMISSIONS[r].canManageTeam);
      expect(canManage).toEqual(["director"]);
    });

    it("todos los permisos son booleanos puros (no truthy/falsy)", () => {
      for (const role of ALL_ROLES) {
        for (const perm of ALL_PERMISSIONS) {
          expect(ROLE_PERMISSIONS[role][perm] === true || ROLE_PERMISSIONS[role][perm] === false).toBe(true);
        }
      }
    });
  });
});
