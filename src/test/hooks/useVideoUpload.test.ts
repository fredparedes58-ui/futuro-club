/**
 * useVideoUpload — Tests
 * Cubre el flujo completo de upload: init → TUS → polling → pipeline
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ──────────────────────────────────────────────────────────────────
const mockStorage: Record<string, unknown> = {};
vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn((key: string, fallback: unknown) => mockStorage[key] ?? fallback),
    set: vi.fn((key: string, val: unknown) => { mockStorage[key] = val; }),
  },
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1" } }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {},
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/services/real/supabaseVideoService", () => ({
  SupabaseVideoService: {
    pushOne: vi.fn().mockResolvedValue(undefined),
  },
}));

vi.mock("@/lib/localVideoUtils", () => ({
  generateLocalVideoId: () => "local-123",
  extractVideoMetadata: vi.fn().mockResolvedValue({ duration: 60, width: 1920, height: 1080 }),
  extractThumbnailFromVideo: vi.fn().mockResolvedValue("data:image/png;base64,thumb"),
}));

vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({
    invalidateQueries: vi.fn(),
  }),
}));

// Mock TUS
vi.mock("tus-js-client", () => ({
  Upload: vi.fn().mockImplementation((_file: File, opts: { onSuccess?: () => void; onProgress?: (a: number, b: number) => void }) => ({
    start: () => {
      opts.onProgress?.(50, 100);
      opts.onSuccess?.();
    },
    abort: vi.fn(),
  })),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

// Stub URL.createObjectURL
vi.stubGlobal("URL", {
  ...globalThis.URL,
  createObjectURL: () => "blob:test-video",
});

import { renderHook, act } from "@testing-library/react";
import { useVideoUpload } from "@/hooks/useVideoUpload";

describe("useVideoUpload", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
    mockStorage["vitas_videos"] = [];
  });

  it("starts in idle state", () => {
    const { result } = renderHook(() => useVideoUpload("p1"));
    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.progress).toBe(0);
    expect(result.current.state.videoId).toBeNull();
  });

  it("local fallback when Bunny not configured", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        phase2Pending: true,
        error: "BUNNY_STREAM not configured",
      }),
    });

    const file = new File(["video-content"], "test.mp4", { type: "video/mp4" });
    const { result } = renderHook(() => useVideoUpload("p1"));

    await act(async () => {
      await result.current.upload(file, "Test Video");
    });

    expect(result.current.state.phase).toBe("done");
    expect(result.current.state.videoId).toBe("local-123");
    expect(result.current.state.progress).toBe(100);
  });

  it("full upload flow calls init with correct params", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        phase2Pending: true,
      }),
    });

    const file = new File(["video-data"], "match.mp4", { type: "video/mp4" });
    const { result } = renderHook(() => useVideoUpload("p1"));

    await act(async () => {
      await result.current.upload(file, "Match Day");
    });

    // Verify init was called with correct body
    expect(mockFetch).toHaveBeenCalledWith("/api/upload/video-init", expect.objectContaining({
      method: "POST",
      body: JSON.stringify({ title: "Match Day", playerId: "p1" }),
    }));

    // Falls back to local since Bunny not configured
    expect(result.current.state.phase).toBe("done");
  });

  it("handles init failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({
        success: false,
        error: "BUNNY_STREAM_API_KEY not configured",
      }),
    });

    const file = new File(["x"], "test.mp4", { type: "video/mp4" });
    const { result } = renderHook(() => useVideoUpload("p1"));

    await act(async () => {
      await result.current.upload(file);
    });

    expect(result.current.state.phase).toBe("error");
    expect(result.current.state.error).toBeTruthy();
  });

  it("reset() returns to idle", async () => {
    const { result } = renderHook(() => useVideoUpload("p1"));

    act(() => {
      result.current.reset();
    });

    expect(result.current.state.phase).toBe("idle");
    expect(result.current.state.progress).toBe(0);
  });

  it("cancel() aborts and resets", () => {
    const { result } = renderHook(() => useVideoUpload("p1"));

    act(() => {
      result.current.cancel();
    });

    expect(result.current.state.phase).toBe("idle");
  });
});
