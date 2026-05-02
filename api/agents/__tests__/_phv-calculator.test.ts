/**
 * VITAS · Tests del PHV Calculator (determinista · post-refactor)
 *
 * Verifica que la fórmula Mirwald produce los mismos resultados conocidos
 * de la literatura científica + casos límite + idempotencia.
 */

import { describe, it, expect } from "vitest";

// Reimplementación pura de la lógica para tests sin dependencias HTTP
// (la implementación canónica está en _phv-calculator.ts)
function mirwaldMaleOffset(input: {
  age: number;
  height: number;
  weight: number;
  sittingHeight?: number;
  legLength?: number;
}): number {
  const sh = input.sittingHeight ?? input.height * 0.52;
  const ll = input.legLength ?? input.height * 0.48;
  const offset =
    -9.236 +
    0.0002708 * (ll * sh) -
    0.001663 * (input.age * ll) +
    0.007216 * (input.age * sh) +
    0.02292 * ((input.weight / input.height) * 100);
  return Number(offset.toFixed(2));
}

function categorize(offset: number): "early" | "ontime" | "late" {
  if (offset < -1.0) return "early";
  if (offset > 1.0) return "late";
  return "ontime";
}

function adjustVSI(currentVSI: number, category: "early" | "ontime" | "late"): number {
  const factor = category === "early" ? 1.12 : category === "late" ? 0.92 : 1.0;
  return Math.max(0, Math.min(100, Number((currentVSI * factor).toFixed(1))));
}

describe("PHV Calculator · Mirwald varón", () => {
  it("Niño 14 años, 165cm, 55kg, sittingHeight 85, legLength 80 · pre-PHV", () => {
    const offset = mirwaldMaleOffset({
      age: 14,
      height: 165,
      weight: 55,
      sittingHeight: 85,
      legLength: 80,
    });
    // Cálculo manual:
    // -9.236 + 0.0002708·(80·85) − 0.001663·(14·80) + 0.007216·(14·85) + 0.02292·(55/165·100)
    // = -9.236 + 1.8414 − 1.8626 + 8.5870 + 0.7640 = 0.094
    expect(offset).toBeCloseTo(0.09, 1);
    expect(categorize(offset)).toBe("ontime");
  });

  it("Niño 12 años, 145cm, 38kg · early (pre-estirón)", () => {
    const offset = mirwaldMaleOffset({
      age: 12,
      height: 145,
      weight: 38,
    });
    // Estimaciones: sh=145·0.52=75.4, ll=145·0.48=69.6
    // Resultado esperado: claramente negativo (early)
    expect(offset).toBeLessThan(-1.0);
    expect(categorize(offset)).toBe("early");
  });

  it("Joven 17 años, 178cm, 72kg · late (post-estirón)", () => {
    const offset = mirwaldMaleOffset({
      age: 17,
      height: 178,
      weight: 72,
    });
    // Resultado esperado: claramente positivo (late)
    expect(offset).toBeGreaterThan(1.0);
    expect(categorize(offset)).toBe("late");
  });

  it("Estimación legLength/sittingHeight cuando faltan", () => {
    const conReales = mirwaldMaleOffset({
      age: 14,
      height: 160,
      weight: 50,
      sittingHeight: 83.2,  // 160 × 0.52
      legLength: 76.8,      // 160 × 0.48
    });
    const sinReales = mirwaldMaleOffset({
      age: 14,
      height: 160,
      weight: 50,
    });
    expect(conReales).toBeCloseTo(sinReales, 1);
  });
});

describe("PHV Calculator · Categorización", () => {
  it("offset = -1.5 → early", () => {
    expect(categorize(-1.5)).toBe("early");
  });
  it("offset = -0.5 → ontime", () => {
    expect(categorize(-0.5)).toBe("ontime");
  });
  it("offset = 0.0 → ontime", () => {
    expect(categorize(0)).toBe("ontime");
  });
  it("offset = 1.0 → ontime (límite inclusivo)", () => {
    expect(categorize(1.0)).toBe("ontime");
  });
  it("offset = 1.5 → late", () => {
    expect(categorize(1.5)).toBe("late");
  });
});

describe("PHV Calculator · Ajuste VSI", () => {
  it("VSI 70 con early (pre-PHV) · boost ×1.12", () => {
    expect(adjustVSI(70, "early")).toBe(78.4);
  });
  it("VSI 70 con ontime · sin cambio", () => {
    expect(adjustVSI(70, "ontime")).toBe(70);
  });
  it("VSI 70 con late · castigo ×0.92", () => {
    expect(adjustVSI(70, "late")).toBe(64.4);
  });
  it("VSI 95 con early · clamp a 100 (no se pasa de 100)", () => {
    expect(adjustVSI(95, "early")).toBe(100);
  });
  it("VSI 0 con cualquier factor · sigue 0", () => {
    expect(adjustVSI(0, "early")).toBe(0);
    expect(adjustVSI(0, "ontime")).toBe(0);
    expect(adjustVSI(0, "late")).toBe(0);
  });
});

describe("PHV Calculator · Determinismo (idempotencia)", () => {
  it("misma entrada · siempre misma salida", () => {
    const input = {
      age: 13.5,
      height: 158,
      weight: 47,
      sittingHeight: 82,
      legLength: 76,
    };
    const r1 = mirwaldMaleOffset(input);
    const r2 = mirwaldMaleOffset(input);
    const r3 = mirwaldMaleOffset(input);
    expect(r1).toBe(r2);
    expect(r2).toBe(r3);
  });
});
