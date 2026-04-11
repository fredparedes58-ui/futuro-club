/**
 * Rankings — Tests
 * Titulo, search, lista jugadores, empty state, sort
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// ── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
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
  toast: { error: vi.fn() },
}));

const mockPlayers = [
  {
    id: "p1", name: "Pablo Gavi", vsi: 88, positionShort: "CM", age: 19,
    position: "Mediocentro", phvCategory: "on-time", trending: "up",
    percentile: 80, percentileInAgeGroup: 85, ageGroup: "Sub-21",
    competitiveLevel: "Regional", phvOffset: 0, metrics: {}, foot: "right", height: 170, weight: 68,
    updatedAt: "2026-01-01",
  },
  {
    id: "p2", name: "Pedri Gonzalez", vsi: 91, positionShort: "AM", age: 20,
    position: "Mediapunta", phvCategory: "late", trending: "up",
    percentile: 95, percentileInAgeGroup: 90, ageGroup: "Sub-21",
    competitiveLevel: "Regional", phvOffset: 0, metrics: {}, foot: "right", height: 174, weight: 70,
    updatedAt: "2026-01-01",
  },
  {
    id: "p3", name: "Lamine Yamal", vsi: 85, positionShort: "RW", age: 16,
    position: "Extremo Derecho", phvCategory: "early", trending: "up",
    percentile: 70, percentileInAgeGroup: 95, ageGroup: "Sub-18",
    competitiveLevel: "Regional", phvOffset: 0, metrics: {}, foot: "right", height: 180, weight: 72,
    updatedAt: "2026-01-01",
  },
];

const mockRankingsResponse = {
  players: mockPlayers,
  total: 3,
  totalUnfiltered: 3,
  ageGroups: ["Sub-18", "Sub-21"],
  ageGroupStats: { "Sub-18": { count: 1, avgVsi: 85, minVsi: 85, maxVsi: 85 }, "Sub-21": { count: 2, avgVsi: 89.5, minVsi: 88, maxVsi: 91 } },
  competitiveLevels: ["Regional"],
  limit: 50,
  offset: 0,
};

const mockUseRankedPlayers = vi.fn();
vi.mock("@/hooks/useRankings", () => ({
  useRankedPlayers: (...args: any[]) => mockUseRankedPlayers(...args),
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
  RankingsPodiumSkeleton: () => <div data-testid="podium-skeleton">Loading podium...</div>,
  PlayerListSkeleton: () => <div data-testid="list-skeleton">Loading list...</div>,
}));

vi.mock("@/components/VsiGauge", () => ({
  default: ({ value }: any) => <span data-testid="vsi-gauge">{value}</span>,
}));

vi.mock("@/components/ui/button", () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

vi.mock("@/components/ui/input", () => ({
  Input: (props: any) => <input {...props} />,
}));

import Rankings from "@/pages/Rankings";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Rankings", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseRankedPlayers.mockReturnValue({
      data: mockRankingsResponse,
      isLoading: false,
      isError: false,
    });
  });

  it("renderiza titulo y search input", () => {
    render(<Rankings />);
    expect(screen.getByText("players.rankings.title")).toBeDefined();
    const searchInput = document.querySelector('input[placeholder="players.rankings.searchPlaceholder"]');
    expect(searchInput).toBeDefined();
  });

  it("renderiza lista de jugadores cuando hay data", () => {
    render(<Rankings />);
    expect(screen.getByText("Pablo Gavi")).toBeDefined();
    expect(screen.getByText("Pedri Gonzalez")).toBeDefined();
    expect(screen.getByText("Lamine Yamal")).toBeDefined();
  });

  it("muestra empty state cuando no hay jugadores", () => {
    mockUseRankedPlayers.mockReturnValue({
      data: { players: [], total: 0, totalUnfiltered: 0, ageGroups: [], ageGroupStats: {}, competitiveLevels: [], limit: 50, offset: 0 },
      isLoading: false,
      isError: false,
    });
    render(<Rankings />);
    expect(screen.getByText("players.rankings.noPlayersTitle")).toBeDefined();
  });

  it("search input actualiza filtros y llama al hook con search", () => {
    render(<Rankings />);
    const searchInput = document.querySelector('input[placeholder="players.rankings.searchPlaceholder"]')!;
    fireEvent.change(searchInput, { target: { value: "Gavi" } });
    // Verify the hook is called with search filter
    const lastCall = mockUseRankedPlayers.mock.calls[mockUseRankedPlayers.mock.calls.length - 1];
    expect(lastCall[2]).toEqual(expect.objectContaining({ search: "Gavi" }));
  });

  it("botones de sort estan presentes", () => {
    render(<Rankings />);
    // Sort buttons render translated keys
    expect(screen.getByText(/players\.rankings\.sortVsi/)).toBeDefined();
    expect(screen.getByText(/players\.rankings\.sortAge/)).toBeDefined();
    expect(screen.getByText(/players\.rankings\.sortName/)).toBeDefined();
  });

  it("muestra skeleton mientras carga", () => {
    mockUseRankedPlayers.mockReturnValue({
      data: null,
      isLoading: true,
      isError: false,
    });
    render(<Rankings />);
    expect(screen.getByTestId("podium-skeleton")).toBeDefined();
    expect(screen.getByTestId("list-skeleton")).toBeDefined();
  });
});
