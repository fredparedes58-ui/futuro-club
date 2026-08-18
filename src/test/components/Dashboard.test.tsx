/**
 * Dashboard — Tests
 * Renderizado de stats, skeleton, empty state, quick access navigation
 */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
  // PulseInboxHero (Ola 2 UX) usa <Link> dentro del Dashboard
  Link: ({ to, children, ...props }: { to: string; children?: React.ReactNode } & Record<string, unknown>) =>
    React.createElement("a", { href: String(to), ...props }, children),
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string) => key,
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

vi.mock("sonner", () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

const mockStats = {
  activePlayers: 42,
  drillsCompleted: 128,
  avgVsi: 74,
  hiddenTalents: 5,
};

const mockPlayers = [
  {
    id: "p1", name: "Test Player", image: "", vsi: 88, positionShort: "CM",
    age: 17, academy: "Test Academy", position: "Mediocentro",
    stats: { speed: 80, shooting: 70, vision: 85, technique: 88, defending: 60, stamina: 82 },
    vsiTrend: "up" as const, phvCategory: "ontime" as const,
  },
];

const mockUseDashboardStats = vi.fn();
const mockUseTrendingPlayers = vi.fn();
const mockUseLiveMatches = vi.fn();

vi.mock("@/hooks/useDashboard", () => ({
  useDashboardStats: () => mockUseDashboardStats(),
  useTrendingPlayers: () => mockUseTrendingPlayers(),
  useLiveMatches: () => mockUseLiveMatches(),
}));

vi.mock("@/hooks/useUserProfile", () => ({
  useUserProfile: () => ({ isDirector: false }),
}));

vi.mock("@/components/shared/PageHeader", () => ({
  default: ({ title, subtitle }: any) => (
    <div data-testid="page-header">
      <h1>{title}</h1>
      <p>{subtitle}</p>
    </div>
  ),
}));

vi.mock("@/components/shared/Skeletons", () => ({
  DashboardStatsSkeleton: () => <div data-testid="stats-skeleton">Loading stats...</div>,
  MatchesSkeleton: () => <div data-testid="matches-skeleton">Loading matches...</div>,
  PlayerListSkeleton: () => <div data-testid="players-skeleton">Loading players...</div>,
}));

vi.mock("@/components/LiveMatchCard", () => ({
  default: ({ match }: any) => <div data-testid="match-card">{match.id}</div>,
}));

vi.mock("@/components/LiveFixtures", () => ({
  default: () => <div data-testid="live-fixtures">Fixtures</div>,
}));

vi.mock("@/components/PlayerCard", () => ({
  default: ({ player }: any) => <div data-testid="player-card">{player.name}</div>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/UsageMeter", () => ({
  default: () => <div data-testid="usage-meter">UsageMeter</div>,
}));

vi.mock("@/components/WelcomeGuide", () => ({
  default: () => <div data-testid="welcome-guide">WelcomeGuide</div>,
}));

import Dashboard from "@/pages/Dashboard";

// Dashboard llama useQueryClient() (para invalidar queries en "cargar demo"),
// por lo que el render debe ir dentro de un QueryClientProvider real
// (mismo patrón que los tests de hooks). Los hooks de datos siguen mockeados.
function renderDashboard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <Dashboard />
    </QueryClientProvider>,
  );
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Dashboard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseDashboardStats.mockReturnValue({ data: mockStats, isLoading: false, isError: false });
    mockUseTrendingPlayers.mockReturnValue({ data: mockPlayers, isLoading: false, isError: false });
    mockUseLiveMatches.mockReturnValue({ data: [], isLoading: false, isError: false });
  });

  it("renderiza titulo VITAS.", () => {
    renderDashboard();
    expect(screen.getByText("VITAS.")).toBeDefined();
  });

  it("renderiza 4 stat cards cuando stats cargadas", () => {
    renderDashboard();
    expect(screen.getByText("42")).toBeDefined();
    expect(screen.getByText("128")).toBeDefined();
    expect(screen.getByText("74")).toBeDefined();
    expect(screen.getByText("5")).toBeDefined();
  });

  it("muestra skeleton mientras carga stats", () => {
    mockUseDashboardStats.mockReturnValue({ data: null, isLoading: true, isError: false });
    renderDashboard();
    expect(screen.getByTestId("stats-skeleton")).toBeDefined();
  });

  it("muestra empty state cuando no hay jugadores", () => {
    mockUseTrendingPlayers.mockReturnValue({ data: [], isLoading: false, isError: false });
    renderDashboard();
    expect(screen.getByText("dashboard.noPlayers.title")).toBeDefined();
    expect(screen.getByText("dashboard.noPlayers.description")).toBeDefined();
  });

  it("navega al hacer click en quick access", () => {
    renderDashboard();
    const masterBtn = screen.getByText("dashboard.quickAccess.masterDashboard");
    fireEvent.click(masterBtn.closest("button")!);
    expect(mockNavigate).toHaveBeenCalledWith("/master");
  });

  it("renderiza player cards cuando hay jugadores", () => {
    renderDashboard();
    expect(screen.getByTestId("player-card")).toBeDefined();
    expect(screen.getByText("Test Player")).toBeDefined();
  });

  it("muestra skeleton de players mientras carga", () => {
    mockUseTrendingPlayers.mockReturnValue({ data: null, isLoading: true, isError: false });
    renderDashboard();
    expect(screen.getByTestId("players-skeleton")).toBeDefined();
  });
});
