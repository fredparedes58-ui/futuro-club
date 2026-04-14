/**
 * Tests for UserProfileService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockStore: Record<string, unknown> = {};

vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn((key: string, fallback: unknown) => mockStore[key] ?? fallback),
    set: vi.fn((key: string, value: unknown) => { mockStore[key] = value; }),
    remove: vi.fn((key: string) => { delete mockStore[key]; }),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      upsert: vi.fn(async () => ({ data: null, error: null })),
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          maybeSingle: vi.fn(async () => ({ data: null, error: null })),
        })),
      })),
    })),
  },
  SUPABASE_CONFIGURED: false,
}));

import {
  UserProfileService,
  ROLE_PERMISSIONS,
  PROFILE_TYPE_LABELS,
  PROFILE_TYPE_DESCRIPTIONS,
  ROLE_LABELS,
  type UserProfile,
} from "@/services/real/userProfileService";
import { StorageService } from "@/services/real/storageService";

describe("UserProfileService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Clear mock store
    Object.keys(mockStore).forEach(k => delete mockStore[k]);
  });

  // ── Constants ────────────────────────────────────────────────────────────────

  describe("constants", () => {
    it("PROFILE_TYPE_LABELS has all 4 types", () => {
      expect(Object.keys(PROFILE_TYPE_LABELS)).toEqual(["scout", "parent", "academy", "club"]);
    });

    it("PROFILE_TYPE_DESCRIPTIONS has all 4 types", () => {
      expect(Object.keys(PROFILE_TYPE_DESCRIPTIONS)).toHaveLength(4);
    });

    it("ROLE_LABELS has all 4 roles", () => {
      expect(Object.keys(ROLE_LABELS)).toEqual(["director", "scout", "coach", "viewer"]);
    });

    it("ROLE_PERMISSIONS has all 4 roles", () => {
      expect(Object.keys(ROLE_PERMISSIONS)).toHaveLength(4);
    });

    it("director has all permissions true", () => {
      const p = ROLE_PERMISSIONS.director;
      expect(p.canCreatePlayers).toBe(true);
      expect(p.canDeletePlayers).toBe(true);
      expect(p.canManageTeam).toBe(true);
      expect(p.canViewDirectorDashboard).toBe(true);
    });

    it("viewer has restrictive permissions", () => {
      const p = ROLE_PERMISSIONS.viewer;
      expect(p.canCreatePlayers).toBe(false);
      expect(p.canEditPlayers).toBe(false);
      expect(p.canDeletePlayers).toBe(false);
      expect(p.canRunAnalysis).toBe(false);
      expect(p.canManageTeam).toBe(false);
    });

    it("scout cannot delete players or manage team", () => {
      const p = ROLE_PERMISSIONS.scout;
      expect(p.canDeletePlayers).toBe(false);
      expect(p.canManageTeam).toBe(false);
      expect(p.canCreatePlayers).toBe(true);
      expect(p.canRunAnalysis).toBe(true);
    });
  });

  // ── get / getRole / getPermissions ───────────────────────────────────────────

  describe("get", () => {
    it("returns null when no profile cached", () => {
      expect(UserProfileService.get("u1")).toBeNull();
    });

    it("returns profile when cached for same userId", () => {
      const profile: UserProfile = {
        userId: "u1",
        profileType: "scout",
        role: "scout",
        onboardingCompleted: true,
        createdAt: "2025-01-01T00:00:00Z",
      };
      mockStore["user_profile"] = profile;
      expect(UserProfileService.get("u1")).toEqual(profile);
    });

    it("returns null when cached profile belongs to different user", () => {
      mockStore["user_profile"] = {
        userId: "u2",
        profileType: "scout",
        role: "scout",
        onboardingCompleted: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      expect(UserProfileService.get("u1")).toBeNull();
    });
  });

  describe("getRole", () => {
    it("returns scout as default when no profile", () => {
      expect(UserProfileService.getRole("u1")).toBe("scout");
    });

    it("returns stored role", () => {
      mockStore["user_profile"] = {
        userId: "u1",
        role: "director",
        profileType: "club",
        onboardingCompleted: true,
        createdAt: "2025-01-01T00:00:00Z",
      };
      expect(UserProfileService.getRole("u1")).toBe("director");
    });
  });

  describe("getPermissions", () => {
    it("returns scout permissions by default", () => {
      const perms = UserProfileService.getPermissions("u1");
      expect(perms).toEqual(ROLE_PERMISSIONS.scout);
    });

    it("returns director permissions for director", () => {
      mockStore["user_profile"] = {
        userId: "u1",
        role: "director",
        profileType: "club",
        onboardingCompleted: true,
        createdAt: "2025-01-01T00:00:00Z",
      };
      const perms = UserProfileService.getPermissions("u1");
      expect(perms.canManageTeam).toBe(true);
    });
  });

  describe("isOnboardingCompleted", () => {
    it("returns false when no profile", () => {
      expect(UserProfileService.isOnboardingCompleted("u1")).toBe(false);
    });

    it("returns true when onboarding is completed", () => {
      mockStore["user_profile"] = {
        userId: "u1",
        role: "scout",
        profileType: "scout",
        onboardingCompleted: true,
        createdAt: "2025-01-01T00:00:00Z",
      };
      expect(UserProfileService.isOnboardingCompleted("u1")).toBe(true);
    });
  });

  // ── create / update / completeOnboarding ─────────────────────────────────────

  describe("create", () => {
    it("creates a profile with createdAt timestamp", () => {
      const result = UserProfileService.create({
        userId: "u1",
        profileType: "academy",
        role: "director",
        organizationName: "VITAS Academy",
        onboardingCompleted: false,
      });
      expect(result.createdAt).toBeDefined();
      expect(result.profileType).toBe("academy");
      expect(StorageService.set).toHaveBeenCalled();
    });
  });

  describe("update", () => {
    it("updates existing profile", () => {
      mockStore["user_profile"] = {
        userId: "u1",
        role: "scout",
        profileType: "scout",
        onboardingCompleted: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      UserProfileService.update("u1", { role: "coach" });
      expect(StorageService.set).toHaveBeenCalledWith(
        "user_profile",
        expect.objectContaining({ role: "coach" }),
      );
    });

    it("does nothing when profile not found", () => {
      UserProfileService.update("nonexistent", { role: "coach" });
      expect(StorageService.set).not.toHaveBeenCalled();
    });
  });

  describe("completeOnboarding", () => {
    it("sets onboardingCompleted to true", () => {
      mockStore["user_profile"] = {
        userId: "u1",
        role: "scout",
        profileType: "scout",
        onboardingCompleted: false,
        createdAt: "2025-01-01T00:00:00Z",
      };
      UserProfileService.completeOnboarding("u1");
      expect(StorageService.set).toHaveBeenCalledWith(
        "user_profile",
        expect.objectContaining({ onboardingCompleted: true }),
      );
    });
  });
});
