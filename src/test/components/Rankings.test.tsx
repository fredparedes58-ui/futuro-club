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
    position: "Mediocentro", phvCategory: "ontime", trending: "up",
  },
  {
    id: "p2", name: "Pedri Gonzalez", vsi: 91, positionShort: "AM", age: 20,
    position: "Mediapunta", phvCategory: "late", trending: "up",
  },
  {
    id: "p3", name: "Lamine Yamal", vsi: 85, positionShort: "RW", age: 16,
    position: "Extremo Derecho", phvCategory: "early", trending: "up",
  },
];

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
      data: mockPlayers,
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
      data: [],
      isLoading: false,
      isError: false,
    });
    render(<Rankings />);
    expect(screen.getByText("players.rankings.noPlayersTitle")).toBeDefined();
  });

  it("search filtra jugadores", () => {
    render(<Rankings />);
    const searchInput = document.querySelector('input[placeholder="players.rankings.searchPlaceholder"]')!;
    fireEvent.change(searchInput, { target: { value: "Gavi" } });
    expect(screen.getByText("Pablo Gavi")).toBeDefined();
    expect(screen.queryByText("Pedri Gonzalez")).toBeNull();
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
