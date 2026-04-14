/**
 * Tests for useVideos hooks
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: { id: "u1" }, session: null, loading: false, configured: true })),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    auth: { getSession: vi.fn(async () => ({ data: { session: null } })) },
  },
  SUPABASE_CONFIGURED: true,
}));

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: vi.fn(async () => ({ "Content-Type": "application/json" })),
}));

vi.mock("@/lib/localVideoUtils", () => ({
  isLocalSrc: vi.fn((path: string) => path?.startsWith("/local/")),
  clearStaleBlobUrls: vi.fn((v: unknown) => v),
}));

vi.mock("@/services/real/videoService", () => ({
  VideoService: {
    getAll: vi.fn(() => [
      {
        id: "v1",
        playerId: "p1",
        title: "Match 1",
        status: "finished",
        embedUrl: "https://cdn.example.com/v1.mp4",
        streamUrl: null,
        localPath: null,
        analysisResult: null,
        createdAt: "2025-01-01T00:00:00Z",
      },
      {
        id: "v2",
        playerId: "p2",
        title: "Match 2",
        status: "finished",
        embedUrl: null,
        streamUrl: "https://cdn.example.com/v2.mp4",
        localPath: null,
        analysisResult: { summary: "ok" },
        createdAt: "2025-02-01T00:00:00Z",
      },
    ]),
    getByPlayerId: vi.fn((pid: string) => [
      {
        id: "v1",
        playerId: pid,
        title: "Match 1",
        status: "finished",
        embedUrl: "https://cdn.example.com/v1.mp4",
      },
    ]),
    getById: vi.fn(() => null),
    save: vi.fn(),
    delete: vi.fn(),
    saveAnalysis: vi.fn(),
    syncFromApi: vi.fn(async () => []),
  },
}));

vi.mock("@/services/real/supabaseVideoService", () => ({
  SupabaseVideoService: {
    save: vi.fn(),
    delete: vi.fn(),
    saveAnalysis: vi.fn(),
  },
}));

vi.mock("@/services/real/pushNotificationService", () => ({
  PushNotificationService: {
    showLocal: vi.fn(async () => {}),
  },
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// Mock fetch for API calls
global.fetch = vi.fn(async () => ({
  ok: true,
  json: async () => ({ success: true, data: null }),
  text: async () => "",
})) as typeof fetch;

import { useVideos, useVideoCount, useDeleteVideo } from "@/hooks/useVideos";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("useVideos", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns all videos", async () => {
    const { result } = renderHook(() => useVideos(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.length).toBe(2);
  });

  it("filters by playerId", async () => {
    const { result } = renderHook(() => useVideos("p1"), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.length).toBe(1);
    expect(result.current.data![0].playerId).toBe("p1");
  });
});

describe("useVideoCount", () => {
  it("returns video count stats", async () => {
    const { result } = renderHook(() => useVideoCount(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.total).toBeGreaterThan(0));
    expect(result.current.finished).toBe(2);
    expect(result.current.analyzed).toBe(1);
  });
});

describe("useDeleteVideo", () => {
  it("returns a mutation function", () => {
    const { result } = renderHook(() => useDeleteVideo(), { wrapper: createWrapper() });
    expect(result.current.mutateAsync).toBeDefined();
    expect(typeof result.current.mutateAsync).toBe("function");
  });
});
