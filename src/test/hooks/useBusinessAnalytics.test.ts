/**
 * useBusinessAnalytics — Tests
 * Verifica fetch, parsing, y helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@test.com" } }),
}));

vi.mock("@/lib/supabase", () => ({
  supabase: { auth: { getSession: async () => ({ data: { session: null } }) } },
  SUPABASE_CONFIGURED: false,
}));

vi.mock("@/lib/apiAuth", () => ({
  getAuthHeaders: async () => ({ "Content-Type": "application/json" }),
}));

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { useBusinessAnalytics, topEndpoints, endpointLabel } from "@/hooks/useBusinessAnalytics";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

const mockAnalytics = {
  data: {
    generatedAt: "2026-04-14T00:00:00Z",
    month: "2026-04",
    usage: {
      thisMonth: 42,
      previousMonth: 30,
      growthPercent: 40,
      byEndpoint: {
        "scout-insight": 20,
        "video-intelligence": 15,
        "role-profile": 7,
      },
    },
    players: { total: 12 },
    team: { total: 4, byRole: { director: 1, scout: 2, coach: 1 }, byStatus: { active: 4 } },
    analyses: { total: 25, byAgent: { ScoutInsightAgent: 15, VideoIntelligenceAgent: 10 } },
    subscription: { plan: "pro", status: "active", current_period_end: "2026-05-01" },
    recentInsights: [],
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useBusinessAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("fetches and returns analytics data", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockAnalytics,
    });

    const { result } = renderHook(() => useBusinessAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.usage.thisMonth).toBe(42);
    expect(result.current.data!.usage.growthPercent).toBe(40);
    expect(result.current.data!.players.total).toBe(12);
    expect(result.current.data!.team.total).toBe(4);
  });

  it("handles API error gracefully", async () => {
    // Mock both the initial call and the retry (retry: 1 in hook)
    mockFetch
      .mockResolvedValueOnce({ ok: false, status: 500 })
      .mockResolvedValueOnce({ ok: false, status: 500 });

    const { result } = renderHook(() => useBusinessAnalytics(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isError).toBe(true), { timeout: 5000 });
    expect(result.current.data).toBeUndefined();
  });
});

describe("topEndpoints", () => {
  it("sorts endpoints by count descending", () => {
    const result = topEndpoints({
      "role-profile": 5,
      "scout-insight": 20,
      "video-intelligence": 10,
    });
    expect(result[0].name).toBe("scout-insight");
    expect(result[0].count).toBe(20);
    expect(result[2].name).toBe("role-profile");
  });

  it("handles empty input", () => {
    expect(topEndpoints({})).toEqual([]);
  });
});

describe("endpointLabel", () => {
  it("returns friendly label for known endpoints", () => {
    expect(endpointLabel("scout-insight")).toBe("Scout Insight");
    expect(endpointLabel("video-intelligence")).toBe("Video Intelligence");
  });

  it("returns raw name for unknown endpoints", () => {
    expect(endpointLabel("custom-agent")).toBe("custom-agent");
  });
});
