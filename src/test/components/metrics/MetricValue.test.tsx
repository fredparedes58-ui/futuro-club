/**
 * Render de MetricValue (G1, item 4). El componente único de presentación:
 *  - value !== null → muestra el valor + badge con la etiqueta DERIVADA de la procedencia.
 *  - value === null → muestra el gate_reason, NUNCA un 0 / guion / placeholder.
 *  - CONSTANTE → no se presenta como cifra (muestra el motivo).
 * Y la etiqueta NUNCA se escribe a mano: se deriva de provenance.
 */
import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { MetricValue, provenanceLabel } from "@/components/metrics/MetricValue";
import { derived, measured, estimatedLLM, gated, constant } from "@/lib/metrics/MetricResult";

describe("provenanceLabel — etiquetas canónicas derivadas de procedencia", () => {
  it("mapea cada procedencia a su etiqueta (CONSTANTE = null, no se rotula)", () => {
    expect(provenanceLabel("MEDIDA")).toBe("Medido");
    expect(provenanceLabel("DERIVADA")).toBe("Calculado");
    expect(provenanceLabel("ESTIMADA_LLM")).toBe("Estimado por IA");
    expect(provenanceLabel("MOCK")).toBe("Datos de ejemplo");
    expect(provenanceLabel("CONSTANTE")).toBeNull();
  });
});

describe("MetricValue — 3 estados", () => {
  it("value presente → muestra el valor y el badge de la procedencia", () => {
    render(<MetricValue result={derived(5.4, { units: "m/s" })} />);
    expect(screen.getByText("5.4 m/s")).toBeInTheDocument();
    expect(screen.getByText("Calculado")).toBeInTheDocument();
  });

  it("MEDIDA → badge 'Medido'; ESTIMADA_LLM → 'Estimado por IA'", () => {
    const { rerender } = render(<MetricValue result={measured(21, { units: "km/h" })} />);
    expect(screen.getByText("Medido")).toBeInTheDocument();
    rerender(<MetricValue result={estimatedLLM(12)} />);
    expect(screen.getByText("Estimado por IA")).toBeInTheDocument();
    expect(screen.queryByText("Medido")).not.toBeInTheDocument();
  });

  it("value === null (gated) → muestra el gate_reason, no un 0/guion", () => {
    render(<MetricValue result={gated("Falta calibración de campo")} />);
    expect(screen.getByText("Falta calibración de campo")).toBeInTheDocument();
    expect(screen.queryByText("0")).not.toBeInTheDocument();
    expect(screen.queryByText("--")).not.toBeInTheDocument();
  });

  it("CONSTANTE → no se presenta como cifra; muestra el motivo", () => {
    render(<MetricValue result={constant("Sub-score fijo 65; pendiente de medir (G4)")} />);
    expect(screen.getByText(/pendiente de medir/)).toBeInTheDocument();
    // Sin badge de cifra (CONSTANTE no se rotula).
    expect(screen.queryByText("Calculado")).not.toBeInTheDocument();
    expect(screen.queryByText("65")).not.toBeInTheDocument();
  });
});
