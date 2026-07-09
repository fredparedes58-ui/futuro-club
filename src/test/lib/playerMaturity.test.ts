/**
 * VITAS · Tests del adaptador de maduración por jugador (fuente única UI)
 */
import { describe, it, expect } from "vitest";
import {
  playerMaturity,
  maturityTone,
  maturityBandKey,
  maturityStatusKey,
  maturityTimingKey,
} from "@/lib/phv/playerMaturity";

describe("playerMaturity · adaptador", () => {
  it("usa edad decimal desde birthDate (no el entero age)", () => {
    const withBirth = playerMaturity(
      { birthDate: "2012-01-01", age: 14, height: 165, weight: 55, gender: "M",
        motherHeightCm: 165, fatherHeightCm: 178 },
      "2026-07-01", // ~14.5 años reales
    );
    // Con alturas parentales y edad en rango → método Khamis-Roche.
    expect(withBirth.method).toBe("khamis_roche_pah");
    expect(withBirth.chronologicalAge).toBeGreaterThan(14.4);
  });

  it("jugador pre-púber sin alturas parentales → NO afirma timing (blindaje)", () => {
    const a = playerMaturity({ age: 9, height: 135, weight: 30, gender: "M" });
    expect(a.timing).toBe("unknown");
    expect(a.adjustmentFactor).toBe(1);
    expect(maturityTone(a)).toBe("neutral");
    expect(maturityBandKey(a)).toBeNull(); // sin %PAH no hay banda inventada
  });

  it("con alturas parentales → banda %PAH disponible", () => {
    const a = playerMaturity({ age: 14, height: 165, weight: 55, gender: "M",
      motherHeightCm: 165, fatherHeightCm: 178 });
    expect(a.method).toBe("khamis_roche_pah");
    expect(a.percentPredictedAdultHeight).toBeGreaterThan(0);
    expect(maturityBandKey(a)).toBe(maturityStatusKey(a.status));
  });

  it("helpers de i18n devuelven claves namespaced correctas", () => {
    expect(maturityStatusKey("pre_phv")).toBe("maturity.status.pre_phv");
    expect(maturityTimingKey("late")).toBe("maturity.timing.late");
  });

  it("tono: tardío→boost, precoz→discount", () => {
    expect(maturityTone({ timing: "late" } as never)).toBe("boost");
    expect(maturityTone({ timing: "early" } as never)).toBe("discount");
    expect(maturityTone({ timing: "on_time" } as never)).toBe("neutral");
    expect(maturityTone({ timing: "unknown" } as never)).toBe("neutral");
  });
});
