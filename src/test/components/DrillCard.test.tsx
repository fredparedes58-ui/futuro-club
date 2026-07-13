/**
 * VITAS · Tests — DrillCard Component
 * Verifica: renderizado, truncamiento, expand/collapse, badges
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";

// DrillCard migró a react-i18next: el botón usa t("intelDrillCard.showMore") /
// t("intelDrillCard.showLess"). En el entorno de test no hay i18n provider, así
// que t() devolvería la clave cruda. Mockeamos useTranslation (mismo patrón que
// UsageMeter/BottomNav.test.tsx) resolviendo las claves a las traducciones
// reales de es.json → "intelDrillCard", para seguir aseverando el texto real de
// UI ("Ver más" / "Ver menos").
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => {
      const es: Record<string, string> = {
        "intelDrillCard.defaultTitle": "Ejercicio",
        "intelDrillCard.showLess": "Ver menos",
        "intelDrillCard.showMore": "Ver más",
        "intelDrillCard.usefulPrompt": "Útil?",
      };
      return es[key] ?? fallback ?? key;
    },
    i18n: { language: "es", changeLanguage: vi.fn() },
  }),
}));

import DrillCard from "@/components/intelligence/DrillCard";

describe("DrillCard", () => {
  const shortContent = "Ejercicio corto de pases en triangulo.";
  const longContent = "A".repeat(200); // > 150 chars

  it("renderiza contenido corto sin boton de expandir", () => {
    render(<DrillCard content={shortContent} similarity={0.85} />);

    // El contenido corto aparece como título y como contenido
    expect(screen.getAllByText(shortContent).length).toBeGreaterThanOrEqual(1);
    expect(screen.queryByText("Ver más")).toBeNull();
  });

  it("renderiza contenido largo truncado con boton Ver más", () => {
    render(<DrillCard content={longContent} similarity={0.75} />);

    expect(screen.getByText("Ver más")).toBeDefined();
  });

  it("click en Ver más expande el contenido", () => {
    render(<DrillCard content={longContent} similarity={0.8} />);

    fireEvent.click(screen.getByText("Ver más"));
    expect(screen.getByText("Ver menos")).toBeDefined();
  });

  it("muestra porcentaje de similarity", () => {
    render(<DrillCard content={shortContent} similarity={0.92} />);

    expect(screen.getByText("92%")).toBeDefined();
  });

  it("muestra badge de categoría", () => {
    render(<DrillCard content={shortContent} similarity={0.8} metadata={{ category: "técnica" }} />);

    expect(screen.getByText("técnica")).toBeDefined();
  });

  it("muestra badge de edad si existe en metadata", () => {
    render(<DrillCard content={shortContent} similarity={0.8} metadata={{ ageRange: "U-15" }} />);

    expect(screen.getByText("U-15")).toBeDefined();
  });

  it("sin metadata muestra 'drill' como categoría por defecto", () => {
    render(<DrillCard content={shortContent} similarity={0.7} />);

    expect(screen.getByText("drill")).toBeDefined();
  });

  it("usa título de metadata si disponible", () => {
    render(
      <DrillCard
        content="Contenido del ejercicio detallado..."
        similarity={0.8}
        metadata={{ title: "Rondo 4v2 Posicional" }}
      />
    );

    expect(screen.getByText("Rondo 4v2 Posicional")).toBeDefined();
  });
});
