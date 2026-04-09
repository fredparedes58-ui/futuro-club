/**
 * VITAS · Tests — VsiGauge Component
 * Verifica: renderizado, tamaños, colores, label
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import VsiGauge from "@/components/VsiGauge";

describe("VsiGauge", () => {
  it("renderiza el valor numérico", () => {
    render(<VsiGauge value={75} />);
    expect(screen.getByText("75")).toBeDefined();
  });

  it("renderiza label VSI por defecto en size md", () => {
    render(<VsiGauge value={60} size="md" />);
    expect(screen.getByText("VSI")).toBeDefined();
  });

  it("size sm NO muestra label", () => {
    render(<VsiGauge value={60} size="sm" />);
    expect(screen.queryByText("VSI")).toBeNull();
  });

  it("size lg muestra label", () => {
    render(<VsiGauge value={80} size="lg" />);
    expect(screen.getByText("VSI")).toBeDefined();
  });

  it("label personalizado se muestra", () => {
    render(<VsiGauge value={70} size="md" label="PHV" />);
    expect(screen.getByText("PHV")).toBeDefined();
  });

  it("renderiza SVG con circle elements", () => {
    const { container } = render(<VsiGauge value={50} />);
    const svg = container.querySelector("svg");
    expect(svg).toBeDefined();

    const circles = container.querySelectorAll("circle");
    expect(circles.length).toBe(2); // background + animated
  });

  it("value 0 se muestra correctamente", () => {
    render(<VsiGauge value={0} />);
    expect(screen.getByText("0")).toBeDefined();
  });

  it("value 100 se muestra correctamente", () => {
    render(<VsiGauge value={100} />);
    expect(screen.getByText("100")).toBeDefined();
  });
});
