/**
 * useUsageMeter — Tests
 * Verifica cálculos de porcentaje, status, y edge cases.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUsePlan = vi.fn();

vi.mock("@/hooks/usePlan", () => ({
  usePlan: () => mockUsePlan(),
}));

vi.mock("@/context/AuthContext", () => ({
  useAuth: () => ({ user: { id: "u1", email: "test@test.com" } }),
}));

import { useUsageMeter } from "@/hooks/useUsageMeter";

// ── Helpers ──────────────────────────────────────────────────────────────────

function basePlan(overrides: Record<string, unknown> = {}) {
  return {
    plan: "free",
    limits: { analyses: 3, players: 5, vaep: false, pdf: false, roles: false, pushNotifications: false },
    playerCount: 1,
    analysesUsed: 0,
    canAddPlayer: true,
    canRunAnalysis: true,
    canUseVAEP: false,
    canExportPDF: false,
    canManageRoles: false,
    canUsePush: false,
    isPro: false,
    isClub: false,
    isAdmin: false,
    stripeCustomerId: null,
    currentPeriodEnd: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("useUsageMeter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns ok status when usage is low", () => {
    mockUsePlan.mockReturnValue(basePlan({ analysesUsed: 1 }));
    const meter = useUsageMeter();
    expect(meter.status).toBe("ok");
    expect(meter.used).toBe(1);
    expect(meter.limit).toBe(3);
    expect(meter.remaining).toBe(2);
    expect(meter.percent).toBe(33);
    expect(meter.canRunAnalysis).toBe(true);
    expect(meter.isUnlimited).toBe(false);
  });

  it("returns warning status at 60%+", () => {
    mockUsePlan.mockReturnValue(basePlan({ analysesUsed: 2 }));
    const meter = useUsageMeter();
    expect(meter.status).toBe("warning");
    expect(meter.percent).toBe(67);
  });

  it("returns critical status at 80%+", () => {
    mockUsePlan.mockReturnValue(basePlan({
      plan: "pro",
      limits: { analyses: 20, players: 50, vaep: true, pdf: true, roles: false, pushNotifications: true },
      analysesUsed: 17,
    }));
    const meter = useUsageMeter();
    expect(meter.status).toBe("critical");
    expect(meter.percent).toBe(85);
    expect(meter.remaining).toBe(3);
  });

  it("returns exceeded status at 100%", () => {
    mockUsePlan.mockReturnValue(basePlan({
      analysesUsed: 3,
      canRunAnalysis: false,
    }));
    const meter = useUsageMeter();
    expect(meter.status).toBe("exceeded");
    expect(meter.percent).toBe(100);
    expect(meter.remaining).toBe(0);
    expect(meter.canRunAnalysis).toBe(false);
  });

  it("caps percent at 100 even if over limit", () => {
    mockUsePlan.mockReturnValue(basePlan({
      analysesUsed: 5,
      canRunAnalysis: false,
    }));
    const meter = useUsageMeter();
    expect(meter.percent).toBe(100);
    expect(meter.remaining).toBe(0);
  });

  it("returns unlimited for club plan", () => {
    mockUsePlan.mockReturnValue(basePlan({
      plan: "club",
      limits: { analyses: 9999, players: 9999, vaep: true, pdf: true, roles: true, pushNotifications: true },
      analysesUsed: 50,
      isClub: true,
    }));
    const meter = useUsageMeter();
    expect(meter.isUnlimited).toBe(true);
    expect(meter.limit).toBe(-1);
    expect(meter.status).toBe("ok");
    expect(meter.remaining).toBe(Infinity);
  });

  it("returns unlimited for admin", () => {
    mockUsePlan.mockReturnValue(basePlan({
      plan: "club",
      limits: { analyses: 9999, players: 9999, vaep: true, pdf: true, roles: true, pushNotifications: true },
      isAdmin: true,
    }));
    const meter = useUsageMeter();
    expect(meter.isUnlimited).toBe(true);
    expect(meter.isAdmin).toBe(true);
  });

  it("returns 0 percent when limit is 0", () => {
    mockUsePlan.mockReturnValue(basePlan({
      limits: { analyses: 0, players: 0, vaep: false, pdf: false, roles: false, pushNotifications: false },
      analysesUsed: 0,
    }));
    const meter = useUsageMeter();
    expect(meter.percent).toBe(0);
  });

  it("plan name is passed through", () => {
    mockUsePlan.mockReturnValue(basePlan({ plan: "pro" }));
    const meter = useUsageMeter();
    expect(meter.plan).toBe("pro");
  });
});
