/**
 * UsageMeter — Tests
 * Renderizado en modo compact/full, estados visuales, unlimited.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseUsageMeter = vi.fn();
vi.mock("@/hooks/useUsageMeter", () => ({
  useUsageMeter: () => mockUseUsageMeter(),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback: string) => fallback ?? key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

import UsageMeter from "@/components/UsageMeter";

// ── Helpers ──────────────────────────────────────────────────────────────────

function baseMeter(overrides: Record<string, unknown> = {}) {
  return {
    plan: "free",
    used: 1,
    limit: 3,
    remaining: 2,
    percent: 33,
    status: "ok" as const,
    canRunAnalysis: true,
    isUnlimited: false,
    isAdmin: false,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("UsageMeter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders full mode with usage data", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter());
    render(<UsageMeter />);
    expect(screen.getByText(/1 \/ 3/)).toBeDefined();
    expect(screen.getByText("2 restantes")).toBeDefined();
    expect(screen.getByText("free")).toBeDefined();
  });

  it("renders compact mode", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter());
    render(<UsageMeter compact />);
    expect(screen.getByText("1/3")).toBeDefined();
  });

  it("shows unlimited for club/admin", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter({
      isUnlimited: true,
      plan: "club",
      limit: -1,
      remaining: Infinity,
      percent: 0,
    }));
    render(<UsageMeter />);
    expect(screen.getByText(/Ilimitado|ilimitados/i)).toBeDefined();
  });

  it("shows unlimited in compact mode", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter({
      isUnlimited: true,
    }));
    render(<UsageMeter compact />);
    expect(screen.getByText("Ilimitado")).toBeDefined();
  });

  it("shows limit reached when exceeded", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter({
      used: 3,
      limit: 3,
      remaining: 0,
      percent: 100,
      status: "exceeded",
      canRunAnalysis: false,
    }));
    render(<UsageMeter />);
    expect(screen.getByText(/Lmite alcanzado/)).toBeDefined();
  });

  it("shows remaining count in critical status", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter({
      used: 17,
      limit: 20,
      remaining: 3,
      percent: 85,
      status: "critical",
      plan: "pro",
    }));
    render(<UsageMeter />);
    expect(screen.getByText("3 restantes")).toBeDefined();
    expect(screen.getByText("pro")).toBeDefined();
  });

  it("renders plan badge", () => {
    mockUseUsageMeter.mockReturnValue(baseMeter({ plan: "pro" }));
    render(<UsageMeter />);
    expect(screen.getByText("pro")).toBeDefined();
  });
});
