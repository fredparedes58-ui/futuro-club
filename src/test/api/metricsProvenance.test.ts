import { describe, it, expect } from "vitest";
import {
  computeVsiProvenance,
  fatigueIsReliable,
  MIN_FATIGUE_SESSIONS,
} from "../../../api/_lib/metricsProvenance";

describe("computeVsiProvenance", () => {
  it("sin biomecánica ni anthro: 0/5 medidos → parcialmente estimado", () => {
    const p = computeVsiProvenance(null, null);
    expect(p.measuredFraction).toBe(0);
    expect(p.partiallyEstimated).toBe(true);
    expect(p.perSubscore.technique).toBe("placeholder");
    expect(p.perSubscore.physical).toBe("placeholder");
    expect(p.perSubscore.projection).toBe("placeholder");
  });

  it("con biomecánica real → physical medido", () => {
    const p = computeVsiProvenance({ stride_frequency_hz: 4.2 }, null);
    expect(p.perSubscore.physical).toBe("measured");
    expect(p.measuredFraction).toBeCloseTo(0.2, 5);
  });

  it("con anthro real → projection medido; technique/mental/tactical SIEMPRE placeholder", () => {
    const p = computeVsiProvenance({ asymmetry_pct: 3 }, { adjusted_vsi: 72 });
    expect(p.perSubscore.physical).toBe("measured");
    expect(p.perSubscore.projection).toBe("measured");
    expect(p.measuredFraction).toBeCloseTo(0.4, 5); // 2/5
    expect(p.partiallyEstimated).toBe(true); // los 3 subjetivos siguen placeholder
    expect(p.perSubscore.technique).toBe("placeholder");
    expect(p.perSubscore.mental).toBe("placeholder");
    expect(p.perSubscore.tactical).toBe("placeholder");
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
