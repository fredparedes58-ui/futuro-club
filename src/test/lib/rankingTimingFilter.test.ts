/**
 * VITAS · Tests — filtro «Maduración» del ranking = TIMING vs pares (no la fase).
 *
 * Antes: el chip «Tardío ⭐» mandaba `phv=early` y se filtraba la CATEGORÍA del gate
 * (early = pre-PHV, un ESTADO), mientras cada fila rotula el TIMING («Madurador
 * tardío ⭐»). Un tardío ya en PHV quedaba oculto y cualquier pre-púber «en fase»
 * aparecía. Casos reales del hallazgo (gate de la rama, 2026-09-29).
 */
import { describe, it, expect } from "vitest";
import { phvGate, matchesTimingFilter, RANKING_TIMING_FILTERS } from "@/lib/phv/phvGate";

const AT = "2026-09-29";
/** Chico en PHV (fase «ontme») con timing TARDÍO. */
const LATE_IN_PHV = {
  height: 160, weight: 48, sittingHeight: 80, legLength: 80, birthDate: "2011-09-29", gender: "M",
};
/** Chico pre-PHV (fase «early») con timing EN FASE. */
const PRE_PHV_ON_TIME = {
  height: 150, weight: 42, sittingHeight: 78, legLength: 72, birthDate: "2016-03-29", gender: "M",
};

describe("fase ≠ timing (por qué el filtro no puede usar la categoría)", () => {
  it("tardío en PHV: categoría ontme, timing late", () => {
    const g = phvGate(LATE_IN_PHV, AT);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.category).toBe("ontme");
    expect(g.assessment.timing).toBe("late");
  });

  it("pre-PHV en fase: categoría early, timing on_time", () => {
    const g = phvGate(PRE_PHV_ON_TIME, AT);
    expect(g.ok).toBe(true);
    if (!g.ok) return;
    expect(g.category).toBe("early");
    expect(g.assessment.timing).toBe("on_time");
  });
});

describe("matchesTimingFilter", () => {
  it("sin filtro o «all» ⇒ pasan todos (incluido el gate cerrado)", () => {
    for (const f of [undefined, null, "", "all"]) {
      expect(matchesTimingFilter(null, f)).toBe(true);
      expect(matchesTimingFilter("late", f)).toBe(true);
    }
  });

  it("cada filtro solo deja pasar su MISMO timing", () => {
    for (const f of RANKING_TIMING_FILTERS) {
      for (const tm of ["late", "on_time", "early", "unknown"] as const) {
        expect(matchesTimingFilter(tm, f)).toBe(tm === f);
      }
    }
  });

  it("gate cerrado (null) o timing «unknown» no pasan ningún filtro", () => {
    for (const f of RANKING_TIMING_FILTERS) {
      expect(matchesTimingFilter(null, f)).toBe(false);
      expect(matchesTimingFilter(undefined, f)).toBe(false);
      expect(matchesTimingFilter("unknown", f)).toBe(false);
    }
  });

  it("valores de FASE o desconocidos no se reinterpretan como timing", () => {
    for (const f of ["ontme", "on-time", "pre_phv", "unknown", "foo"]) {
      for (const tm of ["late", "on_time", "early", "unknown"] as const) {
        expect(matchesTimingFilter(tm, f)).toBe(false);
      }
    }
  });

  it("los casos del hallazgo: el chip tardío lista al tardío en PHV y no al pre-PHV en fase", () => {
    const late = phvGate(LATE_IN_PHV, AT);
    const pre = phvGate(PRE_PHV_ON_TIME, AT);
    const timingOf = (g: typeof late) => (g.ok ? g.assessment.timing : null);
    expect(matchesTimingFilter(timingOf(late), "late")).toBe(true);
    expect(matchesTimingFilter(timingOf(pre), "late")).toBe(false);
    expect(matchesTimingFilter(timingOf(pre), "on_time")).toBe(true);
    expect(matchesTimingFilter(timingOf(late), "on_time")).toBe(false);
  });
});
