/**
 * BackupService — Tests
 * Export/import de datos localStorage con validación Zod
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock StorageService
const mockStorage: Record<string, unknown> = {};
vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn((key: string, fallback: unknown) => mockStorage[key] ?? fallback),
    set: vi.fn((key: string, val: unknown) => { mockStorage[key] = val; }),
    keys: vi.fn(() => Object.keys(mockStorage)),
  },
}));

// Mock PlayerSchema
vi.mock("@/services/real/playerService", () => ({
  PlayerSchema: {
    safeParse: vi.fn((data: unknown) => {
      if (data && typeof data === "object" && "name" in data) {
        return { success: true, data };
      }
      return { success: false, error: { message: "invalid" } };
    }),
  },
}));

// Mock DOM APIs
const mockCreateElement = vi.fn(() => ({
  href: "",
  download: "",
  click: vi.fn(),
}));
const mockCreateObjectURL = vi.fn(() => "blob:mock");
const mockRevokeObjectURL = vi.fn();

Object.defineProperty(global, "document", {
  value: { createElement: mockCreateElement },
  writable: true,
});
Object.defineProperty(global, "URL", {
  value: { createObjectURL: mockCreateObjectURL, revokeObjectURL: mockRevokeObjectURL },
  writable: true,
});
Object.defineProperty(global, "Blob", {
  value: class MockBlob { constructor(public parts: unknown[], public options: unknown) {} },
  writable: true,
});

import { BackupService } from "@/services/real/backupService";

describe("BackupService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("export() devuelve JSON válido con metadatos", () => {
    mockStorage["players"] = [{ name: "Test" }];
    mockStorage["settings"] = { theme: "dark" };
    const json = BackupService.export();
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe("vitas");
    expect(parsed.version).toBeDefined();
    expect(parsed.exportedAt).toBeDefined();
    expect(parsed.data).toBeDefined();
  });

  it("export() incluye datos de localStorage", () => {
    mockStorage["players"] = [{ name: "Pedri" }];
    mockStorage["videos"] = [{ id: "v1" }];
    const parsed = JSON.parse(BackupService.export());
    expect(parsed.data.players).toEqual([{ name: "Pedri" }]);
    expect(parsed.data.videos).toEqual([{ id: "v1" }]);
  });

  it("export() funciona con storage vacío", () => {
    const json = BackupService.export();
    const parsed = JSON.parse(json);
    expect(parsed.app).toBe("vitas");
    expect(parsed.data).toBeDefined();
  });

  it("import() restaura datos válidos", () => {
    const backup = JSON.stringify({
      version: 1,
      app: "vitas",
      exportedAt: new Date().toISOString(),
      data: {
        players: [{ name: "Gavi", id: "p1" }],
        videos: [{ id: "v1" }],
        settings: { theme: "dark" },
      },
    });
    const result = BackupService.import(backup);
    expect(result.success).toBe(true);
    expect(result.errors.length).toBe(0);
    expect(result.imported.length).toBeGreaterThan(0);
  });

  it("import() rechaza JSON inválido", () => {
    const result = BackupService.import("not json at all");
    expect(result.success).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });

  it("import() rechaza backup sin campo app", () => {
    const result = BackupService.import(JSON.stringify({ data: {} }));
    expect(result.success).toBe(false);
  });

  it("export() genera campo exportedAt con formato ISO", () => {
    const parsed = JSON.parse(BackupService.export());
    expect(new Date(parsed.exportedAt).toISOString()).toBe(parsed.exportedAt);
  });

  it("export() incluye version numérica", () => {
    const parsed = JSON.parse(BackupService.export());
    expect(typeof parsed.version).toBe("number");
  });

  it("import() cuenta jugadores importados", () => {
    const backup = JSON.stringify({
      version: 1,
      app: "vitas",
      exportedAt: new Date().toISOString(),
      data: {
        players: [
          { name: "Player1", id: "1" },
          { name: "Player2", id: "2" },
        ],
      },
    });
    const result = BackupService.import(backup);
    expect(result.playersCount).toBe(2);
  });

  it("import() cuenta videos importados", () => {
    const backup = JSON.stringify({
      version: 1,
      app: "vitas",
      exportedAt: new Date().toISOString(),
      data: {
        videos: [{ id: "v1" }, { id: "v2" }, { id: "v3" }],
      },
    });
    const result = BackupService.import(backup);
    expect(result.videosCount).toBe(3);
  });
});
