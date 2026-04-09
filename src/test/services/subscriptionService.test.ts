/**
 * SubscriptionService — Tests
 * Planes, límites, contadores de análisis
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

const mockStorage: Record<string, unknown> = {};
vi.mock("@/services/real/storageService", () => ({
  StorageService: {
    get: vi.fn((key: string, fallback: unknown) => mockStorage[key] ?? fallback),
    set: vi.fn((key: string, val: unknown) => { mockStorage[key] = val; }),
  },
}));

vi.mock("@/lib/supabase", () => ({
  supabase: {
    from: vi.fn(() => ({
      select: vi.fn(() => ({ eq: vi.fn(() => ({ single: vi.fn(() => Promise.resolve({ data: null, error: null })) })) })),
      upsert: vi.fn(() => Promise.resolve({ error: null })),
    })),
    auth: { getUser: vi.fn(() => Promise.resolve({ data: { user: { id: "u1" } } })) },
  },
  SUPABASE_CONFIGURED: false,
}));

import { SubscriptionService as subscriptionService, PLAN_LIMITS, PLAN_LABELS, PLAN_PRICES } from "@/services/real/subscriptionService";

describe("SubscriptionService", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    Object.keys(mockStorage).forEach((k) => delete mockStorage[k]);
  });

  it("getCurrent() devuelve suscripción por defecto (free)", () => {
    const sub = subscriptionService.getCurrent();
    expect(sub.plan).toBe("free");
    expect(sub.status).toBe("active");
  });

  it("getPlan() devuelve el plan actual", () => {
    expect(subscriptionService.getPlan()).toBe("free");
  });

  it("getLimits() devuelve límites del plan free", () => {
    const limits = subscriptionService.getLimits();
    expect(limits.players).toBe(PLAN_LIMITS.free.players);
    expect(limits.vaep).toBe(false);
  });

  it("update() merge parcial en suscripción", () => {
    subscriptionService.update({ plan: "pro" });
    expect(subscriptionService.getPlan()).toBe("pro");
  });

  it("canAddPlayer() true si bajo límite", () => {
    expect(subscriptionService.canAddPlayer(3)).toBe(true);
  });

  it("canAddPlayer() false si alcanza límite free", () => {
    expect(subscriptionService.canAddPlayer(PLAN_LIMITS.free.players)).toBe(false);
  });

  it("canRunAnalysis() true si bajo límite mensual", () => {
    expect(subscriptionService.canRunAnalysis()).toBe(true);
  });

  it("incrementAnalysisCount() incrementa contador", () => {
    const before = subscriptionService.getAnalysesUsedThisMonth();
    subscriptionService.incrementAnalysisCount();
    const after = subscriptionService.getAnalysesUsedThisMonth();
    expect(after).toBe(before + 1);
  });

  it("plan pro tiene más límites que free", () => {
    expect(PLAN_LIMITS.pro.players).toBeGreaterThan(PLAN_LIMITS.free.players);
    expect(PLAN_LIMITS.pro.analyses).toBeGreaterThan(PLAN_LIMITS.free.analyses);
    expect(PLAN_LIMITS.pro.vaep).toBe(true);
  });

  it("plan club tiene límites ilimitados", () => {
    expect(PLAN_LIMITS.club.players).toBeGreaterThanOrEqual(9999);
    expect(PLAN_LIMITS.club.vaep).toBe(true);
    expect(PLAN_LIMITS.club.pdf).toBe(true);
  });

  it("PLAN_LABELS tiene etiquetas para todos los planes", () => {
    expect(PLAN_LABELS.free).toBeDefined();
    expect(PLAN_LABELS.pro).toBeDefined();
    expect(PLAN_LABELS.club).toBeDefined();
  });

  it("PLAN_PRICES tiene precios para todos los planes", () => {
    expect(PLAN_PRICES.free).toBeDefined();
    expect(PLAN_PRICES.pro).toBeDefined();
    expect(PLAN_PRICES.club).toBeDefined();
  });

  it("cambiar a pro permite más jugadores", () => {
    subscriptionService.update({ plan: "pro" });
    expect(subscriptionService.canAddPlayer(10)).toBe(true);
    expect(subscriptionService.getLimits().vaep).toBe(true);
  });
});
