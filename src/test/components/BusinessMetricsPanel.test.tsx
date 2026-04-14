/**
 * BusinessMetricsPanel — Tests
 * Verifica renderizado de métricas, loading, error states.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockUseBusinessAnalytics = vi.fn();
vi.mock("@/hooks/useBusinessAnalytics", () => ({
  useBusinessAnalytics: () => mockUseBusinessAnalytics(),
  topEndpoints: (byEndpoint: Record<string, number>) =>
    Object.entries(byEndpoint)
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count),
  endpointLabel: (name: string) => {
    const labels: Record<string, string> = {
      "scout-insight": "Scout Insight",
      "video-intelligence": "Video Intelligence",
    };
    return labels[name] ?? name;
  },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (_key: string, fallback: string) => fallback ?? _key,
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, ...props }: any) => {
        const Tag = prop as any;
        return <Tag {...props}>{children}</Tag>;
      };
    },
  });
  return { motion, AnimatePresence: ({ children }: any) => <>{children}</> };
});

import BusinessMetricsPanel from "@/components/BusinessMetricsPanel";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("BusinessMetricsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("renders loading state", () => {
    mockUseBusinessAnalytics.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    });
    render(<BusinessMetricsPanel />);
    // Should show spinner (Loader2)
    expect(document.querySelector(".animate-spin")).toBeDefined();
  });

  it("renders error state", () => {
    mockUseBusinessAnalytics.mockReturnValue({
      data: null,
      isLoading: false,
      isError: true,
    });
    render(<BusinessMetricsPanel />);
    expect(screen.getByText("Metricas de negocio no disponibles")).toBeDefined();
  });

  it("renders usage data with growth", () => {
    mockUseBusinessAnalytics.mockReturnValue({
      data: {
        usage: {
          thisMonth: 42,
          previousMonth: 30,
          growthPercent: 40,
          byEndpoint: { "scout-insight": 25, "video-intelligence": 17 },
        },
        players: { total: 12 },
        team: { total: 3, byRole: { director: 1, scout: 2 }, byStatus: { active: 3 } },
        analyses: { total: 20, byAgent: { ScoutInsightAgent: 12 } },
        subscription: { plan: "pro", status: "active", current_period_end: "2026-05-01" },
        recentInsights: [],
      },
      isLoading: false,
      isError: false,
    });
    render(<BusinessMetricsPanel />);

    // Usage count
    expect(screen.getByText("42")).toBeDefined();
    // Growth
    expect(screen.getByText("+40%")).toBeDefined();
    // Endpoint breakdown
    expect(screen.getByText("Scout Insight")).toBeDefined();
    expect(screen.getByText("Video Intelligence")).toBeDefined();
    // Team
    expect(screen.getByText("3 miembros totales")).toBeDefined();
    // Subscription
    expect(screen.getByText("Plan pro")).toBeDefined();
  });

  it("renders negative growth correctly", () => {
    mockUseBusinessAnalytics.mockReturnValue({
      data: {
        usage: { thisMonth: 10, previousMonth: 20, growthPercent: -50, byEndpoint: {} },
        players: { total: 5 },
        team: { total: 0, byRole: {}, byStatus: {} },
        analyses: { total: 0, byAgent: {} },
        subscription: null,
        recentInsights: [],
      },
      isLoading: false,
      isError: false,
    });
    render(<BusinessMetricsPanel />);
    expect(screen.getByText("-50%")).toBeDefined();
  });

  it("handles zero usage gracefully", () => {
    mockUseBusinessAnalytics.mockReturnValue({
      data: {
        usage: { thisMonth: 0, previousMonth: 0, growthPercent: 0, byEndpoint: {} },
        players: { total: 0 },
        team: { total: 0, byRole: {}, byStatus: {} },
        analyses: { total: 0, byAgent: {} },
        subscription: null,
        recentInsights: [],
      },
      isLoading: false,
      isError: false,
    });
    render(<BusinessMetricsPanel />);
    expect(screen.getByText("0")).toBeDefined();
    expect(screen.getByText("0%")).toBeDefined();
  });
});
