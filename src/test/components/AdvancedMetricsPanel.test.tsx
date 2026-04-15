import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import { AdvancedMetricsPanel } from "@/components/AdvancedMetricsPanel";
import type { AdvancedPlayerMetrics } from "@/services/real/advancedMetricsService";

function makeMetrics(overrides: Partial<AdvancedPlayerMetrics> = {}): AdvancedPlayerMetrics {
  return {
    rae: null,
    ubi: {
      ubi: 0.2,
      raeComponent: 0,
      phvComponent: 0.45,
      vsICorrectionFactor: 1.024,
      description: "Sesgo bajo",
    },
    truthFilter: {
      filterCase: "ontme_low_rae",
      originalVSI: 72,
      adjustedVSI: 72,
      delta: 0,
      confidence: 0.9,
      explanation: "Sin ajuste necesario",
    },
    dominantFeatures: {
      dominant: [
        { key: "shooting", label: "Disparo", value: 74, zScore: 1.47, description: "" },
      ],
      underdeveloped: [],
      playStyle: "ofensivo",
      specializationIndex: 0.4,
    },
    vaep: {
      vaepTotal: 2.4,
      vaep90: 2.4,
      topActions: [
        { actionId: "v_40000_shot", impact: 0.35 },
        { actionId: "v_10000_pass", impact: 0.12 },
      ],
      status: "calculated",
      message: "VAEP calculado con 6 acciones",
    },
    tracking: {
      maxSpeedMs: 8.2,
      avgSpeedMs: 3.1,
      totalDistanceM: 9200,
      fieldCoveragePct: 42.5,
      sprintCount: 6,
      sprintDistanceM: 320,
      status: "calculated",
      message: "Tracking calculado",
    },
    biomechanics: {
      drillScore: 82,
      injuryRisk: 0.16,
      asymmetryPct: 8,
      status: "calculated",
      message: "DrillScore calculado",
    },
    adjustedVSI: 72,
    ...overrides,
  };
}

describe("AdvancedMetricsPanel", () => {
  it("muestra VAEP cuando status=calculated", () => {
    const metrics = makeMetrics();
    render(<AdvancedMetricsPanel metrics={metrics} />);
    expect(screen.getByText("VAEP")).toBeInTheDocument();
    expect(screen.getByText("2.40")).toBeInTheDocument();
  });

  it("muestra tracking con fieldCoverage", () => {
    const metrics = makeMetrics();
    render(<AdvancedMetricsPanel metrics={metrics} />);
    expect(screen.getByText("Cobertura de campo")).toBeInTheDocument();
    expect(screen.getByText("42.5%")).toBeInTheDocument();
  });

  it("muestra drillScore biomecánico", () => {
    const metrics = makeMetrics();
    render(<AdvancedMetricsPanel metrics={metrics} />);
    expect(screen.getByText("DrillScore")).toBeInTheDocument();
    expect(screen.getByText("82")).toBeInTheDocument();
  });

  it("muestra top actions del VAEP", () => {
    const metrics = makeMetrics();
    render(<AdvancedMetricsPanel metrics={metrics} />);
    expect(screen.getByText(/tiro/i)).toBeInTheDocument();
    expect(screen.getByText(/pase/i)).toBeInTheDocument();
  });

  it("muestra message de stub cuando VAEP no calculado", () => {
    const metrics = makeMetrics({
      vaep: {
        vaepTotal: null, vaep90: null, topActions: [],
        status: "stub_no_data", message: "Sin acciones SPADL",
      },
    });
    render(<AdvancedMetricsPanel metrics={metrics} />);
    expect(screen.getByText(/sin acciones spadl/i)).toBeInTheDocument();
  });

  it("muestra badge de calidad cuando se provee qualityScore", () => {
    const metrics = makeMetrics();
    render(<AdvancedMetricsPanel metrics={metrics} qualityScore={0.85} />);
    expect(screen.getByText(/excelente/i)).toBeInTheDocument();
  });

  it("muestra issues de calidad si se proveen", () => {
    const metrics = makeMetrics();
    render(
      <AdvancedMetricsPanel
        metrics={metrics}
        qualityScore={0.5}
        qualityIssues={["Pocos eventos detectados", "Muestra corta"]}
      />
    );
    expect(screen.getByText(/limitaciones del análisis/i)).toBeInTheDocument();
    expect(screen.getByText(/pocos eventos detectados/i)).toBeInTheDocument();
  });

  it("velocidad máxima se muestra cuando hay tracking calculado", () => {
    const metrics = makeMetrics();
    render(<AdvancedMetricsPanel metrics={metrics} />);
    expect(screen.getByText(/velocidad máx/i)).toBeInTheDocument();
    expect(screen.getByText(/8\.2 m\/s/)).toBeInTheDocument();
  });
});
