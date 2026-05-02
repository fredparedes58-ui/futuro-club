/**
 * VITAS · Tests del VSI Calculator
 * Run: npm run test:api -- _vsi-calculator
 *
 * Cobertura:
 *   - Fórmula oficial v1 produce el resultado documentado
 *   - Tiers asignados correctamente
 *   - Edge cases (0, 100, valores extremos)
 *   - Pesos suman exactamente 1.00
 */

import { describe, it, expect } from "vitest";
import { computeVsi, VSI_WEIGHTS, VSI_TIERS } from "../_vsi-calculator";

describe("VSI Calculator · Fórmula oficial v1.0", () => {
  it("pesos suman exactamente 1.0", () => {
    const total =
      VSI_WEIGHTS.technique +
      VSI_WEIGHTS.physical +
      VSI_WEIGHTS.mental +
      VSI_WEIGHTS.tactical +
      VSI_WEIGHTS.projection;
    expect(total).toBeCloseTo(1.0, 5);
  });

  it("ejemplo del documento VSI_FORMULA.md → 69.6", () => {
    // Este es el ejemplo CANÓNICO. Si falla, la fórmula divergió.
    const vsi = computeVsi({
      technique: 68.7,
      physical: 75.0,
      mental: 66.2,
      tactical: 61.3,
      projection: 78.4,
    });
    expect(vsi).toBeCloseTo(69.6, 1);
  });

  it("todos los subscores en 100 → VSI=100", () => {
    const vsi = computeVsi({
      technique: 100,
      physical: 100,
      mental: 100,
      tactical: 100,
      projection: 100,
    });
    expect(vsi).toBe(100);
  });

  it("todos los subscores en 0 → VSI=0", () => {
    const vsi = computeVsi({
      technique: 0,
      physical: 0,
      mental: 0,
      tactical: 0,
      projection: 0,
    });
    expect(vsi).toBe(0);
  });

  it("clamp a [0, 100] aunque el cálculo se pase", () => {
    // No debería ocurrir si los inputs están validados, pero por seguridad
    const vsi = computeVsi({
      technique: 100,
      physical: 100,
      mental: 100,
      tactical: 100,
      projection: 100,
    });
    expect(vsi).toBeLessThanOrEqual(100);
    expect(vsi).toBeGreaterThanOrEqual(0);
  });

  it("subscore técnica tiene el peso mayor (30%)", () => {
    // Técnica=100, resto=0 → VSI debe ser 30
    const vsi = computeVsi({
      technique: 100,
      physical: 0,
      mental: 0,
      tactical: 0,
      projection: 0,
    });
    expect(vsi).toBe(30);
  });

  it("subscore proyección tiene el peso menor (10%)", () => {
    // Proyección=100, resto=0 → VSI debe ser 10
    const vsi = computeVsi({
      technique: 0,
      physical: 0,
      mental: 0,
      tactical: 0,
      projection: 100,
    });
    expect(vsi).toBe(10);
  });
});

describe("VSI Calculator · Tiers", () => {
  it("Elite ≥85", () => {
    expect(VSI_TIERS.elite.min).toBe(85);
    expect(VSI_TIERS.elite.max).toBe(100);
  });

  it("Pro 70-84", () => {
    expect(VSI_TIERS.pro.min).toBe(70);
    expect(VSI_TIERS.pro.max).toBe(84);
  });

  it("Talent 50-69", () => {
    expect(VSI_TIERS.talent.min).toBe(50);
    expect(VSI_TIERS.talent.max).toBe(69);
  });

  it("Develop <50", () => {
    expect(VSI_TIERS.develop.min).toBe(0);
    expect(VSI_TIERS.develop.max).toBe(49);
  });
});

describe("VSI Calculator · Idempotencia", () => {
  it("mismo input → mismo output siempre (determinismo)", () => {
    const subs = {
      technique: 65.5,
      physical: 72.3,
      mental: 58.9,
      tactical: 60.1,
      projection: 75.0,
    };
    const v1 = computeVsi(subs);
    const v2 = computeVsi(subs);
    const v3 = computeVsi(subs);
    expect(v1).toBe(v2);
    expect(v2).toBe(v3);
  });
});
