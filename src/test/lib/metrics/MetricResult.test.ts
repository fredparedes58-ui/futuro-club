/**
 * Contrato MetricResult (G1). Los 5 invariantes de .claude/rules/metricas.md deben
 * FALLAR en construcción (no solo en tests de negocio). Un número sin procedencia
 * válida no debe poder existir.
 */
import { describe, it, expect } from "vitest";
import {
  makeMetric,
  measured,
  derived,
  estimatedLLM,
  mock,
  gated,
  constant,
  isPresentable,
  MetricContractError,
  type MetricResult,
} from "@/lib/metrics/MetricResult";

describe("makeMetric — invariantes que LANZAN", () => {
  const base: MetricResult<number> = {
    value: 10, provenance: "DERIVADA", confidence: 1,
    units: "km/h", calibrated: false, gate_reason: null,
  };

  it("inv.1 — MEDIDA con calibrated=false lanza", () => {
    expect(() => makeMetric({ ...base, provenance: "MEDIDA", calibrated: false }))
      .toThrow(MetricContractError);
  });

  it("inv.2 — value=null sin gate_reason lanza", () => {
    expect(() => makeMetric({ ...base, value: null, gate_reason: null })).toThrow(MetricContractError);
    expect(() => makeMetric({ ...base, value: null, gate_reason: "   " })).toThrow(MetricContractError);
  });

  it("inv.3 — CONSTANTE con value no-null lanza (una constante no es resultado)", () => {
    expect(() => makeMetric({ ...base, provenance: "CONSTANTE", value: 65 })).toThrow(MetricContractError);
  });

  it("inv.5 — confidence fuera de [0,1] lanza", () => {
    expect(() => makeMetric({ ...base, confidence: 1.5 })).toThrow(MetricContractError);
    expect(() => makeMetric({ ...base, confidence: -0.1 })).toThrow(MetricContractError);
    expect(() => makeMetric({ ...base, confidence: Number.NaN })).toThrow(MetricContractError);
  });

  it("un MetricResult válido no lanza", () => {
    expect(() => makeMetric(base)).not.toThrow();
    expect(makeMetric(base).value).toBe(10);
  });
});

describe("constructores de conveniencia", () => {
  it("measured exige calibrated=true por defecto", () => {
    expect(measured(21, { units: "km/h" }).calibrated).toBe(true);
    expect(measured(21).provenance).toBe("MEDIDA");
  });

  it("derived produce DERIVADA presentable", () => {
    const m = derived(5.4, { units: "m/s" });
    expect(m.provenance).toBe("DERIVADA");
    expect(isPresentable(m)).toBe(true);
  });

  it("estimatedLLM marca la fuente y no es MEDIDA", () => {
    const m = estimatedLLM(12, { source_ref: "gemini-2.0-flash" });
    expect(m.provenance).toBe("ESTIMADA_LLM");
    expect(m.calibrated).toBe(false);
    expect(m.source_ref).toBe("gemini-2.0-flash");
  });

  it("mock es MOCK", () => {
    expect(mock(3).provenance).toBe("MOCK");
  });

  it("gated bloquea: value=null + gate_reason + no presentable", () => {
    const g = gated("Falta calibración de campo");
    expect(g.value).toBeNull();
    expect(g.gate_reason).toBe("Falta calibración de campo");
    expect(isPresentable(g)).toBe(false);
  });

  it("constant() es CONSTANTE con value null (no presentable como cifra)", () => {
    const c = constant("Sub-score fijo 65; pendiente de medir (G4)");
    expect(c.provenance).toBe("CONSTANTE");
    expect(c.value).toBeNull();
    expect(isPresentable(c)).toBe(false);
  });
});
