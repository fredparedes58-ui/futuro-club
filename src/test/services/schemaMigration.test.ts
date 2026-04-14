/**
 * Tests for SchemaMigrationService
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Mock StorageService before importing SchemaMigration
vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn(() => 0),
    set: vi.fn(),
    remove: vi.fn(),
    getAllKeys: vi.fn(() => []),
  },
}));

import { SchemaMigrationService } from "@/services/real/schemaMigration";
import { StorageService } from "@/services/real/storageService";

describe("SchemaMigrationService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // ── getCurrentVersion ──────────────────────────────────────────────────────
  describe("getCurrentVersion", () => {
    it("returns 0 when no version stored", () => {
      vi.mocked(StorageService.get).mockReturnValue(0);
      expect(SchemaMigrationService.getCurrentVersion()).toBe(0);
    });

    it("delegates to StorageService", () => {
      SchemaMigrationService.getCurrentVersion();
      expect(StorageService.get).toHaveBeenCalledWith("schema_version", 0);
    });
  });

  // ── CURRENT_VERSION ────────────────────────────────────────────────────────
  it("CURRENT_VERSION is a positive integer", () => {
    expect(SchemaMigrationService.CURRENT_VERSION).toBeGreaterThanOrEqual(1);
    expect(Number.isInteger(SchemaMigrationService.CURRENT_VERSION)).toBe(true);
  });

  // ── migrateIfNeeded ────────────────────────────────────────────────────────
  describe("migrateIfNeeded", () => {
    it("returns no-op when already at current version", () => {
      vi.mocked(StorageService.get).mockReturnValue(SchemaMigrationService.CURRENT_VERSION);
      const result = SchemaMigrationService.migrateIfNeeded();
      expect(result.migrated).toBe(false);
      expect(result.stepsApplied).toHaveLength(0);
      expect(result.errors).toHaveLength(0);
    });

    it("initializes schema version for new install (v0)", () => {
      vi.mocked(StorageService.get).mockReturnValue(0);
      const result = SchemaMigrationService.migrateIfNeeded();
      expect(result.migrated).toBe(true);
      expect(result.stepsApplied.length).toBeGreaterThanOrEqual(1);
      expect(StorageService.set).toHaveBeenCalledWith("schema_version", SchemaMigrationService.CURRENT_VERSION);
    });

    it("returns empty errors array on success", () => {
      vi.mocked(StorageService.get).mockReturnValue(0);
      const result = SchemaMigrationService.migrateIfNeeded();
      expect(result.errors).toHaveLength(0);
    });

    it("result has correct fromVersion and toVersion", () => {
      vi.mocked(StorageService.get).mockReturnValue(0);
      const result = SchemaMigrationService.migrateIfNeeded();
      expect(result.fromVersion).toBe(0);
      expect(result.toVersion).toBe(SchemaMigrationService.CURRENT_VERSION);
    });
  });

  // ── checkStorageQuota ──────────────────────────────────────────────────────
  describe("checkStorageQuota", () => {
    it("returns quota info object with expected shape", () => {
      const info = SchemaMigrationService.checkStorageQuota();
      expect(info).toHaveProperty("usedBytes");
      expect(info).toHaveProperty("usedMB");
      expect(info.estimatedMaxMB).toBe(5);
      expect(typeof info.usagePercent).toBe("number");
      expect(typeof info.warning).toBe("boolean");
      expect(typeof info.critical).toBe("boolean");
    });

    it("does not throw even with data in localStorage", () => {
      localStorage.setItem("testKey", "testValue");
      expect(() => SchemaMigrationService.checkStorageQuota()).not.toThrow();
    });

    it("warning and critical flags are booleans", () => {
      const info = SchemaMigrationService.checkStorageQuota();
      expect(typeof info.warning).toBe("boolean");
      expect(typeof info.critical).toBe("boolean");
    });
  });

  // ── isStorageWritable ──────────────────────────────────────────────────────
  describe("isStorageWritable", () => {
    it("returns true in test env (jsdom)", () => {
      expect(SchemaMigrationService.isStorageWritable()).toBe(true);
    });

    it("returns false when localStorage throws", () => {
      const origSetItem = localStorage.setItem;
      localStorage.setItem = () => { throw new Error("QuotaExceeded"); };
      expect(SchemaMigrationService.isStorageWritable()).toBe(false);
      localStorage.setItem = origSetItem;
    });
  });

  // ── validateDataIntegrity ──────────────────────────────────────────────────
  describe("validateDataIntegrity", () => {
    it("returns valid when no critical keys exist", () => {
      const result = SchemaMigrationService.validateDataIntegrity();
      expect(result.valid).toBe(true);
      expect(result.corruptedKeys).toHaveLength(0);
    });

    it("returns valid for proper JSON data", () => {
      localStorage.setItem("vitas_players", JSON.stringify([{ id: "p1" }]));
      localStorage.setItem("vitas_videos", JSON.stringify([]));
      const result = SchemaMigrationService.validateDataIntegrity();
      expect(result.valid).toBe(true);
    });

    it("detects corrupted JSON", () => {
      localStorage.setItem("vitas_players", "{invalid json[");
      const result = SchemaMigrationService.validateDataIntegrity();
      expect(result.valid).toBe(false);
      expect(result.corruptedKeys).toContain("players");
    });

    it("detects multiple corrupted keys", () => {
      localStorage.setItem("vitas_players", "not json");
      localStorage.setItem("vitas_sync_queue", "also bad");
      const result = SchemaMigrationService.validateDataIntegrity();
      expect(result.corruptedKeys.length).toBe(2);
    });

    it("ignores non-critical keys", () => {
      localStorage.setItem("vitas_settings", "bad json here");
      const result = SchemaMigrationService.validateDataIntegrity();
      expect(result.valid).toBe(true);
    });
  });
});
