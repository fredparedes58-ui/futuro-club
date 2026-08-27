/**
 * VITAS · Tests de deriveSimMetrics (docx #14 · P3).
 *
 * Fija el comportamiento HONESTO del comparable profesional:
 *   - Sin eventos observados → null → el orquestador se ABSTIENE (no fabrica un
 *     match de 6 dims con constantes; era el bug de las 65/60/55, inv #1).
 *   - Con eventos → deriva de RATIOS reales (precisión de pase, % duelos, % disparos)
 *     y cuenta cuántas dims salen de un ratio real (ratioDerivedDims) para modular
 *     la confianza.
 */
import { describe, it, expect } from "vitest";
import { deriveSimMetrics } from "../_lib/simMetrics";

describe("deriveSimMetrics · abstención sin eventos", () => {
  it("null / sin observaciones → null (abstención)", () => {
    expect(deriveSimMetrics(null, 70)).toBeNull();
    expect(deriveSimMetrics({}, 70)).toBeNull();
    expect(deriveSimMetrics({ gemini: null, eventSummary: null }, 70)).toBeNull();
    // physicalMetrics presente pero SIN eventos de juego → sigue abstención
    expect(deriveSimMetrics({ physicalMetrics: { tracksDetected: 5 } }, 70)).toBeNull();
  });
});

describe("deriveSimMetrics · path Gemini (eventosContados)", () => {
  const obs = {
    gemini: {
      eventosContados: {
        pasesCompletados: 30, pasesFallados: 10, pasesProgresivos: 6,
        regatesConVentaja: 4, regatesSinVentaja: 1,
        duelosGanados: 7, duelosPerdidos: 3,
        recuperaciones: 5, robos: 2, anticipaciones: 1,
        disparosAlArco: 3, disparosFuera: 1, escaneos: 12,
      },
    },
  };

  it("technique ← precisión de pase (30/40=75) + regate (4/5=80) → ~78", () => {
    const r = deriveSimMetrics(obs, 60)!;
    expect(r).not.toBeNull();
    expect(r.source).toBe("gemini");
    expect(r.metrics.technique).toBe(78); // (75+80)/2
  });

  it("defending ← %duelos (7/10=70) blend con volumen, shooting ← %disparos (3/4=75)", () => {
    const r = deriveSimMetrics(obs, 60)!;
    expect(r.metrics.shooting).toBe(75); // 3/(3+1)
    expect(r.metrics.defending).toBeGreaterThan(50); // duelWin 70 + defVol
    expect(r.metrics.defending).toBeLessThanOrEqual(100);
  });

  it("cuenta las dims de ratio real (pase, duelo, disparo) + física real = 4", () => {
    const r = deriveSimMetrics(obs, 60)!;
    // physical real (1) + technique-ratio (1) + duel-ratio (1) + shot-ratio (1)
    expect(r.ratioDerivedDims).toBe(4);
  });

  it("physicalValue null → speed/stamina neutros (50), física NO cuenta como ratio", () => {
    const r = deriveSimMetrics(obs, null)!;
    expect(r.metrics.speed).toBe(50);
    expect(r.metrics.stamina).toBe(50);
    expect(r.ratioDerivedDims).toBe(3); // sin la física
  });

  it("todas las métricas quedan en [0,100]", () => {
    const r = deriveSimMetrics(obs, 60)!;
    for (const v of Object.values(r.metrics)) {
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThanOrEqual(100);
    }
  });
});

describe("deriveSimMetrics · path cliente (eventSummary)", () => {
  it("technique ← passCompletionPct; defending ← %duelos + recoveries", () => {
    const r = deriveSimMetrics(
      { eventSummary: { passCompletionPct: 62, duelsWon: 6, duelsLost: 4, recoveries: 3, shots: 2, xgContributions: 0.4 } },
      55,
    )!;
    expect(r.source).toBe("client");
    expect(r.metrics.technique).toBe(62);
    expect(r.metrics.defending).toBeGreaterThan(0);
    expect(r.ratioDerivedDims).toBeGreaterThanOrEqual(3); // física + pase + duelo
  });

  it("sin passCompletionPct → technique neutro 50, no cuenta como ratio", () => {
    const r = deriveSimMetrics({ eventSummary: { duelsWon: 0, duelsLost: 0 } }, null)!;
    expect(r.metrics.technique).toBe(50);
    expect(r.ratioDerivedDims).toBe(0); // ni física ni ratios
  });
});
