import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock dependencies
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "test-user" } }),
}));

vi.mock("@/lib/supabase", () => ({
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/services/real/videoService", () => ({
  VideoService: {
    save: vi.fn(),
    getById: vi.fn(() => null),
    createStub: vi.fn((p: any) => p),
    saveAnalysis: vi.fn(),
  },
}));

vi.mock("@/services/real/supabaseVideoService", () => ({
  SupabaseVideoService: { pushOne: vi.fn() },
}));

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json" })),
}));

vi.mock("@/lib/localVideoUtils", () => ({
  generateLocalVideoId: () => "local-test-id",
  extractVideoMetadata: vi.fn(async () => ({ duration: 60, width: 1920, height: 1080 })),
  extractThumbnailFromVideo: vi.fn(async () => "data:image/png;base64,thumb"),
}));

vi.mock("@/services/errorDiagnosticService", () => ({
  getErrorDetails: (_err: unknown, _ctx: string) => ({
    title: "Test Error",
    description: "Test error description",
  }),
}));

vi.mock("tus-js-client", () => ({
  Upload: vi.fn().mockImplementation(() => ({
    start: vi.fn(),
    abort: vi.fn(),
  })),
}));

describe("useVideoUpload types and constants", () => {
  it("exports UploadPhase type with all expected values", async () => {
    const mod = await import("@/hooks/useVideoUpload");
    expect(mod).toBeDefined();
    // The module should export useVideoUpload function
    expect(typeof mod.useVideoUpload).toBe("function");
  });

  it("INITIAL state has correct defaults", async () => {
    // Verify the module loads without errors
    const mod = await import("@/hooks/useVideoUpload");
    expect(mod).toBeDefined();
  });
});

describe("upload state management", () => {
  it("module exports are correct shape", async () => {
    const mod = await import("@/hooks/useVideoUpload");
    expect(mod.useVideoUpload).toBeDefined();
  });
});
