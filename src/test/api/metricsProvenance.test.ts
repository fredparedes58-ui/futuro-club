import { describe, it, expect } from "vitest";
import {
  buildVsiSubscores,
  gateVsiComposite,
  vsiMeasuredFraction,
  fatigueIsReliable,
  MIN_FATIGUE_SESSIONS,
} from "../../../api/_lib/metricsProvenance";
import { derived, constant } from "../../../src/lib/metrics/MetricResult";

// Pesos del VSI de vídeo (mismos que api/agents/_vsi-calculator.ts). Local para no
// arrastrar el módulo edge (withHandler → process) al typecheck del frontend.
const VSI_WEIGHTS = {
  technique: 0.3,
  physical: 0.25,
  mental: 0.2,
  tactical: 0.15,
  projection: 0.1,
} as const;

describe("buildVsiSubscores (G4 · sub-scores como MetricResult)", () => {
  it("technique/mental/tactical son CONSTANTE con value null (no 65/60/55)", () => {
    const s = buildVsiSubscores({ physicalValue: null, projectionValue: null });
    for (const k of ["technique", "mental", "tactical"] as const) {
      expect(s[k].provenance).toBe("CONSTANTE");
      expect(s[k].value).toBeNull();
      expect(s[k].gate_reason).toBeTruthy();
    }
  });

  it("physical/projection ausentes → BLOQUEADOS (value null), nunca un default", () => {
    const s = buildVsiSubscores({ physicalValue: null, projectionValue: null });
    expect(s.physical.value).toBeNull();
    expect(s.physical.gate_reason).toBeTruthy();
    expect(s.projection.value).toBeNull();
    expect(s.projection.gate_reason).toBeTruthy();
  });

  it("physical/projection con señal real → DERIVADA con value", () => {
    const s = buildVsiSubscores({ physicalValue: 62, projectionValue: 71 });
    expect(s.physical.provenance).toBe("DERIVADA");
    expect(s.physical.value).toBe(62);
    expect(s.projection.provenance).toBe("DERIVADA");
    expect(s.projection.value).toBe(71);
    expect(vsiMeasuredFraction(s)).toBeCloseTo(0.4, 5); // 2/5
  });
});

describe("gateVsiComposite (G4 · compuesto bloqueado si <4/5)", () => {
  it("todo placeholder (0/5 real) → BLOQUEADO (value null) con motivo", () => {
    const s = buildVsiSubscores({ physicalValue: null, projectionValue: null });
    const c = gateVsiComposite(s, VSI_WEIGHTS);
    expect(c.value).toBeNull();
    expect(c.gate_reason).toContain("0/5");
    expect(c.gate_reason).toContain("technique");
  });

  it("solo physical+projection reales (2/5) → sigue BLOQUEADO", () => {
    const s = buildVsiSubscores({ physicalValue: 60, projectionValue: 70 });
    const c = gateVsiComposite(s, VSI_WEIGHTS);
    expect(c.value).toBeNull();
    expect(c.gate_reason).toContain("2/5");
  });

  it("≥4/5 reales → compone (media ponderada renormalizada, DERIVADA)", () => {
    const subs = {
      technique: derived(80),
      physical: derived(60),
      mental: derived(70),
      tactical: derived(50),
      projection: constant("proyección no medida"),
    };
    const c = gateVsiComposite(subs, VSI_WEIGHTS);
    expect(c.value).not.toBeNull();
    expect(c.provenance).toBe("DERIVADA");
    expect(c.confidence).toBeCloseTo(0.8, 5); // 4/5 cobertura
    // (80·.30 + 60·.25 + 70·.20 + 50·.15) / (.30+.25+.20+.15) = 60.5 / 0.90 = 67.2
    expect(c.value).toBeCloseTo(67.2, 1);
  });
});

describe("fatigueIsReliable", () => {
  it("por debajo del mínimo de sesiones → no fiable", () => {
    expect(fatigueIsReliable(0)).toBe(false);
    expect(fatigueIsReliable(1)).toBe(false);
    expect(fatigueIsReliable(MIN_FATIGUE_SESSIONS - 1)).toBe(false);
  });
  it("con suficientes sesiones → fiable", () => {
    expect(fatigueIsReliable(MIN_FATIGUE_SESSIONS)).toBe(true);
    expect(fatigueIsReliable(10)).toBe(true);
  });
});
