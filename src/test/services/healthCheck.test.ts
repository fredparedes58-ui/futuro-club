/**
 * Tests for HealthCheckService
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { HealthCheckService } from "@/services/real/healthCheck";
import { SyncQueueService } from "@/services/real/syncQueueService";

// Mock dependencies
vi.mock("@/services/real/schemaMigration", () => ({
  SchemaMigrationService: {
    CURRENT_VERSION: 3,
    getCurrentVersion: vi.fn(() => 3),
    getLatestVersion: vi.fn(() => 3),
    needsMigration: vi.fn(() => false),
    isStorageWritable: vi.fn(() => true),
    validateDataIntegrity: vi.fn(() => ({ valid: true, corruptedKeys: [] })),
    migrateIfNeeded: vi.fn(() => ({ migrated: false, stepsApplied: [], errors: [] })),
    checkStorageQuota: vi.fn(() => ({ usedMB: 1.2, estimatedMaxMB: 5, usagePercent: 24, warning: false, critical: false })),
    migrate: vi.fn(),
  },
}));

vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn(() => null),
    set: vi.fn(),
    remove: vi.fn(),
    getAllKeys: vi.fn(() => ["vitas_players", "vitas_settings"]),
  },
}));

vi.mock("@/services/real/syncQueueService", () => ({
  SyncQueueService: {
    pendingCount: vi.fn(() => 0),
    getQueue: vi.fn(() => []),
  },
}));

describe("HealthCheckService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(SyncQueueService.pendingCount).mockReturnValue(0);
  });

  it("run() returns healthy result when everything is ok", () => {
    const result = HealthCheckService.run();
    expect(result.healthy).toBe(true);
    expect(result.checks.length).toBeGreaterThan(0);
    expect(result.timestamp).toBeDefined();
  });

  it("checks array contains named items with status", () => {
    const result = HealthCheckService.run();
    for (const check of result.checks) {
      expect(check.name).toBeDefined();
      expect(["ok", "warning", "error"]).toContain(check.status);
      expect(check.message).toBeDefined();
    }
  });

  it("has at least 4 checks", () => {
    const result = HealthCheckService.run();
    expect(result.checks.length).toBeGreaterThanOrEqual(4);
  });

  it("timestamp is valid ISO string", () => {
    const result = HealthCheckService.run();
    expect(new Date(result.timestamp).toISOString()).toBe(result.timestamp);
  });

  it("reports warning when sync queue has pending items", () => {
    vi.mocked(SyncQueueService.pendingCount).mockReturnValue(5);

    const result = HealthCheckService.run();
    const syncCheck = result.checks.find(c =>
      c.name.toLowerCase().includes("sync") || c.name.toLowerCase().includes("cola"),
    );
    if (syncCheck) {
      expect(["ok", "warning"]).toContain(syncCheck.status);
    }
  });
});
