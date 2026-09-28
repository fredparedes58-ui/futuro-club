/**
 * VITAS · Regresión (PR #291 review): un conteo Gemini `null` significa "no se pudo
 * observar" — nunca debe tratarse como 0 ("observado y no ocurrió") aguas abajo.
 *
 * Run: npm run test:api -- observedNulls
 */
import { describe, it, expect } from "vitest";
import { detectObservedWeaknesses } from "../agents/_development-plan";
import { deriveSimMetrics } from "../_lib/simMetrics";

describe("detectObservedWeaknesses · null ≠ 0", () => {
  it("escaneos null NO produce un déficit de escaneo 'observado en vídeo'", () => {
    const out = detectObservedWeaknesses({
      gemini: { eventosContados: { pasesCompletados: 6, pasesFallados: 1, escaneos: null } },
    });
    expect(out.some((w) => w.startsWith("escaneo"))).toBe(false);
  });

  it("escaneos observados (1) con volumen de pase suficiente SÍ es déficit", () => {
    const out = detectObservedWeaknesses({
      gemini: { eventosContados: { pasesCompletados: 6, pasesFallados: 1, escaneos: 1 } },
    });
    expect(out.some((w) => w.startsWith("escaneo"))).toBe(true);
  });

  it("un componente del ratio sin observar (pasesFallados null) no genera déficit de pase", () => {
    const out = detectObservedWeaknesses({
      gemini: { eventosContados: { pasesCompletados: 1, pasesFallados: null } },
    });
    expect(out.some((w) => w.startsWith("precisión de pase"))).toBe(false);
  });

  it("pérdidas observadas sin recuperaciones observadas no es 'control bajo presión'", () => {
    const out = detectObservedWeaknesses({
      gemini: { eventosContados: { perdidas: 4, recuperaciones: null } },
    });
    expect(out.some((w) => w.startsWith("control bajo presión"))).toBe(false);
  });
});

describe("deriveSimMetrics · null ≠ 0", () => {
  const base = {
    pasesCompletados: 30, pasesFallados: 10, pasesProgresivos: 6,
    regatesConVentaja: 4, regatesSinVentaja: 1,
    duelosGanados: 7, duelosPerdidos: 3,
    recuperaciones: 5, robos: 2, anticipaciones: 1,
    disparosAlArco: 3, disparosFuera: 1,
  };

  it("escaneos null no hunde la visión como si fuera 0", () => {
    const withNull = deriveSimMetrics({ gemini: { eventosContados: { ...base, escaneos: null } } }, null);
    const withZero = deriveSimMetrics({ gemini: { eventosContados: { ...base, escaneos: 0 } } }, null);
    expect(withNull).not.toBeNull();
    expect(withZero).not.toBeNull();
    // 0 observado → visión baja; null → solo pases progresivos (6/12 → 50), no el 0 del escaneo
    expect(withNull!.metrics.vision).toBe(50);
    expect(withZero!.metrics.vision).toBeLessThan(withNull!.metrics.vision);
  });

  it("disparos con un componente sin observar no cuentan como ratio real", () => {
    const d = deriveSimMetrics({ gemini: { eventosContados: { ...base, disparosFuera: null, escaneos: 10 } } }, null);
    const full = deriveSimMetrics({ gemini: { eventosContados: { ...base, escaneos: 10 } } }, null);
    expect(d!.ratioDerivedDims).toBe(full!.ratioDerivedDims - 1);
  });

  it("todo observado mantiene el resultado de siempre", () => {
    const d = deriveSimMetrics({ gemini: { eventosContados: { ...base, escaneos: 12 } } }, null);
    // technique = media(75 pase, 80 regate) = 78 (redondeo de 77.5)
    expect(d!.metrics.technique).toBe(78);
    expect(d!.metrics.shooting).toBe(75);
  });
});
