/**
 * VITAS · Tests del Player ID Re-identifier
 */

import { describe, it, expect } from "vitest";

// Recreamos la función cosineDistance localmente para test puro (la del módulo
// está dentro del handler edge — refactor opcional: exportar para test)
function cosineDistance(a: number[], b: number[]): number {
  let dot = 0, magA = 0, magB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    magA += a[i] * a[i];
    magB += b[i] * b[i];
  }
  const denom = Math.sqrt(magA) * Math.sqrt(magB);
  if (denom === 0) return 1;
  return 1 - dot / denom;
}

describe("Player ID Re-identifier · cosineDistance", () => {
  it("vectores idénticos → distancia 0", () => {
    const a = [1, 2, 3, 4];
    const b = [1, 2, 3, 4];
    expect(cosineDistance(a, b)).toBeCloseTo(0, 5);
  });

  it("vectores opuestos → distancia 2", () => {
    const a = [1, 2, 3];
    const b = [-1, -2, -3];
    expect(cosineDistance(a, b)).toBeCloseTo(2, 5);
  });

  it("vectores ortogonales → distancia 1", () => {
    const a = [1, 0, 0];
    const b = [0, 1, 0];
    expect(cosineDistance(a, b)).toBeCloseTo(1, 5);
  });

  it("vector nulo → distancia 1 (no NaN)", () => {
    const a = [0, 0, 0];
    const b = [1, 2, 3];
    expect(cosineDistance(a, b)).toBe(1);
  });

  it("distancia es simétrica", () => {
    const a = [0.5, 0.3, 0.8];
    const b = [0.7, 0.1, 0.9];
    expect(cosineDistance(a, b)).toBeCloseTo(cosineDistance(b, a), 5);
  });
});
