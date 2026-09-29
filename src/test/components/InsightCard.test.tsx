/**
 * InsightCard — la cifra del insight pasa por el componente canónico MetricValue
 * (procedencia → badge; bloqueada → gate_reason; nunca "—").
 *
 * Caso de origen: la tarjeta de Samu pintaba «67.4 ▲ +9.9» (texto libre del LLM,
 * contra un 57.5 fabricado) con el tooltip «Cambio respecto a evaluaciones
 * anteriores». Ahora la variación es context_data.vsi_delta (servidor, DERIVADA).
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";

vi.mock("react-router-dom", () => ({ useNavigate: () => vi.fn() }));
// t con interpolación visible: permite comprobar que las fechas reales llegan al texto.
vi.mock("react-i18next", () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, unknown>) =>
      opts && Object.keys(opts).some((k) => k !== "defaultValue")
        ? `${key} ${JSON.stringify(Object.fromEntries(Object.entries(opts).filter(([k]) => k !== "defaultValue")))}`
        : key,
    i18n: { language: "es" },
  }),
}));
vi.mock("@/components/VsiGauge", () => ({ default: () => null }));

import InsightCard from "@/components/scout/InsightCard";
import { computeVsiDelta } from "@/lib/scoring/vsiDelta";
import type { ScoutInsightRow } from "@/hooks/useScoutFeed";

function insight(over: Partial<ScoutInsightRow>): ScoutInsightRow {
  return {
    id: "i1", user_id: "u1", player_id: "p-samu", player_name: "Samu",
    insight_type: "breakout", title: "Titular", description: "Cuerpo",
    metric: null, metric_value: null, urgency: "high", tags: [],
    context_data: { vsi: 67.4, position: "CM", age: 9 },
    rag_drills: [], action_items: [], benchmark: null,
    is_read: true, is_archived: false, created_at: "2026-09-20T10:00:00.000Z",
    ...over,
  };
}

describe("InsightCard — variación calculada (vsi_delta)", () => {
  it("delta calculado ⇒ '+9.9 pts' con badge «Calculado» y las dos fechas reales", () => {
    const vsi_delta = computeVsiDelta({
      evaluations: [
        { value: 57.5, at: "2026-09-01T10:00:00.000Z", source: "coach_form" },
        { value: 67.4, at: "2026-09-20T10:00:00.000Z", source: "coach_form" },
      ],
    });
    render(<InsightCard insight={insight({ context_data: { vsi: 67.4, vsi_delta: JSON.parse(JSON.stringify(vsi_delta)) } })} />);
    const box = screen.getByTestId("insight-vsi-delta");
    expect(box).toHaveTextContent("+9.9 pts");
    expect(box).toHaveTextContent("Calculado"); // ProvenanceBadge DERIVADA
    expect(box).toHaveTextContent("scout.vsiDelta.between");
    expect(box).toHaveTextContent("57.5");
    expect(box).toHaveTextContent("67.4");
    expect(box).toHaveTextContent("2026"); // fechas formateadas presentes
  });

  it("delta bloqueado ⇒ muestra el motivo (traducido), ninguna cifra ni badge", () => {
    const vsi_delta = computeVsiDelta({ evaluations: [], legacyHistory: [57.5, 67.4] });
    render(<InsightCard insight={insight({ context_data: { vsi: 67.4, vsi_delta } })} />);
    const box = screen.getByTestId("insight-vsi-delta");
    expect(box).toHaveTextContent("vsiDelta.gate.legacy_undated");
    expect(box).not.toHaveTextContent("9.9");
    expect(box).not.toHaveTextContent("Calculado");
  });
});

describe("InsightCard — insights legacy (texto libre del LLM)", () => {
  it("'67.4 (+9.9)' ⇒ base «Estimado por IA», la variación NO se pinta como tendencia", () => {
    render(<InsightCard insight={insight({ metric: "VSI", metric_value: "67.4 (+9.9)" })} />);
    const box = screen.getByTestId("insight-legacy-metric");
    expect(box).toHaveTextContent("67.4");
    expect(box).toHaveTextContent("Estimado por IA");
    expect(box).not.toHaveTextContent("+9.9");
    expect(box).toHaveTextContent("scout.legacyDeltaUnverified");
    // El tooltip antiguo desaparece.
    expect(screen.queryByTitle("scout.metricTrend")).toBeNull();
  });

  it("insight de ejemplo (demo) ⇒ «Datos de ejemplo», no «Estimado por IA»", () => {
    render(<InsightCard insight={insight({ metric: "Técnica", metric_value: "74", context_data: { metric_provenance: "MOCK" } })} />);
    const box = screen.getByTestId("insight-legacy-metric");
    expect(box).toHaveTextContent("Datos de ejemplo");
    expect(box).not.toHaveTextContent("Estimado por IA");
  });

  it("sin cifra (metric_value null y sin vsi_delta) ⇒ no pinta nada: ni '—' ni placeholder", () => {
    const { container } = render(<InsightCard insight={insight({ metric: "VSI", metric_value: null, context_data: {} })} />);
    expect(screen.queryByTestId("insight-legacy-metric")).toBeNull();
    expect(screen.queryByTestId("insight-vsi-delta")).toBeNull();
    expect(container.textContent).not.toContain("—");
  });
});
