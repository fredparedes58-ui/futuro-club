/**
 * AdminDashboardPage — Tests
 * Verifica control de acceso por email admin, renderizado de tabs,
 * estados loading/error, y render de analíticas.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";

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

const mockUseAuth = vi.fn();
vi.mock("@/context/AuthContext", () => ({
  useAuth: () => mockUseAuth(),
}));

vi.mock("framer-motion", () => {
  const motion = new Proxy({}, {
    get: (_target, prop: string) => {
      return ({ children, ...props }: { children?: React.ReactNode } & Record<string, unknown>) => {
        const Tag = prop as keyof JSX.IntrinsicElements;
        return <Tag {...props}>{children}</Tag>;
      };
    },
  });
  return { motion, AnimatePresence: ({ children }: { children?: React.ReactNode }) => <>{children}</> };
});

import AdminDashboardPage from "@/pages/AdminDashboardPage";

// ── i18n ─────────────────────────────────────────────────────────────────────
// The page migrated to react-i18next; its t() returns raw keys unless an
// i18next instance is provided. We build a dedicated instance pinned to "es"
// (no LanguageDetector → deterministic) loaded with the real translations, so
// assertions can target the actual Spanish copy the user sees.
import { I18nextProvider, initReactI18next } from "react-i18next";
import { createInstance } from "i18next";
import esTranslations from "@/i18n/es.json";

const testI18n = createInstance();
testI18n.use(initReactI18next).init({
  resources: { es: { translation: esTranslations } },
  lng: "es",
  fallbackLng: "es",
  interpolation: { escapeValue: false },
  react: { useSuspense: false },
});

// ── Helpers ──────────────────────────────────────────────────────────────────

function renderPage() {
  return render(
    <I18nextProvider i18n={testI18n}>
      <MemoryRouter initialEntries={["/admin"]}>
        <AdminDashboardPage />
      </MemoryRouter>
    </I18nextProvider>
  );
}

function makeAnalytics(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    generatedAt: "2026-04-15T12:00:00Z",
    month: "2026-04",
    usage: {
      thisMonth: 42,
      previousMonth: 30,
      growthPercent: 40,
      byEndpoint: { "scout-insight": 25, "video-intelligence": 17 },
    },
    players: { total: 12 },
    team: { total: 3, byRole: { director: 1, scout: 2 }, byStatus: { active: 3 } },
    analyses: { total: 20, byAgent: { ScoutInsightAgent: 12 } },
    subscription: { plan: "pro", status: "active", current_period_end: "2026-05-01T00:00:00Z" },
    recentInsights: [
      {
        id: "i1",
        type: "opportunity",
        headline: "Jugador destacado en Sub-16",
        urgency: "high",
        created_at: "2026-04-10T12:00:00Z",
      },
    ],
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("AdminDashboardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe("acceso", () => {
    it("bloquea acceso si usuario no es admin", () => {
      mockUseAuth.mockReturnValue({ user: { email: "scout@example.com" } });
      mockUseBusinessAnalytics.mockReturnValue({
        data: null, isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
      });

      renderPage();
      expect(screen.getByText(/acceso restringido/i)).toBeInTheDocument();
      expect(screen.queryByText(/admin dashboard/i)).not.toBeInTheDocument();
    });

    it("bloquea acceso si no hay usuario", () => {
      mockUseAuth.mockReturnValue({ user: null });
      mockUseBusinessAnalytics.mockReturnValue({
        data: null, isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
      });

      renderPage();
      expect(screen.getByText(/acceso restringido/i)).toBeInTheDocument();
    });

    it("permite acceso al email admin por defecto", () => {
      mockUseAuth.mockReturnValue({ user: { email: "fredparedes58@gmail.com" } });
      mockUseBusinessAnalytics.mockReturnValue({
        data: makeAnalytics(), isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
      });

      renderPage();
      expect(screen.getByText(/admin dashboard/i)).toBeInTheDocument();
      expect(screen.queryByText(/acceso restringido/i)).not.toBeInTheDocument();
    });
  });

  describe("estados", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: { email: "fredparedes58@gmail.com" } });
    });

    it("muestra loading spinner mientras carga", () => {
      mockUseBusinessAnalytics.mockReturnValue({
        data: null, isLoading: true, error: null, refetch: vi.fn(), isRefetching: false,
      });
      renderPage();
      expect(document.querySelector(".animate-spin")).toBeTruthy();
    });

    it("muestra error si falla la carga", () => {
      mockUseBusinessAnalytics.mockReturnValue({
        data: null,
        isLoading: false,
        error: new Error("Network timeout"),
        refetch: vi.fn(),
        isRefetching: false,
      });
      renderPage();
      // i18n copy is now "Error al cargar las analíticas" (adminDashboardPage.errorLoadingAnalytics)
      expect(screen.getByText(/error al cargar las analíticas/i)).toBeInTheDocument();
      expect(screen.getByText(/network timeout/i)).toBeInTheDocument();
    });
  });

  describe("tabs con data cargada", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: { email: "fredparedes58@gmail.com" } });
      mockUseBusinessAnalytics.mockReturnValue({
        data: makeAnalytics(), isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
      });
    });

    it("tab Resumen muestra KPIs globales", () => {
      renderPage();
      // KPI values
      expect(screen.getByText("42")).toBeInTheDocument();
      expect(screen.getByText("12")).toBeInTheDocument();
      expect(screen.getByText("3")).toBeInTheDocument();
      expect(screen.getByText("20")).toBeInTheDocument();
      // Subscription
      expect(screen.getByText(/pro/i)).toBeInTheDocument();
      expect(screen.getByText(/active/i)).toBeInTheDocument();
    });

    it("tab Uso IA muestra breakdown de endpoints", () => {
      renderPage();
      // Tab label is now "Uso" (adminDashboardPage.tabUsage), no longer "Uso IA"
      fireEvent.click(screen.getByRole("button", { name: /^uso$/i }));
      expect(screen.getByText(/mes actual vs anterior/i)).toBeInTheDocument();
      expect(screen.getByText("Scout Insight")).toBeInTheDocument();
      expect(screen.getByText("Video Intelligence")).toBeInTheDocument();
    });

    it("tab Equipo muestra composición por rol", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /^equipo$/i }));
      expect(screen.getByText(/composición por rol/i)).toBeInTheDocument();
      expect(screen.getByText(/director/i)).toBeInTheDocument();
      expect(screen.getByText(/scout/i)).toBeInTheDocument();
    });

    it("tab Insights muestra insights recientes", () => {
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /insights/i }));
      expect(screen.getByText(/insights recientes/i)).toBeInTheDocument();
      expect(screen.getByText(/jugador destacado en sub-16/i)).toBeInTheDocument();
      expect(screen.getByText(/high/i)).toBeInTheDocument();
    });

    it("muestra mensaje cuando no hay insights", () => {
      mockUseBusinessAnalytics.mockReturnValue({
        data: makeAnalytics({ recentInsights: [] }),
        isLoading: false,
        error: null,
        refetch: vi.fn(),
        isRefetching: false,
      });
      renderPage();
      fireEvent.click(screen.getByRole("button", { name: /insights/i }));
      // Empty-state copy is now "Aún no hay insights" (adminDashboardPage.noInsightsYet)
      expect(screen.getByText(/aún no hay insights/i)).toBeInTheDocument();
    });

    it("botón refresh llama a refetch", () => {
      const refetch = vi.fn();
      mockUseBusinessAnalytics.mockReturnValue({
        data: makeAnalytics(), isLoading: false, error: null, refetch, isRefetching: false,
      });
      renderPage();
      // Refresh button aria-label is now "Actualizar" (adminDashboardPage.refresh)
      fireEvent.click(screen.getByLabelText(/actualizar/i));
      expect(refetch).toHaveBeenCalled();
    });
  });

  describe("trend badges", () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({ user: { email: "fredparedes58@gmail.com" } });
    });

    it("muestra trend positivo en verde con +40%", () => {
      mockUseBusinessAnalytics.mockReturnValue({
        data: makeAnalytics(), isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
      });
      renderPage();
      // There may be multiple matches (KPI card + overview), just assert presence
      expect(screen.getAllByText(/\+40%/).length).toBeGreaterThan(0);
    });

    it("muestra trend negativo", () => {
      mockUseBusinessAnalytics.mockReturnValue({
        data: makeAnalytics({
          usage: { thisMonth: 10, previousMonth: 20, growthPercent: -50, byEndpoint: {} },
        }),
        isLoading: false, error: null, refetch: vi.fn(), isRefetching: false,
      });
      renderPage();
      expect(screen.getAllByText(/-50%/).length).toBeGreaterThan(0);
    });
  });
});
