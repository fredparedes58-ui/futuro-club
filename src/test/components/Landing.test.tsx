/**
 * Landing — Tests
 * Renderizado del hero, stats, CTA, modulos y navegacion
 */
import { describe, it, expect, vi } from "vitest";
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
  return {
    motion,
    AnimatePresence: ({ children }: any) => <>{children}</>,
    useMotionValue: () => ({ on: () => () => {} }),
    useTransform: () => ({ on: () => () => {} }),
    animate: () => ({ stop: () => {} }),
  };
});

vi.mock("@/components/landing/Floating3DCard", () => ({
  Floating3DCard: ({ children, onClick }: any) => (
    <div data-testid="floating-card" onClick={onClick}>{children}</div>
  ),
}));

vi.mock("@/components/landing/MockupScreen", () => ({
  PulseScreen: () => <div>PulseScreen</div>,
  MasterScreen: () => <div>MasterScreen</div>,
  RankingsScreen: () => <div>RankingsScreen</div>,
  ScoutScreen: () => <div>ScoutScreen</div>,
}));

import Landing from "@/pages/Landing";

// ── Tests ────────────────────────────────────────────────────────────────────

describe("Landing", () => {
  it("renderiza titulo VITAS", () => {
    render(<Landing />);
    expect(screen.getByText("VITAS")).toBeDefined();
  });

  it("renderiza 3 stat counters", () => {
    render(<Landing />);
    expect(screen.getByText("landing.stats.players")).toBeDefined();
    expect(screen.getByText("landing.stats.liveSessions")).toBeDefined();
    expect(screen.getByText("landing.stats.insightsToday")).toBeDefined();
  });

  it("renderiza boton CTA", () => {
    render(<Landing />);
    expect(screen.getByText("landing.enter")).toBeDefined();
  });

  it("renderiza 9 botones de modulos", () => {
    render(<Landing />);
    const moduleLabels = ["Pulse", "Master", "Scout", "Solo Drill", "Rankings", "VITAS.LAB", "Reports", "Compare", "Settings"];
    moduleLabels.forEach((label) => {
      expect(screen.getByText(label)).toBeDefined();
    });
  });

  it("navega a /pulse al hacer click en CTA", () => {
    render(<Landing />);
    const ctaBtn = screen.getByText("landing.enter").closest("button")!;
    fireEvent.click(ctaBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/pulse");
  });

  it("navega a modulo al hacer click en boton de modulo", () => {
    render(<Landing />);
    const pulseBtn = screen.getByText("Pulse").closest("button")!;
    fireEvent.click(pulseBtn);
    expect(mockNavigate).toHaveBeenCalledWith("/pulse");
  });

  it("renderiza footer", () => {
    render(<Landing />);
    expect(screen.getByText("landing.footer")).toBeDefined();
  });
});
