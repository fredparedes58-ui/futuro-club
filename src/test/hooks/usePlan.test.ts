/**
 * VITAS · Tests — usePlan hook
 * Verifica: plan por defecto, límites por plan, flags, playerCount
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, waitFor } from "@testing-library/react";
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("@/context/AuthContext", () => ({
  useAuth: vi.fn(() => ({ user: null, session: null, loading: false, configured: false })),
}));

vi.mock("@/services/real/subscriptionService", () => ({
  SubscriptionService: {
    getCurrent: vi.fn(() => ({
      plan: "free",
      status: "active",
      stripeCustomerId: null,
      stripeSubscriptionId: null,
      currentPeriodEnd: null,
      updatedAt: new Date().toISOString(),
    })),
    syncFromSupabase: vi.fn(async () => {}),
    getAnalysesUsedThisMonth: vi.fn(() => 0),
  },
  PLAN_LIMITS: {
    free: { players: 5, analyses: 3, vaep: false, pdf: false, roles: false, pushNotifications: false },
    pro: { players: 25, analyses: 20, vaep: true, pdf: true, roles: false, pushNotifications: true },
    club: { players: 9999, analyses: 9999, vaep: true, pdf: true, roles: true, pushNotifications: true },
  },
}));

vi.mock("@/services/real/playerService", () => ({
  PlayerService: {
    getAll: vi.fn(() => []),
  },
}));

import { useAuth } from "@/context/AuthContext";
import { SubscriptionService, PLAN_LIMITS } from "@/services/real/subscriptionService";
import { PlayerService } from "@/services/real/playerService";
import { usePlan } from "@/hooks/usePlan";

// ── Helpers ──────────────────────────────────────────────────────────────────

function createWrapper() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) =>
    React.createElement(QueryClientProvider, { client: qc }, children);
}

function mockUserWithPlan(plan: "free" | "pro" | "club", email = "test@test.com") {
  (SubscriptionService.getCurrent as ReturnType<typeof vi.fn>).mockReturnValue({
    plan, status: "active", stripeCustomerId: null,
    stripeSubscriptionId: null, currentPeriodEnd: null, updatedAt: new Date().toISOString(),
  });
  (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
    user: { id: "u1", email }, session: null, loading: false, configured: true,
  });
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("usePlan", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (PlayerService.getAll as ReturnType<typeof vi.fn>).mockReturnValue([]);
    (SubscriptionService.getAnalysesUsedThisMonth as ReturnType<typeof vi.fn>).mockReturnValue(0);
    (useAuth as ReturnType<typeof vi.fn>).mockReturnValue({
      user: null, session: null, loading: false, configured: false,
    });
  });

  it("retorna plan free por defecto", () => {
    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    expect(result.current.plan).toBe("free");
  });

  it("retorna límites correctos para plan pro", async () => {
    mockUserWithPlan("pro");
    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.plan).toBe("pro"));
    expect(result.current.limits.players).toBe(PLAN_LIMITS.pro.players);
    expect(result.current.limits.vaep).toBe(true);
    expect(result.current.limits.pdf).toBe(true);
  });

  it("retorna límites correctos para plan club", async () => {
    mockUserWithPlan("club");
    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.plan).toBe("club"));
    expect(result.current.limits.players).toBe(9999);
    expect(result.current.limits.roles).toBe(true);
  });

  it("isClub es true solo para plan club", async () => {
    // Free (sin user, no query)
    const { result: r1 } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    expect(r1.current.isClub).toBe(false);

    // Club
    mockUserWithPlan("club");
    const { result: r2 } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    await waitFor(() => expect(r2.current.isClub).toBe(true));
  });

  it("playerCount refleja cantidad real de jugadores", () => {
    (PlayerService.getAll as ReturnType<typeof vi.fn>).mockReturnValue([
      { id: "p1" }, { id: "p2" }, { id: "p3" },
    ]);

    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    expect(result.current.playerCount).toBe(3);
  });

  it("canAddPlayer es false cuando se alcanza límite free", () => {
    (PlayerService.getAll as ReturnType<typeof vi.fn>).mockReturnValue(
      Array.from({ length: 5 }, (_, i) => ({ id: `p${i}` }))
    );

    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    expect(result.current.canAddPlayer).toBe(false);
  });

  it("isPro es true para plan pro y club", async () => {
    mockUserWithPlan("pro");
    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    await waitFor(() => expect(result.current.isPro).toBe(true));
  });

  it("admin obtiene límites de club independientemente del plan", () => {
    mockUserWithPlan("free", "fredparedes58@gmail.com");
    const { result } = renderHook(() => usePlan(), { wrapper: createWrapper() });
    // Admin check is synchronous — no need to wait for query
    expect(result.current.isAdmin).toBe(true);
    expect(result.current.plan).toBe("club");
    expect(result.current.limits.roles).toBe(true);
  });
});
