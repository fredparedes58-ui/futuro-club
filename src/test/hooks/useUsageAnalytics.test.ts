/**
 * Tests for useUsageAnalytics — recordPlayerVisit + hook
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: { id: "u1" }, session: null, loading: false, configured: true })),
}));

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: vi.fn(() => [
      { id: "p1", name: "Player 1", vsi: 70, minutesPlayed: 200, metrics: {}, phvCategory: "ontme" },
      { id: "p2", name: "Player 2", vsi: 65, minutesPlayed: 100, metrics: {}, phvCategory: "early" },
    ]),
  },
}));

vi.mock("@/services/real/subscriptionService", () => ({
  SubscriptionService: {
    getCurrent: vi.fn(() => ({ plan: "free", status: "active" })),
    getAnalysesUsedThisMonth: vi.fn(() => 2),
  },
  PLAN_LIMITS: {
    free: { players: 5, analyses: 3 },
    pro: { players: 25, analyses: 20 },
    club: { players: 9999, analyses: 9999 },
  },
}));

vi.mock("@/services/real/storageService", () => {
  const store: Record<string, unknown> = {};
  return {
    StorageService: {
      get: vi.fn((key: string, fallback: unknown) => store[key] ?? fallback),
      set: vi.fn((key: string, value: unknown) => { store[key] = value; }),
      remove: vi.fn((key: string) => { delete store[key]; }),
    },
  };
});

vi.mock("@/services/real/matchEventsService", () => ({
  MatchEventsService: {
    getAll: vi.fn(() => [
      { id: "e1", playerId: "p1", type: "gol" },
      { id: "e2", playerId: "p1", type: "asistencia" },
    ]),
  },
}));

import { recordPlayerVisit, useUsageAnalytics } from "@/hooks/useUsageAnalytics";
import { StorageService } from "@/services/real/storageService";

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

describe("recordPlayerVisit", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset stored visits
    vi.mocked(StorageService.get).mockReturnValue({});
  });

  it("records a visit and increments count", () => {
    recordPlayerVisit("p1");
    expect(StorageService.set).toHaveBeenCalledWith(
      "player_visits",
      expect.objectContaining({
        p1: expect.objectContaining({ count: 1 }),
      }),
    );
  });

  it("increments existing visit count", () => {
    vi.mocked(StorageService.get).mockReturnValue({
      p1: { count: 3, last: "2025-01-01T00:00:00Z" },
    });
    recordPlayerVisit("p1");
    expect(StorageService.set).toHaveBeenCalledWith(
      "player_visits",
      expect.objectContaining({
        p1: expect.objectContaining({ count: 4 }),
      }),
    );
  });

  it("sets a valid ISO timestamp", () => {
    recordPlayerVisit("p2");
    const call = vi.mocked(StorageService.set).mock.calls[0];
    const visits = call[1] as Record<string, { count: number; last: string }>;
    expect(new Date(visits.p2.last).toISOString()).toBe(visits.p2.last);
  });
});

describe("useUsageAnalytics", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns usage analytics data", async () => {
    const { result } = renderHook(() => useUsageAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());

    const data = result.current.data!;
    expect(data.plan).toBe("free");
    expect(data.playerCount).toBe(2);
    expect(data.analysesUsed).toBe(2);
  });

  it("includes topPlayers sorted by activity", async () => {
    const { result } = renderHook(() => useUsageAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(result.current.data!.topPlayers.length).toBeGreaterThan(0);
  });

  it("generates alerts array", async () => {
    const { result } = renderHook(() => useUsageAnalytics(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => expect(result.current.data).toBeDefined());
    expect(Array.isArray(result.current.data!.alerts)).toBe(true);
  });
});
