/**
 * VITAS · Tests del Fatigue Report Agent (honestidad · inv #2)
 * Run: npm run test:api -- _fatigue-report
 *
 * Cobertura:
 *   - hasRealFatigueData distingue "sin datos" de "con datos"
 *   - blockedFatigueReport NUNCA fabrica cifras: índice/ACWR/riesgo en null
 *   - Regresión del bug de demo: sin sesiones, no se estima 35/1.1
 */

import { describe, it, expect } from "vitest";
import { hasRealFatigueData, blockedFatigueReport } from "../_fatigue-report";

describe("Fatigue Report · gate de datos (inv #2)", () => {
  it("hasRealFatigueData = false sin sesión ni historial", () => {
    expect(hasRealFatigueData({ playerId: "p1" } as never)).toBe(false);
    expect(hasRealFatigueData({ playerId: "p1", fatigueReport: null, fatigueHistory: [] } as never)).toBe(false);
    expect(hasRealFatigueData({ playerId: "p1", fatigueReport: {} } as never)).toBe(false);
  });

  it("hasRealFatigueData = true con sesión con contenido o historial", () => {
    expect(hasRealFatigueData({ playerId: "p1", fatigueReport: { fatigueIndex: 40 } } as never)).toBe(true);
    expect(hasRealFatigueData({ playerId: "p1", fatigueHistory: [{ date: "2026-01-01" }] } as never)).toBe(true);
  });

  it("blockedFatigueReport NO fabrica cifras: índice/ACWR/riesgo en null", () => {
    const r = blockedFatigueReport({ playerId: "p1" } as never) as Record<string, Record<string, unknown>>;
    expect(r.estadoActual.indice).toBeNull();
    expect(r.cargaACWR.valor).toBeNull();
    expect(r.riesgoLesion.nivel).toBe("sin datos");
    expect(r._gated).toBe(true);
    expect(r.confidence_score).toBe(0);
    expect(r.data_completeness).toBe(0);
    // Regresión: los valores fabricados del bug de demo NO aparecen.
    expect(r.estadoActual.indice).not.toBe(35);
    expect(r.cargaACWR.valor).not.toBe(1.1);
  });

  it("blockedFatigueReport propaga la banda PHV si viene, sin inventarla", () => {
    const r = blockedFatigueReport({ playerId: "p1", phv: { category: "early" } } as never) as Record<string, Record<string, unknown>>;
    expect(r.ajustesPHV.banda).toBe("early");
    const r2 = blockedFatigueReport({ playerId: "p1" } as never) as Record<string, Record<string, unknown>>;
    expect(r2.ajustesPHV.banda).toBe("unknown");
  });
});
