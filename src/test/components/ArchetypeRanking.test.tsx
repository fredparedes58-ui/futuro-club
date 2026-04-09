/**
 * ArchetypeRanking — Tests
 * Renderizado de tabla de arquetipos con scores y stability badges
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("@/lib/roleProfileData", () => ({
  ARCHETYPE_LABELS: {
    box_to_box: "Box-to-Box",
    deep_lying: "Deep-Lying Playmaker",
    target_man: "Target Man",
  },
  getConfidenceColor: (conf: number) => conf > 0.7 ? "text-green-400" : "text-amber-400",
  getStabilityLabel: (s: string) => s,
}));

import ArchetypeRanking from "@/components/role-profile/ArchetypeRanking";

const mockData = {
  archetypes: [
    { code: "box_to_box", score: 85.2, confidence: 0.92, stability: "estable", positions: ["CM", "CDM"] },
    { code: "deep_lying", score: 78.1, confidence: 0.75, stability: "en_desarrollo", positions: ["CM"] },
    { code: "target_man", score: 45.3, confidence: 0.4, stability: "emergente", positions: ["ST"] },
  ],
} as any;

describe("ArchetypeRanking", () => {
  it("renderiza título 'Arquetipos compatibles'", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getByText("Arquetipos compatibles")).toBeDefined();
  });

  it("renderiza todos los arquetipos", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getByText("Box-to-Box")).toBeDefined();
    expect(screen.getByText("Deep-Lying Playmaker")).toBeDefined();
    expect(screen.getByText("Target Man")).toBeDefined();
  });

  it("muestra scores formateados", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getByText("85.2")).toBeDefined();
    expect(screen.getByText("78.1")).toBeDefined();
    expect(screen.getByText("45.3")).toBeDefined();
  });

  it("muestra porcentaje de confianza", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getByText("92%")).toBeDefined();
    expect(screen.getByText("75%")).toBeDefined();
    expect(screen.getByText("40%")).toBeDefined();
  });

  it("muestra posiciones de cada arquetipo", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getAllByText("CM").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText("CDM")).toBeDefined();
    expect(screen.getByText("ST")).toBeDefined();
  });

  it("ordena arquetipos por score descendente", () => {
    const { container } = render(<ArchetypeRanking data={mockData} />);
    const ranks = container.querySelectorAll(".font-mono.text-muted-foreground");
    // First rank should be 1 (highest score = box_to_box at 85.2)
    expect(ranks[0]?.textContent).toBe("1");
  });

  it("muestra stability badges", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getByText("estable")).toBeDefined();
    expect(screen.getByText("en_desarrollo")).toBeDefined();
    expect(screen.getByText("emergente")).toBeDefined();
  });

  it("renderiza números de ranking 1, 2, 3", () => {
    render(<ArchetypeRanking data={mockData} />);
    expect(screen.getByText("1")).toBeDefined();
    expect(screen.getByText("2")).toBeDefined();
    expect(screen.getByText("3")).toBeDefined();
  });
});
