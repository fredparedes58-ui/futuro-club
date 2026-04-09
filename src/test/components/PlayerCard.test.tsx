/**
 * PlayerCard — Tests
 * Renderizado de tarjeta de jugador con VSI, posición, edad
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

const mockNavigate = vi.fn();
vi.mock("react-router-dom", () => ({
  useNavigate: () => mockNavigate,
}));

// Mock framer-motion to render plain divs
vi.mock("framer-motion", () => ({
  motion: {
    div: ({ children, onClick, ...props }: any) => (
      <div onClick={onClick} data-testid="motion-div" {...props}>
        {children}
      </div>
    ),
  },
}));

import PlayerCard from "@/components/PlayerCard";

const mockPlayer = {
  id: "p1",
  name: "Pablo Gavi",
  image: "/img/gavi.jpg",
  vsi: 88,
  positionShort: "CM",
  age: 19,
  academy: "La Masia",
  position: "Central Midfielder",
  stats: { speed: 78, shooting: 70, vision: 85, technique: 88, defending: 60, stamina: 82 },
  vsiTrend: "up" as const,
  phvCategory: "ontime" as const,
};

describe("PlayerCard", () => {
  it("renderiza nombre del jugador", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("Pablo Gavi")).toBeDefined();
  });

  it("renderiza VSI score", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("88")).toBeDefined();
  });

  it("renderiza posición corta", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("CM")).toBeDefined();
  });

  it("renderiza edad con sufijo y", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("19y")).toBeDefined();
  });

  it("renderiza academia", () => {
    render(<PlayerCard player={mockPlayer} />);
    expect(screen.getByText("La Masia")).toBeDefined();
  });

  it("navega a /player/{id} al hacer click", () => {
    render(<PlayerCard player={mockPlayer} />);
    fireEvent.click(screen.getByTestId("motion-div"));
    expect(mockNavigate).toHaveBeenCalledWith("/player/p1");
  });

  it("renderiza imagen del jugador", () => {
    render(<PlayerCard player={mockPlayer} />);
    const img = document.querySelector("img");
    expect(img).toBeDefined();
    expect(img?.alt).toBe("Pablo Gavi");
  });

  it("VSI alto (>=85) usa color primary", () => {
    render(<PlayerCard player={{ ...mockPlayer, vsi: 90 }} />);
    // El gradiente primary se aplica al badge
    const badge = screen.getByText("90").closest("div");
    expect(badge?.className).toContain("primary");
  });

  it("VSI medio (70-84) usa color electric", () => {
    render(<PlayerCard player={{ ...mockPlayer, vsi: 75 }} />);
    const badge = screen.getByText("75").closest("div");
    expect(badge?.className).toContain("electric");
  });
});
